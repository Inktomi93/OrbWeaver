// op: getPendingUserText (docs/plans/rpg/design.md) — the rpg-facing pending-user-text read (the AI GM turn's queued
// dice feed-forward), against a real libSQL db. Proves: the LATEST user-role message's selected-variant content
// wins (never a later assistant/narrator line), an empty chat is `null`, and a message with no user line is null.

import type { Db } from "@orb/db";
import { beforeEach, describe } from "vitest";
import { createGetPendingUserText } from "../../../../../packages/server/src/domain/chat/verbs/get-pending-user-text.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeChatContext, seedChat, seedMessage } from "../_support.ts";

let db: Db;

beforeEach(async () => {
  db = await freshDb();
});

describe("getPendingUserText", () => {
  test("returns the latest USER message's text, ignoring a newer assistant line", async () => {
    const chatId = await seedChat(db, "a");
    await seedMessage(db, chatId, 1, { role: "user", content: "I sneak up. [dice: d20 = 14 (14)]" });
    await seedMessage(db, chatId, 2, { role: "assistant", content: "The guard turns…" });

    const getPendingUserText = createGetPendingUserText(makeChatContext(db));
    expect(await getPendingUserText(chatId)).toBe("I sneak up. [dice: d20 = 14 (14)]");
  });

  test("resolves the MOST RECENT of several user messages", async () => {
    const chatId = await seedChat(db, "a");
    await seedMessage(db, chatId, 1, { role: "user", content: "first" });
    await seedMessage(db, chatId, 3, { role: "user", content: "latest" });

    const getPendingUserText = createGetPendingUserText(makeChatContext(db));
    expect(await getPendingUserText(chatId)).toBe("latest");
  });

  test("null when the chat has no user message (empty, or only assistant lines)", async () => {
    const chatId = await seedChat(db, "a");
    const getPendingUserText = createGetPendingUserText(makeChatContext(db));
    expect(await getPendingUserText(chatId)).toBeNull();

    await seedMessage(db, chatId, 1, { role: "assistant", content: "narration" });
    expect(await getPendingUserText(chatId)).toBeNull();
  });
});
