// engine/engine — the turn LIFECYCLE shell (.int: real libSQL for the lock + the D26 canon persist). Pins
// the happy path (belts → turnStarted → generate → persist → committed/completed → lock released), the abort
// CLASSIFICATION (a FAULT emits turnAborted(error) then rethrows; a caller cancel emits turnAborted(user) then
// RETURNS the aborted outcome — an abort is an outcome, not an exception), and the pre-start belt refusals
// (budget / consent / locked).

import type { AssembleContext, ChatBusEvent } from "@orb/contracts/chat";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { StatsDelta } from "@orb/contracts/stats";
import type { BatchStmt, Db } from "@orb/db";
import { characterStats, chatLocks, chats, dailyStats, messages, messageVariants, ownerStats } from "@orb/db";
import { DomainRateLimitError } from "@orb/kit/errors";
import type { CharacterId, ChatId, UserId, WorldEntryId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { RowMacroNameContext } from "@orb/kit/macro";
import { applyStatsDelta } from "@orb/server/domain/stats";
import { eq } from "drizzle-orm";
import { beforeEach, describe, vi } from "vitest";
import type { ChatContext } from "../../../../../packages/server/src/domain/chat/context";
import { ChatOperationError } from "../../../../../packages/server/src/domain/chat/contract/errors";
import type { MemoryRecallInputs } from "../../../../../packages/server/src/domain/chat/contract/memory";
import type { TurnPrep, TurnRequest, TurnStreamChunk } from "../../../../../packages/server/src/domain/chat/contract/results";
import { createTurnEngine } from "../../../../../packages/server/src/domain/chat/engine/engine";
import { loadWitnessHorizons } from "../../../../../packages/server/src/domain/chat/memory/persistence/queries";
import { recallMemory } from "../../../../../packages/server/src/domain/chat/memory/recall/recall";
import type { WitnessInterval } from "../../../../../packages/server/src/domain/chat/memory/types";
import { tryAcquireLock } from "../../../../../packages/server/src/domain/chat/persistence/lock";
import { loadCanonHistory, loadMaxMessageSeq, loadTurnOrigin } from "../../../../../packages/server/src/domain/chat/persistence/queries";
import { freshDb } from "../../../../support/db";
import { expect, test } from "../../../../support/fixtures";
import { FROZEN_AT, makeChatContext, seedCharacter, seedChat, seedMessage, seedParticipant, seedUser, stubRunCompaction, testConnection } from "../_support";

const HOST = castId<UserId>("user_host");
const MEMBER = castId<UserId>("user_member");

const ASSEMBLE_CTX: AssembleContext = {
  character: { name: "Aria", description: "a bold knight" },
  promptConfig: DEFAULT_PROMPT_CONFIG,
  activePersona: { name: "Nate", description: "the user" },
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
    economics: { content: "Hi there", tokensIn: 4, tokensOut: 2, model: "test-model" },
  },
]);

