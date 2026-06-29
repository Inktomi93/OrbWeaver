// engine/engine — the turn LIFECYCLE shell (.int: real libSQL for the lock + the D26 canon persist). Pins
// the happy path (belts → turnStarted → generate → persist → committed/completed → lock released), the
// turnAborted-then-rethrow error path, and the pre-start belt refusals (budget / consent / locked).

import type { AssembleContext, ChatBusEvent } from "@orb/contracts/chat";
import type { ModelCapability, ResolvedConnection } from "@orb/contracts/connection";
import type { ResolvedCredential } from "@orb/contracts/credentials";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { StatsDelta } from "@orb/contracts/stats";
import type { Db } from "@orb/db";
import { DomainRateLimitError } from "@orb/kit/errors";
import type { ChatId, ModelId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { beforeEach, describe, expect, test, vi } from "vitest";
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
import { FROZEN_AT, makeChatContext, seedChat } from "../_support";

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
