import { applyRpgRoundEvent, clearRpgRounds, readRpgRoundPendingForTest } from "@orb/client/state";
import type { ChatId, ChatTurnId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { beforeEach, describe } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

const CHAT = castId<ChatId>("chat_rpg_round_store");
const TURN_A = castId<ChatTurnId>("chat_turn_round_a");
const TURN_B = castId<ChatTurnId>("chat_turn_round_b");

beforeEach(() => clearRpgRounds());

describe("rpg round lifecycle", () => {
  test("stays pending until every concurrent turn settles", () => {
    applyRpgRoundEvent({ type: "stateRoundStarted", chatId: CHAT, turnId: TURN_A });
    applyRpgRoundEvent({ type: "stateRoundStarted", chatId: CHAT, turnId: TURN_B });
    applyRpgRoundEvent({ type: "stateRoundSettled", chatId: CHAT, turnId: TURN_A });
    expect(readRpgRoundPendingForTest(CHAT)).toBe(true);
    applyRpgRoundEvent({ type: "stateRoundSettled", chatId: CHAT, turnId: TURN_B });
    expect(readRpgRoundPendingForTest(CHAT)).toBe(false);
  });

  test("duplicate starts are idempotent and reconnect clear removes stale lifecycle state", () => {
    applyRpgRoundEvent({ type: "stateRoundStarted", chatId: CHAT, turnId: TURN_A });
    applyRpgRoundEvent({ type: "stateRoundStarted", chatId: CHAT, turnId: TURN_A });
    clearRpgRounds(CHAT);
    expect(readRpgRoundPendingForTest(CHAT)).toBe(false);
  });
});
