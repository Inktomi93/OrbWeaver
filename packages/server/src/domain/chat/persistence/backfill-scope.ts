// Memory sweeps and empty-owner completion share the same present-host room universe.
import type { ImportWindow } from "@orb/contracts/chat";
import type { Db } from "@orb/db";
import { chatImportClaims, chatParticipants, chats } from "@orb/db";
import type { ChatId, UserId } from "@orb/kit/ids";
import type { SQL } from "drizzle-orm";
import { and, between, eq, inArray, isNull, notExists, sql } from "drizzle-orm";
import { QueryBuilder } from "drizzle-orm/sqlite-core";

function hostedChatIds(ownerId: UserId): SQL {
  const query = new QueryBuilder()
    .select({ id: chats.id })
    .from(chats)
    .innerJoin(
      chatParticipants,
      and(
        eq(chatParticipants.chatId, chats.id),
        eq(chatParticipants.kind, "human"),
        eq(chatParticipants.role, "host"),
        eq(chatParticipants.userId, ownerId),
        isNull(chatParticipants.leftSeq),
      ),
    );
  return sql`(${query.getSQL()})`;
}

/** The full owner memory scope is empty only while no existing room has this present human host. */
export function emptyMemoryScopePredicate(ownerId: UserId): SQL {
  return notExists(hostedChatIds(ownerId));
}

/** Temporary and unstarted chats are live sweep inputs; import claims narrow only the admitted intersection. */
export async function loadBackfillChatIds(db: Db, ownerId?: UserId | null, importWindow?: ImportWindow | null): Promise<ChatId[]> {
  const narrowed =
    importWindow === undefined || importWindow === null
      ? undefined
      : inArray(
          chats.id,
          db
            .select({ id: chatImportClaims.chatId })
            .from(chatImportClaims)
            .where(between(chatImportClaims.createdAt, importWindow.from, importWindow.to)),
        );
  const scope = ownerId === undefined || ownerId === null ? undefined : inArray(chats.id, hostedChatIds(ownerId));
  const rows = await db.select({ id: chats.id }).from(chats).where(and(scope, narrowed));
  return rows.map(({ id }) => id);
}
