// All tag-namespace db access (queries only — the verbs own not-found/conflict classification). Owner-scoped
// on `ownerId` throughout: a foreign-owned tag is never returned/mutated. Junction dispatch lives in the
// sibling `junctions.ts`.

import type { TagFilterVocabularyEntry, TagSource, TagSuggestionView, TagView, TagWithUsage } from "@orb/contracts/tag";
import type { Db } from "@orb/db";
import { characters as charactersTable, characterTags, chatTags, personaTags, presetTags, tags, worldBookTags } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import { batchMany, fetchOwned } from "@orb/db/kit";
import type { CharacterId, TagId, UserId } from "@orb/kit/ids";
import { and, eq, inArray, notExists, sql } from "drizzle-orm";
import type { SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";

type TagRow = typeof tags.$inferSelect;

/** Project a `tags` row onto the cross-boundary `TagView` (drops `ownerId`/`createdAt` — the wire shape). */
export function toTagView(row: TagRow): TagView {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    color2: row.color2,
    source: row.source,
    folderType: row.folderType,
    sortOrder: row.sortOrder,
    isHiddenOnCard: row.isHiddenOnCard,
  };
}

/** Load one owner-scoped tag row, or `undefined` (a foreign-owned id reads as absent — the owner predicate
 *  is in the WHERE, never a post-filter). */
export function loadOwnedTag(db: Db, tagId: TagId, ownerId: UserId): Promise<TagRow | undefined> {
  return fetchOwned(db, tags, tagId, ownerId);
}

/** Every tag the owner has, ordered: manually-ordered first (sortOrder ASC), then unordered by name
 *  (`sort_order IS NULL` sinks the nulls last; name is the fallback — mirrors the TagView contract). */
export function listOwnedTags(db: Db, ownerId: UserId): Promise<TagRow[]> {
  return db.select().from(tags).where(eq(tags.ownerId, ownerId)).orderBy(sql`${tags.sortOrder} is null`, tags.sortOrder, tags.name);
}

/** Race-safe create: insert a tag, no-op on the `(ownerId, lower(name))` functional unique conflict, and
 *  return the new id, or `undefined` if the row already existed. Caller falls back to {@link findTagIdByName}
 *  for the existing row. `source` is stamped only on first create. */
export async function insertTagIfAbsent(args: {
  readonly db: Db;
  readonly ownerId: UserId;
  readonly name: string;
  readonly tagId: TagId;
  readonly source: TagSource;
}): Promise<TagId | undefined> {
  const { db, ownerId, name, tagId, source } = args;
  // Conflict target is the (ownerId, lower(name)) functional unique — a case-variant no-ops onto the
  // existing row like an exact-name dup.
  const inserted = await db
    .insert(tags)
    .values({ id: tagId, ownerId, name, source })
    .onConflictDoNothing({ target: [tags.ownerId, sql`lower(${tags.name})`] })
    .returning({ id: tags.id });
  return inserted[0]?.id;
}

/** The owner's tag id whose name folds to `name` (case-insensitive), or `undefined`. */
export async function findTagIdByName(db: Db, ownerId: UserId, name: string): Promise<TagId | undefined> {
  const rows = await db
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.ownerId, ownerId), sql`lower(${tags.name}) = lower(${name})`));
  return rows[0]?.id;
}

/** The subset of `ids` that the owner actually owns (the bulk-attach ownership belt — one query, not N). */
export async function fetchOwnedTagIds(db: Db, ownerId: UserId, ids: readonly TagId[]): Promise<TagId[]> {
  if (ids.length === 0) {
    return [];
  }
  const rows = await db
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.ownerId, ownerId), inArray(tags.id, [...ids])));
  return rows.map((r) => r.id);
}

/** Idempotent RESTORE for the portable tag-library import (O-3: restore-wins). A same-folded-name tag is
 *  UPDATED in place — it keeps its id, so every junction survives, and takes the backup's presentation axes.
 *  Returns the newly-inserted count, so a re-import of the same library still reports `created: 0`. Caller
 *  pre-normalizes each name and mints each id. */
