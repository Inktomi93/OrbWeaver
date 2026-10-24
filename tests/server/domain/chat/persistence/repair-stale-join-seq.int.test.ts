// A seat's join floor above its own room's canon head is clamped to that head; a correct floor never moves.
// @subject packages/server/src/domain/chat/persistence/participant.ts
import type { Db } from "@orb/db";
import { chatParticipants } from "@orb/db";
import type { BootDatabaseHandle } from "@orb/db/wiring";
import { databaseHandle } from "@orb/db/wiring-driver";
import type { ChatId, ChatParticipantId, UserId } from "@orb/kit/ids";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { repairStaleJoinSeq } from "@orb/server/domain/chat";
import { expect, test } from "@orb/testkit/node";
import { bootGrantFor } from "@orb/testkit/node/helpers";
import { seedChatRow, seedMessageRow, seedUser } from "@orb/testkit/node/rows";
import { eq } from "drizzle-orm";

// The historic state: an invite seat stamped against another room's canon head, which no current writer produces.
async function seatMember(db: Db, chatId: ChatId, userId: UserId, joinSeq: number): Promise<ChatParticipantId> {
  const id = mintTypeId(ID_PREFIX.chatParticipant);
  await db.insert(chatParticipants).values({ id, chatId, kind: "human", userId, role: "member", joinedAt: 0, joinSeq });
  return id;
}

async function joinSeqOf(db: Db, id: ChatParticipantId): Promise<number | undefined> {
  const [row] = await db.select({ joinSeq: chatParticipants.joinSeq }).from(chatParticipants).where(eq(chatParticipants.id, id));
  return row?.joinSeq;
}

test("a floor above its room's head is clamped to that head, floors at or below a head are untouched, and a second run is a no-op", async ({ db }) => {
  const quiet = await seedChatRow(db);
  for (const seq of [1, 2, 3]) {
    await seedMessageRow(db, { chatId: quiet.id, seq });
  }
  const busy = await seedChatRow(db);
  await seedMessageRow(db, { chatId: busy.id, seq: 5 });
  const stale = await seatMember(db, quiet.id, (await seedUser(db)).id, 99);
  const correct = await seatMember(db, busy.id, (await seedUser(db)).id, 5);
  // A late joiner's floor below its head is the ordinary case; raising it would hide history it was admitted to.
  const lateJoiner = await seatMember(db, quiet.id, (await seedUser(db)).id, 2);

  const repaired = await repairStaleJoinSeq(bootGrantFor(db));
  expect(await joinSeqOf(db, stale)).toBe(3);
  expect(await joinSeqOf(db, correct)).toBe(5);
  expect(await joinSeqOf(db, lateJoiner)).toBe(2);
  expect(repaired).toBe(1);
  expect(await repairStaleJoinSeq(bootGrantFor(db))).toBe(0);
});

test("a room with no canon resolves its head to zero, so only a floor above zero moves", async ({ db }) => {
  const empty = await seedChatRow(db);
  const atZero = await seatMember(db, empty.id, (await seedUser(db)).id, 0);
  const above = await seatMember(db, empty.id, (await seedUser(db)).id, 4);

  expect(await repairStaleJoinSeq(bootGrantFor(db))).toBe(1);
  expect(await joinSeqOf(db, atZero)).toBe(0);
  expect(await joinSeqOf(db, above)).toBe(0);
});

test("a plain handle cast to the boot grant is refused before the repair writes", async ({ db }) => {
  const empty = await seedChatRow(db);
  const above = await seatMember(db, empty.id, (await seedUser(db)).id, 4);
  // The cast is the forgery a request route could write; only a grant the mint registered may cross owners.
  const forged = databaseHandle(db) as BootDatabaseHandle;

  await expect(repairStaleJoinSeq(forged)).rejects.toThrow("boot wiring handle is not granted");
  expect(await joinSeqOf(db, above)).toBe(4);
});
