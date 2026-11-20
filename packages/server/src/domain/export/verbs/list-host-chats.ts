// verb: listHostChats — every chat the caller HOSTS, paired with the handle of its primary seated character
// (first by join order). The bundle descriptor's `exportAll` streams one transcript at a time over this
// enumeration and nests each file under the handle; a chat with no seated character is skipped (there would
// be no directory to nest it under, and import re-links by handle).
//
// Homed here because it is an EXPORT read; the composition root only assembles descriptors from verbs.
// Export is the sanctioned bulk reader of other domains'
// tables.
//
// ONE query, not one-per-chat: the host seat and the character seat are the same table joined twice
// (aliased), ordered so the FIRST row per chat is that chat's primary character.

import { characters, chatParticipants, chats } from "@orb/db";
import type { ChatId } from "@orb/kit/ids";
import { and, asc, eq, isNotNull, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import type { ListHostChatsCreatedAtParams, ListHostChatsParams } from "../contract/params.ts";
import type { HostChatRef } from "../contract/results.ts";
import type { ExportContext, ExportService } from "../contract/service.ts";

const hostSeat = alias(chatParticipants, "host_seat");
const charSeat = alias(chatParticipants, "char_seat");

export function createListHostChats(ctx: ExportContext): ExportService["listHostChats"] {
  return async ({ principal }: ListHostChatsParams): Promise<readonly HostChatRef[]> => {
    const rows = await ctx.db
      .select({ chatId: hostSeat.chatId, handle: characters.handle })
      .from(hostSeat)
      .innerJoin(charSeat, and(eq(charSeat.chatId, hostSeat.chatId), isNotNull(charSeat.characterId), isNull(charSeat.leftSeq)))
      .innerJoin(characters, eq(characters.id, charSeat.characterId))
      .where(and(eq(hostSeat.role, "host"), eq(hostSeat.userId, principal.userId), isNull(hostSeat.leftSeq)))
      .orderBy(asc(hostSeat.chatId), asc(charSeat.joinSeq), asc(charSeat.id));

    // FIRST row per chat wins — the join emits one row per seated character, the ORDER BY makes row 0 of
    // each chat its primary seat.
    const out: HostChatRef[] = [];
    for (const row of rows) {
      if (out.at(-1)?.chatId !== row.chatId) {
        out.push({ chatId: row.chatId, handle: row.handle });
      }
    }
    return out;
  };
}

/** The chats the caller hosts that seat `characterId` and were created at `createdAt`: the rooms a chat bundle
 *  written from this library can be, which the restore compares with their current export. */
export function createListHostChatsCreatedAt(ctx: ExportContext): ExportService["listHostChatsCreatedAt"] {
  return async ({ principal, characterId, createdAt }: ListHostChatsCreatedAtParams): Promise<readonly ChatId[]> => {
    const rows = await ctx.db
      .selectDistinct({ chatId: hostSeat.chatId })
      .from(hostSeat)
      .innerJoin(charSeat, and(eq(charSeat.chatId, hostSeat.chatId), eq(charSeat.characterId, characterId), isNull(charSeat.leftSeq)))
      .innerJoin(chats, and(eq(chats.id, hostSeat.chatId), eq(chats.createdAt, createdAt)))
      .where(and(eq(hostSeat.role, "host"), eq(hostSeat.userId, principal.userId), isNull(hostSeat.leftSeq)))
      .orderBy(asc(hostSeat.chatId));
    return rows.map((row) => row.chatId);
  };
}
