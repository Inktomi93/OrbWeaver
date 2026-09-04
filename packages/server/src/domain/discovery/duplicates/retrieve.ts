// domain/discovery/duplicates/retrieve — the owner-scoped near-duplicate CHARACTER read. Joins
// `duplicate_character_pairs` to `characters` on BOTH sides (the names for display + the owner scope belt;
// the join NEVER reads the `users` table). CSLS-ranked (highest first). No `similarCharacters` here — top-k
// "more like this character" is `search`'s; this is the recorded-pairs read.
//
// BOTH SIDES OF A PAIR CARRY THE PREDICATE (#1414 seam 2). These reads used to scope side A only, on the
// stated grounds that a pair is only ever computed inside one owner's library so A implies B. That is a
// property of the WRITER, and neither pair table has an owner column or a same-owner constraint to hold it —
// so the belt was a comment. Under the invariant the second predicate matches everything and costs a hash
// probe on an already-joined alias; the moment a writer (or a repair, or a restore) breaks it, it is the
// only thing standing between one tenant's list and another's card name.
//
// `ownerId` is ALWAYS the resolved principal id, never caller input (audit #1) — the verb signature takes a
// branded `UserId` the tRPC seam supplies.

import type { DuplicateRelation } from "@orb/contracts/discovery";
import type { Db } from "@orb/db";
import { characters, chatParticipants, chats, duplicateCharacterPairs, duplicateChatPairs } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { aliasedTable, and, desc, eq, exists, gte, isNull } from "drizzle-orm";
import type { DuplicateCharactersOptions, DuplicateChatsOptions } from "../contract/params.ts";
import type { DuplicateCharacterPair, DuplicateChatPair } from "../contract/results.ts";

/** The owner's near-duplicate character pairs, CSLS-ranked (highest first), enriched with both card names. */
export async function readDuplicateCharacters(db: Db, ownerId: UserId, opts: DuplicateCharactersOptions = {}): Promise<DuplicateCharacterPair[]> {
  const charA = aliasedTable(characters, "char_a");
  const charB = aliasedTable(characters, "char_b");
  // BOTH sides carry the predicate (#1414 seam 2). "A pair is only ever computed inside one owner's library"
  // is a WRITER invariant, and `duplicate_character_pairs` has no owner column and no same-owner constraint
  // to hold it — so filtering A and inferring B was a comment, not a query guarantee. Under the invariant
  // the B predicate is free; when the invariant breaks, it is the whole belt.
  const where = [eq(charA.ownerId, ownerId), eq(charB.ownerId, ownerId)];
  if (opts.minScore !== undefined) {
    where.push(gte(duplicateCharacterPairs.cslsScore, opts.minScore));
  }

  const base = db
    .select({
      id: duplicateCharacterPairs.id,
      characterIdA: duplicateCharacterPairs.characterIdA,
      characterIdB: duplicateCharacterPairs.characterIdB,
      nameA: charA.name,
      nameB: charB.name,
      similarity: duplicateCharacterPairs.similarity,
      cslsScore: duplicateCharacterPairs.cslsScore,
      model: duplicateCharacterPairs.model,
      computedAt: duplicateCharacterPairs.computedAt,
    })
    .from(duplicateCharacterPairs)
    .innerJoin(charA, eq(charA.id, duplicateCharacterPairs.characterIdA))
    .innerJoin(charB, eq(charB.id, duplicateCharacterPairs.characterIdB))
    .where(and(...where))
    .orderBy(desc(duplicateCharacterPairs.cslsScore));

  const rows = opts.limit !== undefined ? await base.limit(opts.limit) : await base;
  return rows;
}

/** The owner's near-duplicate CHAT pairs, Jaccard-ranked (highest first), enriched with both chat titles +
 *  the fork `relation`. Owner scope: `duplicate_chat_pairs` has no ownerId (D23) — the belt is an EXISTS on a
 *  present-host `chat_participants` row for side A's chat (a pair is within ONE owner's hosted chats, so
 *  scoping side A suffices and the join never reads `users`). `ownerId` is ALWAYS the resolved principal
 *  (audit #1). */
export async function readDuplicateChats(db: Db, ownerId: UserId, opts: DuplicateChatsOptions = {}): Promise<DuplicateChatPair[]> {
  const chatA = aliasedTable(chats, "chat_a");
  const chatB = aliasedTable(chats, "chat_b");
  /** The present-host EXISTS belt for ONE side of the pair (#1414 seam 2 — both sides carry it now: the
   *  same-owner property of a pair is a WRITER invariant with no column and no constraint behind it). */
  const hostedBy = (chatId: typeof duplicateChatPairs.chatIdA | typeof duplicateChatPairs.chatIdB): ReturnType<typeof exists> =>
    exists(
      db
        .select({ one: chatParticipants.id })
        .from(chatParticipants)
        .where(
          and(
            eq(chatParticipants.chatId, chatId),
            eq(chatParticipants.userId, ownerId),
            eq(chatParticipants.kind, "human"),
            eq(chatParticipants.role, "host"),
            isNull(chatParticipants.leftSeq),
          ),
        ),
    );
  const where = [hostedBy(duplicateChatPairs.chatIdA), hostedBy(duplicateChatPairs.chatIdB)];
  if (opts.minScore !== undefined) {
    where.push(gte(duplicateChatPairs.similarity, opts.minScore));
  }
  if (opts.relation !== undefined) {
    where.push(eq(duplicateChatPairs.relation, opts.relation));
  }

  const base = db
    .select({
      id: duplicateChatPairs.id,
      chatIdA: duplicateChatPairs.chatIdA,
      chatIdB: duplicateChatPairs.chatIdB,
      titleA: chatA.title,
      titleB: chatB.title,
      similarity: duplicateChatPairs.similarity,
      cslsScore: duplicateChatPairs.cslsScore,
      relation: duplicateChatPairs.relation,
      model: duplicateChatPairs.model,
      computedAt: duplicateChatPairs.computedAt,
    })
    .from(duplicateChatPairs)
    .innerJoin(chatA, eq(chatA.id, duplicateChatPairs.chatIdA))
    .innerJoin(chatB, eq(chatB.id, duplicateChatPairs.chatIdB))
    .where(and(...where))
    .orderBy(desc(duplicateChatPairs.similarity));

  const rows = opts.limit !== undefined ? await base.limit(opts.limit) : await base;
  return rows.map((r) => ({ ...r, relation: r.relation as DuplicateRelation }));
}
