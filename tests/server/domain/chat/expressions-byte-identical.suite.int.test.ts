// The E3 null-op byte-identity pin (expressions-design/02 §0). The `ChatContext.expressions` hook is a
// FIRE-AND-FORGET post-commit side-effect — wiring it (vs the `null` no-op) must NOT change the assembled wire
// request OR the persisted canon by a single byte (the `tools: … | null` precedent; the "non-expressions
// deploy byte-identical" guarantee). Posture A = op absent (`null`); posture B = op WIRED but classify-inert
// (the autoClassify-off / sprite-less case, where the real hook returns without emitting). The two must be
// byte-identical, and B must have actually FIRED the hook (a dead hook would trivially pass).

import type { AssembleContext, ChatBusEvent, GroupConfig } from "@orb/contracts/chat";
import { DEFAULT_GROUP_CONFIG } from "@orb/contracts/chat";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { Db } from "@orb/db";
import type { CharacterId, ChatId, MessageId, MessageVariantId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe, vi } from "vitest";
import type { ChatContext } from "../../../../packages/server/src/domain/chat/contract/context";
type ChatExpressionsOps = NonNullable<ChatContext["expressions"]>;
import type { TurnEngine, TurnRequest } from "../../../../packages/server/src/domain/chat/contract/results";
import { createTurnEngine } from "../../../../packages/server/src/domain/chat/engine/engine";
import { driveRound } from "../../../../packages/server/src/domain/chat/engine/round";
import { loadWitnessHorizons } from "../../../../packages/server/src/domain/chat/memory/persistence/queries";
import { recallMemory } from "../../../../packages/server/src/domain/chat/memory/recall/recall";
import { loadCanonHistory } from "../../../../packages/server/src/domain/chat/persistence/queries";
import { freshDb } from "../../../support/db";
import { expect, test } from "../../../support/fixtures";
import { makeChatContext, scriptedRoleTurn, seedCharacter, seedChat, seedMessage, seedUser, testConnection } from "./_support";

const HOST = castId<UserId>("user_host");
const ARIA = castId<CharacterId>("character_aria");

const ASSEMBLE_CTX: AssembleContext = {
  character: { name: "Aria", description: "a bold knight" },
  promptConfig: DEFAULT_PROMPT_CONFIG,
  activePersona: { name: "Alex", description: "the user" },
  recentMessages: [],
};

function realEngine(database: Db, requests: TurnRequest[], expressions: ChatExpressionsOps | null): TurnEngine {
  const ctx = makeChatContext(database, {
    runChatTurn: scriptedRoleTurn(requests),
    applyStatsDelta: (): void => undefined,
    expressions,
  });
  return createTurnEngine(ctx, {
    emit: (_e: ChatBusEvent): Promise<void> => Promise.resolve(),
    debitBudget: (): Promise<void> => Promise.resolve(),
    resolveTurnPolicy: async () => ({ budget: null, allowNonOwnerMaxProSub: false }),
    holder: "tester",
    lockTtlMs: 1000,
    generateSegments: async () => ({ written: 0, skipped: 0 }),
    generateDigests: async () => ({ written: 0, skipped: 0 }),
    loadWitnessHorizons,
    recallMemory,
  });
}

async function runPosture(
  expressions: ChatExpressionsOps | null,
): Promise<{ req: TurnRequest; newRow: { role: string; characterId: unknown; content: string } }> {
  const database = await freshDb();
  await seedUser(database, "host");
  await seedCharacter(database, HOST, "aria");
  const chatId = await seedChat(database, "c");
  await seedMessage(database, chatId, 1, { role: "user", authorUserId: HOST, content: "hello there" });

  const requests: TurnRequest[] = [];
  const outcome = await driveRound({
    engine: realEngine(database, requests, expressions),
    base: {
      chatId: castId<ChatId>("chat_c"),
      assembleContext: ASSEMBLE_CTX,
      connection: testConnection(),
      triggeredBy: HOST,
      runAsUserId: HOST,
      kind: "auto",
      intent: {},
    },
    group: DEFAULT_GROUP_CONFIG satisfies GroupConfig,
    speakers: [{ ref: { kind: "character", characterId: ARIA }, name: "Aria" }],
    groupCharacterId: null,
    castName: "Aria",
  });
  expect(outcome.aborted).toBe(false);
  const history = await loadCanonHistory(database, castId<ChatId>("chat_c"));
  const tail = history.at(-1);
  if (requests[0] === undefined || tail === undefined) {
    throw new Error("posture run produced no request/row");
  }
  return { req: requests[0], newRow: { role: tail.role, characterId: tail.characterId, content: tail.content } };
}

function wireBytes(req: TurnRequest): string {
  return JSON.stringify({ prompt: req.prompt, history: req.history, intent: req.intent, kind: req.kind, cacheBreakpointFromEnd: req.cacheBreakpointFromEnd });
}

describe("E3 expressions hook — the null-op byte-identity pin", () => {
  test("op WIRED (classify-inert) ≡ op ABSENT: byte-identical wire request + persisted canon", async () => {
    const onTurnCompleted = vi.fn<ChatExpressionsOps["onTurnCompleted"]>(() => Promise.resolve());
    const wired = await runPosture({ onTurnCompleted });
    const absent = await runPosture(null);

    expect(wireBytes(wired.req)).toBe(wireBytes(absent.req));
    expect(wired.newRow).toEqual(absent.newRow);
    expect(wired.newRow).toEqual({ role: "assistant", characterId: ARIA, content: "reply" });
  });

  test("the hook actually FIRES after commit (a dead hook would pass the byte pin trivially)", async () => {
    const onTurnCompleted = vi.fn<ChatExpressionsOps["onTurnCompleted"]>(() => Promise.resolve());
    await runPosture({ onTurnCompleted });

    expect(onTurnCompleted).toHaveBeenCalledTimes(1);
    const [chatId, messageId, variantId] = onTurnCompleted.mock.calls[0] as [ChatId, MessageId, MessageVariantId];
    expect(chatId).toBe(castId<ChatId>("chat_c"));
    // The committed slot + its selected variant (the swipe-key pair the client uses).
    expect(messageId).toBeDefined();
    expect(variantId).toBeDefined();
  });
});