export async function restoreOwnedTags(db: Db, ownerId: UserId, values: readonly (typeof tags.$inferInsert)[]): Promise<number> {
  if (values.length === 0) {
    return 0;
  }
  const existing = await listOwnedTags(db, ownerId);
  const matchOf = (name: string): TagRow | undefined => existing.find((row) => row.name.toLowerCase() === name.toLowerCase());
  // O-3 restore-wins: a same-name tag keeps its ID (every junction survives) and takes the backup's
  // presentation axes. N statements (each payload differs), ONE batch.
  const updates: BatchStmt[] = [];
  for (const row of values) {
    const match = matchOf(row.name);
    if (match !== undefined) {
      updates.push(
        db
          .update(tags)
          .set({
            color: row.color,
            color2: row.color2,
            source: row.source,
            folderType: row.folderType,
            sortOrder: row.sortOrder,
            isHiddenOnCard: row.isHiddenOnCard,
          })
          .where(and(eq(tags.id, match.id), eq(tags.ownerId, ownerId))),
      );
    }
  }
  if (updates.length > 0) {
    await db.batch(batchMany(updates));
  }
  const fresh = values.filter((row) => matchOf(row.name) === undefined);
  if (fresh.length === 0) {
    return 0;
  }
  const inserted = await db
    .insert(tags)
    .values([...fresh])
    .onConflictDoNothing({ target: [tags.ownerId, sql`lower(${tags.name})`] })
    .returning({ id: tags.id });
  return inserted.length;
}

/** Apply an owner-scoped partial patch; returns the updated row, or `undefined` if no owned row matched. */
export async function updateOwnedTag(db: Db, tagId: TagId, ownerId: UserId, patch: Partial<typeof tags.$inferInsert>): Promise<TagRow | undefined> {
  const updated = await db
    .update(tags)
    .set(patch)
    .where(and(eq(tags.id, tagId), eq(tags.ownerId, ownerId)))
    .returning();
  return updated[0];
}

/** Delete an owner-scoped tag; returns the number of rows removed (0 ⇒ no such owned tag — the verb throws,
 *  remove is deliberately NOT idempotent). Junction rows cascade via the FK `onDelete: cascade`. */
export async function deleteOwnedTag(db: Db, tagId: TagId, ownerId: UserId): Promise<number> {
  const deleted = await db
    .delete(tags)
    .where(and(eq(tags.id, tagId), eq(tags.ownerId, ownerId)))
    .returning({ id: tags.id });
  return deleted.length;
}

/** Set the manual sort order: position i → `sortOrder = i`, owner-scoped. One libSQL batch. Caller
 *  guarantees `orderedIds` is non-empty. */
export async function setTagOrderBatch(db: Db, ownerId: UserId, orderedIds: readonly TagId[]): Promise<void> {
  const stmts = orderedIds.map((id, idx) =>
    db
      .update(tags)
      .set({ sortOrder: idx })
      .where(and(eq(tags.id, id), eq(tags.ownerId, ownerId))),
  );
  await db.batch(batchMany(stmts));
}

/** Merge one owned tag into another — re-point every attachment of `sourceTagId` to `targetTagId` across all
 *  five junctions, then delete the source tag, in one atomic batch. Dedupe is delete-collisions-then-repoint
 *  (a source row already covered by the target is dropped first, so the repoint UPDATE never hits a PK
 *  conflict). `character_tags` preserves the strongest status — an `accepted` source row upgrades a
 *  `pending` target row before the collision-delete. */
export async function mergeTagBatch(db: Db, ownerId: UserId, sourceTagId: TagId, targetTagId: TagId): Promise<void> {
  const stmts = [
    // character: accepted source row upgrades pending target row before the collision-delete.
    db
      .update(characterTags)
      .set({ status: "accepted" })
      .where(
        and(
          eq(characterTags.tagId, targetTagId),
          eq(characterTags.status, "pending"),
          inArray(
            characterTags.characterId,
            db
              .select({ id: characterTags.characterId })
              .from(characterTags)
              .where(and(eq(characterTags.tagId, sourceTagId), eq(characterTags.status, "accepted"))),
          ),
        ),
      ),
    db
      .delete(characterTags)
      .where(
        and(
          eq(characterTags.tagId, sourceTagId),
          inArray(characterTags.characterId, db.select({ id: characterTags.characterId }).from(characterTags).where(eq(characterTags.tagId, targetTagId))),
        ),
      ),
    db.update(characterTags).set({ tagId: targetTagId }).where(eq(characterTags.tagId, sourceTagId)),

    // chat: dedupe on chatId (ownerId is invariant across both tags' rows).
    db
      .delete(chatTags)
      .where(
        and(
          eq(chatTags.tagId, sourceTagId),
          inArray(chatTags.chatId, db.select({ id: chatTags.chatId }).from(chatTags).where(eq(chatTags.tagId, targetTagId))),
        ),
      ),
    db.update(chatTags).set({ tagId: targetTagId }).where(eq(chatTags.tagId, sourceTagId)),

    // worldBook
    db
      .delete(worldBookTags)
      .where(
        and(
          eq(worldBookTags.tagId, sourceTagId),
          inArray(worldBookTags.worldBookId, db.select({ id: worldBookTags.worldBookId }).from(worldBookTags).where(eq(worldBookTags.tagId, targetTagId))),
        ),
      ),
    db.update(worldBookTags).set({ tagId: targetTagId }).where(eq(worldBookTags.tagId, sourceTagId)),

    // persona
    db
      .delete(personaTags)
      .where(
        and(
          eq(personaTags.tagId, sourceTagId),
          inArray(personaTags.personaId, db.select({ id: personaTags.personaId }).from(personaTags).where(eq(personaTags.tagId, targetTagId))),
        ),
      ),
    db.update(personaTags).set({ tagId: targetTagId }).where(eq(personaTags.tagId, sourceTagId)),

    // preset
    db
      .delete(presetTags)
      .where(
        and(
          eq(presetTags.tagId, sourceTagId),
          inArray(presetTags.presetId, db.select({ id: presetTags.presetId }).from(presetTags).where(eq(presetTags.tagId, targetTagId))),
        ),
      ),
    db.update(presetTags).set({ tagId: targetTagId }).where(eq(presetTags.tagId, sourceTagId)),

    // drop the now-emptied source tag (owner-scoped belt).
    db.delete(tags).where(and(eq(tags.id, sourceTagId), eq(tags.ownerId, ownerId))),
  ];
  await db.batch(batchMany(stmts));
}

