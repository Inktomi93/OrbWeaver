import type { Db } from "@orb/db";
import { chats, personas } from "@orb/db";
import type { ChatId, UserId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";

/** The two room facts the host's global plane gates on, in one read: whether another human ever held a seat in the
 *  room or a room it was copied from, and who owns the room's pin (null when there is no pin). */
export async function loadGlobalPlaneGate(db: Db, chatId: ChatId): Promise<{ readonly everShared: boolean; readonly pinOwnerId: UserId | null } | undefined> {
  const [row] = await db
    .select({ everShared: chats.everShared, pinOwnerId: personas.ownerId })
    .from(chats)
    .leftJoin(personas, eq(personas.id, chats.anchorPersonaId))
    .where(eq(chats.id, chatId))
    .limit(1);
  return row;
}
