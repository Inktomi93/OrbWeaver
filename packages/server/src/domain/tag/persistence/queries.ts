// domain/tag/persistence/queries — ALL tag-namespace db access (queries only; the conflict→DomainConflictError
// classification + the not-found throws are the verbs' business logic). Owner-scoped on `principal.userId`
// throughout (§7.1): a foreign-owned tag is never returned/mutated. The junction DISPATCH (insert/delete/
// target-access) is the sibling `junctions.ts`. The row→view projection lives here (`toTagView`) — the
// persistence layer owns the read shape.

import type { TagSource, TagView, TagWithUsage } from "@orb/contracts/tag";
import type { Db } from "@orb/db";
import {
  batchMany,
  characterTags,
  chatTags,
  fetchOwned,
  personaTags,
  presetTags,
  tags,
  worldBookTags,
} from "@orb/db";
import type { TagId, UserId } from "@orb/kit/ids";
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
  // Five GROUP BY rollups in parallel (one per per-type junction), merged in-process below.
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