/** Every `pending` character-tag suggestion for the owner (optionally narrowed to one character), joined to
 *  its tag row so the review UI renders the chip with name + colors. `character_tags` carries no ownerId, so
 *  the owner gate reaches `characters.ownerId` via the innerJoin. */
export async function listPendingCharacterSuggestions(db: Db, ownerId: UserId, characterId?: CharacterId): Promise<TagSuggestionView[]> {
  const conds = [eq(charactersTable.ownerId, ownerId), eq(characterTags.status, "pending")];
  if (characterId !== undefined) {
    conds.push(eq(characterTags.characterId, characterId));
  }
  const rows = await db
    .select({
      id: tags.id,
      name: tags.name,
      color: tags.color,
      color2: tags.color2,
      source: tags.source,
      folderType: tags.folderType,
      sortOrder: tags.sortOrder,
      isHiddenOnCard: tags.isHiddenOnCard,
      characterId: characterTags.characterId,
    })
    .from(characterTags)
    .innerJoin(tags, eq(characterTags.tagId, tags.id))
    .innerJoin(charactersTable, eq(characterTags.characterId, charactersTable.id))
    .where(and(...conds))
    .orderBy(tags.name);
  return rows;
}

// Usage rollup: five independent GROUP BY queries merged in-process, never a 5-way LEFT JOIN (that explodes
// to N×5 NULL rows at typical tag counts).

/** Count junction rows per tag for the given tag ids, on one junction's tagId column. */
async function countByTag(db: Db, table: SQLiteTable, tagCol: SQLiteColumn, ids: readonly TagId[]): Promise<Record<string, number>> {
  const rows = await db
    .select({ tagId: tagCol, n: sql<number>`count(*)` })
    .from(table)
    .where(inArray(tagCol, [...ids]))
    .groupBy(tagCol);
  return Object.fromEntries(rows.map((r) => [r.tagId, r.n]));
}

/**
 * Count the ACCEPTED character attachments per tag — {@link countByTag}'s status-aware twin, and the ONE
 * count a FILTER may be derived from.
 *
 * WHY IT IS SEPARATE FROM THE ROLLUP'S COUNT (side-eye 2026-08-30 rail-characters P2, #839). The character
 * library's tag filter is `characterTags.status = 'accepted'` on both arms — the tag predicate AND the
 * group-by-tag read, in `domain/character/persistence/queries.ts` — because a PENDING suggestion is a
 * proposal about a card, not a fact about it. The filter VOCABULARY counted every junction row regardless
 * of status, so a tag that exists only as unaccepted suggestions reported a non-zero `characters`, cleared
 * the chip rail's own `characters > 0` gate (`tagVocabulary`), and rendered a chip that could only ever
 * answer "no matches". Measured on the seed library: 28 offered facets, every one of them dead, against a
 * group-by-tag returning one bucket of ten untagged characters.
 *
 * The MANAGEMENT rollup ({@link listOwnedTagsWithUsage}) keeps the status-blind count on purpose: that
 * screen answers "is this tag attached to anything" — a prune candidate is a tag with no attachment of any
 * status, and a pending suggestion is an attachment. Two questions, two counts.
 */
async function countAcceptedCharacterTags(db: Db, ids: readonly TagId[]): Promise<Record<string, number>> {
  const rows = await db
    .select({ tagId: characterTags.tagId, n: sql<number>`count(*)` })
    .from(characterTags)
    .where(and(inArray(characterTags.tagId, [...ids]), eq(characterTags.status, "accepted")))
    .groupBy(characterTags.tagId);
  return Object.fromEntries(rows.map((r) => [r.tagId, r.n]));
}

