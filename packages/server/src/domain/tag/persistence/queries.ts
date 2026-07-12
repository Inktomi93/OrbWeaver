// domain/tag/persistence/queries — ALL tag-namespace db access (queries only; the conflict→DomainConflictError
// classification + the not-found throws are the verbs' business logic). Owner-scoped on `principal.userId`
// throughout (§7.1): a foreign-owned tag is never returned/mutated. The junction DISPATCH (insert/delete/
// target-access) is the sibling `junctions.ts`. The row→view projection lives here (`toTagView`) — the
// persistence layer owns the read shape.

import type { TagSource, TagSuggestionView, TagView, TagWithUsage } from "@orb/contracts/tag";
import type { Db } from "@orb/db";
import {
  batchMany,
  characters as charactersTable,
  characterTags,
  chatTags,
  fetchOwned,
  personaTags,
  presetTags,
  tags,
  worldBookTags,
} from "@orb/db";
import type { CharacterId, TagId, UserId } from "@orb/kit/ids";
import { and, eq, inArray, sql } from "drizzle-orm";
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
  return db
    .select()
    .from(tags)
    .where(eq(tags.ownerId, ownerId))
    .orderBy(sql`${tags.sortOrder} is null`, tags.sortOrder, tags.name);
}

/** Race-safe create: INSERT a tag, NO-OP on the `(ownerId, lower(name))` functional unique conflict, and
 *  RETURN the new id — or `undefined` if the row already existed (a prior/concurrent OR case-variant create
 *  won the unique). The functional unique is the race guard, so no duplicate tag is ever minted
 *  (one namespace, one owner); the caller falls back to
 *  {@link findTagIdByName} for the existing row. `source` is the provenance stamped ONLY on this first create
 *  (a tag's source is set once); an existing row's source is left untouched by the no-op conflict. */
export async function insertTagIfAbsent(args: {
  readonly db: Db;
  readonly ownerId: UserId;
  readonly name: string;
  readonly tagId: TagId;
  readonly source: TagSource;
}): Promise<TagId | undefined> {
  const { db, ownerId, name, tagId, source } = args;
  // Conflict target is the `(ownerId, lower(name))` FUNCTIONAL unique — so a case-variant ("Female" vs
  // "female") no-ops onto the existing row exactly like an exact-name dup. The caller passes an
  // already-`normalizeTagName`d name; the fold is the case-insensitive half.
  const inserted = await db
    .insert(tags)
    .values({ id: tagId, ownerId, name, source })
    .onConflictDoNothing({ target: [tags.ownerId, sql`lower(${tags.name})`] })
    .returning({ id: tags.id });
  return inserted[0]?.id;
}

/** The owner's tag id whose name folds to `name` (CASE-INSENSITIVE — `lower(name)` both sides, matching the
 *  functional unique), or `undefined` — owner-scoped (a different owner's same-name tag is never returned; the
 *  `(ownerId, lower(name))` predicate is in the WHERE, never a post-filter). */
export async function findTagIdByName(
  db: Db,
  ownerId: UserId,
  name: string,
): Promise<TagId | undefined> {
  const rows = await db
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.ownerId, ownerId), sql`lower(${tags.name}) = lower(${name})`));
  return rows[0]?.id;
}

/** The subset of `ids` that the owner actually owns (the bulk-attach ownership belt — one query, not N). */
export async function fetchOwnedTagIds(
  db: Db,
  ownerId: UserId,
  ids: readonly TagId[],
): Promise<TagId[]> {
  if (ids.length === 0) {
    return [];
  }
  const rows = await db
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.ownerId, ownerId), inArray(tags.id, [...ids])));
  return rows.map((r) => r.id);
}

/** Bulk-insert a set of prepared tag rows for one owner, IDEMPOTENTLY: each row NO-OPs on the
 *  `(ownerId, lower(name))` functional unique (a name already in the owner's namespace is left untouched — a
 *  library import MERGES, never duplicates). Returns the count actually CREATED (the `RETURNING` rows — a
 *  conflicted row returns nothing). One statement; the caller pre-normalizes each `name` and mints each `id`
 *  (the tag-library import verb). A re-import of the same file inserts zero (the round-trip idempotency guard). */
