// engine/engine — the turn LIFECYCLE shell (.int: real libSQL for the lock + the D26 canon persist). Pins
// the happy path (belts → turnStarted → generate → persist → committed/completed → lock released), the abort
// CLASSIFICATION (a FAULT emits turnAborted(error) then rethrows; a caller cancel emits turnAborted(user) then
// RETURNS the aborted outcome — an abort is an outcome, not an exception), and the pre-start belt refusals
// (locked — the budget/consent belts were retired by @orb/inference §14 F11/F13).

import type { AssembleContext, ChatBusEvent, DurableChatBusEvent } from "@orb/contracts/chat";
import type { GenerationCapability } from "@orb/contracts/inference";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { StatsDelta } from "@orb/contracts/stats";
import type { Db } from "@orb/db";
import { characterStats, chatLocks, chatStreamEvents, chats, dailyStats, messages, messageVariants, ownerStats } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import type { ChatEvent, ChatResult } from "@orb/inference";
import { generationOf, resolveChat } from "@orb/inference";
import type { CharacterId, ChatId, Handle, MessageId, MessageVariantId, ModelId, UserId, WorldEntryId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { RowMacroNameContext } from "@orb/kit/macro";
import { applyStatsDelta } from "@orb/server/domain/stats";
import { createRunChatTurnBridge } from "@orb/server/entry/compose";
import { getLog, initTracing, recentTraces, withRequestSpan } from "@orb/server/foundation/observability";
import { eq } from "drizzle-orm";
import { beforeEach, describe, vi } from "vitest";
import type { ChatContext } from "../../../../../packages/server/src/domain/chat/context.ts";
import { ChatOperationError } from "../../../../../packages/server/src/domain/chat/contract/errors.ts";
import type { MemoryRecallInputs } from "../../../../../packages/server/src/domain/chat/contract/memory.ts";
import type { TurnPrep, TurnRequest, TurnStreamChunk } from "../../../../../packages/server/src/domain/chat/contract/results.ts";
import { createTurnEngine } from "../../../../../packages/server/src/domain/chat/engine/engine.ts";
import { loadWitnessHorizons } from "../../../../../packages/server/src/domain/chat/memory/persistence/queries.ts";
import { recallMemory } from "../../../../../packages/server/src/domain/chat/memory/recall/recall.ts";
import type { WitnessInterval } from "../../../../../packages/server/src/domain/chat/memory/types.ts";
import { tryAcquireLock } from "../../../../../packages/server/src/domain/chat/persistence/lock.ts";
import { loadCanonHistory, loadMaxMessageSeq, loadStreamReplay, loadTurnOrigin } from "../../../../../packages/server/src/domain/chat/persistence/queries.ts";
import { createTurnRetrievalWarningEpisode } from "../../../../../packages/server/src/domain/chat/substrate/turn-retrieval-warning.ts";
import { freshDb } from "../../../../support/db.ts";
import { makeCapability } from "../../../../support/factories/resolved-connection.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { testModelId } from "../../../../support/inference-identities.ts";
import {
  FROZEN_AT,
  fakeRecallResult,
  makeChatContext,
  seedCharacter,
  seedChat,
  seedConnection,
  seedMessage,
  seedParticipant,
  seedUser,
  stubRunCompaction,
  testConnection,
} from "../_support.ts";

const HOST = castId<UserId>("user_host");
const MEMBER = castId<UserId>("user_member");

const ASSEMBLE_CTX: AssembleContext = {
  character: { name: "Aria", description: "a bold knight" },
  promptConfig: DEFAULT_PROMPT_CONFIG,
  activePersona: { name: "Alex", description: "the user" },
  recentMessages: [],
};

function scripted(chunks: readonly TurnStreamChunk[]): ChatContext["runChatTurn"] {
  return () =>
    (async function* (): AsyncGenerator<TurnStreamChunk> {
      await Promise.resolve();
      for (const c of chunks) {
        yield c;
      }
    })();
}

const OK_TURN = scripted([
  { kind: "text", text: "Hi" },
  {
    kind: "final",
    economics: { content: "Hi there", tokensIn: 4, tokensOut: 2, model: testModelId("test-model") },
  },
]);

function prepOf(chatId: ChatId, over: Partial<TurnPrep> = {}): TurnPrep {
  return {
    chatId,
    assembleContext: ASSEMBLE_CTX,
    connection: testConnection(),
    triggeredBy: HOST,
    funderUserId: HOST,
    runAsUserId: HOST,
    kind: "send",
    intent: {},
    speakerCharacterId: null,
    ...over,
  };
}

interface Harness {
  ctx: ChatContext;
  events: ChatBusEvent[];
  deltas: StatsDelta[];
  /** The `chatsChanged` member-fan calls (PD user-bus lane) — one per terminal turn, list-only (no `detail`). */
  chatChangedFans: { chatId: ChatId; options: unknown }[];
  engine: ReturnType<typeof createTurnEngine>;
}

function harness(
  database: Db,
  over: {
    runChatTurn?: ChatContext["runChatTurn"];
    generateSegments?: Parameters<typeof createTurnEngine>[1]["generateSegments"];
    generateDigests?: Parameters<typeof createTurnEngine>[1]["generateDigests"];
    loadWitnessHorizons?: Parameters<typeof createTurnEngine>[1]["loadWitnessHorizons"];
    recallMemory?: Parameters<typeof createTurnEngine>[1]["recallMemory"];
    runCompaction?: Parameters<typeof createTurnEngine>[1]["runCompaction"];
    lockTtlMs?: number;
    now?: () => number;
    /** The injected rpg turn ops (default null = not wired). The I-7 abort-trace pin wires a recorder. */
    rpg?: ChatContext["rpg"];
    /** The injected expressions post-turn classify (default null = not wired). The I-7 classify-trace pin
     *  wires a recorder. */
    expressions?: ChatContext["expressions"];
    /** Override the durable chat emitter while preserving the harness recorder. */
    emit?: Parameters<typeof createTurnEngine>[1]["emit"];
    /** Override the stats-delta sink — the one seam that can fail INSIDE `commitGeneration` but BEFORE its
     *  batch, which is exactly the window #1437 is about. */
    applyStatsDelta?: ChatContext["applyStatsDelta"];
  } = {},
): Harness {
  const events: ChatBusEvent[] = [];
  const deltas: StatsDelta[] = [];
  const chatChangedFans: { chatId: ChatId; options: unknown }[] = [];
  const ctx = makeChatContext(database, {
    newStreamEventId: () => mintTypeId(ID_PREFIX.chatStreamEvent),
    newStreamGenerationId: () => mintTypeId(ID_PREFIX.chatStreamGeneration),
    runChatTurn: over.runChatTurn ?? OK_TURN,
    ...(over.now !== undefined ? { now: over.now } : {}),
    ...(over.rpg !== undefined ? { rpg: over.rpg } : {}),
    ...(over.expressions !== undefined ? { expressions: over.expressions } : {}),
    applyStatsDelta:
      over.applyStatsDelta ??
      ((_batch: unknown, _db: Db, delta: StatsDelta): void => {
        deltas.push(delta);
      }),
    emitChatChanged: (chatId, options): Promise<void> => {
      chatChangedFans.push({ chatId, options });
      return Promise.resolve();
    },
  });
  const engine = createTurnEngine(ctx, {
    emit: (event: DurableChatBusEvent): Promise<void> => {
      events.push(event);
      return over.emit?.(event) ?? Promise.resolve();
    },

    holder: "replica-1",
    lockTtlMs: over.lockTtlMs ?? 60_000,
    generateSegments: over.generateSegments ?? (async () => ({ written: 0, skipped: 0 })),
    generateDigests: over.generateDigests ?? (async () => ({ written: 0, skipped: 0 })),
    loadWitnessHorizons: over.loadWitnessHorizons ?? loadWitnessHorizons,
    recallMemory: over.recallMemory ?? recallMemory,
    runCompaction: over.runCompaction ?? stubRunCompaction,
  });
  return { ctx, events, deltas, chatChangedFans, engine };
}

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

const types = (events: readonly ChatBusEvent[]): string[] => events.map((e) => e.type);

describe("createTurnEngine — turn origin stamping", () => {
  test("a default turn stamps the reply slot 'human'/depth 0 — getTurnOrigin reads it back", async () => {
    const chatId = await seedChat(db, "origin-default");
    const h = harness(db);
    const outcome = await h.engine.runTurn(prepOf(chatId));
    const messageId = outcome.messages[0]?.id;
    expect(messageId).toBeDefined();
    expect(messageId === undefined ? null : await loadTurnOrigin(db, chatId, messageId)).toEqual({ initiator: "human", automationDepth: 0 });
  });

  test("a programmatic turn carrying initiator:'automation' + depth stamps + round-trips through getTurnOrigin", async () => {
    const chatId = await seedChat(db, "origin-auto");
    const h = harness(db);
    const outcome = await h.engine.runTurn(prepOf(chatId, { initiator: "automation", automationDepth: 2 }));
    const messageId = outcome.messages[0]?.id;
    expect(messageId).toBeDefined();
    expect(messageId === undefined ? null : await loadTurnOrigin(db, chatId, messageId)).toEqual({ initiator: "automation", automationDepth: 2 });
  });
});

// The BORN-KIND belt for the engine commit (stickler 2026-08-08 canon-message-identity §R1). The engine is
// one of exactly two writers that mint a non-default kind (`postNarratorMessage` is the other); everything
// else is born `standard` by the DB default. The narrator arm is what makes a narrator row survive the two
// things that used to erase its purpose — deleting the synthetic group character (attribution SET-NULLs) and
// flipping the room's `output` dial (which retroactively re-classified history).
describe("createTurnEngine — the born message KIND", () => {
  /** Read the committed slot's declared purpose back out of the db (never off the returned view). */
  async function kindOf(messageId: MessageId): Promise<string | undefined> {
    const rows = await db.select({ kind: messages.kind }).from(messages).where(eq(messages.id, messageId));
    expect(rows).toHaveLength(1);
    return rows[0]?.kind;
  }

  test("an ordinary per-speaker turn is born kind='standard'", async () => {
    const chatId = await seedChat(db, "kind-standard");
    await seedUser(db, castId<Handle>("host"));
    const aria = await seedCharacter(db, HOST, "aria_kind_std");
    const h = harness(db);
    const outcome = await h.engine.runTurn(
      prepOf(chatId, {
        speakerCharacterId: aria,
        shape: { output: "per-speaker", cardScope: "merged", scopedTargetId: null, speakerName: "aria", speakerRef: { kind: "character", characterId: aria } },
      }),
    );
    const messageId = outcome.messages[0]?.id;
    expect(messageId).toBeDefined();
    expect(messageId === undefined ? null : await kindOf(messageId)).toBe("standard");
  });

  test("a NARRATOR round's turn is born kind='narrator' while its canon role stays 'assistant'", async () => {
    const chatId = await seedChat(db, "kind-narrator");
    await seedUser(db, castId<Handle>("host"));
    const group = await seedCharacter(db, HOST, "group_kind_nar");
    const h = harness(db);
    const outcome = await h.engine.runTurn(
      prepOf(chatId, {
        speakerCharacterId: group,
        shape: {
          output: "narrator",
          cardScope: "merged",
          scopedTargetId: null,
          speakerName: "the room",
          speakerRef: { kind: "character", characterId: group },
        },
      }),
    );
    const messageId = outcome.messages[0]?.id;
    expect(messageId).toBeDefined();
    expect(messageId === undefined ? null : await kindOf(messageId)).toBe("narrator");
    // Kind never decides the canon role — and since 2026-08-18 it decides no wire role either (the owner
    // ruled the narrator→wire-`system` mapping out; group narration is the assistant's own output voice).
    expect(outcome.messages[0]?.role).toBe("assistant");
  });
});

describe("createTurnEngine — happy path", () => {
  test("commits streamed deltas to the resumable token log under the committed message root", async () => {
    const chatId = await seedChat(db, "stream-log");
    const h = harness(db, {
      runChatTurn: scripted([
        { kind: "reasoning", text: "think" },
        { kind: "text", text: "Hi" },
        { kind: "text", text: " there" },
        { kind: "final", economics: { content: "Hi there", reasoning: "think", model: testModelId("test-model") } },
      ]),
    });

    const outcome = await h.engine.runTurn(prepOf(chatId));
    const messageId = outcome.messages[0]?.id;
    expect(messageId).toBeDefined();

    const rows = await db.select().from(chatStreamEvents).where(eq(chatStreamEvents.chatId, chatId)).orderBy(chatStreamEvents.seq);
    expect(
      rows.map(({ seq, chatId: rowChatId, messageId: rowMessageId, kind, delta }) => ({ seq, chatId: rowChatId, messageId: rowMessageId, kind, delta })),
    ).toEqual([
      { seq: 1, chatId, messageId, kind: "reasoning", delta: "think" },
      { seq: 2, chatId, messageId, kind: "text", delta: "Hi" },
      { seq: 3, chatId, messageId, kind: "text", delta: " there" },
    ]);
    expect(new Set(rows.map(({ seq }) => seq)).size).toBe(rows.length);
    expect(rows.every(({ id }) => id.startsWith(`${ID_PREFIX.chatStreamEvent}_`))).toBe(true);
    const generationId = rows[0]?.generationId;
    expect(generationId?.startsWith(`${ID_PREFIX.chatStreamGeneration}_`)).toBe(true);
    expect(new Set(rows.map((row) => row.generationId))).toEqual(new Set([generationId]));
    expect(await loadStreamReplay(db, chatId, undefined, 0)).toEqual([
      { seq: 1, messageId, generationId, kind: "reasoning", delta: "think" },
      { seq: 2, messageId, generationId, kind: "text", delta: "Hi" },
      { seq: 3, messageId, generationId, kind: "text", delta: " there" },
    ]);
  });

  test("commits the assistant turn + emits the lifecycle in order", async () => {
    const chatId = await seedChat(db, "a");
    const h = harness(db);

    const outcome = await h.engine.runTurn(prepOf(chatId));

    expect(outcome.aborted).toBe(false);
    expect(outcome.messages).toHaveLength(1);
    expect(outcome.messages[0]?.content).toBe("Hi there");

    const history = await loadCanonHistory(db, chatId);
    expect(history).toHaveLength(1);
    expect(history[0]?.role).toBe("assistant");
    expect(history[0]?.seq).toBe(1);

    const t = types(h.events);
    expect(t).toContain("turnStarted");
    expect(t).toContain("messageCommitted");
    expect(t).toContain("turnCompleted");
    expect(t.indexOf("turnStarted")).toBeLessThan(t.indexOf("messageCommitted"));
    expect(t.indexOf("messageCommitted")).toBeLessThan(t.indexOf("turnCompleted"));
    expect(t).toContain("delta");
  });

  test("owns the delta drain: terminal success cannot overtake a held delta emit", async () => {
    const chatId = await seedChat(db, "delta-order");
    let releaseDelta: (() => void) | undefined;
    let markDeltaStarted: (() => void) | undefined;
    const deltaStarted = new Promise<void>((resolve) => {
      markDeltaStarted = resolve;
    });
    const heldDelta = new Promise<void>((resolve) => {
      releaseDelta = resolve;
    });
    const h = harness(db, {
      emit: (event): Promise<void> => {
        if (event.type === "delta") {
          markDeltaStarted?.();
          return heldDelta;
        }
        return Promise.resolve();
      },
    });

    let settled = false;
    const turn = h.engine.runTurn(prepOf(chatId)).finally(() => {
      settled = true;
    });
    await deltaStarted;

    expect(settled).toBe(false);
    expect(types(h.events)).not.toContain("messageCommitted");
    expect(types(h.events)).not.toContain("turnCompleted");

    releaseDelta?.();
    await turn;
    expect(types(h.events).indexOf("delta")).toBeLessThan(types(h.events).indexOf("turnCompleted"));
  });

  // #1521 REPLACES a pin that injected a REJECTING emitter and asserted the turn withheld its terminal. That
  // shape has no producer: `entry/compose/services::emitChatEvent` awaits `emitChatEventChecked`, whose
  // `chatBus.emit` is total (bus.ts FLAG[emit-is-total]) and whose fan is a synchronous `EventEmitter.emit`
  // into `on()`-buffered subscribers (`chat-events-bus::publishChatEvent` → `bus-channel::publish`; the one
  // callback listener try/catches its own throw). So the pin proved a behaviour no caller can reach, while
  // the behaviour production DOES have — a durable append that is dropped, reported, and RESOLVES — had no
  // pin at all. This is that pin, and it is deliberately uncomfortable reading: it is the engine-side face of
  // #1454's open propagation fork.
  test("#1521 THE REAL SHAPE: a DROPPED durable event resolves, so the turn commits and completes blind to the loss", async () => {
    const chatId = await seedChat(db, "delta-dropped");
    const dropped: string[] = [];
    // The composed emitter's actual failure shape: `emitChatEventChecked` returns `false` for a dropped
    // append and `emitChatEvent` DISCARDS it, so the engine is handed a resolved `void` either way.
    const h = harness(db, {
      emit: (event): Promise<void> => {
        if (event.type === "delta") {
          dropped.push(event.type);
          return Promise.resolve();
        }
        return Promise.resolve();
      },
    });

    const outcome = await h.engine.runTurn(prepOf(chatId));

    // The turn is a SUCCESS by every surface it owns — the reply committed, the terminal fired…
    expect(outcome.aborted).toBe(false);
    expect(outcome.messages[0]?.content).toBe("Hi there");
    expect(types(h.events)).toContain("messageCommitted");
    expect(types(h.events)).toContain("turnCompleted");
    expect(await loadCanonHistory(db, chatId)).toHaveLength(1);
    // …and the drop happened. Nothing in the engine's return, its bus emissions, or its outcome says so:
    // the loss is reported by the BUS (a classified log line), and the engine cannot see it. Whether that
    // should change is #1454's fork (a typed verdict every caller may ignore, or an outbox) — an owner call,
    // deliberately not decided by a test.
    expect(dropped).not.toHaveLength(0);
  });

  test("PD user-bus lane: fans `chatsChanged` ONCE for the turn, list-only (no `detail`), after the settle", async () => {
    const chatId = await seedChat(db, "fan");
    const h = harness(db);

    await h.engine.runTurn(prepOf(chatId));

    // Exactly ONE fan for the whole turn (NOT one per messageCommitted + turnCompleted — the pair fires inside
    // one dup-alarm window, so a second fan would triple-invalidate the list keys). PRINCIPAL-BLIND: only the
    // chatId crosses. List-only: no `detail` (the per-chat bus drives the open chat's getChat).
    expect(h.chatChangedFans).toEqual([{ chatId, options: undefined }]);
  });

  test("PD-117: a turn with NO reasoning channel never emits reasoningStreamDone", async () => {
    const chatId = await seedChat(db, "noreason");
    const h = harness(db); // OK_TURN carries no "reasoning" chunk kind

    await h.engine.runTurn(prepOf(chatId));

    expect(types(h.events)).not.toContain("reasoningStreamDone");
  });

  test("PD-117: a turn WITH a reasoning channel emits reasoningStreamDone BEFORE turnCompleted", async () => {
    const chatId = await seedChat(db, "reason");
    const h = harness(db, {
      runChatTurn: scripted([
        { kind: "reasoning", text: "thinking..." },
        { kind: "text", text: "Hi" },
        {
          kind: "final",
          economics: {
            content: "Hi there",
            reasoning: "thinking...",
            tokensIn: 4,
            tokensOut: 2,
            model: testModelId("test-model"),
          },
        },
      ]),
    });

    await h.engine.runTurn(prepOf(chatId));

    const t = types(h.events);
    expect(t).toContain("reasoningStreamDone");
    expect(t.indexOf("reasoningStreamDone")).toBeLessThan(t.indexOf("turnCompleted"));
  });

  // THE DURABLE HALF of the reasoning channel. `reasoningStreamDone` (above) only proves the LIVE signal
  // fired; the committed transcript re-reads `message_variants.reasoning`, so a turn whose trace was never
  // written to canon shows reasoning while it streams and loses it forever at commit. Pinned at the ROW, not
  // the event: the engine's `variantPayloadOf` must land the reduced trace on the persisted variant — for the
  // deltas-only shape too (the OpenRouter chat-completions path accumulates its trace from `reasoning`-kind
  // deltas; the terminal `final` chunk carries no `reasoning` field there).
  test("a turn's reasoning trace is PERSISTED on the committed variant — both from the final chunk and from deltas alone", async () => {
    const fromFinal = await seedChat(db, "reason_final");
    await harness(db, {
      runChatTurn: scripted([
        { kind: "reasoning", text: "ignored — the terminal chunk is authoritative" },
        { kind: "text", text: "Hi" },
        { kind: "final", economics: { content: "Hi there", reasoning: "the settled trace", tokensIn: 4, tokensOut: 2, model: testModelId("test-model") } },
      ]),
    }).engine.runTurn(prepOf(fromFinal));

    // The deltas-only shape: no `reasoning` on the terminal economics ⇒ the accumulated deltas ARE the trace.
    const fromDeltas = await seedChat(db, "reason_deltas");
    await harness(db, {
      runChatTurn: scripted([
        { kind: "reasoning", text: "weighing " },
        { kind: "reasoning", text: "two openings" },
        { kind: "text", text: "Hi" },
        { kind: "final", economics: { content: "Hi there", tokensIn: 4, tokensOut: 2, model: testModelId("test-model") } },
      ]),
    }).engine.runTurn(prepOf(fromDeltas));

    expect(await selectedReasoning(fromFinal)).toBe("the settled trace");
    expect(await selectedReasoning(fromDeltas)).toBe("weighing two openings");
  });

  // THE ATTRIBUTION INVARIANT, NAMED. Every reasoning-carrying row is a GENERATED assistant slot, and every
  // producer writes those with `authorUserId: null` (this turn commit; `postNarratorMessage`). A large amount of
  // authority rests on that: `assertAuthorOrHost` degrades to HOST-ONLY exactly when `authorUserId` is null, so
  // "a member can never reach an assistant row" is a consequence of this write-side convention — NOT of the
  // schema. The `messages_attribution_shape` CHECK permits `role='assistant'` + a non-null `author_user_id`
  // (it only forbids character_id AND author_user_id together), so nothing but this test stands between a
  // future producer stamping an author onto a generated row and a silent widening of who may edit/read it.
  // The §3.6 return belt (`edit.ts::projectEditReturn`) now holds on the CALLER's role regardless — this test
  // exists so a violating write is caught by a RED TEST that names the invariant, not by a leak finding it.
  test("the ATTRIBUTION INVARIANT: a reasoning-carrying assistant slot is written authorUserId-NULL (host-only by construction)", async () => {
    const chatId = await seedChat(db, "attrib_invariant");
    await harness(db, {
      runChatTurn: scripted([
        { kind: "reasoning", text: "the model's private trace" },
        { kind: "text", text: "Hi" },
        {
          kind: "final",
          economics: { content: "Hi there", reasoning: "the model's private trace", tokensIn: 4, tokensOut: 2, model: testModelId("test-model") },
        },
      ]),
    }).engine.runTurn(prepOf(chatId));

    const [slot] = await db
      .select({ role: messages.role, authorUserId: messages.authorUserId, reasoning: messageVariants.reasoning })
      .from(messages)
      .innerJoin(messageVariants, eq(messageVariants.id, messages.selectedVariantId))
      .where(eq(messages.chatId, chatId));

    // The row genuinely carries the model's trace (else the assertion below would be vacuous)…
    expect(slot?.role).toBe("assistant");
    expect(slot?.reasoning).toBe("the model's private trace");
    // …and it is UNAUTHORED, which is what makes every author-or-host verb host-only for it.
    expect(slot?.authorUserId).toBeNull();
  });

  /** The DB truth for a chat's tail assistant row: the reasoning column of its SELECTED variant. */
  async function selectedReasoning(chatId: ChatId): Promise<string | null | undefined> {
    const history = await loadCanonHistory(db, chatId);
    const [row] = await db
      .select({ reasoning: messageVariants.reasoning })
      .from(messageVariants)
      .where(eq(messageVariants.id, castId(history.at(-1)?.selectedVariantId ?? "")));
    return row?.reasoning;
  }

  test("D50 pt-2 (PD-117): a turn whose assembled WI pool fired entries emits worldInfoActivated with them", async () => {
    const chatId = await seedChat(db, "wi");
    const firedId = castId<WorldEntryId>("world_entry_dragon");
    const h = harness(db);

    await h.engine.runTurn(
      prepOf(chatId, {
        assembleContext: {
          ...ASSEMBLE_CTX,
          wiTrace: { included: 1, dropped: [], matchedKeys: [], activated: [{ id: firedId, keys: ["dragon"] }] },
        },
      }),
    );

    // A human-plane turn (default prep) threads automationDepth 0 — the normal path stays depth 0 (#704).
    const wi = h.events.find((e) => e.type === "worldInfoActivated");
    expect(wi).toMatchObject({ type: "worldInfoActivated", chatId, entryIds: [firedId], automationDepth: 0 });
  });

  test("#704: an automation reaction turn (depth 2) emits worldInfoActivated carrying its OWN depth — the fact-resolver reads it (no reply slot to read back), so the cascade cap bounds a re-activation self-chain", async () => {
    const chatId = await seedChat(db, "wi-cascade");
    const firedId = castId<WorldEntryId>("world_entry_dragon");
    const h = harness(db);

    await h.engine.runTurn(
      prepOf(chatId, {
        initiator: "automation",
        automationDepth: 2,
        assembleContext: {
          ...ASSEMBLE_CTX,
          wiTrace: { included: 1, dropped: [], matchedKeys: [], activated: [{ id: firedId, keys: ["dragon"] }] },
        },
      }),
    );

    const wi = h.events.find((e) => e.type === "worldInfoActivated");
    expect(wi).toMatchObject({ type: "worldInfoActivated", chatId, entryIds: [firedId], automationDepth: 2 });
  });

  test("D50 pt-2: a turn with an empty WI pool never emits worldInfoActivated", async () => {
    const chatId = await seedChat(db, "wi-empty");
    const h = harness(db);

    await h.engine.runTurn(prepOf(chatId));

    expect(types(h.events)).not.toContain("worldInfoActivated");
  });

  test("D45: a non-vision turn carrying an embedded image ref emits image_dropped once", async () => {
    // The model has no `input.vision` (CAPABILITY) → the engine strips the image part + warns once. The ref
    // rides a synthetic user turn (appendUserTurn), so no canon seeding is needed; the drop short-circuits
    // before `resolveImageUrl`, so the notStubbed op is never reached.
    const chatId = await seedChat(db, "img");
    const h = harness(db);

    await h.engine.runTurn(prepOf(chatId, { appendUserTurn: "see ![](asset:x) please" }));

    const warnings = h.events.filter((e) => e.type === "warning");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ type: "warning", code: "image_dropped" });
  });

  test("the stats delta is attributed to the host (runAsUserId), not the caller", async () => {
    const chatId = await seedChat(db, "a");
    const h = harness(db);
    await h.engine.runTurn(prepOf(chatId, { triggeredBy: MEMBER, runAsUserId: HOST }));
    expect(h.deltas).toHaveLength(1);
    expect(h.deltas[0]?.ownerId).toBe(HOST);
    // The per-member budget DEBIT that was asserted beside this is deleted with the belt (@orb/inference
    // §14 F11). Stats attribution is the live half and is unchanged: `buildTurnStatsDeltas` still keys the
    // delta on `prep.runAsUserId` (the host's assembly scope, §8.4-3), never on the triggering member.
  });

  test("the lock is released — a second turn runs (seq advances)", async () => {
    const chatId = await seedChat(db, "a");
    const h = harness(db);
    await h.engine.runTurn(prepOf(chatId));
    await h.engine.runTurn(prepOf(chatId));
    const history = await loadCanonHistory(db, chatId);
    expect(history.map((m) => m.seq)).toEqual([1, 2]);
  });
});

