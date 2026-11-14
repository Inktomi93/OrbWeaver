// domain/chat/memory/persistence/import-strikes — the chat-owned write of a restored room's memory strikes, injected
// into the chat bundle import (import writes no chat table). The import resolved every id from the room it just
// wrote, but the op's signature is the promise the next wiring inherits, so it gates its own target: the caller
// must hold the room's host seat, each endpoint must be a message of that room, and a scoped strike's character
// must hold a seat in it. A strike failing any of those is dropped, never written at a guess.
//
// A strike the room already holds stays as it is (`onConflictDoNothing` over both partial unique indexes), so a
// same-library restore never doubles one.
//
// A REPEATED IMPORT RE-ADDS A RESTORED STRIKE, deliberately. Importing the same file again onto a room it already
// wrote runs every overlay again (the tag overlay's retry semantics: an interrupted import completes on the next
// run), so a strike the host restored after the first import comes back. A room the app wrote and has not changed
// since is matched by its current export and runs no overlay.

import type { ImportedMemoryStrike, ImportMemoryStrikesOp } from "@orb/contracts/chat";
import type { Db } from "@orb/db";
import { chatMemoryStrikes, chatParticipants, messages } from "@orb/db";
import type { DbAssemblyInput } from "@orb/db/wiring";
import { databaseForOwner } from "@orb/db/wiring-owner";
import type { CharacterId, ChatId, MessageId, UserId } from "@orb/kit/ids";
import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import type { ImportMemoryStrikesContext } from "#src/domain/chat/contract/import.ts";
import { IMPORTED_STRIKE_HASH } from "./strikes.ts";

const LIMIT_ONE = 1;

async function holdsHostSeat(db: Db, chatId: ChatId, userId: UserId): Promise<boolean> {
  const rows = await db
    .select({ id: chatParticipants.id })
    .from(chatParticipants)
    .where(
      and(
        eq(chatParticipants.chatId, chatId),
        eq(chatParticipants.kind, "human"),
        eq(chatParticipants.role, "host"),
        eq(chatParticipants.userId, userId),
        isNull(chatParticipants.leftSeq),
      ),
    )
    .limit(LIMIT_ONE);
  return rows.length > 0;
}

/** The strikes whose endpoints and scoped character belong to the room. */
async function placeable(db: Db, chatId: ChatId, strikes: readonly ImportedMemoryStrike[]): Promise<ImportedMemoryStrike[]> {
  const endpointIds = [...new Set(strikes.flatMap((s) => [s.messageStartId, s.messageEndId]))];
  const [held, seated] = await Promise.all([
    db
      .select({ id: messages.id })
      .from(messages)
      .where(and(eq(messages.chatId, chatId), inArray(messages.id, endpointIds))),
    db
      .select({ characterId: chatParticipants.characterId })
      .from(chatParticipants)
      .where(and(eq(chatParticipants.chatId, chatId), isNotNull(chatParticipants.characterId))),
  ]);
  const heldIds = new Set<MessageId>(held.map((row) => row.id));
  const seatedIds = new Set<CharacterId | null>(seated.map((row) => row.characterId));
  return strikes.filter(
    (s) => heldIds.has(s.messageStartId) && heldIds.has(s.messageEndId) && (s.scopedCharacterId === null || seatedIds.has(s.scopedCharacterId)),
  );
}

export function createImportMemoryStrikes(input: DbAssemblyInput<ImportMemoryStrikesContext>): ImportMemoryStrikesOp {
  const ctx: ImportMemoryStrikesContext = { ...input, db: databaseForOwner(input.db) };
  return async ({ chatId, hostUserId, strikes }) => {
    if (strikes.length === 0 || !(await holdsHostSeat(ctx.db, chatId, hostUserId))) {
      return;
    }
    const rows = (await placeable(ctx.db, chatId, strikes)).map((s) => ({
      id: ctx.newMemoryStrikeId(),
      chatId,
      scopedCharacterId: s.scopedCharacterId,
      tier: s.tier,
      messageStartId: s.messageStartId,
      messageEndId: s.messageEndId,
      contentHash: IMPORTED_STRIKE_HASH,
      topicAnchor: s.topicAnchor,
      createdAt: s.createdAt,
    }));
    if (rows.length > 0) {
      await ctx.db.insert(chatMemoryStrikes).values(rows).onConflictDoNothing();
    }
  };
}