/** Every owned tag plus its five-junction usage rollup (the management screen's read; drives prune-unused). */
export async function listOwnedTagsWithUsage(db: Db, ownerId: UserId): Promise<TagWithUsage[]> {
  const owned = await listOwnedTags(db, ownerId);
  if (owned.length === 0) {
    return [];
  }
  const ids = owned.map((t) => t.id);
  const [characters, chats, worldBooks, personas, presets] = await Promise.all([
    countByTag(db, characterTags, characterTags.tagId, ids),
    countByTag(db, chatTags, chatTags.tagId, ids),
    countByTag(db, worldBookTags, worldBookTags.tagId, ids),
    countByTag(db, personaTags, personaTags.tagId, ids),
    countByTag(db, presetTags, presetTags.tagId, ids),
  ]);
  return owned.map((row) => {
    const usage = {
      characters: characters[row.id] ?? 0,
      chats: chats[row.id] ?? 0,
      worldBooks: worldBooks[row.id] ?? 0,
      personas: personas[row.id] ?? 0,
      presets: presets[row.id] ?? 0,
      total: 0,
    };
    usage.total = usage.characters + usage.chats + usage.worldBooks + usage.personas + usage.presets;
    return { ...toTagView(row), usage };
  });
}

/**
 * The character-library FILTER VOCABULARY — every owned tag, projected to what a filter chip reads, ranked
 * MOST-USED-FIRST (ties alphabetical, the order the chip rail's cap depends on being meaningful).
 *
 * ONE `GROUP BY`, NOT FIVE, and four columns instead of eleven: the chip rail used to ride
 * {@link listOwnedTagsWithUsage}, the MANAGEMENT screen's read, which counts all five junctions and ships
 * the full display axes — 433KB over the wire for 1,736 tags to paint 8 chips (side-eye 2026-08-18 P2-6).
 * The other four counts are not a datum any chip can use.
 *
 * THE RANK IS THE SERVER'S (paged-list lenses go server-side): the client no longer re-sorts what it was
 * handed, so the cap's "the filters that can do the most sit in the visible slice" rule has ONE author.
 * Every owned tag is returned, including hidden and zero-usage ones — the caller drops those from the RAIL
 * but needs them as the referential authority for a persisted filter (see `TagFilterVocabularyEntry`).
 *
 * `characters` IS THE ACCEPTED COUNT, AND THAT IS WHAT MAKES THE RAIL'S OWN GATE TRUE (#839) — see
 * {@link countAcceptedCharacterTags}. The client drops a `characters === 0` entry from the chips
 * (`tagVocabulary`), so this number is the predicate deciding whether a facet is OFFERED; counting a
 * pending suggestion here offered 28 facets that the list's `status = 'accepted'` filter could never match.
 * Zero-count rows still SHIP (the referential authority is the row set, not the count).
 */
export async function listOwnedTagFilterVocabulary(db: Db, ownerId: UserId): Promise<TagFilterVocabularyEntry[]> {
  const owned = await listOwnedTags(db, ownerId);
  if (owned.length === 0) {
    return [];
  }
  const characters = await countAcceptedCharacterTags(
    db,
    owned.map((t) => t.id),
  );
  return owned
    .map((row) => ({ id: row.id, name: row.name, isHiddenOnCard: row.isHiddenOnCard, characters: characters[row.id] ?? 0 }))
    .sort((a, b) => b.characters - a.characters || a.name.localeCompare(b.name));
}

/** Delete every owned tag with zero junction usage; returns the removed count. The rollup supplies
 *  candidates; the DELETE rechecks all five junctions so an attachment created after that snapshot wins. */
export async function pruneZeroUsageTags(db: Db, ownerId: UserId): Promise<number> {
  const withUsage = await listOwnedTagsWithUsage(db, ownerId);
  const zero = withUsage.filter((t) => t.usage.total === 0).map((t) => t.id);
  if (zero.length === 0) {
    return 0;
  }
  const deleted = await db
    .delete(tags)
    .where(
      and(
        eq(tags.ownerId, ownerId),
        inArray(tags.id, zero),
        notExists(db.select({ tagId: characterTags.tagId }).from(characterTags).where(eq(characterTags.tagId, tags.id))),
        notExists(db.select({ tagId: chatTags.tagId }).from(chatTags).where(eq(chatTags.tagId, tags.id))),
        notExists(db.select({ tagId: worldBookTags.tagId }).from(worldBookTags).where(eq(worldBookTags.tagId, tags.id))),
        notExists(db.select({ tagId: personaTags.tagId }).from(personaTags).where(eq(personaTags.tagId, tags.id))),
        notExists(db.select({ tagId: presetTags.tagId }).from(presetTags).where(eq(presetTags.tagId, tags.id))),
      ),
    )
    .returning({ id: tags.id });
  return deleted.length;
}