describe("createTurnEngine — R3 stats real-wire (the REAL applyStatsDelta lands rollup rows)", () => {
  test("a committed turn flows through the production applyStatsDelta → characterStats/ownerStats/dailyStats rows carry the turn's economics", async () => {
    // The other engine tests inject a RECORDER for applyStatsDelta (assert the computed StatsDelta shape). This
    // one wires the REAL `stats/write/apply-delta` — the pure batch fn the composition root injects — so the
    // engine's own `db.batch` commits the four rollup UPSERTs alongside the canon write. It proves, from chat's
    // real call site, that the live delta actually lands as rows (the apply≡reconcile invariant's write half).
    const chatId = await seedChat(db, "stats");
    await seedUser(db, castId<Handle>("host"));
    const char = await seedCharacter(db, HOST, "aria");
    await seedParticipant(db, { chatId, key: "aria", characterId: char });

    // Bind the REAL apply exactly as compose does (chat.ts): the chat op erases batch to `unknown`, so the
    // wrapper restores the concrete `BatchStmt[]` before calling the production fn.
    const ctx = makeChatContext(db, {
      runChatTurn: OK_TURN,
      applyStatsDelta: (batch, opDb, delta) => {
        applyStatsDelta(batch as BatchStmt[], opDb, delta);
      },
    });
    const engine = createTurnEngine(ctx, {
      emit: () => Promise.resolve(),

      holder: "replica-1",
      lockTtlMs: 60_000,
      generateSegments: async () => ({ written: 0, skipped: 0 }),
      generateDigests: async () => ({ written: 0, skipped: 0 }),
      loadWitnessHorizons,
      recallMemory,
      runCompaction: stubRunCompaction,
    });

    // A character-voiced assistant turn (speakerCharacterId set) so ALL FOUR grains touch — most notably
    // character_stats (skipped for a null character). OK_TURN's economics: content "Hi there", tokensIn 4,
    // tokensOut 2, model "test-model".
    const outcome = await engine.runTurn(prepOf(chatId, { runAsUserId: HOST, speakerCharacterId: char }));
    expect(outcome.aborted).toBe(false);

    // ownerStats — attributed to the host (runAsUserId), the token economics folded in.
    const [owner] = await db.select().from(ownerStats).where(eq(ownerStats.ownerId, HOST));
    expect(owner?.assistantTurns).toBe(1);
    expect(owner?.tokensIn).toBe(4);
    expect(owner?.tokensOut).toBe(2);

    // characterStats — the speaker's row (NO ownerId column, D23), same assistant-turn contribution.
    const [character] = await db.select().from(characterStats).where(eq(characterStats.characterId, char));
    expect(character?.assistantTurns).toBe(1);
    expect(character?.tokensOut).toBe(2);

    // dailyStats — the per-day point for the host; daily tokens credit the message stream.
    const daily = await db.select().from(dailyStats).where(eq(dailyStats.ownerId, HOST));
    expect(daily).toHaveLength(1);
    expect(daily[0]?.assistantTurns).toBe(1);
    expect(daily[0]?.tokensOut).toBe(2);
  });
});

