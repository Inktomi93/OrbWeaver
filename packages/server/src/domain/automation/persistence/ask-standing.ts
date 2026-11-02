// The two roster reads a plugin ask's standing is recorded from and re-checked against. Neither decodes a role or
// decides a permission: one names who hosts, the other which membership a user holds.

import type { Db } from "@orb/db";
import { chatParticipants } from "@orb/db";
import type { ChatId, UserId } from "@orb/kit/ids";
import { and, eq, isNull } from "drizzle-orm";
import type { MembershipInstance } from "../contract/ops.ts";

const LIMIT_ONE = 1;

/** Which present membership of `userId` in `chatId` this is, or `undefined` when they are not present. A rejoin
 *  reuses the same row and restamps both columns, so the pair tells one stay in the room from the next. */
export async function loadMembershipInstance(db: Db, chatId: ChatId, userId: UserId): Promise<MembershipInstance | undefined> {
  const rows = await db
    .select({ joinSeq: chatParticipants.joinSeq, joinedAt: chatParticipants.joinedAt })
    .from(chatParticipants)
    .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.userId, userId), isNull(chatParticipants.leftSeq)))
    .limit(LIMIT_ONE);
  return rows[0];
}

/** The room's present host — a roster lookup naming WHO hosts, never a permission decision (that is `can()`'s).
 *  `null` for a hostless room. */
export async function loadPresentHostUserId(db: Db, chatId: ChatId): Promise<UserId | null> {
  const rows = await db
    .select({ userId: chatParticipants.userId })
    .from(chatParticipants)
    .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.kind, "human"), eq(chatParticipants.role, "host"), isNull(chatParticipants.leftSeq)))
    .limit(LIMIT_ONE);
  return rows[0]?.userId ?? null;
}
