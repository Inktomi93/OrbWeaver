// verb: listHostChats — every chat the caller HOSTS, paired with the handle of its primary seated character
// (first by join order). The bundle descriptor's `exportAll` streams one transcript at a time over this
// enumeration and nests each file under the handle; a chat with no seated character is skipped (there would
// be no directory to nest it under, and import re-links by handle).
//
// Homed here (F8) because it is an EXPORT read: the composition root used to run it itself, in a file whose
// stated job is assembling descriptors from verbs. Export is the sanctioned bulk reader of other domains'
// tables (`own-tables-only`'s BULK_READERS row).
//
// ONE query, not one-per-chat: the host seat and the character seat are the same table joined twice
// (aliased), ordered so the FIRST row per chat is that chat's primary character.

import { characters, chatParticipants } from "@orb/db";
import { and, asc, eq, isNotNull, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import type { ExportContext } from "../context.ts";
import type { ListHostChatsParams } from "../contract/params.ts";
import type { HostChatRef } from "../contract/results.ts";
import type { ExportService } from "../contract/service.ts";

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