describe("createTurnEngine — D46 runtime plane (delta persist + cache recompute)", () => {
  async function runtimeCache(chatId: ChatId): Promise<Record<string, string> | null> {
    const [row] = await db.select({ runtimeVariables: chats.runtimeVariables }).from(chats).where(eq(chats.id, chatId));
    return row?.runtimeVariables ?? null;
  }

  test("a turn persists its op-log as the variant delta + folds the runtime cache; the cache survives the next turn", async () => {
    const chatId = await seedChat(db, "vars");
    const h = harness(db);

    // Turn 1's assembly recorded a setvar (X=1) on the op-log (the by-reference sink macros push to).
    const ctxSet: AssembleContext = {
      ...ASSEMBLE_CTX,
      opLog: [{ op: "set", key: "hp", value: "1" }],
    };
    await h.engine.runTurn(prepOf(chatId, { assembleContext: ctxSet }));

    const history1 = await loadCanonHistory(db, chatId);
    const [v1] = await db
      .select({ variableDelta: messageVariants.variableDelta })
      .from(messageVariants)
      .where(eq(messageVariants.id, castId(history1[0]?.selectedVariantId ?? "")));
    expect(v1?.variableDelta).toEqual([{ op: "set", key: "hp", value: "1" }]);
    expect(await runtimeCache(chatId)).toEqual({ hp: "1" });

    // Turn 2 sets nothing (empty op-log) — the cache SURVIVES (the fold still replays turn 1's delta).
    await h.engine.runTurn(prepOf(chatId, { assembleContext: { ...ASSEMBLE_CTX, opLog: [] } }));
    expect(await runtimeCache(chatId)).toEqual({ hp: "1" });
  });

  test("a group round SHARING one assembleContext clears the op-log per commit (no cross-speaker double-count)", async () => {
    const chatId = await seedChat(db, "grp");
    const h = harness(db);
    // ONE assembleContext reused across sequential speakers (the round.ts `buildSpeakerPrep` pattern) — the
    // op-log is a by-reference array both speakers push to.
    const shared: AssembleContext = {
      ...ASSEMBLE_CTX,
      opLog: [{ op: "set", key: "hp", value: "1" }],
    };

    // Speaker 1 commits [set hp=1]; the shared array is cleared after commit.
    await h.engine.runTurn(prepOf(chatId, { assembleContext: shared }));
    // Speaker 2's assembly pushes ONE op onto the (now-cleared) shared array.
    shared.opLog?.push({ op: "inc", key: "hp" });
    await h.engine.runTurn(prepOf(chatId, { assembleContext: shared }));

    const history = await loadCanonHistory(db, chatId);
    const [v2] = await db
      .select({ variableDelta: messageVariants.variableDelta })
      .from(messageVariants)
      .where(eq(messageVariants.id, castId(history[1]?.selectedVariantId ?? "")));
    // Speaker 2's delta is ITS op ONLY — NOT [set hp=1, inc hp] (the double-count the clear prevents).
    expect(v2?.variableDelta).toEqual([{ op: "inc", key: "hp" }]);
    // Fold: M1 sets 1, M2 incs → 2 (each op applied exactly once across the chain).
    expect(await runtimeCache(chatId)).toEqual({ hp: "2" });
  });
});

describe("createTurnEngine — post-turn memory build (fire-and-forget, §3a)", () => {
  test("the memory build throwing emits warning(memory_build_failed) but the turn itself still completes", async () => {
    const chatId = await seedChat(db, "memfail");
    // A seated character in the roster — `chars.length > 0` is what actually drives the engine into calling
    // `deps.generateDigests` (an empty roster short-circuits `Promise.all([])`, never reaching the throw).
    await seedUser(db, castId<Handle>("host"));
    const char = await seedCharacter(db, HOST, "aria");
    await seedParticipant(db, { chatId, key: "aria", characterId: char });
    const events: ChatBusEvent[] = [];
    const ctx = makeChatContext(db, { runChatTurn: OK_TURN });
    const engine = createTurnEngine(ctx, {
      emit: (event: DurableChatBusEvent): Promise<void> => {
        events.push(event);
        return Promise.resolve();
      },

      holder: "replica-1",
      lockTtlMs: 60_000,
      generateSegments: async () => ({ written: 0, skipped: 0 }),
      generateDigests: () => {
        throw new Error("digest build exploded");
      },
      loadWitnessHorizons,
      recallMemory,
      runCompaction: stubRunCompaction,
    });

    const outcome = await engine.runTurn(prepOf(chatId));
    expect(outcome.aborted).toBe(false);
    expect(types(events)).toContain("turnCompleted");

    // The build runs fire-and-forget AFTER the turn resolves — poll for the warning event's arrival.
    const warning = await vi.waitFor(() => {
      const w = events.find((e) => e.type === "warning");
      expect(w).toBeDefined();
      return w;
    });
    expect(warning).toMatchObject({ type: "warning", chatId, code: "memory_build_failed" });
  });

  test("F3: threads the resolved character NAME map into the segment + digest builds (not raw typeids)", async () => {
    const chatId = await seedChat(db, "memnames");
    await seedUser(db, castId<Handle>("host"));
    const char = await seedCharacter(db, HOST, "aria"); // id character_aria, name "aria"
    await seedParticipant(db, { chatId, key: "aria", characterId: char });
    // A prior character-voiced canon row → the per-chat producer resolves character_aria → its live name.
    await seedMessage(db, chatId, 1, {
      role: "assistant",
      characterId: char,
      content: "prior line",
    });

    const segNames: (RowMacroNameContext | undefined)[] = [];
    const digNames: (RowMacroNameContext | undefined)[] = [];
    const h = harness(db, {
      generateSegments: (_ctx, args) => {
        segNames.push(args.macroNames);
        return Promise.resolve({ written: 0, skipped: 0 });
      },
      generateDigests: (_ctx, args) => {
        digNames.push(args.macroNames);
        return Promise.resolve({ written: 0, skipped: 0 });
      },
    });

    await h.engine.runTurn(prepOf(chatId));
    await vi.waitFor(() => {
      expect(segNames.length).toBeGreaterThan(0);
      expect(digNames.length).toBeGreaterThan(0);
    });

    // The build receives the LIVE per-chat producer (F3/G1) — the character name keyed by id, so the
    // summarizer transcript labels "aria: …" + resolves the BODY, NOT the raw `character_aria` typeid fallback.
    expect(segNames[0]?.characterNamesById.get(char)?.name).toBe("aria");
    expect(digNames.every((m) => m?.characterNamesById.get(char)?.name === "aria")).toBe(true);
  });

  test("F3b: threads each seated character's WITNESSING horizons into its SCOPED digest build (D6)", async () => {
    const chatId = await seedChat(db, "memwitness");
    await seedUser(db, castId<Handle>("host"));
    const char = await seedCharacter(db, HOST, "aria");
    // aria joined at seq 5 (not seq 0) — a real, non-trivial horizon the engine must source + thread.
    await seedParticipant(db, { chatId, key: "aria", characterId: char, joinSeq: 5 });
    await seedMessage(db, chatId, 1, { role: "assistant", characterId: char, content: "prior line" });

    const digWitness: (readonly WitnessInterval[] | undefined)[] = [];
    const h = harness(db, {
      generateDigests: (_ctx, args) => {
        digWitness.push(args.witnessing);
        return Promise.resolve({ written: 0, skipped: 0 });
      },
    });

    await h.engine.runTurn(prepOf(chatId));
    await vi.waitFor(() => {
      expect(digWitness.length).toBeGreaterThan(0);
    });
    // The scoped build for aria received aria's real join horizon — sourced live via loadWitnessHorizons, NOT
    // left undefined (the pre-fix full-history state). Solo chat ⇒ one scoped bucket, no group bucket.
    expect(digWitness).toEqual([[{ joinSeq: 5, leftSeq: null }]]);
  });

  test("F3c: SCOPED per-speaker recall — each speaker recalls its OWN bucket, horizon-filtered by ITS presence (D6)", async () => {
    const chatId = await seedChat(db, "perspeaker");
    await seedUser(db, castId<Handle>("host"));
    const aria = await seedCharacter(db, HOST, "aria"); // present since the chat opened
    const bram = await seedCharacter(db, HOST, "bram"); // a late joiner
    await seedParticipant(db, { chatId, key: "aria", characterId: aria, joinSeq: 1, leftSeq: null });
    await seedParticipant(db, { chatId, key: "bram", characterId: bram, joinSeq: 20, leftSeq: null });

    // Record every per-speaker recall dispatch (bucket + horizons) the engine issues.
    const calls: { scoped: string; group: string; witnessing: readonly WitnessInterval[] | undefined }[] = [];
    const recordRecall: Parameters<typeof createTurnEngine>[1]["recallMemory"] = (_ctx, args) => {
      calls.push({ scoped: args.scope.scopedCharacterId, group: args.groupCharacterId, witnessing: args.witnessing });
      return Promise.resolve(fakeRecallResult(`memory-for-${args.scope.scopedCharacterId}`));
    };
    const h = harness(db, { recallMemory: recordRecall });

    const memoryRecall: MemoryRecallInputs = {
      groupCharacterId: aria,
      recent: [],
      names: new Map<CharacterId, string>(),
      config: { mode: "mixA" },
      warningEpisode: createTurnRetrievalWarningEpisode(),
    };
    const scopedShape = (charId: typeof aria, name: string): TurnPrep["shape"] => ({
      output: "per-speaker",
      cardScope: "scoped",
      scopedTargetId: charId,
      speakerName: name,
      speakerRef: { kind: "character", characterId: charId },
    });

    await h.engine.runTurn(prepOf(chatId, { speakerCharacterId: aria, shape: scopedShape(aria, "aria"), memoryRecall }));
    await h.engine.runTurn(prepOf(chatId, { speakerCharacterId: bram, shape: scopedShape(bram, "bram"), memoryRecall }));

    // Each speaker recalled ITS OWN bucket, filtered by ITS join horizon — sourced live from chat_participants.
    expect(calls).toEqual([
      { scoped: aria, group: aria, witnessing: [{ joinSeq: 1, leftSeq: null }] },
      { scoped: bram, group: aria, witnessing: [{ joinSeq: 20, leftSeq: null }] },
    ]);
  });

  test("F3d: MERGED / narrator round keeps round-level recall — NO per-speaker recall (byte-identical)", async () => {
    const chatId = await seedChat(db, "mergedbyteid");
    await seedUser(db, castId<Handle>("host"));
    const aria = await seedCharacter(db, HOST, "aria");
    await seedParticipant(db, { chatId, key: "aria", characterId: aria, joinSeq: 5, leftSeq: null });

    let recallCalls = 0;
    const recordRecall: Parameters<typeof createTurnEngine>[1]["recallMemory"] = (_ctx, _args) => {
      recallCalls += 1;
      return Promise.resolve(fakeRecallResult("scoped"));
    };
    const h = harness(db, { recallMemory: recordRecall });
    const memoryRecall: MemoryRecallInputs = {
      groupCharacterId: aria,
      recent: [],
      names: new Map<CharacterId, string>(),
      config: { mode: "mixA" },
      warningEpisode: createTurnRetrievalWarningEpisode(),
    };

    // A per-speaker MERGED turn (cardScope !== "scoped") must NOT re-run recall — the round-level memory stands.
    await h.engine.runTurn(
      prepOf(chatId, {
        speakerCharacterId: aria,
        shape: { output: "per-speaker", cardScope: "merged", scopedTargetId: null, speakerName: "aria", speakerRef: { kind: "character", characterId: aria } },
        memoryRecall,
      }),
    );
    expect(recallCalls).toBe(0);
  });

  test("rerank-unavailable warns once across round-level + speaker recalls, then a fresh turn episode can warn again", async () => {
    const chatId = await seedChat(db, "rerankwarn");
    await seedUser(db, castId<Handle>("host"));
    const aria = await seedCharacter(db, HOST, "aria");
    const bram = await seedCharacter(db, HOST, "bram");
    await seedParticipant(db, { chatId, key: "aria", characterId: aria, joinSeq: 1, leftSeq: null });
    await seedParticipant(db, { chatId, key: "bram", characterId: bram, joinSeq: 1, leftSeq: null });

    const speakerRecall = vi.fn<Parameters<typeof createTurnEngine>[1]["recallMemory"]>((_ctx, args) => {
      args.warningEpisode?.reportRerankUnavailable();
      return Promise.resolve(fakeRecallResult(`memory-for-${args.scope.scopedCharacterId}`));
    });
    const h = harness(db, { recallMemory: speakerRecall });
    const scopedShape = (charId: typeof aria, name: string): TurnPrep["shape"] => ({
      output: "per-speaker",
      cardScope: "scoped",
      scopedTargetId: charId,
      speakerName: name,
      speakerRef: { kind: "character", characterId: charId },
    });

    const firstEpisode = createTurnRetrievalWarningEpisode();
    firstEpisode.reportRerankUnavailable(); // the round-level gather degraded before either speaker recall
    const shared: MemoryRecallInputs = {
      groupCharacterId: aria,
      recent: [],
      names: new Map<CharacterId, string>(),
      config: { mode: "mixC" },
      warningEpisode: firstEpisode,
    };
    await h.engine.runTurn(prepOf(chatId, { speakerCharacterId: aria, shape: scopedShape(aria, "aria"), memoryConfig: { mode: "off" }, memoryRecall: shared }));
    await h.engine.runTurn(prepOf(chatId, { speakerCharacterId: bram, shape: scopedShape(bram, "bram"), memoryConfig: { mode: "off" }, memoryRecall: shared }));

    expect(h.events.filter((event) => event.type === "warning")).toEqual([{ type: "warning", chatId, code: "memory_rerank_unavailable" }]);
    expect(speakerRecall).toHaveBeenCalledTimes(2); // both speaker failures happened; dedupe did not skip work

    const nextEpisode = createTurnRetrievalWarningEpisode();
    const nextTurn: MemoryRecallInputs = { ...shared, warningEpisode: nextEpisode };
    await h.engine.runTurn(
      prepOf(chatId, { speakerCharacterId: aria, shape: scopedShape(aria, "aria"), memoryConfig: { mode: "off" }, memoryRecall: nextTurn }),
    );
    expect(h.events.filter((event) => event.type === "warning")).toEqual([
      { type: "warning", chatId, code: "memory_rerank_unavailable" },
      { type: "warning", chatId, code: "memory_rerank_unavailable" },
    ]);
  });

  // #405 F1 — the MERGED/narrator early-return branch of `resolveSpeakerMemory` is the DEFAULT solo-chat
  // shape, and every other emitting test above rides `cardScope: "scoped"`. Deleting the early branch's
  // `emitMemoryRerankWarningOnce` therefore left every suite green while making mixC degrade SILENT for
  // ordinary chats — exactly what the #332 "not a silent fallback" ruling forbids. This is the pin for the
  // branch nobody was covering: a merged turn whose round-level gather already degraded must still warn.
  test("a MERGED turn (the default shape) warns when the round-level recall already degraded", async () => {
    const chatId = await seedChat(db, "rerankwarn-merged");
    await seedUser(db, castId<Handle>("host"));
    const aria = await seedCharacter(db, HOST, "aria");
    await seedParticipant(db, { chatId, key: "aria", characterId: aria, joinSeq: 1, leftSeq: null });
    const h = harness(db);

    const episode = createTurnRetrievalWarningEpisode();
    episode.reportRerankUnavailable(); // the round-level gather degraded; no per-speaker recall will re-run
    await h.engine.runTurn(
      prepOf(chatId, {
        speakerCharacterId: aria,
        shape: { output: "per-speaker", cardScope: "merged", scopedTargetId: null, speakerName: "aria", speakerRef: { kind: "character", characterId: aria } },
        memoryConfig: { mode: "off" },
        memoryRecall: { groupCharacterId: aria, recent: [], names: new Map<CharacterId, string>(), config: { mode: "mixC" }, warningEpisode: episode },
      }),
    );

    expect(h.events.filter((event) => event.type === "warning")).toEqual([{ type: "warning", chatId, code: "memory_rerank_unavailable" }]);
  });

  // #2510 — the D41 half of the in-turn retrieval degrade. The compose bindings now absorb the two SPACE
  // refusals (`search_space_reindexing` / `search_no_space`) so an owner whose vector space is mid-move or
  // unbound can still send a message; that trade is only legitimate if the user is TOLD. The report comes from
  // whichever gather arm hit it (memory recall and/or the databank slot) and drains here, once for the turn.
  test("an index-unavailable report warns ONCE for the turn, independently of the rerank class", async () => {
    const chatId = await seedChat(db, "indexwarn");
    await seedUser(db, castId<Handle>("host"));
    const aria = await seedCharacter(db, HOST, "aria");
    await seedParticipant(db, { chatId, key: "aria", characterId: aria, joinSeq: 1, leftSeq: null });
    const h = harness(db);

    const episode = createTurnRetrievalWarningEpisode();
    // Both classes in ONE turn: the databank gather lost the whole space AND recall lost its reranker. Two
    // different sentences, so two notices — collapsing them would tell a user their reranker failed when they
    // have no queryable index at all.
    episode.reportIndexUnavailable();
    episode.reportIndexUnavailable(); // a second arm reporting the same outage is still one notice
    episode.reportRerankUnavailable();
    await h.engine.runTurn(
      prepOf(chatId, {
        speakerCharacterId: aria,
        shape: { output: "per-speaker", cardScope: "merged", scopedTargetId: null, speakerName: "aria", speakerRef: { kind: "character", characterId: aria } },
        memoryConfig: { mode: "off" },
        memoryRecall: { groupCharacterId: aria, recent: [], names: new Map<CharacterId, string>(), config: { mode: "mixC" }, warningEpisode: episode },
      }),
    );

    expect(h.events.filter((event) => event.type === "warning")).toEqual([
      { type: "warning", chatId, code: "retrieval_index_unavailable" },
      { type: "warning", chatId, code: "memory_rerank_unavailable" },
    ]);
  });

  test("the memory build succeeding never emits warning(memory_build_failed)", async () => {
    const chatId = await seedChat(db, "memok");
    const h = harness(db);

    await h.engine.runTurn(prepOf(chatId));
    // The success arm's generateDigests already resolved synchronously inside runTurn's fire-and-forget chain
    // by the time we get here in practice, but to be safe against scheduling, flush a microtask turn.
    await Promise.resolve();
    await Promise.resolve();

    expect(types(h.events)).not.toContain("warning");
  });
});

