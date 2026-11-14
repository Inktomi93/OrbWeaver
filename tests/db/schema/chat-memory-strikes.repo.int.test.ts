// The memory-strike migration: a deleted room takes its strikes with it, a deleted character takes only the strikes
// scoped to it (never widening one to the shared bucket), each item holds at most one strike per bucket, and a strike
// whose endpoint message is gone stays stored so the view can list it.
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

test("strikes cascade with their room and their scoped character, hold one row per item, and outlive their endpoint message", async () => {
  using opened = ownDb(await createDb(":memory:"));
  const db = opened.db;
  await runMigrations(db, SHIPPED_MIGRATIONS);
  const ids = createIdSource(createSeededIds().next);
  const owner = await seedUser(db, {}, ids);
  const [kept, scoped] = [await seedCharacterRow(db, { ownerId: owner.id }, ids), await seedCharacterRow(db, { ownerId: owner.id }, ids)];
  const [room, other] = [await seedChatRow(db, {}, ids), await seedChatRow(db, {}, ids)];
  const start = await seedMessageRow(db, { chatId: room.id, seq: 1 }, ids);
  const end = await seedMessageRow(db, { chatId: room.id, seq: 2 }, ids);
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
  const shared = strike(room.id, null, [start.id, end.id]);
  const keptScoped = strike(room.id, kept.id, [start.id, end.id]);
  const goneScoped = strike(room.id, scoped.id, [start.id, end.id]);
  const otherRoom = strike(other.id, null, [otherStart.id, otherStart.id]);
  await db.insert(chatMemoryStrikes).values([shared, keptScoped, goneScoped, otherRoom]);

  // One strike per item and bucket: the shared bucket's partial index holds even though its character column is null.
  for (const twin of [strike(room.id, null, [start.id, end.id]), strike(room.id, kept.id, [start.id, end.id])]) {
    await expect(db.insert(chatMemoryStrikes).values(twin)).rejects.toSatisfy((error) => isConstraintViolation(error)?.kind === "unique");
  }
  await expect(db.insert(chatMemoryStrikes).values(strike(room.id, null, [start.id, end.id], -1))).rejects.toSatisfy(
    (error) => isConstraintViolation(error)?.kind === "check",
  );

  await db.delete(characters).where(eq(characters.id, scoped.id));
  await db.delete(messages).where(eq(messages.id, end.id));
  const afterCharacter = await db
    .select({ id: chatMemoryStrikes.id, scopedCharacterId: chatMemoryStrikes.scopedCharacterId })
    .from(chatMemoryStrikes)
    .orderBy(asc(chatMemoryStrikes.id));
  expect(afterCharacter).toEqual(
    [shared, keptScoped, otherRoom].map((row) => ({ id: row.id, scopedCharacterId: row.scopedCharacterId })).sort((a, b) => a.id.localeCompare(b.id)),
  );

  await db.delete(chats).where(eq(chats.id, room.id));
  expect(await db.select({ id: chatMemoryStrikes.id }).from(chatMemoryStrikes)).toEqual([{ id: otherRoom.id }]);
  await expect(assertReferentialIntegrity(db)).resolves.toBeUndefined();
});
