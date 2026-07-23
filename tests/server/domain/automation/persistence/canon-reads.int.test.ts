// Persistence: the narrow cross-domain canon reads (the authority gate + the book-attachment consent probe
// + the CEL chat.messageCount projection). Reads only — automation never mutates another domain's canon here.

import { chatBooks, worldBooks } from "@orb/db";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { describe } from "vitest";
import {
  countChatMessages,
  isBookAttachedToChat,
  loadCallerRole,
  loadPresentHumanMemberIds,
} from "../../../../../packages/server/src/domain/automation/persistence/canon-reads.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { seedParticipant } from "../../chat/_support.ts";
import { seedHostChat, seedUser } from "../_support.ts";

describe("automation canon-reads", () => {
  test("loadCallerRole returns the present host role and undefined for a non-member", async () => {
    const db = await freshDb();
    const host = await seedUser(db, "user_host");
    const stranger = await seedUser(db, "user_stranger");
    const chatId = await seedHostChat(db, host);
    await expect(loadCallerRole(db, chatId, host)).resolves.toBe("host");
    await expect(loadCallerRole(db, chatId, stranger)).resolves.toBeUndefined();
  });

  // The `notify`/`post_notification` `all_members` recipient set (03 §1.5) — the participant-only wall: a plugin
  // (or rule) can notify ONLY present HUMAN members. A DEPARTED member (leftSeq set) and a never-joined stranger
  // are both excluded — so a plugin can never notify a non-participant.
  test("loadPresentHumanMemberIds is present HUMANS only — excludes left members and strangers", async () => {
    const db = await freshDb();
    const host = await seedUser(db, "user_host2");
    const member = await seedUser(db, "user_member");
    const left = await seedUser(db, "user_left");
    await seedUser(db, "user_stranger2"); // never a participant — must never appear
    const chatId = await seedHostChat(db, host); // seeds the host participant

    await seedParticipant(db, { chatId, key: "npm_member", userId: member, role: "member" });
    await seedParticipant(db, { chatId, key: "npm_left", userId: left, role: "member", leftSeq: 9 }); // departed

    const present = (await loadPresentHumanMemberIds(db, chatId)).sort();
    expect(present).toEqual([host, member].sort());
  });

  test("countChatMessages counts the chat's messages (0 for an empty chat)", async () => {
    const db = await freshDb();
    const host = await seedUser(db);
    const chatId = await seedHostChat(db, host);
    await expect(countChatMessages(db, chatId)).resolves.toBe(0);
  });

  test("isBookAttachedToChat reflects the chat_books junction", async () => {
    const db = await freshDb();
    const host = await seedUser(db);
    const chatId = await seedHostChat(db, host);
    const bookId = mintTypeId(ID_PREFIX.worldBook);
    await db.insert(worldBooks).values({ id: bookId, ownerId: host, name: "book" });
    await expect(isBookAttachedToChat(db, chatId, bookId)).resolves.toBe(false);
    await db.insert(chatBooks).values({ chatId, worldBookId: bookId });
    await expect(isBookAttachedToChat(db, chatId, bookId)).resolves.toBe(true);
  });
});