describe("createTurnEngine — error path (turnAborted then rethrow)", () => {
  test("a generation failure emits turnAborted(error) THEN rethrows; lock released", async () => {
    const chatId = await seedChat(db, "a");
    let releaseDelta: (() => void) | undefined;
    let markDeltaStarted: (() => void) | undefined;
    const deltaStarted = new Promise<void>((resolve) => {
      markDeltaStarted = resolve;
    });
    const heldDelta = new Promise<void>((resolve) => {
      releaseDelta = resolve;
    });
    let markProviderFailed: (() => void) | undefined;
    const providerFailed = new Promise<void>((resolve) => {
      markProviderFailed = resolve;
    });
    // A partial stream then a mid-flight failure (the realistic error path).
    const throwing: ChatContext["runChatTurn"] = () =>
      (async function* (): AsyncGenerator<TurnStreamChunk> {
        await Promise.resolve();
        yield { kind: "text", text: "partial" };
        markProviderFailed?.();
        throw new Error("model exploded");
      })();
    const h = harness(db, {
      runChatTurn: throwing,
      emit: (event): Promise<void> => {
        if (event.type === "delta") {
          markDeltaStarted?.();
          return heldDelta;
        }
        return Promise.resolve();
      },
    });

    let settled = false;
    const turn = h.engine.runTurn(prepOf(chatId)).finally(() => {
      settled = true;
    });
    await deltaStarted;
    await providerFailed;
    // Give the pipeline/catch ample scheduler progress without releasing the held durable append. On the old
    // implementation this deterministically reaches turnAborted; the repaired engine remains parked on the
    // delta drain. This is event-loop progression, not a wall-clock sleep or eventual assertion.
    for (let turnIndex = 0; turnIndex < 10; turnIndex += 1) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }

    expect(settled).toBe(false);
    expect(types(h.events)).not.toContain("turnAborted");

    releaseDelta?.();
    await expect(turn).rejects.toThrow("model exploded");

    const aborted = h.events.find((e) => e.type === "turnAborted");
    expect(aborted).toBeDefined();
    expect(aborted?.type === "turnAborted" && aborted.reason).toBe("error");
    expect(types(h.events)).not.toContain("turnCompleted");

    // The lock was released in the finally — a fresh OK turn now commits.
    const h2 = harness(db);
    await h2.engine.runTurn(prepOf(chatId));
    expect(await loadCanonHistory(db, chatId)).toHaveLength(1);
  });
});

describe("createTurnEngine — pre-start belt refusals (no turnStarted)", () => {
  // The BUDGET and CONSENT refusals that stood here are DELETED, subjects gone (@orb/inference program
  // §14 F11 + F13): F11 retired the D17 member-budget belt (there is no owner compute to budget any more)
  // and F13 retired the separate owner-consent belt. The host seat itself now accepts room-turn liability,
  // so `budget_exceeded`/`consent_required` have no raiser on this path. `locked` survives.
  test("a turn already in flight (held lock) → locked", async () => {
    const chatId = await seedChat(db, "a");
    await tryAcquireLock(db, {
      chatId,
      holder: "other-replica",
      now: FROZEN_AT,
      expiresAt: FROZEN_AT + 60_000,
    });
    const h = harness(db);
    await expect(h.engine.runTurn(prepOf(chatId))).rejects.toBeInstanceOf(ChatOperationError);
    expect(h.events).toHaveLength(0);
  });
});

// The refusal above stays BUS-SILENT because nobody opened a client slot for that turn (the founding
// `opening` turn is the ONE live caller of that shape — `forceCharacterTurn` joined the accepting set on
// 2026-08-14, so it is no longer an example here). When the CALLER accepted first
// (`slotAccepted` — every verb that emits `turnAccepted`), the same refusal owes a `turnAborted`: the client's
// slot is open, `turnStarted` never fires, and nothing else on these paths emits, so the slot would strand as a
// stuck Stop button. Depth rides `automationDepth` exactly as a real abort's does.
describe("createTurnEngine — an ACCEPTED turn's pre-start refusals CLOSE the slot (slotAccepted)", () => {
  // The budget/consent twins of the two deleted pre-start pins above are gone for the same reason
  // (@orb/inference §14 F11/F13). The slot-close CONTRACT they shared is unchanged and still pinned by the
  // `locked` and MISSING-persist-target arms below — every accepted-then-refused turn owes one turnAborted.
  test("a held lock → locked + exactly turnAborted(error)", async () => {
    const chatId = await seedChat(db, "a");
    await tryAcquireLock(db, { chatId, holder: "other-replica", now: FROZEN_AT, expiresAt: FROZEN_AT + 60_000 });
    const h = harness(db);
    await expect(h.engine.runTurn(prepOf(chatId, { slotAccepted: true }))).rejects.toMatchObject({ code: "locked" });
    expect(types(h.events)).toEqual(["turnAborted"]);
  });

  test("a MISSING persist target (swipe of a vanished slot) → NOT_FOUND + exactly turnAborted(error)", async () => {
    const chatId = await seedChat(db, "a");
    const h = harness(db);
    await expect(
      h.engine.runTurn(
        prepOf(chatId, {
          slotAccepted: true,
          kind: "swipe",
          persist: { mode: "append-variant", targetMessageId: castId<MessageId>("message_gone") },
        }),
      ),
    ).rejects.toThrow();
    expect(types(h.events)).toEqual(["turnAborted"]);
    expect(h.events[0]).toMatchObject({ intent: "swipe", reason: "error" });
  });

  test("an AUTOMATION-initiated accepted turn's refusal carries its cascade depth (the retry-loop guard)", async () => {
    const chatId = await seedChat(db, "a");
    await tryAcquireLock(db, { chatId, holder: "other-replica", now: FROZEN_AT, expiresAt: FROZEN_AT + 60_000 });
    const h = harness(db);
    await expect(h.engine.runTurn(prepOf(chatId, { slotAccepted: true, automationDepth: 2 }))).rejects.toMatchObject({ code: "locked" });
    expect(h.events[0]).toMatchObject({ type: "turnAborted", automationDepth: 2 });
  });
});

// ── The turn MODES (D26) the engine parametrizes the ONE lifecycle by ───────────────────────────────────────

describe("createTurnEngine — swipe (append-variant on an existing slot, D26)", () => {
  test("appends a variant to the target slot + selects it; slot attribution unchanged", async () => {
    const chatId = await seedChat(db, "a");
    await seedUser(db, castId<Handle>("host"));
    const char = await seedCharacter(db, HOST, "aria");
    await seedMessage(db, chatId, 1, { role: "user", content: "hi" });
    const { messageId } = await seedMessage(db, chatId, 2, {
      role: "assistant",
      characterId: char,
      content: "first take",
    });
    const h = harness(db);

    const outcome = await h.engine.runTurn(
      prepOf(chatId, {
        kind: "swipe",
        speakerCharacterId: char,
        persist: { mode: "append-variant", targetMessageId: messageId },
      }),
    );

    const view = outcome.messages[0];
    expect(view?.id).toBe(messageId); // the SAME slot — no new message
    expect(view?.content).toBe("Hi there"); // the new variant is selected
    expect(view?.selectedVariantIdx).toBe(1);
    expect(view?.variantCount).toBe(2);
    expect(view?.characterId).toBe(char); // attribution unchanged (D26 — a swipe never re-voices)
    // No new slot was added (still 2 canon rows; the tail advanced to the new variant).
    const canon = await loadCanonHistory(db, chatId);
    expect(canon).toHaveLength(2);
    expect(canon[1]?.selectedVariantIdx).toBe(1);
  });
});

// THE D16 CLAMP ANCHOR, at its ONE emit site. `substrate/auth::isBelowHistoryFloor` decides a raw-text
// `delta` on the `slotSeq` stamped here, so a wrong anchor is either a silent LEAK (too high — a clamped
// member streams a pre-join slot's tokens live) or silent un-streaming (too low — the regression this whole
// change exists to undo). `tsc` only proves the field exists; these prove the engine stamps the TRUTH for
// both target shapes, against the real committed row rather than a constant.
describe("createTurnEngine — the D16 `slotSeq` anchor on every streamed delta", () => {
  const deltaAnchors = (events: readonly ChatBusEvent[]): number[] => events.flatMap((e) => (e.type === "delta" ? [e.slotSeq] : []));

  test("a NEW-slot turn anchors its deltas to the seq the reply ACTUALLY commits at", async () => {
    const chatId = await seedChat(db, "slotseq-new");
    await seedMessage(db, chatId, 1, { role: "user", content: "hi" });
    await seedMessage(db, chatId, 2, { role: "assistant", content: "first" });
    const h = harness(db);

    const outcome = await h.engine.runTurn(prepOf(chatId));

    const committedSeq = outcome.messages[0]?.seq;
    expect(committedSeq).toBe(3);
    const anchors = deltaAnchors(h.events);
    expect(anchors.length).toBeGreaterThan(0);
    // The anchor IS the committed row's own seq — at/above every present member's join floor, so a post-join
    // turn streams to everyone entitled to the row it produces.
    expect([...new Set(anchors)]).toEqual([committedSeq]);
  });

  test("a SWIPE anchors its deltas to the TARGET slot's seq, not the canon tail — the leak the clamp closes", async () => {
    const chatId = await seedChat(db, "slotseq-swipe");
    await seedMessage(db, chatId, 1, { role: "user", content: "hi" });
    const { messageId } = await seedMessage(db, chatId, 2, { role: "assistant", content: "first take" });
    // Newer canon so the tail (+1 = 6) is unmistakably different from the target slot's seq (2): a host
    // re-rolling this OLD row must stream it as slot 2, or a member floored above 2 would receive it.
    await seedMessage(db, chatId, 5, { role: "assistant", content: "later" });
    const h = harness(db);

    await h.engine.runTurn(prepOf(chatId, { kind: "swipe", persist: { mode: "append-variant", targetMessageId: messageId } }));

    const anchors = deltaAnchors(h.events);
    expect(anchors.length).toBeGreaterThan(0);
    expect([...new Set(anchors)]).toEqual([2]);
  });
});