export async function insertOwnedTagsIfAbsent(
  db: Db,
  values: readonly (typeof tags.$inferInsert)[],
): Promise<number> {
  if (values.length === 0) {
    return 0;
  }
  const inserted = await db
    .insert(tags)
    .values([...values])
    .onConflictDoNothing({ target: [tags.ownerId, sql`lower(${tags.name})`] })
    .returning({ id: tags.id });
  return inserted.length;
}

/** Apply an owner-scoped partial patch; returns the updated row, or `undefined` if no owned row matched. */
export async function updateOwnedTag(
  db: Db,
  tagId: TagId,
  ownerId: UserId,
  patch: Partial<typeof tags.$inferInsert>,
): Promise<TagRow | undefined> {
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

/** Set the manual sort order: position i → `sortOrder = i`, owner-scoped. ONE libSQL batch (N typed UPDATEs
 *  in a single round-trip — the `db.batch` non-empty tuple via `batchMany`; sequential awaits would serialize
 *  N round-trips). The caller guarantees `orderedIds` is non-empty (batch rejects an empty list). */
export async function setTagOrderBatch(
  db: Db,
  ownerId: UserId,
  orderedIds: readonly TagId[],
): Promise<void> {
  const stmts = orderedIds.map((id, idx) =>
    db
      .update(tags)
      .set({ sortOrder: idx })
      .where(and(eq(tags.id, id), eq(tags.ownerId, ownerId))),
  );
  await db.batch(batchMany(stmts));
}

/**
 * Merge one owned tag INTO another — re-point every attachment of `sourceTagId` to `targetTagId` across all
 * five junctions, then delete the source tag, in ONE atomic libSQL batch (statements run in order, in a
 * transaction). Dedupe is DELETE-collisions-then-REPOINT: a source junction row whose target entity is
 * ALREADY tagged by `targetTagId` is dropped first, so the subsequent `SET tag_id = target` can never trip a
 * composite-PK conflict. The `character_tags` junction preserves the STRONGEST status — an `accepted` source
 * row upgrades an already-`pending` target row BEFORE the collision-delete (accepted always wins over pending);
 * the four status-less junctions just dedupe on their non-tag PK column. `chat_tags` dedupes on `chatId` alone:
 * its `ownerId` (the tagger) is invariant across both tags' rows — only a tag's OWNER can attach it (attach is
 * owner-scoped) — so a same-`chatId` clash is the only possible PK collision. The verb pre-verifies both ids
 * are owner-owned and distinct; the trailing `owner_id` predicate on the tag delete is the belt.
 */
export async function mergeTagBatch(
  db: Db,
  ownerId: UserId,
  sourceTagId: TagId,
  targetTagId: TagId,
): Promise<void> {
  const stmts = [
    // character — strongest status: an `accepted` source row upgrades a `pending` target row (must run
    // BEFORE the collision-delete drops the source rows).
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
              .where(
                and(eq(characterTags.tagId, sourceTagId), eq(characterTags.status, "accepted")),
              ),
          ),
        ),
      ),
    db
      .delete(characterTags)
      .where(
        and(
          eq(characterTags.tagId, sourceTagId),
          inArray(
            characterTags.characterId,
            db
              .select({ id: characterTags.characterId })
              .from(characterTags)
              .where(eq(characterTags.tagId, targetTagId)),
          ),
        ),
      ),
    db
      .update(characterTags)
      .set({ tagId: targetTagId })
      .where(eq(characterTags.tagId, sourceTagId)),

    // chat (D30) — dedupe on chatId (ownerId is invariant across both tags' rows).
    db
      .delete(chatTags)
      .where(
        and(
          eq(chatTags.tagId, sourceTagId),
          inArray(
            chatTags.chatId,
            db
              .select({ id: chatTags.chatId })
              .from(chatTags)
              .where(eq(chatTags.tagId, targetTagId)),
          ),
        ),
      ),
    db.update(chatTags).set({ tagId: targetTagId }).where(eq(chatTags.tagId, sourceTagId)),

    // worldBook
    db
      .delete(worldBookTags)
      .where(
        and(
          eq(worldBookTags.tagId, sourceTagId),
          inArray(
            worldBookTags.worldBookId,
            db
              .select({ id: worldBookTags.worldBookId })
              .from(worldBookTags)
              .where(eq(worldBookTags.tagId, targetTagId)),
          ),
        ),
      ),
    db
      .update(worldBookTags)
      .set({ tagId: targetTagId })
      .where(eq(worldBookTags.tagId, sourceTagId)),

    // persona
    db
      .delete(personaTags)
      .where(
        and(
          eq(personaTags.tagId, sourceTagId),
          inArray(
            personaTags.personaId,
            db
              .select({ id: personaTags.personaId })
              .from(personaTags)
              .where(eq(personaTags.tagId, targetTagId)),
          ),
        ),
      ),
    db.update(personaTags).set({ tagId: targetTagId }).where(eq(personaTags.tagId, sourceTagId)),

    // preset
    db
      .delete(presetTags)
      .where(
        and(
          eq(presetTags.tagId, sourceTagId),
          inArray(
            presetTags.presetId,
            db
              .select({ id: presetTags.presetId })
              .from(presetTags)
              .where(eq(presetTags.tagId, targetTagId)),
          ),
        ),
      ),
    db.update(presetTags).set({ tagId: targetTagId }).where(eq(presetTags.tagId, sourceTagId)),

    // finally: drop the now-emptied source tag (owner-scoped belt).
    db.delete(tags).where(and(eq(tags.id, sourceTagId), eq(tags.ownerId, ownerId))),
  ];
  await db.batch(batchMany(stmts));
}

