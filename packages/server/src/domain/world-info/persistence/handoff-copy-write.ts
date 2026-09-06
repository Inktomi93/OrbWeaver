// domain/world-info/persistence/handoff-copy-write — the world-info-owned lore copy the host-handoff property
// offer executes. A named exception to "persistence is queries only" (the `import-write` / `duplicate-carry`
// precedent): chat must land books in the NOMINEE's library and re-point the room's attachments, and chat
// never touches the world-info tables. The WHY is in `../contract/handoff-copy.ts`; this file is the
// mechanism.
//
// EVERY SOURCE READ CARRIES `fromOwnerId` IN ITS WHERE. A junction row is not a license: the old host may
// have a book attached to a card or to the room that they do not own (a prior host's, still licensed by the
// room-public chat-book posture), and those are not theirs to give away. They are skipped, silently — the
// nominee is no worse off than before the handoff, and the honest alternative (refusing the accept over
// someone else's lore) is not an alternative.
//
// …AND EVERY DESTINATION READ CARRIES `toOwnerId` (#1819). The paragraph above is the SOURCE axis; the card
// half also has a DESTINATION, and it is a caller-supplied id (`cardCopies[].characterId`). Nothing here
// used to ask whose card that was, so a copy id naming a THIRD PARTY's character got a `character_books`
// row pointing at a book this call had just minted under the recipient: a write into another tenant's
// entity graph, deletable by them through their own card's CASCADE, while the recipient's "copy" stayed
// inert (the character-book pool is owner-filtered and they own no card it hangs off). `pendingCardCopies`
// therefore joins `characters` on `toOwnerId` and a foreign or absent id is dropped BEFORE any mint — the
// local belt an injected op's signature owes its next call site, exactly as the `duplicate-carry` twin
// (#1516) and the six #1480 seams took it. The one production caller derives the ids under `toOwnerId`
// (`chat/substrate/handoff-copy.ts` mints them via `copyHandoffCards`), so this closes a latent class, not
// a live bug. The ROOM half needs no destination gate: `chat_books` is keyed by the room and stays
// chat-id-only ON PURPOSE (the room-public chat-book posture — a per-arm owner authority, #1396).

import type { Db } from "@orb/db";
import { characterBooks, characters, chatBooks, worldBooks, worldEntries } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import { batchMany, batchStmt } from "@orb/db/kit";
import type { CharacterId, ChatId, UserId, WorldBookId } from "@orb/kit/ids";
import { and, eq, inArray } from "drizzle-orm";
import type { CopyHandoffBooks, CountHandoffBooks, WorldInfoHandoffCopyContext } from "../contract/handoff-copy.ts";

type BookRow = typeof worldBooks.$inferSelect;

/** The source books attached to `characterIds` that `fromOwnerId` actually OWNS, with their junction role. */
async function ownedCharacterAttachments(
  db: Db,
  fromOwnerId: UserId,
  characterIds: readonly CharacterId[],
): Promise<{ characterId: CharacterId; book: BookRow; role: (typeof characterBooks.$inferSelect)["role"] }[]> {
  if (characterIds.length === 0) {
    return [];
  }
  const rows = await db
    .select({ characterId: characterBooks.characterId, book: worldBooks, role: characterBooks.role })
    .from(characterBooks)
    .innerJoin(worldBooks, eq(characterBooks.worldBookId, worldBooks.id))
    .where(and(inArray(characterBooks.characterId, [...characterIds]), eq(worldBooks.ownerId, fromOwnerId)));
  return rows;
}

/** The books attached to THIS CHAT that `fromOwnerId` owns — the license the copy severs. */
async function ownedChatAttachments(db: Db, fromOwnerId: UserId, chatId: ChatId): Promise<BookRow[]> {
  const rows = await db
    .select({ book: worldBooks })
    .from(chatBooks)
    .innerJoin(worldBooks, eq(chatBooks.worldBookId, worldBooks.id))
    .where(and(eq(chatBooks.chatId, chatId), eq(worldBooks.ownerId, fromOwnerId)));
  return rows.map((r) => r.book);
}