describe("createTurnEngine — continue (extend in place + the D26 snapshot)", () => {
  test("appends the continuation to the variant + records preContinue*/lastContinuation*", async () => {
    const chatId = await seedChat(db, "a");
    await seedMessage(db, chatId, 1, { role: "user", content: "hi" });
    const { messageId, variantId } = await seedMessage(db, chatId, 2, {
      role: "assistant",
      content: "The story so far",
    });
    const h = harness(db);

    const outcome = await h.engine.runTurn(
      prepOf(chatId, {
        kind: "continue",
        appendUserTurn: "[continue]",
        persist: { mode: "continue", targetMessageId: messageId },
      }),
    );

    const view = outcome.messages[0];
    expect(view?.id).toBe(messageId);
    expect(view?.content).toBe("The story so farHi there"); // pre + continuation, in place
    expect(view?.variantCount).toBe(1); // extended the SAME variant — no sibling appended

    const [row] = await db
      .select({
        pre: messageVariants.preContinueContent,
        last: messageVariants.lastContinuationContent,
      })
      .from(messageVariants)
      .where(eq(messageVariants.id, variantId));
    expect(row?.pre).toBe("The story so far"); // undoContinue restores this
    expect(row?.last).toBe("Hi there"); // revertContinue re-applies this
  });
});

describe("createTurnEngine — impersonate (a role:user slot, D26)", () => {
  test("commits a human-voiced role:user slot authored by triggeredBy", async () => {
    const chatId = await seedChat(db, "a");
    await seedUser(db, castId<Handle>("host"));
    const h = harness(db);

    const outcome = await h.engine.runTurn(
      prepOf(chatId, {
        kind: "impersonate",
        speakerCharacterId: null,
        appendUserTurn: "[impersonate]",
        persist: { mode: "new-slot", role: "user", authorUserId: HOST, personaId: null },
      }),
    );

    const view = outcome.messages[0];
    expect(view?.role).toBe("user");
    expect(view?.authorUserId).toBe(HOST);
    expect(view?.characterId).toBeNull();
    expect(view?.content).toBe("Hi there");
  });
});

describe("createTurnEngine — generate (LOCK-FREE; active-turns)", () => {
  test("commits while ANOTHER holder owns the per-chat lock (a locked turn would refuse)", async () => {
    const chatId = await seedChat(db, "a");
    // A foreign holder owns a fresh lock — a normal (locked) turn is refused.
    await tryAcquireLock(db, {
      chatId,
      holder: "other-replica",
      now: FROZEN_AT,
      expiresAt: FROZEN_AT + 60_000,
    });
    const h = harness(db);
    await expect(h.engine.runTurn(prepOf(chatId, { kind: "send" }))).rejects.toMatchObject({
      code: "locked",
    });

    // …but a lock-free generate runs concurrent with the held lock and commits.
    const outcome = await h.engine.runTurn(prepOf(chatId, { kind: "generate", lockFree: true }));
    expect(outcome.aborted).toBe(false);
    expect(outcome.messages).toHaveLength(1);
    expect(outcome.messages[0]?.content).toBe("Hi there");
  });
});

describe("createTurnEngine — F3: new-slot seq-collision retry (lock-free generate ∥ locked send)", () => {
  test("a raced (chatId,seq) UNIQUE on the new-slot commit re-derives the head + re-mints, retries once — the paid generation is NOT lost", async () => {
    const chatId = await seedChat(db, "race");

    // Simulate the F3 race: a lock-free `generate` and a locked `send` both allocated `maxSeq + 1` before
    // their pipelines; the slower committer's new-slot insert loses the `messages_chat_seq_unique` race AFTER
    // the generation was paid + streamed. On the FIRST `db.batch`, a competing writer lands a row at the seq
    // this attempt was about to claim, then the batch fails the UNIQUE. commitGeneration must catch it,
    // re-read the now-higher head, re-mint fresh ids, and re-commit — no lost message, no turnAborted.
    let tripped = false;
    const racedDb = new Proxy(db, {
      get(target, prop, receiver) {
        if (prop === "batch") {
          return async (stmts: unknown) => {
            if (!tripped) {
              tripped = true;
              const claimed = (await loadMaxMessageSeq(db, chatId)) + 1;
              await seedMessage(db, chatId, claimed, { content: "racer" });
              throw new Error("SQLITE_CONSTRAINT: UNIQUE constraint failed: messages.chat_id, seq");
            }
            return (target as Db).batch(stmts as never);
          };
        }
        const value = Reflect.get(target, prop, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }) as Db;

    const h = harness(racedDb);
    const outcome = await h.engine.runTurn(prepOf(chatId, { lockFree: true }));

    expect(tripped).toBe(true); // the retry path actually fired
    // The racer took seq 1; the assistant reply retried onto seq 2 — nothing dropped, no re-generation.
    const canon = await loadCanonHistory(db, chatId);
    expect(canon.map((m) => m.content)).toEqual(["racer", "Hi there"]);
    expect(canon.map((m) => m.seq)).toEqual([1, 2]);
    expect(outcome.aborted).toBe(false);
    expect(outcome.messages[0]?.content).toBe("Hi there");
    expect(outcome.messages[0]?.seq).toBe(2);
    // The generation was committed exactly once (the first, failed batch rolled back atomically).
    expect(types(h.events)).not.toContain("turnAborted");
  });
});

describe("createTurnEngine — F4: continuePostfix delimiter on a continue turn", () => {
  const continueTurn = scripted([
    { kind: "text", text: "more" },
    {
      kind: "final",
      economics: { content: "more", tokensIn: 1, tokensOut: 1, model: testModelId("test-model") },
    },
  ]);

  /** Seed an assistant slot to continue, run a continue turn with the given postfix, and return the extended
   *  variant row (content + the undo/revert snapshot columns). */
  async function continueWith(
    postfix: "none" | "space" | "newline" | "double-newline" | undefined,
  ): Promise<{ content: string; preContinueContent: string; lastContinuationContent: string }> {
    const chatId = await seedChat(db, `cont-${postfix ?? "default"}`);
    const { messageId, variantId } = await seedMessage(db, chatId, 1, {
      role: "assistant",
      content: "tip",
    });
    const h = harness(db, { runChatTurn: continueTurn });
    await h.engine.runTurn(
      prepOf(chatId, {
        kind: "continue",
        persist: { mode: "continue", targetMessageId: messageId },
        assembleContext: {
          ...ASSEMBLE_CTX,
          promptConfig: {
            ...DEFAULT_PROMPT_CONFIG,
            ...(postfix !== undefined ? { continuePostfix: postfix } : {}),
          },
        },
      }),
    );
    const [row] = await db.select().from(messageVariants).where(eq(messageVariants.id, variantId));
    return {
      content: row?.content ?? "",
      preContinueContent: row?.preContinueContent ?? "",
      lastContinuationContent: row?.lastContinuationContent ?? "",
    };
  }

  test("a non-empty postfix (double-newline) is inserted between the tip and the continued chunk", async () => {
    const row = await continueWith("double-newline");
    expect(row.content).toBe("tip\n\nmore");
    // The delimiter is folded INTO the continuation piece so `revertContinue` (preContinue + lastContinuation)
    // reproduces the committed content byte-for-byte.
    expect(row.preContinueContent).toBe("tip");
    expect(row.lastContinuationContent).toBe("\n\nmore");
    expect(row.preContinueContent + row.lastContinuationContent).toBe(row.content);
  });

  test("a `space` postfix inserts a single space", async () => {
    const row = await continueWith("space");
    expect(row.content).toBe("tip more");
    expect(row.lastContinuationContent).toBe(" more");
  });

  test("an absent / `none` postfix keeps today's byte-adjacent concatenation (no delimiter)", async () => {
    expect((await continueWith(undefined)).content).toBe("tipmore");
    const none = await continueWith("none");
    expect(none.content).toBe("tipmore");
    expect(none.lastContinuationContent).toBe("more");
  });
});

// The runner honors the threaded signal: an aborted request throws a name-based AbortError mid-generation.
// Hoisted to module scope — the I-7 rpg-abort-trace pin (below) reuses it to reach the engine's abort path.
const honorsAbort: ChatContext["runChatTurn"] = (req) =>
  (async function* (): AsyncGenerator<TurnStreamChunk> {
    await Promise.resolve();
    if (req.signal?.aborted === true) {
      const err = new Error("request aborted");
      err.name = "AbortError";
      throw err;
    }
    yield { kind: "text", text: "should not reach" };
  })();

describe("createTurnEngine — abort signal (FLAG[abort-into-engine] resolved)", () => {
  test("a caller-cancelled turn RETURNS an aborted outcome (aborted:true, reason:user) — no throw, no canon", async () => {
    const chatId = await seedChat(db, "a");
    const h = harness(db, { runChatTurn: honorsAbort });
    const controller = new AbortController();
    controller.abort();

    // A caller cancel is a lifecycle OUTCOME, not an exception — the verb sees `aborted:true`, never a throw.
    const outcome = await h.engine.runTurn(prepOf(chatId, { signal: controller.signal }));
    expect(outcome.aborted).toBe(true);
    expect(outcome.abortReason).toBe("user");
    expect(outcome.messages).toHaveLength(0);

    // The turnAborted bus emission STAYS on the abort path (it is how the UI learns).
    const aborted = h.events.find((e) => e.type === "turnAborted");
    expect(aborted?.type === "turnAborted" && aborted.reason).toBe("user");
    expect(types(h.events)).not.toContain("turnCompleted");
    expect(await loadCanonHistory(db, chatId)).toHaveLength(0);
    // Lock released on the return path.
    expect(await lockExpiry(db, chatId)).toBeNull();
  });

  test("a provider fault merely NAMED AbortError, with an UN-aborted signal, stays a FAULT (#1435)", async () => {
    const chatId = await seedChat(db, "b");
    // Provider timeouts, SDK-internal cancellations and unrelated libraries all throw under this NAME. Nobody
    // cancelled this turn — the signal proves it — so classifying it "user" filed a provider fault as a user
    // action: the caller got a clean aborted outcome and the operator lost the failure entirely.
    const timeout = new Error("provider stream timed out after 120s");
    timeout.name = "AbortError";
    const providerTimeout: ChatContext["runChatTurn"] = () =>
      (async function* (): AsyncGenerator<TurnStreamChunk> {
        await Promise.reject(timeout);
        yield { kind: "text", text: "" }; // unreachable — the reject above throws out of the first next()
      })();
    const h = harness(db, { runChatTurn: providerTimeout });

    // A real failure stays a failure: it THROWS out of the engine rather than returning `abortedOutcome`.
    await expect(h.engine.runTurn(prepOf(chatId))).rejects.toThrow("provider stream timed out after 120s");
    const aborted = h.events.find((e) => e.type === "turnAborted");
    expect(aborted?.type === "turnAborted" && aborted.reason).toBe("error");
    expect(await loadCanonHistory(db, chatId)).toHaveLength(0);
    expect(await lockExpiry(db, chatId)).toBeNull();
  });
});

// ── I-7: the three remaining trace-ring holes are now DETACHED roots of their own ──────────────────────
// The expressions classify, the rpg turn-abort clear, and the post-turn memory build all ran under NO live
// span (same outlives-the-request class SM4 fixed for the rpg round: their dispatch instant still has the
// request span active, but their actual work runs after that root sealed — a parented span would silently
// never land). Proved through the TRACE RING (`recentTraces`), driven from INSIDE an outer request root
// exactly like production — that nesting is the exact condition a non-detached root would have lost.
const TRACE_SCAN_LIMIT = 50;
const OUTER_REQUEST_ID = "i7-trace-outer-request";
const EXPR_REQUEST_ID_RE = /^expr-turn:/;
const RPG_ABORT_REQUEST_ID_RE = /^rpg-turn-abort:/;
const MEMORY_REQUEST_ID_RE = /^memory-turn:/;

describe("createTurnEngine — I-7 trace-ring landing proofs", () => {
  test("the expressions post-turn classify opens its OWN request trace", async () => {
    initTracing();
    const chatId = await seedChat(db, "expr-trace");
    let classifyDone: () => void = () => undefined;
    const classified = new Promise<void>((resolve) => {
      classifyDone = resolve;
    });
    const expressions: NonNullable<ChatContext["expressions"]> = {
      onTurnCompleted: async () => {
        await Promise.resolve();
        classifyDone();
      },
    };
    const h = harness(db, { expressions });

    const outcome = await withRequestSpan(OUTER_REQUEST_ID, "http POST /api/trpc/chat.send", {}, () => h.engine.runTurn(prepOf(chatId)));
    expect(outcome.aborted).toBe(false);
    await classified;

    const trace = recentTraces(TRACE_SCAN_LIMIT).find((t) => t.rootName === "expressions.turnCompleted");
    expect(trace).toBeDefined();
    expect(trace?.requestId).toMatch(EXPR_REQUEST_ID_RE);
    expect(trace?.status).toBe("ok");
    expect(trace?.requestId).not.toBe(OUTER_REQUEST_ID);
  });

  test("the rpg turn-abort staging clear opens its OWN request trace", async () => {
    initTracing();
    const chatId = await seedChat(db, "rpg-abort-trace");
    let clearDone: () => void = () => undefined;
    const cleared = new Promise<void>((resolve) => {
      clearDone = resolve;
    });
    // The abort path reaches only `onTurnAborted` (the `fireOrderRpg`/`gatherSpyRpg` precedent in
    // tests/server/domain/chat/verbs/turn.int.test.ts).
    // @orb-waive no-test-fabrication(unknown): instrumentation double — see above. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    const rpg = {
      onTurnAborted: async () => {
        await Promise.resolve();
        clearDone();
      },
    } as unknown as NonNullable<ChatContext["rpg"]>;
    const h = harness(db, { runChatTurn: honorsAbort, rpg });
    const controller = new AbortController();
    controller.abort();

    const outcome = await withRequestSpan(OUTER_REQUEST_ID, "http POST /api/trpc/chat.send", {}, () =>
      h.engine.runTurn(prepOf(chatId, { signal: controller.signal })),
    );
    expect(outcome.aborted).toBe(true);
    await cleared;

    const trace = recentTraces(TRACE_SCAN_LIMIT).find((t) => t.rootName === "rpg.turnAborted");
    expect(trace).toBeDefined();
    expect(trace?.requestId).toMatch(RPG_ABORT_REQUEST_ID_RE);
    expect(trace?.status).toBe("ok");
    expect(trace?.requestId).not.toBe(OUTER_REQUEST_ID);
  });

  test("the post-turn memory build opens its OWN request trace", async () => {
    initTracing();
    const chatId = await seedChat(db, "memory-trace");
    // A seated character seat, so `chars.length >= 1` and the scoped-digest `Promise.all` below actually
    // reaches `generateDigests` (an empty roster resolves it with zero calls — the completion signal below
    // would never fire).
    await seedUser(db, castId<Handle>("host"));
    const char = await seedCharacter(db, HOST, "aria");
    await seedParticipant(db, { chatId, key: "aria", characterId: char });
    let buildDone: () => void = () => undefined;
    const built = new Promise<void>((resolve) => {
      buildDone = resolve;
    });
    const h = harness(db, {
      generateSegments: async () => {
        await Promise.resolve();
        return { written: 0, skipped: 0 };
      },
      generateDigests: async () => {
        await Promise.resolve();
        buildDone();
        return { written: 0, skipped: 0 };
      },
    });

    const outcome = await withRequestSpan(OUTER_REQUEST_ID, "http POST /api/trpc/chat.send", {}, () => h.engine.runTurn(prepOf(chatId)));
    expect(outcome.aborted).toBe(false);
    await built;

    const trace = recentTraces(TRACE_SCAN_LIMIT).find((t) => t.rootName === "memory.turnCompleted");
    expect(trace).toBeDefined();
    expect(trace?.requestId).toMatch(MEMORY_REQUEST_ID_RE);
    expect(trace?.status).toBe("ok");
    expect(trace?.requestId).not.toBe(OUTER_REQUEST_ID);
  });
});

// ── #1461: EVERY post-turn hook reports its own failure ────────────────────────────────────────────────
// `fireRpgTurnCompleted` logs on catch and the memory build logs + emits + rethrows for the span; the
// expressions classify and the rpg turn-abort clear used `.catch(() => undefined)`, so a rejecting injected
// op left NO log line and NO durable trace of stale derived state (expressions runs on every committed
// turn; the abort clear runs on every abort path — a failed clear leaks staged writes into the NEXT turn).
// Each pin ships its own PLANTED CONTROL: the resolving arm of the same op must produce no line at all.
const HOOK_WARN_TIMEOUT = 2000;

/** The warn messages the two hooks emit — spelled once so a reword breaks the pins, not the reader. */
const EXPR_HOOK_WARN = "expressions: post-turn classify failed (reply already committed)";
const RPG_ABORT_HOOK_WARN = "rpg: turn-abort staging clear failed (the turn is still aborted)";

/** Every `getLog().warn` MESSAGE the spy saw (the second positional — the first is the fields object). Typed
 *  off the LOGGER's own overload set rather than a bare `vi.spyOn` return, whose `calls` is untyped. */
interface WarnSpy {
  readonly mock: { readonly calls: readonly unknown[][] };
}

function warnMessages(spy: WarnSpy): string[] {
  return spy.mock.calls.flatMap((call) => (typeof call[1] === "string" ? [call[1]] : []));
}

describe("createTurnEngine — #1461: a failing post-turn hook is LOGGED, never swallowed", () => {
  test("a REJECTING expressions classify warns with the chat + turn ids", async () => {
    const chatId = await seedChat(db, "expr-hook-warn");
    const expressions: NonNullable<ChatContext["expressions"]> = {
      onTurnCompleted: () => Promise.reject(new Error("classify backend down")),
    };
    const h = harness(db, { expressions });
    const warnSpy = vi.spyOn(getLog(), "warn").mockImplementation(() => undefined);
    try {
      const outcome = await h.engine.runTurn(prepOf(chatId));
      // The happy path is UNCHANGED: the reply still committed (the hook is fire-and-forget).
      expect(outcome.aborted).toBe(false);
      await vi.waitFor(() => expect(warnMessages(warnSpy)).toContain(EXPR_HOOK_WARN), { timeout: HOOK_WARN_TIMEOUT, interval: 5 });
      const [fields] = warnSpy.mock.calls.find((call) => call[1] === EXPR_HOOK_WARN) ?? [];
      expect(fields).toMatchObject({ chatId });
      expect((fields as { turnId?: string } | undefined)?.turnId).toBeDefined();
    } finally {
      warnSpy.mockRestore();
    }
  });

  test("…PLANTED CONTROL: a RESOLVING expressions classify logs nothing", async () => {
    const chatId = await seedChat(db, "expr-hook-quiet");
    let classifyDone: () => void = () => undefined;
    const classified = new Promise<void>((resolve) => {
      classifyDone = resolve;
    });
    const expressions: NonNullable<ChatContext["expressions"]> = {
      onTurnCompleted: async () => {
        await Promise.resolve();
        classifyDone();
      },
    };
    const h = harness(db, { expressions });
    const warnSpy = vi.spyOn(getLog(), "warn").mockImplementation(() => undefined);
    try {
      await h.engine.runTurn(prepOf(chatId));
      await classified;
      expect(warnMessages(warnSpy)).not.toContain(EXPR_HOOK_WARN);
    } finally {
      warnSpy.mockRestore();
    }
  });

  test("a REJECTING rpg turn-abort clear warns with the chat + turn ids", async () => {
    const chatId = await seedChat(db, "rpg-abort-hook-warn");
    // @orb-waive no-test-fabrication(unknown): instrumentation double — the abort path reaches only `onTurnAborted` (the I-7 Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    // abort-trace pin above establishes that).
    const rpg = {
      onTurnAborted: () => Promise.reject(new Error("staging clear failed")),
    } as unknown as NonNullable<ChatContext["rpg"]>;
    const h = harness(db, { runChatTurn: honorsAbort, rpg });
    const controller = new AbortController();
    controller.abort();
    const warnSpy = vi.spyOn(getLog(), "warn").mockImplementation(() => undefined);
    try {
      const outcome = await h.engine.runTurn(prepOf(chatId, { signal: controller.signal }));
      // The abort is still the OUTCOME the caller sees — a failed clear never changes it.
      expect(outcome.aborted).toBe(true);
      await vi.waitFor(() => expect(warnMessages(warnSpy)).toContain(RPG_ABORT_HOOK_WARN), { timeout: HOOK_WARN_TIMEOUT, interval: 5 });
      const [fields] = warnSpy.mock.calls.find((call) => call[1] === RPG_ABORT_HOOK_WARN) ?? [];
      expect(fields).toMatchObject({ chatId });
      expect((fields as { turnId?: string } | undefined)?.turnId).toBeDefined();
    } finally {
      warnSpy.mockRestore();
    }
  });

  test("…PLANTED CONTROL: a RESOLVING rpg turn-abort clear logs nothing", async () => {
    const chatId = await seedChat(db, "rpg-abort-hook-quiet");
    let clearDone: () => void = () => undefined;
    const cleared = new Promise<void>((resolve) => {
      clearDone = resolve;
    });
    // @orb-waive no-test-fabrication(unknown): instrumentation double — see above. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    const rpg = {
      onTurnAborted: async () => {
        await Promise.resolve();
        clearDone();
      },
    } as unknown as NonNullable<ChatContext["rpg"]>;
    const h = harness(db, { runChatTurn: honorsAbort, rpg });
    const controller = new AbortController();
    controller.abort();
    const warnSpy = vi.spyOn(getLog(), "warn").mockImplementation(() => undefined);
    try {
      await h.engine.runTurn(prepOf(chatId, { signal: controller.signal }));
      await cleared;
      expect(warnMessages(warnSpy)).not.toContain(RPG_ABORT_HOOK_WARN);
    } finally {
      warnSpy.mockRestore();
    }
  });
});

