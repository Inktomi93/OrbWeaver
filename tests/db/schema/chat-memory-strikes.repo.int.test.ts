// The memory-strike migration: a deleted room takes its strikes with it, a deleted character only nulls the record of
// which copy was struck (the strike stands), a room holds one strike per span whatever copy it was made on, and a
// strike whose endpoint message is gone stays stored so the view can list it.
// @subject packages/db/src/schema/chat.ts
// @subject packages/db/src/migrations/0016_chat-memory-strikes.sql
import { assertReferentialIntegrity, characters, chatMemoryStrikes, chats, createDb, messages, runMigrations } from "@orb/db";
import { isConstraintViolation } from "@orb/db/query";
import type { CharacterId, ChatId, MessageId } from "@orb/kit/ids";
import { createIdSource, ID_PREFIX } from "@orb/kit/ids";
import { createSeededIds } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { ownDb, SHIPPED_MIGRATIONS } from "@orb/testkit/node/composed";
import { seedCharacterRow, seedChatRow, seedMessageRow, seedUser } from "@orb/testkit/node/rows";
import { asc, eq } from "drizzle-orm";

test("strikes cascade with their room, outlive their character and their endpoint message, and hold one row per span", async () => {
  using opened = ownDb(await createDb(":memory:"));
  const db = opened.db;
  await runMigrations(db, SHIPPED_MIGRATIONS);
  const ids = createIdSource(createSeededIds().next);
  const owner = await seedUser(db, {}, ids);
  const [keeper, scout] = [await seedCharacterRow(db, { ownerId: owner.id }, ids), await seedCharacterRow(db, { ownerId: owner.id }, ids)];
  const [room, other] = [await seedChatRow(db, {}, ids), await seedChatRow(db, {}, ids)];
  const start = await seedMessageRow(db, { chatId: room.id, seq: 1 }, ids);
  const middle = await seedMessageRow(db, { chatId: room.id, seq: 2 }, ids);
  const end = await seedMessageRow(db, { chatId: room.id, seq: 3 }, ids);
  const otherStart = await seedMessageRow(db, { chatId: other.id, seq: 1 }, ids);
  const strike = (
    chatId: ChatId,
    scopedCharacterId: CharacterId | null,
    span: readonly [MessageId, MessageId],
    tier = 0,
  ): typeof chatMemoryStrikes.$inferSelect => ({
    id: ids.typeId(ID_PREFIX.chatMemoryStrike),
    chatId,
    scopedCharacterId,
    tier,
    messageStartId: span[0],
    messageEndId: span[1],
    contentHash: "",
    topicAnchor: null,
    createdAt: 1000,
  });
  const keeperSpan = strike(room.id, keeper.id, [start.id, middle.id]);
  const scoutSpan = strike(room.id, scout.id, [middle.id, end.id]);
  const sharedSpan = strike(room.id, null, [start.id, end.id]);
  const otherRoom = strike(other.id, null, [otherStart.id, otherStart.id]);
  await db.insert(chatMemoryStrikes).values([keeperSpan, scoutSpan, sharedSpan, otherRoom]);

  // One strike per span, whatever copy it was made on: a second strike from the shared copy or another character's
  // copy is refused, and a strike one tier up on the same messages is a different span.
  for (const twin of [strike(room.id, null, [start.id, middle.id]), strike(room.id, scout.id, [start.id, middle.id])]) {
    await expect(db.insert(chatMemoryStrikes).values(twin)).rejects.toSatisfy((error) => isConstraintViolation(error)?.kind === "unique");
  }
  const upTier = strike(room.id, null, [start.id, middle.id], 1);
  await db.insert(chatMemoryStrikes).values(upTier);
  await expect(db.insert(chatMemoryStrikes).values(strike(room.id, null, [end.id, end.id], -1))).rejects.toSatisfy(
    (error) => isConstraintViolation(error)?.kind === "check",
  );

  // Deleting both characters nulls their records and keeps every strike; nulling never collides with the shared one.
  await db.delete(characters).where(eq(characters.id, keeper.id));
  await db.delete(characters).where(eq(characters.id, scout.id));
  await db.delete(messages).where(eq(messages.id, end.id));
  const rows = (): Promise<{ id: string; scopedCharacterId: CharacterId | null }[]> =>
    db.select({ id: chatMemoryStrikes.id, scopedCharacterId: chatMemoryStrikes.scopedCharacterId }).from(chatMemoryStrikes).orderBy(asc(chatMemoryStrikes.id));
  expect(await rows()).toEqual(
    [keeperSpan, scoutSpan, sharedSpan, otherRoom, upTier].map((row) => ({ id: row.id, scopedCharacterId: null })).sort((a, b) => a.id.localeCompare(b.id)),
  );

  await db.delete(chats).where(eq(chats.id, room.id));
  expect(await db.select({ id: chatMemoryStrikes.id }).from(chatMemoryStrikes)).toEqual([{ id: otherRoom.id }]);
  await expect(assertReferentialIntegrity(db)).resolves.toBeUndefined();
});
