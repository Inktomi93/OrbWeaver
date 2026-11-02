// The membership read a plugin ask's standing is recorded from and re-checked against. It decodes no role and
// decides no permission: it names which stay in the room a user holds.

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