// The capability-drop warning emitter (D79). image_dropped rides an end-to-end turn above; tools + structured
// output have no engine INPUT path yet (no chat consumer sets `responseFormat`/tools on a TurnPrep), so their
// The turn-lock heartbeat: `runTurn` refreshes its own lock on a TTL/3 cadence so a turn that outruns the TTL
// stays un-stealable, aborts fail-closed on a lost lock, and never leaks the timer past any exit path. TTL is
// deliberately short here so the real `setInterval` fires within the test; the provider blocks on a gate so a
// heartbeat lands mid-turn.
const HEARTBEAT_TTL = 90;

/** A provider whose stream blocks at `final` until `release()` is called — holds the turn open so a heartbeat
 *  (and a concurrent lock steal) can land mid-generation. */
function gatedProvider(): { runChatTurn: ChatContext["runChatTurn"]; started: Promise<void>; release: () => void } {
  let markStarted!: () => void;
  const started = new Promise<void>((r) => {
    markStarted = r;
  });
  let unblock!: () => void;
  const gate = new Promise<void>((r) => {
    unblock = r;
  });
  const runChatTurn: ChatContext["runChatTurn"] = () =>
    (async function* (): AsyncGenerator<TurnStreamChunk> {
      markStarted();
      await gate;
      yield { kind: "final", economics: { content: "late reply", tokensIn: 4, tokensOut: 2, model: testModelId("test-model") } };
    })();
  return { runChatTurn, started, release: unblock };
}

/** The current lock row's `expiresAt` for a chat (null when released/absent). */
async function lockExpiry(database: Db, chatId: ChatId): Promise<number | null> {
  const rows = await database.select({ expiresAt: chatLocks.expiresAt }).from(chatLocks).where(eq(chatLocks.chatId, chatId));
  return rows[0]?.expiresAt ?? null;
}

describe("createTurnEngine — turn-lock heartbeat", () => {
  test("refreshes its own lock mid-turn so a long turn stays un-stealable", async () => {
    const chatId = await seedChat(db, "hb");
    const provider = gatedProvider();
    // Advancing clock: each `now()` read is later, so a refresh writes a strictly larger `expiresAt`.
    let clock = FROZEN_AT;
    const now = (): number => {
      clock += 1000;
      return clock;
    };
    const h = harness(db, { runChatTurn: provider.runChatTurn, lockTtlMs: HEARTBEAT_TTL, now });

    const run = h.engine.runTurn(prepOf(chatId));
    await provider.started;
    const initial = await lockExpiry(db, chatId);
    expect(initial).not.toBeNull();

    // Wait for at least one heartbeat (TTL/3 = 30ms) to land while the turn is blocked.
    await vi.waitFor(async () => expect(await lockExpiry(db, chatId)).toBeGreaterThan(initial ?? 0), { timeout: 1000, interval: 10 });

    provider.release();
    const outcome = await run;
    expect(outcome.messages[0]?.content).toBe("late reply");
    // Lock released on success — the heartbeat left nothing behind.
    expect(await lockExpiry(db, chatId)).toBeNull();
  });

  test("a lock STOLEN mid-turn aborts the turn (aborted) and writes NO canon", async () => {
    const chatId = await seedChat(db, "steal");
    const provider = gatedProvider();
    const h = harness(db, { runChatTurn: provider.runChatTurn, lockTtlMs: HEARTBEAT_TTL });

    const run = h.engine.runTurn(prepOf(chatId));
    await provider.started;
    // A second replica steals the stale lock out from under the in-flight turn (the exact race the lock guards).
    // `now` is past the initial `expiresAt`, so the stale-steal in `tryAcquireLock` succeeds.
    const stolen = await tryAcquireLock(db, {
      chatId,
      holder: "replica-2",
      now: FROZEN_AT + HEARTBEAT_TTL + 10,
      expiresAt: FROZEN_AT + HEARTBEAT_TTL + 10 + HEARTBEAT_TTL,
    });
    expect(stolen).toBe(true);

    // The next heartbeat's refresh returns false (holder no longer owns it) → abort → reject with `aborted`.
    await expect(run).rejects.toMatchObject({ code: "aborted" });
    provider.release();

    // The dead turn committed no assistant row — the thief is the sole canon writer.
    expect(await loadCanonHistory(db, chatId)).toHaveLength(0);
    // The holder-scoped release is a no-op after the steal: replica-2's lock survives untouched.
    expect(await tryAcquireLock(db, { chatId, holder: "replica-3", now: FROZEN_AT, expiresAt: FROZEN_AT + HEARTBEAT_TTL })).toBe(false);
  });

  test("stops the heartbeat on every exit path — no timer leaks past success OR throw", async () => {
    const clearSpy = vi.spyOn(globalThis, "clearInterval");
    try {
      // Success path.
      const okChat = await seedChat(db, "stop-ok");
      const okBefore = clearSpy.mock.calls.length;
      await harness(db, { lockTtlMs: HEARTBEAT_TTL }).engine.runTurn(prepOf(okChat));
      expect(clearSpy.mock.calls.length).toBeGreaterThan(okBefore);

      // Throw path: the provider errors mid-stream; the heartbeat's interval is still cleared.
      const errChat = await seedChat(db, "stop-err");
      const errProvider: ChatContext["runChatTurn"] = () =>
        (async function* (): AsyncGenerator<TurnStreamChunk> {
          await Promise.reject(new Error("provider exploded"));
          yield { kind: "final", economics: { content: "", tokensIn: 0, tokensOut: 0, model: testModelId("test-model") } };
        })();
      const errBefore = clearSpy.mock.calls.length;
      await expect(harness(db, { runChatTurn: errProvider, lockTtlMs: HEARTBEAT_TTL }).engine.runTurn(prepOf(errChat))).rejects.toThrow("provider exploded");
      expect(clearSpy.mock.calls.length).toBeGreaterThan(errBefore);
      // Both turns released their lock — nothing left holding it.
      expect(await lockExpiry(db, okChat)).toBeNull();
      expect(await lockExpiry(db, errChat)).toBeNull();
    } finally {
      clearSpy.mockRestore();
    }
  });
});

