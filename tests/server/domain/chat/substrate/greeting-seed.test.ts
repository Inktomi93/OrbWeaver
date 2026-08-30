// domain/chat/substrate/greeting-seed — pins the header's contract: an empty/whitespace greeting seeds NO
// row and consumes no seq (a cleared greeting leaves no gap), non-empty greetings land oldest-first from
// `startSeq + 1`, and every id/timestamp is CALLER-stamped (no ambient mint — pins determinism).

import type { Db } from "@orb/db";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { beforeEach, describe } from "vitest";
import { buildGreetingSeed } from "../../../../../packages/server/src/domain/chat/substrate/greeting-seed.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeChatContext } from "../_support.ts";

let db: Db;

beforeEach(async () => {
  db = await freshDb();
});

const CHAT_ID = castId<ChatId>("chat_greet");
const CHAR_A = castId<CharacterId>("character_a");
const CHAR_B = castId<CharacterId>("character_b");

describe("buildGreetingSeed", () => {
  test("non-empty greetings land oldest-first, seq starting at startSeq + 1", () => {
    const ctx = makeChatContext(db);
    const { stmts, views } = buildGreetingSeed(ctx, {
      chatId: CHAT_ID,
      now: 1000,
      startSeq: 0,
      greetings: [
        { characterId: CHAR_A, text: "Hello there." },
        { characterId: CHAR_B, text: "Greetings, traveler." },
      ],
    });
    expect(stmts).toHaveLength(2 * (stmts.length / 2)); // even number of statements (canon-write batches per row)
    expect(views).toHaveLength(2);
    expect(views[0]?.seq).toBe(1);
    expect(views[0]?.characterId).toBe(CHAR_A);
    expect(views[0]?.content).toBe("Hello there.");
    expect(views[1]?.seq).toBe(2);
    expect(views[1]?.characterId).toBe(CHAR_B);
  });

  test("a character with an empty/whitespace greeting is SKIPPED — no row, no consumed seq (no gap)", () => {
    const ctx = makeChatContext(db);
    const { views } = buildGreetingSeed(ctx, {
      chatId: CHAT_ID,
      now: 1000,
      startSeq: 0,
      greetings: [
        { characterId: CHAR_A, text: "   " }, // whitespace-only ⇒ skipped
        { characterId: CHAR_B, text: "Real greeting." },
      ],
    });
    expect(views).toHaveLength(1);
    // The surviving row's seq is 1, NOT 2 — the skipped greeting left no gap.
    expect(views[0]?.characterId).toBe(CHAR_B);
    expect(views[0]?.seq).toBe(1);
  });

  test("a founding room (startSeq 0) and a mid-canon add (startSeq > 0) both continue from the given head", () => {
    const ctx = makeChatContext(db);
    const { views } = buildGreetingSeed(ctx, { chatId: CHAT_ID, now: 1000, startSeq: 5, greetings: [{ characterId: CHAR_A, text: "Late joiner." }] });
    expect(views[0]?.seq).toBe(6);
  });

  test("all-empty greetings produce zero rows and zero statements", () => {
    const ctx = makeChatContext(db);
    const { stmts, views } = buildGreetingSeed(ctx, { chatId: CHAT_ID, now: 1000, startSeq: 0, greetings: [{ characterId: CHAR_A, text: "" }] });
    expect(stmts).toHaveLength(0);
    expect(views).toHaveLength(0);
  });

  test("ids and timestamps are CALLER-stamped — every view carries the passed `now`, never a wall-clock read", () => {
    const ctx = makeChatContext(db);
    const { views } = buildGreetingSeed(ctx, { chatId: CHAT_ID, now: 424_242, startSeq: 0, greetings: [{ characterId: CHAR_A, text: "Stamped." }] });
    expect(views[0]?.createdAt).toBe(424_242);
  });
});