export function createCopyHandoffBooks(ctx: WorldInfoHandoffCopyContext): CopyHandoffBooks {
  return async ({ fromOwnerId, toOwnerId, chatId, cardCopies }): Promise<readonly BatchStmt[]> => {
    const { db } = ctx;
    const at = ctx.now();
    const mints: BatchStmt[] = [];
    // A book attached to two seated cards must become ONE copy shared by both, exactly as the originals
    // shared it — a per-card mint would silently fork the room's lore into divergent duplicates.
    // @orb-gate-ignore persistence-no-in-memory-state: call-local source→copy book map.
    const copyOf = new Map<WorldBookId, WorldBookId>();

    /** Mint a book + its entries under the recipient, once per source book. */
    const copyBook = (source: BookRow): WorldBookId => {
      const known = copyOf.get(source.id);
      if (known !== undefined) {
        return known;
      }
      const bookId = ctx.newBookId();
      copyOf.set(source.id, bookId);
      mints.push(
        batchStmt(db.insert(worldBooks).values({ id: bookId, ownerId: toOwnerId, name: source.name, description: source.description, createdAt: at })),
      );
      return bookId;
    };

    // ── the CARD half. A card copy that already carries junctions is a completed prior attempt: leave it.
    const copiesNeedingBooks = await pendingCardCopies(db, toOwnerId, cardCopies);
    const sourceIds = copiesNeedingBooks.map((c) => c.sourceCharacterId);
    // @orb-gate-ignore persistence-no-in-memory-state: query-local source→copy character lookup.
    const targetOf = new Map(copiesNeedingBooks.map((c) => [c.sourceCharacterId, c.characterId]));
    for (const attachment of await ownedCharacterAttachments(db, fromOwnerId, sourceIds)) {
      const characterId = targetOf.get(attachment.characterId);
      if (characterId === undefined) {
        continue;
      }
      const bookId = copyBook(attachment.book);
      mints.push(batchStmt(db.insert(characterBooks).values({ characterId, worldBookId: bookId, role: attachment.role, createdAt: at })));
    }

    // ── the ROOM half. Detach the original, attach the copy — returned unexecuted so the room's attachment
    // moves in the SAME batch as the role swap.
    const repoint: BatchStmt[] = [];
    const alreadyOnChat = await recipientBookNamesOnChat(db, toOwnerId, chatId);
    for (const source of await ownedChatAttachments(db, fromOwnerId, chatId)) {
      const converged = alreadyOnChat.get(source.name);
      const bookId = converged ?? copyBook(source);
      repoint.push(batchStmt(db.delete(chatBooks).where(and(eq(chatBooks.chatId, chatId), eq(chatBooks.worldBookId, source.id)))));
      repoint.push(batchStmt(db.insert(chatBooks).values({ chatId, worldBookId: bookId, createdAt: at }).onConflictDoNothing()));
    }

    // Entries LAST among the mints: every book row this call creates already exists by then, so one pass
    // reads the whole source set instead of one read per book.
    mints.push(...(await entryMints(ctx, copyOf, at)));
    if (mints.length > 0) {
      await db.batch(batchMany(mints));
    }
    return repoint;
  };
}

/** THE DISCLOSURE (#1762) — the same two owner-filtered halves the copy above reads, counted instead of
 *  minted. `db` only: a count opens no clock and mints no id, and giving it the write context would make it
 *  look like one more writer in a file whose whole subject is writes.
 *
 *  The set arithmetic IS `copyBook`'s map, spelled once more in the small: every source book attached to the
 *  offered cards, plus every chat-attached source book the recipient has no same-named book for on this chat,
 *  DEDUPED BY SOURCE ID — a book attached to both a seated card and the room is one copy there and one here.
 *  A recipient-converged room book is deliberately not counted: nothing new lands in their library for it.
 *  (The card half has no convergence twin: `pendingCardCopies` skips copies that ALREADY carry junctions,
 *  which cannot exist before the accept that mints them.) */
export function createCountHandoffBooks(db: Db): CountHandoffBooks {
  return async ({ fromOwnerId, toOwnerId, chatId, characterIds }): Promise<number> => {
    if (fromOwnerId === toOwnerId) {
      return 0;
    }
    const [cardHalf, roomHalf, alreadyOnChat] = await Promise.all([
      ownedCharacterAttachments(db, fromOwnerId, characterIds),
      ownedChatAttachments(db, fromOwnerId, chatId),
      recipientBookNamesOnChat(db, toOwnerId, chatId),
    ]);
    // @orb-gate-ignore persistence-no-in-memory-state: call-local dedup of source book ids.
    const minted = new Set<WorldBookId>(cardHalf.map((attachment) => attachment.book.id));
    for (const source of roomHalf) {
      if (!alreadyOnChat.has(source.name)) {
        minted.add(source.id);
      }
    }
    return minted.size;
  };
}