// VER-1b — the EMPTY-CONTENT guard class. FIELD EVIDENCE (chat_01kywqtrrdfqasspzxn0b3n3na seq 5): a swipe on a
// wire that silences prose when `tools[]` ride came back `content:""` / `finish_reason:"tool_calls"`, the engine
// committed it as variant idx 2 and FLIPPED the slot's `selectedVariantId` to it — an invisible row selected
// while two real-prose siblings sat behind it. The guard refuses the commit instead, so the pointer never moves.
// The three arms that must stay apart: ZERO content = refuse · PARTIAL content = commit · ABORT = commit nothing
// (already the grammar — pinned here so a future "persist what streamed" change is a deliberate one).
describe("createTurnEngine — VER-1b: a prose-less generation is a FAILURE, never a committed variant", () => {
  /** The field shape: a completion that answered with tool calls and zero prose. */
  const proseLessTurn = scripted([
    {
      kind: "final",
      economics: { content: "", tokensIn: 3713, tokensOut: 157, model: testModelId("test-model"), finishReason: "tool", stopReason: "tool_calls" },
    },
  ]);

  /** Seeds `hi` → `first take` (one variant, selected) and returns the assistant slot + its variant id. */
  async function seedSwipeTarget(name: string): Promise<{ chatId: ChatId; messageId: MessageId; variantId: MessageVariantId; characterId: CharacterId }> {
    const chatId = await seedChat(db, name);
    await seedUser(db, castId<Handle>("host"));
    const characterId = await seedCharacter(db, HOST, "aria");
    await seedMessage(db, chatId, 1, { role: "user", content: "hi" });
    const seeded = await seedMessage(db, chatId, 2, { role: "assistant", characterId, content: "first take" });
    return { chatId, characterId, ...seeded };
  }

  const selectedVariantOf = async (messageId: MessageId): Promise<string | null> => {
    const rows = await db.select({ selected: messages.selectedVariantId }).from(messages).where(eq(messages.id, messageId));
    return rows[0]?.selected ?? null;
  };

  test("THE REPRO: a swipe whose generation returns ZERO content appends NO variant and leaves the PRIOR one selected", async () => {
    const { chatId, messageId, variantId, characterId } = await seedSwipeTarget("empty-swipe");
    const h = harness(db, { runChatTurn: proseLessTurn });

    await expect(
      h.engine.runTurn(prepOf(chatId, { kind: "swipe", speakerCharacterId: characterId, persist: { mode: "append-variant", targetMessageId: messageId } })),
    ).rejects.toMatchObject({ code: "empty_generation" });

    // Nothing was written: no second variant, and the pointer still names the prose variant.
    const variants = await db.select().from(messageVariants).where(eq(messageVariants.messageId, messageId));
    expect(variants).toHaveLength(1);
    expect(await selectedVariantOf(messageId)).toBe(variantId);
    // What the transcript renders is unchanged — no blank bubble, no phantom swipe counter.
    const canon = await loadCanonHistory(db, chatId);
    expect(canon[1]?.content).toBe("first take");
    expect(canon[1]?.variantCount).toBe(1);
    expect(canon[1]?.selectedVariantIdx).toBe(0);
    // Loud, not silent: turnAborted(error) fired, the turn never claimed completion, and no stats were folded.
    const aborted = h.events.find((e) => e.type === "turnAborted");
    expect(aborted?.type === "turnAborted" && aborted.reason).toBe("error");
    expect(types(h.events)).not.toContain("turnCompleted");
    expect(types(h.events)).not.toContain("messageCommitted");
    expect(h.deltas).toHaveLength(0);
  });

  test("a NEW-SLOT turn returning ZERO content commits no blank slot", async () => {
    const chatId = await seedChat(db, "empty-new-slot");
    const h = harness(db, { runChatTurn: proseLessTurn });

    await expect(h.engine.runTurn(prepOf(chatId))).rejects.toMatchObject({ code: "empty_generation" });

    expect(await loadCanonHistory(db, chatId)).toHaveLength(0);
    expect(await lockExpiry(db, chatId)).toBeNull(); // the lock still released on the refusal path
  });

  test("EMPTYGEN-UNLOGGED: the refusal is OBSERVABLE — a warn fires carrying the populated finishReason", async () => {
    // Previously the refusal surfaced to the client only through tRPC and left NO server-side trace: no
    // finishReason, no tool count — a tool-only completion and a provider that returned nothing were
    // indistinguishable after the fact. `assertGeneratedContent` now warns BEFORE the throw.
    const chatId = await seedChat(db, "empty-unlogged");
    const h = harness(db, { runChatTurn: proseLessTurn });
    const warnSpy = vi.spyOn(getLog(), "warn").mockImplementation(() => undefined);
    try {
      await expect(h.engine.runTurn(prepOf(chatId))).rejects.toMatchObject({ code: "empty_generation" });
      const call = warnSpy.mock.calls.find(([entry]) => (entry as { event?: string } | undefined)?.event === "chat.generation.empty");
      expect(call).toBeDefined();
      const [fields] = call ?? [];
      expect(fields).toMatchObject({ event: "chat.generation.empty", chatId, finishReason: "tool", stopReason: "tool_calls", toolRecords: 0 });
    } finally {
      warnSpy.mockRestore();
    }
  });

  // RECOVER-arm amendment (lane DOG-ENGINE, 2026-08-07). The pin above still holds EXACTLY as written, and
  // that is worth stating: `proseLessTurn` carries `finishReason:"tool"` but NO tool calls and rides with no
  // terminal tools, so it is the unrecoverable class — it must still refuse, and still warn.
  //
  // What changed is that a SECOND class now exists. This pins the two apart at the observability seam, because
  // "the refusal is observable" is only half the guarantee once some refusals stop being refusals: a recovered
  // turn must NOT log `chat.generation.empty` (that would report a failure that did not happen), and it must
  // leave its own trace instead — otherwise the recovery, and its extra wire call, are invisible.
  test("…and a RECOVERED turn logs the recovery instead of the refusal (the two classes stay apart)", async () => {
    const chatId = await seedChat(db, "empty-recovered-log");
    const toolCapable = testConnection();
    // `tools` is a GENERATION-capability axis (`capability.generation.tools` — `coEmitsProseWithTools` reads
    // it there); spreading it onto the Capability ROOT left the wire tool-less and the recovery unreachable.
    const connection = { ...toolCapable, capability: makeCapability({ ...generationOf(toolCapable), tools: { parallel: true, silencesProse: false } }) };
    let call = 0;
    const h = harness(db, {
      runChatTurn: () => {
        const first = call === 0;
        call += 1;
        return (async function* (): AsyncGenerator<TurnStreamChunk> {
          await Promise.resolve();
          yield first
            ? {
                kind: "final",
                economics: {
                  content: "",
                  model: testModelId("test-model"),
                  finishReason: "tool",
                  stopReason: "tool_calls",
                  toolCalls: [{ toolCallId: "c1", name: "update_scene", arguments: "{}" }],
                },
              }
            : { kind: "final", economics: { content: "The hall settles.", model: testModelId("test-model"), finishReason: "stop" } };
        })();
      },
    });
    const warnSpy = vi.spyOn(getLog(), "warn").mockImplementation(() => undefined);
    try {
      const outcome = await h.engine.runTurn(
        prepOf(chatId, { connection, terminalTools: [{ name: "update_scene", description: "the scene", parameters: { type: "object" as const } }] }),
      );
      expect(outcome.messages[0]?.content).toBe("The hall settles.");
      const events = warnSpy.mock.calls.map(([entry]) => (entry as { event?: string } | undefined)?.event);
      expect(events).toContain("chat.generation.recovering");
      // The turn did NOT fail, so the refusal warn must be absent — a recovered turn logging `empty` would
      // read as a defect in every dashboard and every future investigation.
      expect(events).not.toContain("chat.generation.empty");
    } finally {
      warnSpy.mockRestore();
    }
  });

  test("WHITESPACE-only content is the same defect (an invisible row either way)", async () => {
    const { chatId, messageId, variantId, characterId } = await seedSwipeTarget("empty-swipe-ws");
    const h = harness(db, {
      runChatTurn: scripted([{ kind: "final", economics: { content: "\n\n  \n", model: testModelId("test-model") } }]),
    });

    await expect(
      h.engine.runTurn(prepOf(chatId, { kind: "swipe", speakerCharacterId: characterId, persist: { mode: "append-variant", targetMessageId: messageId } })),
    ).rejects.toMatchObject({ code: "empty_generation" });
    expect(await selectedVariantOf(messageId)).toBe(variantId);
  });

  test("THE OTHER ARM: a PARTIAL (truncated) generation is real content — it commits and is selected", async () => {
    const { chatId, messageId, characterId } = await seedSwipeTarget("partial-swipe");
    const h = harness(db, {
      // Cut off at the output cap: short, unfinished — but the user may well want it.
      runChatTurn: scripted([
        { kind: "text", text: "The door creaks" },
        { kind: "final", economics: { content: "The door creaks", tokensOut: 3, model: testModelId("test-model"), finishReason: "length" } },
      ]),
    });

    const outcome = await h.engine.runTurn(
      prepOf(chatId, { kind: "swipe", speakerCharacterId: characterId, persist: { mode: "append-variant", targetMessageId: messageId } }),
    );

    expect(outcome.messages[0]?.content).toBe("The door creaks");
    expect(outcome.messages[0]?.selectedVariantIdx).toBe(1);
    const variants = await db.select().from(messageVariants).where(eq(messageVariants.messageId, messageId));
    expect(variants).toHaveLength(2);
  });

  test("a swipe ABORTED after partial tokens persists NOTHING and leaves the prior variant selected", async () => {
    const { chatId, messageId, variantId, characterId } = await seedSwipeTarget("aborted-swipe");
    const controller = new AbortController();
    // Streams a real chunk, THEN the caller stops the turn — the swipe-and-stop the owner was doing.
    const stopMidStream: ChatContext["runChatTurn"] = () =>
      (async function* (): AsyncGenerator<TurnStreamChunk> {
        await Promise.resolve();
        yield { kind: "text", text: "The door cre" };
        controller.abort();
        const err = new Error("request aborted");
        err.name = "AbortError";
        throw err;
      })();
    const h = harness(db, { runChatTurn: stopMidStream });

    const outcome = await h.engine.runTurn(
      prepOf(chatId, {
        kind: "swipe",
        speakerCharacterId: characterId,
        signal: controller.signal,
        persist: { mode: "append-variant", targetMessageId: messageId },
      }),
    );

    // An abort is an OUTCOME, and it commits nothing — partial or not (the pipeline throws before any write).
    expect(outcome.aborted).toBe(true);
    expect(outcome.abortReason).toBe("user");
    const variants = await db.select().from(messageVariants).where(eq(messageVariants.messageId, messageId));
    expect(variants).toHaveLength(1);
    expect(await selectedVariantOf(messageId)).toBe(variantId);
    expect(types(h.events)).not.toContain("messageCommitted");
  });
});

// ── CP-DROPPED-WARN / INFRA-WARN-DEAF: the infra→chat warning READ end ───────────────────────────────────
// THE BUG THIS CATCHES (and that every pre-existing test missed): the infra runners produced `ChatResult.events`
// warnings that NOBODY read. `createRunChatTurnBridge` mapped only reply/economics, so the `custom_parameters_ignored`
// raised by BOTH OpenRouter chat runners died inside infra — D41 no-silent-degrade satisfied in the logs and
// violated in the product. The producer side was fully covered (two runner suites assert the event); the READ
// side had ZERO coverage, which is exactly how a channel ships with a producer and no consumer.
//
// This drives the REAL chain with only the HTTP hop faked: a preset `customParameters` blob on the assemble
// context → the REAL pipeline `TurnRequest` → the REAL compose bridge's `ChatRequest` map → the REAL runner drop
// belt (`withCustomParametersDrop` + `warningEvents`, imported from the OR runner — never a hand-written code
// string) → the bridge's warning chunks → the engine → the chat bus event the client toasts.
describe("createTurnEngine — an infra runner warning reaches the chat bus (D41 read end)", () => {
  /** FABRICATION-OK: a minimal successful `ChatResult` — the assertion is on `events`, which the leaf below
   *  builds with the REAL OpenRouter drop belt. */
  const orLeafResult: Omit<ChatResult, "events"> = {
    reply: "Hi there",
    reasoning: "",
    reasoningRedacted: false,
    stopReason: null,
    terminalReason: null,
    finishReason: null,
    ttftMs: null,
    durationApiMs: null,
    apiErrorStatus: null,
    numTurns: 1,
    appliedEffort: null,
    usage: {
      model: castId<ModelId>("test-model"),
      tokensIn: 4,
      tokensOut: 2,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      reasoningTokens: null,
      contextWindow: null,
      maxOutputTokens: null,
      costUsd: 0,
      costDetails: null,
      costProvenance: "measured",
    },
    rateLimit: null,
  };

  /** A model that exposes NO sampling range — the production shape behind `sampling_knob_dropped`.
   *  FABRICATION-OK: `resolveChat` reads only these axes. */
  const NoSamplingCapability: GenerationCapability = {
    reasoning: { mode: "none", enabled: false },
    sampling: {},
    input: ["text"],
    output: { maxTokens: { min: 1, max: 4096 }, modalities: ["text"] },
    context: { window: 200_000 },
  };

  /** The infra→chat warning bridge, inlined here (`@orb/inference` keeps the mapper backend-internal). */
  function warningEvents(warnings: ReturnType<typeof resolveChat>["warnings"], at: number): ChatEvent[] {
    return warnings.map((warning) => ({ kind: "warning", at, ...warning }));
  }

  // THE RULING THIS ARM REPLACES (#1440, owner 2026-09-05). Until now this test asserted the OPPOSITE — that
  // `sampling_knob_dropped` must NEVER reach the bus, because `toChatWarningCode` mapped it (and nine
  // siblings) to `null` as a "declared not-yet-surfaced" product call. The owner ruled SURFACE: a user who
  // sets a temperature the model does not expose was being told nothing at all. The mechanism the old ruling
  // protected is preserved — chat still owns its vocabulary and still refuses to leak an unknown code — the
  // INPUT changed: the ten classes now have a chat code (`settings_adjusted`) and authored copy.
  //
  // Driven through the REAL resolver, never a hand-written code string: a capability that exposes no
  // temperature range is exactly what produces this drop in production.
  test("a knob the model doesn't expose reaches the user, naming that knob (#1440)", async () => {
    const chatId = await seedChat(db, "cp-knob");
    // The REAL compose bridge stamps `TurnEconomics.connectionId` off the resolved connection (@orb/inference
    // 5.3b attribution), and `message_variants.connection_id` FKs onto `user_connections` — so this pin, the
    // only one here driving the bridge rather than a bare scripted generator, owes the row the commit points at.
    await seedConnection(db, await seedUser(db, castId<Handle>("host")));
    const resolved = resolveChat({ temperature: 0.9 }, NoSamplingCapability);
    const knobDropped = createRunChatTurnBridge({
      runChatTurn: (): Promise<ChatResult> => Promise.resolve({ ...orLeafResult, events: warningEvents(resolved.warnings, FROZEN_AT) }),
    });
    const h = harness(db, { runChatTurn: knobDropped });

    await h.engine.runTurn(prepOf(chatId));

    // `JSON.stringify` deliberately, like the sibling above: this assertion must COMPILE against the pre-fix
    // source (where the bus member carries no detail fields at all), so its RED is a real defect and not a
    // build error.
    const emitted = JSON.stringify(h.events.filter((e) => e.type === "warning"));
    expect(emitted).toContain('"code":"settings_adjusted"');
    expect(emitted).toContain('"adjustment":"sampling_knob_dropped"');
    expect(emitted).toContain('"knob":"temperature"');
  });
});

