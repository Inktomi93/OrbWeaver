// substrate/owner-chat-scope — the ONE definition of "the owner's chats" for stats. It is a SQL fragment,
// so it is pinned by running it: each clause of the predicate gets a row that the clause is the only reason
// to exclude (a foreign owner's room, a non-character participant, an unclaimed husk).

import type { Db } from "@orb/db";
import { chatParticipants, chats } from "@orb/db";
import type { ChatId, ChatParticipantId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { sql } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import { ownerChatIds } from "../../../../../packages/server/src/domain/stats/substrate/owner-chat-scope.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedCharacter, seedChat, seedUser, T0 } from "../_support.ts";

let db: Db;
let ownerId: UserId;

async function scopedChatIds(forOwner: UserId): Promise<string[]> {
  const rows = await db.all<{ chatId: ChatId }>(sql`SELECT chat_id AS chatId FROM (${ownerChatIds(forOwner)})`);
  return rows.map((r) => r.chatId).sort((a, b) => a.localeCompare(b));
}

beforeEach(async () => {
  db = await freshDb();
  ownerId = await seedUser(db);
});

describe("ownerChatIds", () => {
  test("admits a started room the owner reaches through an owned character participant", async () => {
    const characterId = await seedCharacter(db, ownerId);
    await seedChat(db, characterId, { id: "chat_started" });

    expect(await scopedChatIds(ownerId)).toEqual(["chat_started"]);
  });

  test("excludes a husk — a room with `started_at` NULL the user never claimed", async () => {
    const characterId = await seedCharacter(db, ownerId);
    await seedChat(db, characterId, { id: "chat_started" });
    await seedChat(db, characterId, { id: "chat_husk", startedAt: null });

    expect(await scopedChatIds(ownerId)).toEqual(["chat_started"]);
  });

  test("excludes another owner's room — membership is derived through characters.owner_id (D18)", async () => {
    const otherOwner = await seedUser(db, "user_other", "user");
    const otherCharacter = await seedCharacter(db, otherOwner, { id: "character_other" });
    await seedChat(db, otherCharacter, { id: "chat_other" });

    expect(await scopedChatIds(ownerId)).toEqual([]);
    expect(await scopedChatIds(otherOwner)).toEqual(["chat_other"]);
  });

  test("excludes a room the owner sits in as a HUMAN with no owned character participant", async () => {
    // `cp.kind = 'character'` is load-bearing: stats scope is derived from the owned CHARACTER, not from a
    // human seat, so someone else's room the owner merely joined is not "the owner's chat" for stats.
    const chatId = castId<ChatId>("chat_human_seat_only");
    await db.insert(chats).values({ id: chatId, createdAt: T0, updatedAt: T0, anchorPersonaId: null, startedAt: T0 });
    await db.insert(chatParticipants).values({
      id: castId<ChatParticipantId>("chat_participant_human_seat_only"),
      chatId,
      kind: "human",
      userId: ownerId,
      role: "member",
      joinSeq: 0,
    });

    expect(await scopedChatIds(ownerId)).toEqual([]);
  });
});