/** The card copies that belong to the RECIPIENT and do NOT yet carry any attached book — the ones a
 *  (possibly retried) accept still owes lore to. Two filters resolved in ONE read, because the read is a
 *  `characters` LEFT JOIN: an owned copy with no junction row yet must still come back (an inner join
 *  through `character_books` cannot see it), and its ownership must still be decided.
 *   • OWNERSHIP (#1819) — a copy id `toOwnerId` does not own is dropped BEFORE any mint or junction; see
 *     the header's destination-axis paragraph. An id that does not exist drops for the same reason, and
 *     silently: this op has no report channel, and one bad pairing must not fail the whole accept (the
 *     `duplicate-carry` skip-don't-refuse precedent).
 *   • PENDING — a copy that ALREADY carries junctions is a completed prior attempt and is left exactly as
 *     it is. */
async function pendingCardCopies<T extends { readonly characterId: CharacterId }>(db: Db, toOwnerId: UserId, cardCopies: readonly T[]): Promise<T[]> {
  if (cardCopies.length === 0) {
    return [];
  }
  const rows = await db
    .select({ characterId: characters.id, attachedBookId: characterBooks.worldBookId })
    .from(characters)
    .leftJoin(characterBooks, eq(characterBooks.characterId, characters.id))
    .where(
      and(
        inArray(
          characters.id,
          cardCopies.map((c) => c.characterId),
        ),
        eq(characters.ownerId, toOwnerId),
      ),
    );
  // @orb-gate-ignore persistence-no-in-memory-state: query-local set of the RECIPIENT's own copy ids.
  const owned = new Set(rows.map((r) => r.characterId));
  // @orb-gate-ignore persistence-no-in-memory-state: query-local set of already-served copy ids.
  const done = new Set(rows.flatMap((r) => (r.attachedBookId === null ? [] : [r.characterId])));
  return cardCopies.filter((c) => owned.has(c.characterId) && !done.has(c.characterId));
}

/** name → bookId for the books the RECIPIENT already owns on this chat — the retry convergence key (world-
 *  info's own `(ownerId, name)` dedup idiom; there is no provenance column on `world_books`). */
async function recipientBookNamesOnChat(db: Db, toOwnerId: UserId, chatId: ChatId): Promise<Map<string, WorldBookId>> {
  const rows = await db
    .select({ id: worldBooks.id, name: worldBooks.name })
    .from(chatBooks)
    .innerJoin(worldBooks, eq(chatBooks.worldBookId, worldBooks.id))
    .where(and(eq(chatBooks.chatId, chatId), eq(worldBooks.ownerId, toOwnerId)));
  // @orb-gate-ignore persistence-no-in-memory-state: query-local lookup map keyed by book name.
  return new Map(rows.map((r) => [r.name, r.id]));
}

/** Every source book's entries, re-keyed onto its copy. One read for the whole set. */
async function entryMints(ctx: WorldInfoHandoffCopyContext, copyOf: ReadonlyMap<WorldBookId, WorldBookId>, at: number): Promise<BatchStmt[]> {
  if (copyOf.size === 0) {
    return [];
  }
  const rows = await ctx.db
    .select()
    .from(worldEntries)
    .where(inArray(worldEntries.worldBookId, [...copyOf.keys()]));
  return rows.flatMap((entry) => {
    const worldBookId = copyOf.get(entry.worldBookId);
    return worldBookId === undefined
      ? []
      : [
          batchStmt(
            ctx.db.insert(worldEntries).values({
              id: ctx.newEntryId(),
              worldBookId,
              title: entry.title,
              description: entry.description,
              content: entry.content,
              keys: entry.keys,
              enabled: entry.enabled,
              priority: entry.priority,
              ignoreBudget: entry.ignoreBudget,
              metadata: entry.metadata,
              createdAt: at,
            }),
          ),
        ];
  });
}
