// The stored proof that a character id is a narrator author of one room, for the card frame's author read.
// SECURITY: the id arrives from a caller, so it counts only when this room's canon, at or above the viewer's history
// floor, holds a narrator row stamped with it and the id is a synthetic group character. A seated card, another
// room's group character and an id no row carries all fail the same way.

import type { HistoryFloorSeq } from "@orb/contracts/chat";
import type { Db } from "@orb/db";
import { characters, messages } from "@orb/db";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import type { MessageKind } from "@orb/kit/message-author";
import { and, eq, gte } from "drizzle-orm";

const NARRATOR_KIND: MessageKind = "narrator";

/** Whether `characterId` is a synthetic group character that authored a narrator row of `chatId` the viewer can read. */
export async function isNarratorAuthorOf(db: Db, chatId: ChatId, characterId: CharacterId, floor: HistoryFloorSeq): Promise<boolean> {
  const rows = await db
    .select({ id: messages.id })
    .from(messages)
    .innerJoin(characters, eq(characters.id, messages.characterId))
    .where(
      and(
        eq(messages.chatId, chatId),
        eq(messages.kind, NARRATOR_KIND),
        eq(messages.characterId, characterId),
        gte(messages.seq, floor),
        eq(characters.synthetic, true),
      ),
    )
    .limit(1);
  return rows.length > 0;
}