// ── EMPTYGEN-REASONING: the prose-less RECOVERY pass (owner ruling 2026-08-07 — RECOVER, don't discard) ──
//
// THE FIELD DEFECT. A folded rpg turn attaches the extraction tools with `tool_choice:"auto"`. With reasoning
// on, the model regularly decides those calls discharged the beat: it thinks, it calls the tools, it writes no
// prose. VER-1b then refused the turn and the model's GOOD STATE WRITES were discarded with the missing reply.
// The operator saw the reasoning stream stop dead, early, under "the model returned no text".
//
// These pin the recovery as a BEHAVIOR, through what the caller and the rpg consumer actually receive: a
// committed reply, and pass 1's tool calls reaching the flush. Against the pre-fix engine every one of them
// fails with `empty_generation` — the defect, not a compile error.
describe("createTurnEngine — a prose-less completion with tool calls is RECOVERED, not discarded", () => {
  /** A tools-capable connection: `coEmitsProseWithTools` is the terminal-tool attach gate, and it reads
   *  exactly `capability.tools` present + not `silencesProse`. */
  const toolConnection = (): ReturnType<typeof testConnection> => {
    const base = testConnection();
    return { ...base, capability: makeCapability({ ...generationOf(base), tools: { parallel: true, silencesProse: false } }) };
  };

  const terminalToolSet = [{ name: "update_scene", description: "the scene", parameters: { type: "object" as const } }];

  /** Pass 1: tool calls + ZERO prose. Pass 2 (the recovery re-run): the narrative. The runner answers by
   *  INVOCATION, which is also how these tests prove there were exactly two wire calls. */
  function twoPassRunner(sink: TurnRequest[], secondPass: readonly TurnStreamChunk[]): ChatContext["runChatTurn"] {
    let call = 0;
    return (req: TurnRequest) => {
      sink.push(req);
      const first = call === 0;
      call += 1;
      return (async function* (): AsyncGenerator<TurnStreamChunk> {
        await Promise.resolve();
        if (first) {
          yield {
            kind: "final",
            economics: {
              content: "",
              tokensIn: 3713,
              tokensOut: 157,
              model: testModelId("test-model"),
              finishReason: "tool",
              stopReason: "tool_calls",
              toolCalls: [{ toolCallId: "c1", name: "update_scene", arguments: '{"weather":"indoors"}' }],
            },
          };
          return;
        }
        for (const chunk of secondPass) {
          yield chunk;
        }
      })();
    };
  }

  const narrativePass: readonly TurnStreamChunk[] = [
    { kind: "text", text: "The hall settles" },
    { kind: "final", economics: { content: "The hall settles around you.", tokensOut: 6, model: testModelId("test-model"), finishReason: "stop" } },
  ];

  test("THE REPRO, RECOVERED: the turn COMMITS the recovery pass's prose instead of failing", async () => {
    const chatId = await seedChat(db, "recover-commits");
    const requests: TurnRequest[] = [];
    const h = harness(db, { runChatTurn: twoPassRunner(requests, narrativePass) });

    const outcome = await h.engine.runTurn(prepOf(chatId, { connection: toolConnection(), terminalTools: terminalToolSet }));

    // The turn SUCCEEDS and the reply is real canon — this is the whole ruling.
    expect(outcome.aborted).toBe(false);
    expect(outcome.messages[0]?.content).toBe("The hall settles around you.");
    expect(await loadCanonHistory(db, chatId)).toHaveLength(1);
    expect(types(h.events)).toContain("turnCompleted");
    expect(types(h.events)).toContain("messageCommitted");
  });

  test("the state writes SURVIVE — pass 1's tool calls reach the rpg flush, alongside pass 2's prose", async () => {
    const chatId = await seedChat(db, "recover-carries-calls");
    const seen: unknown[] = [];
    // @orb-waive no-test-fabrication(unknown): a completed turn reaches only the two turn hooks (the `fireOrderRpg` precedent above); the assertion is on what `onTurnCompleted` is HANDED Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    const rpg = {
      // Rest-typed: the hook takes five positional arguments and only the LAST is under test here.
      onTurnCompleted: (...hookArgs: readonly unknown[]): Promise<void> => {
        seen.push((hookArgs[4] as { terminalToolCalls: unknown }).terminalToolCalls);
        return Promise.resolve();
      },
      onTurnAborted: (): Promise<void> => Promise.resolve(),
    } as unknown as NonNullable<ChatContext["rpg"]>;
    const h = harness(db, { runChatTurn: twoPassRunner([], narrativePass), rpg });

    await h.engine.runTurn(prepOf(chatId, { connection: toolConnection(), terminalTools: terminalToolSet }));
    // The flush is fire-and-forget on a detached root — let the task queue drain.
    await new Promise((resolve) => setTimeout(resolve, 0));

    // The calls handed to rpg are PASS 1's. The recovery pass rode tool-less, so its own channel is null;
    // returning that would silently drop the beat's state, which is the bug this feature exists to fix.
    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual([{ toolCallId: "c1", name: "update_scene", arguments: '{"weather":"indoors"}' }]);
  });

  test("the recovery pass rides TOOL-LESS and carries the continuation ask (never a second discharge)", async () => {
    const chatId = await seedChat(db, "recover-shape");
    const requests: TurnRequest[] = [];
    const h = harness(db, { runChatTurn: twoPassRunner(requests, narrativePass) });

    await h.engine.runTurn(prepOf(chatId, { connection: toolConnection(), terminalTools: terminalToolSet }));

    // Exactly two wire calls: the original and ONE recovery. Never a loop.
    expect(requests).toHaveLength(2);
    expect(requests[0]?.tools?.terminal?.map((t) => t.name)).toEqual(["update_scene"]);
    // Pass 2 attaches NO tools — re-attaching them invites the same discharge that produced no prose.
    expect(requests[1]?.tools).toBeUndefined();
    // …and the ask is the trailing user row, so the model is told to write the beat it skipped.
    const tail = requests[1]?.history.at(-1);
    expect(tail?.role).toBe("user");
    expect(JSON.stringify(tail?.content)).toContain("already recorded");
  });

  test("a recovery pass that ALSO writes no prose fails the turn — the guard still holds, and names the cause", async () => {
    const chatId = await seedChat(db, "recover-fails");
    // Pass 2 answers empty too. There is no third attempt.
    const h = harness(db, {
      runChatTurn: twoPassRunner([], [{ kind: "final", economics: { content: "", model: testModelId("test-model"), finishReason: "tool" } }]),
    });

    const err: unknown = await h.engine.runTurn(prepOf(chatId, { connection: toolConnection(), terminalTools: terminalToolSet })).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatOperationError);
    expect(err).toMatchObject({ code: "empty_generation" });
    // The generic "returned no text" is gone: the message names what the model actually did.
    expect(err instanceof Error ? err.message : "").toContain("tool calls and no story text");
    expect(await loadCanonHistory(db, chatId)).toHaveLength(0);
  });

  test("NO tool calls ⇒ NO recovery: a genuinely empty completion still fails on ONE wire call", async () => {
    const chatId = await seedChat(db, "recover-not-applicable");
    const requests: TurnRequest[] = [];
    // Terminal tools ride, the model calls NOTHING and writes nothing — a quiet beat with no reply. There is
    // nothing to recover FROM, and retrying a provider that returned nothing is how a dead upstream doubles
    // the spend.
    const h = harness(db, {
      runChatTurn: (req: TurnRequest) => {
        requests.push(req);
        return (async function* (): AsyncGenerator<TurnStreamChunk> {
          await Promise.resolve();
          yield { kind: "final", economics: { content: "", model: testModelId("test-model"), finishReason: "stop", toolCalls: [] } };
        })();
      },
    });

    await expect(h.engine.runTurn(prepOf(chatId, { connection: toolConnection(), terminalTools: terminalToolSet }))).rejects.toMatchObject({
      code: "empty_generation",
    });
    expect(requests).toHaveLength(1);
  });

  test("a LENGTH-cut empty turn names the budget and the lever, not 'no text' (the reasoning-wire trap)", async () => {
    const chatId = await seedChat(db, "recover-length-cut");
    // With reasoning on, `maxOutputTokens` caps thinking AND response together — the model can spend the whole
    // budget deliberating and emit nothing. Not recoverable (no tool calls), but it must not present as the
    // same failure as a provider returning nothing.
    const h = harness(db, {
      runChatTurn: () =>
        (async function* (): AsyncGenerator<TurnStreamChunk> {
          await Promise.resolve();
          yield { kind: "final", economics: { content: "", model: testModelId("test-model"), finishReason: "length", maxOutputTokens: 4096 } };
        })(),
    });

    const err: unknown = await h.engine.runTurn(prepOf(chatId)).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "empty_generation" });
    // Names the budget AND the lever — a host told "no text" has no way to find the setting that fixes it.
    expect(err instanceof Error ? err.message : "").toContain("output limit of 4096 tokens");
    expect(err instanceof Error ? err.message : "").toContain("raise the preset's max output tokens");
  });
});

describe("createTurnEngine — the commit fence (#1393)", () => {
  /** Steal the per-chat lock out from under the running turn — the exact state the heartbeat's TTL steal
   *  produces, minus the timing. The heartbeat itself cannot help here: at a 60s TTL it never ticks inside
   *  the turn, so the ONLY thing standing between a stolen lock and a canon write is the commit fence. */
  async function stealLock(chatId: ChatId): Promise<void> {
    await db.update(chatLocks).set({ holder: "replica-2" }).where(eq(chatLocks.chatId, chatId));
  }

  test("a turn whose lock was stolen mid-generation writes NO canon", async () => {
    const chatId = await seedChat(db, "fence-steal");
    // The steal lands while the generation is streaming — i.e. AFTER the last cancellation point the
    // provider stream honors, which is the whole defect: cancellation is not a write barrier.
    const stealingTurn: ChatContext["runChatTurn"] = () =>
      (async function* (): AsyncGenerator<TurnStreamChunk> {
        yield { kind: "text", text: "Hi" };
        await stealLock(chatId);
        yield { kind: "final", economics: { content: "Hi there", tokensIn: 4, tokensOut: 2, model: testModelId("test-model") } };
      })();
    const h = harness(db, { runChatTurn: stealingTurn });

    const outcome = await h.engine.runTurn(prepOf(chatId));

    // A lost lock is an ABORT, not a provider fault — and it is labelled "stale" even though the heartbeat
    // (TTL/3 away) never ticked, so the operator is told what actually happened (#1537).
    expect(outcome).toMatchObject({ aborted: true, abortReason: "stale", messages: [] });
    expect(h.events.filter((e) => e.type === "turnAborted")).toEqual([{ type: "turnAborted", chatId, intent: "send", reason: "stale", automationDepth: 0 }]);
    const rows = await db.select({ id: messages.id }).from(messages).where(eq(messages.chatId, chatId));
    expect(rows).toEqual([]);
    // And the lock is left for its NEW holder — releaseLock is holder-scoped, so the abandoned turn never
    // deletes a row it no longer owns.
    const locks = await db.select({ holder: chatLocks.holder }).from(chatLocks).where(eq(chatLocks.chatId, chatId));
    expect(locks.at(0)?.holder).toBe("replica-2");
  });

  test("CONTROL: the same turn with the lock intact commits normally", async () => {
    const chatId = await seedChat(db, "fence-ok");
    const h = harness(db);
    const outcome = await h.engine.runTurn(prepOf(chatId));
    expect(outcome.messages).toHaveLength(1);
  });

  test("a LOCK-FREE turn is fenced by its signal alone — it holds no lock to check", async () => {
    const chatId = await seedChat(db, "fence-lockfree");
    const h = harness(db);
    // No lock row exists at all for a lockFree turn; the fence must not read that as "stolen".
    const outcome = await h.engine.runTurn(prepOf(chatId, { lockFree: true }));
    expect(outcome.messages).toHaveLength(1);
  });
});

describe("createTurnEngine — the op-log survives a failed commit (#1437)", () => {
  test("a commit that throws BEFORE the write leaves the caller's op-log intact for the retry", async () => {
    const chatId = await seedChat(db, "oplog-retry");
    // ONE assembleContext, shared across a round's speakers (the `round.ts` pattern) — the op-log is the
    // by-reference array assembly pushed this turn's setvars onto.
    const shared: AssembleContext = { ...ASSEMBLE_CTX, opLog: [{ op: "set", key: "hp", value: "1" }] };
    // A COUNTER, not a boolean flag: an `= true` initializer makes biome's type service narrow every later
    // read to the literal and call the branch unreachable.
    let sinkCalls = 0;
    const h = harness(db, {
      applyStatsDelta: (_batch: unknown, _db: Db, _delta: StatsDelta): void => {
        sinkCalls += 1;
        if (sinkCalls === 1) {
          throw new Error("stats sink exploded");
        }
      },
    });

    await expect(h.engine.runTurn(prepOf(chatId, { assembleContext: shared }))).rejects.toThrow("stats sink exploded");
    // NOTHING committed — so the ops the caller staged are still owed to the canon.
    expect(await db.select({ id: messages.id }).from(messages).where(eq(messages.chatId, chatId))).toEqual([]);
    expect(shared.opLog).toEqual([{ op: "set", key: "hp", value: "1" }]);

    // The retry on the SAME context therefore still carries them.
    await h.engine.runTurn(prepOf(chatId, { assembleContext: shared }));
    const history = await loadCanonHistory(db, chatId);
    const [variant] = await db
      .select({ variableDelta: messageVariants.variableDelta })
      .from(messageVariants)
      .where(eq(messageVariants.id, castId(history[0]?.selectedVariantId ?? "")));
    expect(variant?.variableDelta).toEqual([{ op: "set", key: "hp", value: "1" }]);
    // …and the clear still happens on the SUCCESSFUL commit (no double-count for the next speaker).
    expect(shared.opLog).toEqual([]);
  });
});