// ── pending-suggestion read (the Accept/Reject review queue — PD-40 distill + import staged card tags) ──

/** Every `pending` character-tag suggestion for the owner (optionally narrowed to ONE character), joined to
 *  its tag row so the review UI renders the chip WITH name + colors. Owner-scoped on the JUNCTION-OWNER side:
 *  `character_tags` carries no ownerId (D23), so the owner gate is `characters.ownerId` (the authoritative
 *  owner), reached via the innerJoin — a foreign character's suggestion is never returned. `accepted` rows are
 *  excluded (the read is the STAGED queue; accepted tags read through the character's own `canonicalTagsFor`).
 *  Ordered by name for a stable display. */
export async function listPendingCharacterSuggestions(
  db: Db,
  ownerId: UserId,
  characterId?: CharacterId,
): Promise<TagSuggestionView[]> {
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

// ── usage rollup (FIVE independent GROUP BY queries merged in-process, NEVER a 5-way
//    LEFT JOIN — that explodes to N×5 NULL rows and defeats the merge at typical tag counts) ───────────────

/** Count junction rows per tag for the given tag ids, on ONE junction's tagId column. Returns a plain object
 *  keyed by tag id (NOT a Map — the persistence layer holds no in-memory state; this is a query-local result). */
async function countByTag(
  db: Db,
  table: SQLiteTable,
  tagCol: SQLiteColumn,
  ids: readonly TagId[],
): Promise<Record<string, number>> {
  const rows = await db
    .select({ tagId: tagCol, n: sql<number>`count(*)` })
    .from(table)
    .where(inArray(tagCol, [...ids]))
    .groupBy(tagCol);
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
    usage.total =
      usage.characters + usage.chats + usage.worldBooks + usage.personas + usage.presets;
    return { ...toTagView(row), usage };
  });
}

/** Delete every owned tag with zero junction usage; returns the removed count. Reuses the rollup so a
 *  pending-suggestion junction row counts as usage (a staged suggestion is a live reference — not pruned). */
export async function pruneZeroUsageTags(db: Db, ownerId: UserId): Promise<number> {
  const withUsage = await listOwnedTagsWithUsage(db, ownerId);
  const zero = withUsage.filter((t) => t.usage.total === 0).map((t) => t.id);
  if (zero.length === 0) {
    return 0;
  }
  const deleted = await db
    .delete(tags)
    .where(and(eq(tags.ownerId, ownerId), inArray(tags.id, zero)))
    .returning({ id: tags.id });
  return deleted.length;
}
