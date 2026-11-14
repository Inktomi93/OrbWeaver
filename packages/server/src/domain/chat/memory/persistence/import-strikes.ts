// domain/chat/memory/persistence/import-strikes — the chat-owned write of a restored room's memory strikes, injected
// into the chat bundle import (import writes no chat table).
//
// THE HOST-SEAT CHECK IS THE ONLY GUARD ON THE CLAIMED-ROOM PATH. A re-import matches the room the file first
// created through the importer's claim on its character, not through the host seat, so an ex-host who handed the
// room off still reaches this op with that room's id. Only `holdsHostSeat` keeps them from writing strikes into the
// new host's room. The endpoint check is a second check: the remap resolves endpoints from the target room. A strike
// whose endpoints are not this room's messages is dropped, never written at a guess; one whose character holds no
// seat here is written as a shared strike, since the character only records which copy was struck.
//
// A strike names a span (`matchStrikes` in `packages/kit/src/recall/index.ts`), so a span the room already holds a
// strike on, in any bucket, gets no second row, and a same-library restore never doubles one.
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
import { IMPORTED_STRIKE_HASH, loadMemoryStrikes } from "./strikes.ts";

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

/** The strikes whose endpoints belong to the room, each scoped character kept only when it holds a seat here. */
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
  // A strike whose character holds no seat here keeps its span as a shared strike: the character is only a record.
  return strikes
    .filter((s) => heldIds.has(s.messageStartId) && heldIds.has(s.messageEndId))
    .map((s) => (s.scopedCharacterId === null || seatedIds.has(s.scopedCharacterId) ? s : { ...s, scopedCharacterId: null }));
}

export function createImportMemoryStrikes(input: DbAssemblyInput<ImportMemoryStrikesContext>): ImportMemoryStrikesOp {
  const ctx: ImportMemoryStrikesContext = { ...input, db: databaseForOwner(input.db) };
  return async ({ chatId, hostUserId, strikes }) => {
    if (strikes.length === 0 || !(await holdsHostSeat(ctx.db, chatId, hostUserId))) {
      return;
    }
    const spanOf = (s: Pick<ImportedMemoryStrike, "tier" | "messageStartId" | "messageEndId">): string => `${s.tier}:${s.messageStartId}:${s.messageEndId}`;
    const taken = new Set((await loadMemoryStrikes(ctx.db, chatId)).map(spanOf));
    const fresh = (await placeable(ctx.db, chatId, strikes)).filter((s) => {
      const span = spanOf(s);
      if (taken.has(span)) {
        return false;
      }
      taken.add(span);
      return true;
    });
    const rows = fresh.map((s) => ({
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
