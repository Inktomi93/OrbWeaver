import { messages, messageVariants } from "@orb/db";
import type { MessageId, MessageVariantId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { loadCanonHistory, loadHasSelectedCanonUserMessage } from "../../../../../packages/server/src/domain/chat/persistence/queries.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { FROZEN_AT, seedChat, seedMessage } from "../_support.ts";

describe("loadHasSelectedCanonUserMessage", () => {
  test("matches selected canon, including hidden user slots, while ignoring slots without a selected variant", async () => {
    const db = await freshDb();
    const chatId = await seedChat(db, "selected_user");
    const otherChatId = await seedChat(db, "other");
    const unselectedUserId = castId<MessageId>("message_unselected_user");
    const unselectedVariantId = castId<MessageVariantId>("variant_unselected_user");

    await db.insert(messages).values({
      id: unselectedUserId,
      chatId,
      seq: 1,
      role: "user",
      createdAt: FROZEN_AT,
    });
    await db.insert(messageVariants).values({
      id: unselectedVariantId,
      messageId: unselectedUserId,
      idx: 0,
      content: "not selected canon",
      createdAt: FROZEN_AT,
    });
    await seedMessage(db, otherChatId, 1, { role: "user", content: "another room" });

    expect(await loadCanonHistory(db, chatId)).toEqual([]);
    expect(await loadHasSelectedCanonUserMessage(db, chatId)).toBe(false);

    await seedMessage(db, chatId, 2, { role: "user", excludedFromPrompt: true, content: "hidden user" });

    expect((await loadCanonHistory(db, chatId)).map((message) => message.role)).toEqual(["user"]);
    expect(await loadHasSelectedCanonUserMessage(db, chatId)).toBe(true);
  });
});
