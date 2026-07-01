// engine/engine — the turn LIFECYCLE shell (.int: real libSQL for the lock + the D26 canon persist). Pins
// the happy path (belts → turnStarted → generate → persist → committed/completed → lock released), the
// turnAborted-then-rethrow error path, and the pre-start belt refusals (budget / consent / locked).

import type { AssembleContext, ChatBusEvent } from "@orb/contracts/chat";
import type { ModelCapability, ResolvedConnection } from "@orb/contracts/connection";
import type { ResolvedCredential } from "@orb/contracts/credentials";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { StatsDelta } from "@orb/contracts/stats";
import type { Db } from "@orb/db";
import { messageVariants } from "@orb/db";
import { DomainRateLimitError } from "@orb/kit/errors";
import type { ChatId, ModelId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { beforeEach, describe, vi } from "vitest";
import type { ChatContext } from "../../../../../packages/server/src/domain/chat/contract/context";
import { ChatOperationError } from "../../../../../packages/server/src/domain/chat/contract/errors";
import type {
  TurnPrep,
  TurnStreamChunk,
} from "../../../../../packages/server/src/domain/chat/contract/results";
import { createTurnEngine } from "../../../../../packages/server/src/domain/chat/engine/engine";
import { tryAcquireLock } from "../../../../../packages/server/src/domain/chat/persistence/lock";
import { loadCanonHistory } from "../../../../../packages/server/src/domain/chat/persistence/queries";
import { freshDb } from "../../../../support/db";
import { expect, test } from "../../../../support/fixtures";
import {
  FROZEN_AT,
  makeChatContext,
  seedCharacter,
  seedChat,
  seedMessage,
  seedUser,
} from "../_support";

const HOST = castId<UserId>("user_host");
const MEMBER = castId<UserId>("user_member");

const CAPABILITY = {
  reasoning: { mode: "none", enabled: false },
  sampling: {},
  output: { maxTokens: { min: 1, max: 8192 } },
  context: { window: 200_000 },
} as unknown as ModelCapability;

function connectionOf(source = "vllm"): ResolvedConnection {
  return {
    api: "chat-completions",
    model: castId<ModelId>("test-model"),
    credential: { source, credentialId: null } as unknown as ResolvedCredential,
    capability: CAPABILITY,
  };
}

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
    connection: connectionOf(),
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
  } = {},
): Harness {
  const events: ChatBusEvent[] = [];
  const deltas: StatsDelta[] = [];
  const ctx = makeChatContext(database, {
    runChatTurn: over.runChatTurn ?? OK_TURN,
    applyStatsDelta: (_batch: unknown, _db: Db, delta: StatsDelta): void => {
      deltas.push(delta);
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
    lockTtlMs: 60_000,
    generateSegments: async () => {
      /* no-op */
    },
    generateDigests: async () => {
      /* no-op */
    },
  });
  return { ctx, events, deltas, debitBudget, engine };
}

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

const types = (events: readonly ChatBusEvent[]): string[] => events.map((e) => e.type);

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
          connection: connectionOf("max-pro-sub"),
          triggeredBy: MEMBER,
          runAsUserId: HOST,
        }),
      ),
    ).rejects.toMatchObject({ code: "consent_required" });
    expect(h.events).toHaveLength(0);
  });

  test("a turn already in flight (held lock) → locked", async () => {
    const chatId = await seedChat(db, "a");
    // Another holder owns a FRESH lock.
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

describe("createTurnEngine — abort signal (FLAG[abort-into-engine] resolved)", () => {
  test("an aborted signal interrupts the turn → turnAborted(user) then rethrow", async () => {
    const chatId = await seedChat(db, "a");
    // The runner honors the threaded signal: an aborted request throws AbortError mid-generation.
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
    const h = harness(db, { runChatTurn: honorsAbort });
    const controller = new AbortController();
    controller.abort();

    await expect(h.engine.runTurn(prepOf(chatId, { signal: controller.signal }))).rejects.toThrow();

    const aborted = h.events.find((e) => e.type === "turnAborted");
    expect(aborted?.type === "turnAborted" && aborted.reason).toBe("user");
    expect(types(h.events)).not.toContain("turnCompleted");
    // Nothing committed.
    expect(await loadCanonHistory(db, chatId)).toHaveLength(0);
  });
});
