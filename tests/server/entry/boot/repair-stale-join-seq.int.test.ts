// entry/boot/repair-stale-join-seq — the #2253 boot repair over a REAL libSQL db (the .int lane). Before
// eba8ef526 the invite-redeem seat's join_seq was stamped against the GLOBAL max(messages.seq) instead of
// the per-chat one, so a member seated on a low-traffic chat could carry a join_seq far above any message
// that chat actually has. Pins: a stamped-too-high row is clamped down to the per-chat canon head, a
// correctly-stamped row is left byte-identical, and a second boot is a no-op (the predicate, not a marker,
// is what makes it idempotent — same shape as heal-legacy-background-pins.int.test.ts).

import { chatParticipants } from "@orb/db";
import type { ChatParticipantId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { repairStaleJoinSeqOnBoot } from "@orb/server/entry/boot";
import { eq } from "drizzle-orm";
import { freshDb } from "../../../support/db.ts";
import { seedChat } from "../../../support/factories/chat.ts";
import { seedMessage } from "../../../support/factories/message.ts";
import { seedUser } from "../../../support/factories/user.ts";
import { expect, test } from "../../../support/fixtures.ts";

test("clamps a join_seq stamped above the per-chat canon head, leaves a correct row untouched, and settles idempotent", async () => {
  const db = await freshDb();

  // Chat A: 3 real messages (seq 1..3), a member seated with a stale join_seq of 99 — no message in
  // this chat ever reaches 99, so the stamp is definitionally stale.
  const chatA = await seedChat(db, { withHost: true });
  await seedMessage(db, { chatId: chatA.id, seq: 1 });
  await seedMessage(db, { chatId: chatA.id, seq: 2 });
  await seedMessage(db, { chatId: chatA.id, seq: 3 });
  const staleMember = await seedUser(db);
  const staleParticipantId = castId<ChatParticipantId>(mintTypeId(ID_PREFIX.chatParticipant));
  await db.insert(chatParticipants).values({
    id: staleParticipantId,
    chatId: chatA.id,
    kind: "human",
    userId: staleMember.id,
    role: "member",
    joinedAt: 0,
    joinSeq: 99,
  });

  // Chat B: a member correctly seated at the real per-chat head (seq 5) — must not move.
  const chatB = await seedChat(db, { withHost: true });
  await seedMessage(db, { chatId: chatB.id, seq: 5 });
  const correctMember = await seedUser(db);
  const correctParticipantId = castId<ChatParticipantId>(mintTypeId(ID_PREFIX.chatParticipant));
  await db.insert(chatParticipants).values({
    id: correctParticipantId,
    chatId: chatB.id,
    kind: "human",
    userId: correctMember.id,
    role: "member",
    joinedAt: 0,
    joinSeq: 5,
  });

  const repaired = await repairStaleJoinSeqOnBoot({ db });
  expect(repaired).toBe(1);

  const [staleRow] = await db.select().from(chatParticipants).where(eq(chatParticipants.id, staleParticipantId));
  expect(staleRow?.joinSeq).toBe(3);

  const [correctRow] = await db.select().from(chatParticipants).where(eq(chatParticipants.id, correctParticipantId));
  expect(correctRow?.joinSeq).toBe(5);

  // The second boot finds nothing: the predicate (join_seq > per-chat head), not a marker, is what
  // makes it idempotent.
  expect(await repairStaleJoinSeqOnBoot({ db })).toBe(0);
});

test("a chat with zero messages coalesces its head to 0 and is a no-op for a member already at 0", async () => {
  const db = await freshDb();
  const chat = await seedChat(db, { withHost: true });
  const member = await seedUser(db);
  const participantId = castId<ChatParticipantId>(mintTypeId(ID_PREFIX.chatParticipant));
  await db.insert(chatParticipants).values({
    id: participantId,
    chatId: chat.id,
    kind: "human",
    userId: member.id,
    role: "member",
    joinedAt: 0,
    joinSeq: 0,
  });

  expect(await repairStaleJoinSeqOnBoot({ db })).toBe(0);
  const [row] = await db.select().from(chatParticipants).where(eq(chatParticipants.id, participantId));
  expect(row?.joinSeq).toBe(0);
});