function prepOf(chatId: ChatId, over: Partial<TurnPrep> = {}): TurnPrep {
  return {
    chatId,
    assembleContext: ASSEMBLE_CTX,
    connection: testConnection(),
    triggeredBy: HOST,
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
  chatChangedFans: { chatId: string; options: unknown }[];
  debitBudget: ReturnType<typeof vi.fn>;
  engine: ReturnType<typeof createTurnEngine>;
}

function harness(
  database: Db,
  over: {
    runChatTurn?: ChatContext["runChatTurn"];
    budget?: number | null;
    allowNonOwnerMaxProSub?: boolean;
    debit?: () => Promise<void>;
    generateSegments?: Parameters<typeof createTurnEngine>[1]["generateSegments"];
    generateDigests?: Parameters<typeof createTurnEngine>[1]["generateDigests"];
    loadWitnessHorizons?: Parameters<typeof createTurnEngine>[1]["loadWitnessHorizons"];
    recallMemory?: Parameters<typeof createTurnEngine>[1]["recallMemory"];
    runCompaction?: Parameters<typeof createTurnEngine>[1]["runCompaction"];
    lockTtlMs?: number;
    now?: () => number;
  } = {},
): Harness {
  const events: ChatBusEvent[] = [];
  const deltas: StatsDelta[] = [];
  const chatChangedFans: { chatId: string; options: unknown }[] = [];
  const ctx = makeChatContext(database, {
    runChatTurn: over.runChatTurn ?? OK_TURN,
    ...(over.now !== undefined ? { now: over.now } : {}),
    applyStatsDelta: (_batch: unknown, _db: Db, delta: StatsDelta): void => {
      deltas.push(delta);
    },
    emitChatChanged: (chatId, options): Promise<void> => {
      chatChangedFans.push({ chatId, options });
      return Promise.resolve();
    },
  });
  const debitBudget = vi.fn(over.debit ?? ((): Promise<void> => Promise.resolve()));
  const engine = createTurnEngine(ctx, {
    emit: (event: ChatBusEvent): Promise<void> => {
      events.push(event);
      return Promise.resolve();
    },
    debitBudget,
    resolveTurnPolicy: (): Promise<{ budget: number | null; allowNonOwnerMaxProSub: boolean }> =>
      Promise.resolve({
        budget: over.budget ?? null,
        allowNonOwnerMaxProSub: over.allowNonOwnerMaxProSub ?? false,
      }),
    holder: "replica-1",
    lockTtlMs: over.lockTtlMs ?? 60_000,
    generateSegments: over.generateSegments ?? (async () => ({ written: 0, skipped: 0 })),
    generateDigests: over.generateDigests ?? (async () => ({ written: 0, skipped: 0 })),
    loadWitnessHorizons: over.loadWitnessHorizons ?? loadWitnessHorizons,
    recallMemory: over.recallMemory ?? recallMemory,
    runCompaction: over.runCompaction ?? stubRunCompaction,
  });
  return { ctx, events, deltas, chatChangedFans, debitBudget, engine };
}

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

const types = (events: readonly ChatBusEvent[]): string[] => events.map((e) => e.type);

describe("createTurnEngine — turn origin stamping (automation-design/03 §4; §AC-B)", () => {
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

describe("createTurnEngine — happy path", () => {
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
            model: "test-model",
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
        { kind: "final", economics: { content: "Hi there", reasoning: "the settled trace", tokensIn: 4, tokensOut: 2, model: "test-model" } },
      ]),
    }).engine.runTurn(prepOf(fromFinal));

    // The deltas-only shape: no `reasoning` on the terminal economics ⇒ the accumulated deltas ARE the trace.
    const fromDeltas = await seedChat(db, "reason_deltas");
    await harness(db, {
      runChatTurn: scripted([
        { kind: "reasoning", text: "weighing " },
        { kind: "reasoning", text: "two openings" },
        { kind: "text", text: "Hi" },
        { kind: "final", economics: { content: "Hi there", tokensIn: 4, tokensOut: 2, model: "test-model" } },
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
        { kind: "final", economics: { content: "Hi there", reasoning: "the model's private trace", tokensIn: 4, tokensOut: 2, model: "test-model" } },
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

    const wi = h.events.find((e) => e.type === "worldInfoActivated");
    expect(wi).toMatchObject({ type: "worldInfoActivated", chatId, entryIds: [firedId] });
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
    expect(h.debitBudget).toHaveBeenCalledWith(MEMBER, null);
  });

  test("the lock is released — a second turn runs (seq advances)", async () => {
    const chatId = await seedChat(db, "a");
    const h = harness(db);
    await h.engine.runTurn(prepOf(chatId));
    await h.engine.runTurn(prepOf(chatId));
    const history = await loadCanonHistory(db, chatId);
    expect(history.map((m) => m.seq)).toEqual([1, 2]);
  });

  test("D17: a self-triggered (owner) max-pro-sub turn threads ownerConsented:true onto the built TurnRequest", async () => {
    // The owner speaking on their own box (triggeredBy === runAsUserId): the consent belt does not throw, and
    // the engine derives ownerConsented:true and stamps it on the TurnRequest the infra firewall re-verifies —
    // the field being false is exactly what refused every owner max-pro-sub turn before this belt was wired.
    const chatId = await seedChat(db, "consent");
    let captured: TurnRequest | null = null;
    const capturing: ChatContext["runChatTurn"] = (req) => {
      captured = req;
      return OK_TURN(req);
    };
    const h = harness(db, { runChatTurn: capturing });

    await h.engine.runTurn(
      prepOf(chatId, {
        connection: testConnection("max-pro-sub"),
        triggeredBy: HOST,
        runAsUserId: HOST,
      }),
    );

    expect(captured).not.toBeNull();
    expect((captured as unknown as TurnRequest).ownerConsented).toBe(true);
  });
});

describe("createTurnEngine — R3 stats real-wire (the REAL applyStatsDelta lands rollup rows)", () => {
  test("a committed turn flows through the production applyStatsDelta → characterStats/ownerStats/dailyStats rows carry the turn's economics", async () => {
    // The other engine tests inject a RECORDER for applyStatsDelta (assert the computed StatsDelta shape). This
    // one wires the REAL `stats/write/apply-delta` — the pure batch fn the composition root injects — so the
    // engine's own `db.batch` commits the four rollup UPSERTs alongside the canon write. It proves, from chat's
    // real call site, that the live delta actually lands as rows (the apply≡reconcile invariant's write half).
    const chatId = await seedChat(db, "stats");
    await seedUser(db, "host");
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
      debitBudget: vi.fn(() => Promise.resolve()),
      resolveTurnPolicy: () => Promise.resolve({ budget: null, allowNonOwnerMaxProSub: false }),
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
    // A cast character in the roster — `chars.length > 0` is what actually drives the engine into calling
    // `deps.generateDigests` (an empty roster short-circuits `Promise.all([])`, never reaching the throw).
    await seedUser(db, "host");
    const char = await seedCharacter(db, HOST, "aria");
    await seedParticipant(db, { chatId, key: "aria", characterId: char });
    const events: ChatBusEvent[] = [];
    const ctx = makeChatContext(db, { runChatTurn: OK_TURN });
    const engine = createTurnEngine(ctx, {
      emit: (event: ChatBusEvent): Promise<void> => {
        events.push(event);
        return Promise.resolve();
      },
      debitBudget: vi.fn(() => Promise.resolve()),
      resolveTurnPolicy: (): Promise<{ budget: number | null; allowNonOwnerMaxProSub: boolean }> =>
        Promise.resolve({ budget: null, allowNonOwnerMaxProSub: false }),
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

  test("F3: threads the resolved cast NAME map into the segment + digest builds (not raw typeids)", async () => {
    const chatId = await seedChat(db, "memnames");
    await seedUser(db, "host");
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

  test("F3b: threads each cast character's WITNESSING horizons into its SCOPED digest build (D6)", async () => {
    const chatId = await seedChat(db, "memwitness");
    await seedUser(db, "host");
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
    await seedUser(db, "host");
    const aria = await seedCharacter(db, HOST, "aria"); // present since the chat opened
    const bram = await seedCharacter(db, HOST, "bram"); // a late joiner
    await seedParticipant(db, { chatId, key: "aria", characterId: aria, joinSeq: 1, leftSeq: null });
    await seedParticipant(db, { chatId, key: "bram", characterId: bram, joinSeq: 20, leftSeq: null });

    // Record every per-speaker recall dispatch (bucket + horizons) the engine issues.
    const calls: { scoped: string; group: string; witnessing: readonly WitnessInterval[] | undefined }[] = [];
    const recordRecall: Parameters<typeof createTurnEngine>[1]["recallMemory"] = (_ctx, args) => {
      calls.push({ scoped: args.scope.scopedCharacterId, group: args.groupCharacterId, witnessing: args.witnessing });
      return Promise.resolve(`memory-for-${args.scope.scopedCharacterId}`);
    };
    const h = harness(db, { recallMemory: recordRecall });

    const memoryRecall: MemoryRecallInputs = { groupCharacterId: aria, recent: [], names: new Map<CharacterId, string>(), config: { mode: "mixA" } };
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
    await seedUser(db, "host");
    const aria = await seedCharacter(db, HOST, "aria");
    await seedParticipant(db, { chatId, key: "aria", characterId: aria, joinSeq: 5, leftSeq: null });

    let recallCalls = 0;
    const recordRecall: Parameters<typeof createTurnEngine>[1]["recallMemory"] = (_ctx, _args) => {
      recallCalls += 1;
      return Promise.resolve("scoped");
    };
    const h = harness(db, { recallMemory: recordRecall });
    const memoryRecall: MemoryRecallInputs = { groupCharacterId: aria, recent: [], names: new Map<CharacterId, string>(), config: { mode: "mixA" } };

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
    // A partial stream then a mid-flight failure (the realistic error path).
    const throwing: ChatContext["runChatTurn"] = () =>
      (async function* (): AsyncGenerator<TurnStreamChunk> {
        await Promise.resolve();
        yield { kind: "text", text: "partial" };
        throw new Error("model exploded");
      })();
    const h = harness(db, { runChatTurn: throwing });

    await expect(h.engine.runTurn(prepOf(chatId))).rejects.toThrow("model exploded");

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
  test("budget exhausted → budget_exceeded, nothing emitted", async () => {
    const chatId = await seedChat(db, "a");
    const h = harness(db, {
      budget: 1,
      debit: () => Promise.reject(new DomainRateLimitError("over", { remainingPoints: 0 })),
    });
    await expect(h.engine.runTurn(prepOf(chatId))).rejects.toMatchObject({
      code: "budget_exceeded",
    });
    expect(h.events).toHaveLength(0);
  });

  test("max-pro-sub by a member without consent → consent_required, nothing emitted", async () => {
    const chatId = await seedChat(db, "a");
    const h = harness(db);
    await expect(
      h.engine.runTurn(
        prepOf(chatId, {
          connection: testConnection("max-pro-sub"),
          triggeredBy: MEMBER,
          runAsUserId: HOST,
        }),
      ),
    ).rejects.toMatchObject({ code: "consent_required" });
    expect(h.events).toHaveLength(0);
  });

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

// ── The turn MODES (D26) the engine parametrizes the ONE lifecycle by ───────────────────────────────────────

describe("createTurnEngine — swipe (append-variant on an existing slot, D26)", () => {
  test("appends a variant to the target slot + selects it; slot attribution unchanged", async () => {
    const chatId = await seedChat(db, "a");
    await seedUser(db, "host");
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
    await seedUser(db, "host");
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
      economics: { content: "more", tokensIn: 1, tokensOut: 1, model: "test-model" },
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

describe("createTurnEngine — abort signal (FLAG[abort-into-engine] resolved)", () => {
  // The runner honors the threaded signal: an aborted request throws a name-based AbortError mid-generation.
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
      yield { kind: "final", economics: { content: "late reply", tokensIn: 4, tokensOut: 2, model: "test-model" } };
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
          yield { kind: "final", economics: { content: "", tokensIn: 0, tokensOut: 0, model: "test-model" } };
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
