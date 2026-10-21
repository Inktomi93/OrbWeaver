// Every place a live asset reference sits, and the ONE collector GC, reap and export all derive from: the FK
// registry, the JSON pins and owner-scoped `asset:` refs in message bodies. A reference this file cannot read
// refuses the whole sweep — "unreadable" never means "unreferenced".

import type { ThemeBackground } from "@orb/contracts/theme";
import { BACKGROUND_IMAGE_KINDS } from "@orb/contracts/theme";
import type { Db } from "@orb/db";
import {
  adminDistributedPlugins,
  assets,
  characters,
  chatParticipants,
  chats,
  documents,
  galleryItems,
  imageryGenerations,
  messageAssets,
  messageReactions,
  messages,
  messageVariants,
  personas,
  pluginAssets,
  plugins,
  userSettings,
} from "@orb/db";
import { ASSET_SCHEME } from "@orb/kit/content";
import { DomainOperationError } from "@orb/kit/errors";
import type { AssetId, MessageVariantId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { SQL } from "drizzle-orm";
import { and, asc, eq, exists, gt, inArray, isNotNull, like, not, notInArray, or, sql } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import type { AssetRef } from "../contract/maintenance.ts";
import { extractInlineAssetIds } from "../substrate/portable-asset-file.ts";

/** RETAINING references — a non-null value here keeps its asset (and blob) LIVE; the safe default for an
 *  ambiguous asset-FK column (over-retaining leaks a blob, under-retaining is data loss). */
export const ASSET_REFS: readonly AssetRef[] = [
  { table: characters, column: characters.avatarAssetId },
  { table: personas, column: personas.avatarAssetId },
  { table: galleryItems, column: galleryItems.assetId },

  { table: imageryGenerations, column: imageryGenerations.assetId },
  { table: messageAssets, column: messageAssets.assetId },
  // B6/MR0 — a CUSTOM reaction emoji's image. The column is born-and-typed and nothing writes it through
  // MR0-MR2 (the wire is unicode-only), so this row retains nothing TODAY; it is here because a
  // CAS-referencing column the registry cannot see is exactly how a live reference gets reaped, and the
  // schema-introspection test enumerates every FK-to-`assets.id` column and REDs an unclassified one — so
  // the alternative is not "add it later", it is a red gate now and a purged blob later.
  { table: messageReactions, column: messageReactions.emojiImageAssetId },

  // A document's original uploaded bytes (SET NULL on purge — retaining while the row points at it).
  { table: documents, column: documents.sourceAssetId },
  // An installed plugin's bundle bytes (RESTRICT — must never be reaped under the install).
  { table: plugins, column: plugins.bundleAssetId },
  // A SERVER-WIDE PUBLISHED plugin bundle (D147 clause (d)) — the bytes every future new-user application
  // re-reads. RETAINING for exactly that reason: the publishing admin may have no `plugins` row of their own
  // at that slug (they can uninstall their copy), and without this the blob would be reaped out from under
  // the distribution set while the record still pointed at it. Its own FK is CASCADE (a distribution cannot
  // outlive its bytes), which is the delete direction — this list is about the GC direction.
  { table: adminDistributedPlugins, column: adminDistributedPlugins.bundleAssetId },
  // #802 — an image an installed plugin pulled into its installer's CAS with `net.fetchAsset`. It has no other
  // referencing row ANYWHERE: the surface that displays it (a plugin UI state blob) is JSON, so the FK
  // enumeration could not see it and the scheduled GC reaped a live hub cover one grace window after the fetch.
  // The retention unit is the INSTALL — uninstall CASCADEs these links away and the covers become ordinary
  // candidates again (the uninstall verb reaps them eagerly). Same posture as `message_assets`: the link row
  // exists so this registry can SEE the reference.
  { table: pluginAssets, column: pluginAssets.assetId },
];

/** DERIVED asset-FK columns — regenerable rows that do NOT pin the blob. Held as `<table>.<column>`
 *  snake-case keys, not drizzle refs: `image_embeddings` / `image_index_skips` are embeddings-owned tables
 *  this file may not import. `image_index_skips` is the indexer's admission-floor skip-log (#273): a
 *  re-derivable verdict about the bytes, so it must NOT keep a degenerate blob alive (it CASCADEs away when
 *  the asset is reaped — retaining it would make a skipped 1×1 un-GC-able forever).
 *
 *  The `@public` marker retired 2026-09-05: the front door now re-exports this list and the
 *  `structure:asset-refs` stage's comparator consumes it, so it is an ordinary consumed export and a
 *  `@public`-family marker on a consumed export is stale by the orphan-ratchet's own two-sided rule. */
export const DERIVED_ASSET_COLUMNS: readonly string[] = ["image_embeddings.asset_id", "image_index_skips.asset_id", "image_analyses.asset_id"];

const ASSET_REFS_UNMEASURABLE = "asset_refs_unmeasurable";

// `json_type()` answers SQL NULL for an absent path; these are the stored JSON types a reference reader accepts.
const JSON_NULL_TYPE = "null";
const JSON_TEXT_TYPE = "text";
const JSON_ARRAY_TYPE = "array";

const APPEARANCE_PICK_PATH = "$.appearance.backgroundAssetId";
const APPEARANCE_LIBRARY_PATH = "$.appearance.backgroundLibrary";
const PROFILE_AVATAR_PATH = "$.profile.avatarAssetId";
/** Where a carried background source sits in its JSON column: the whole card override, the room's `background` key. */
const CARD_BACKGROUND_AT = "$";
const CHAT_BACKGROUND_AT = "$.background";

/** The one background source kind that names an asset. */
const ASSET_SOURCE_KIND = "asset" satisfies ThemeBackground["kind"];
/** The retired catalog kind; its boot migration rewrites every stored one, and it never named an asset. */
const RETIRED_SEEDED_SOURCE_KIND = "seeded";
/** Source kinds that name no asset. Any other stored kind is a shape this collector cannot read. */
const NON_ASSET_SOURCE_KINDS: readonly string[] = [...BACKGROUND_IMAGE_KINDS.filter((kind) => kind !== ASSET_SOURCE_KIND), RETIRED_SEEDED_SOURCE_KIND];

/** The `message_variants` text columns whose bytes are, or can be restored into, a rendered body. */
const INLINE_BODY_COLUMNS = [
  messageVariants.content,
  messageVariants.rawContent,
  messageVariants.preContinueContent,
  messageVariants.lastContinuationContent,
] as const;
const INLINE_REF_LIKE = `%${ASSET_SCHEME}%`;
/** Keyset page size for the body scan, so a large corpus never loads every image-bearing body at once. */
const INLINE_BODY_PAGE = 500;

const JSON_OBJECT_TYPE = "object";
const JSON_ROOT = "$";
const APPEARANCE_PATH = "$.appearance";
const PROFILE_PATH = "$.profile";

interface CarriedSourceRow {
  readonly valid: number | null;
  readonly rootType: string | null;
  readonly sourceType: string | null;
  readonly kind: string | null;
  readonly kindType: string | null;
  readonly id: string | null;
  readonly idType: string | null;
}

/** `row` is the source row's table and primary key, the owner's handle for repairing it; never a stored value. */
function unmeasurable(row: string, path: string, shape: string): DomainOperationError {
  return new DomainOperationError(ASSET_REFS_UNMEASURABLE, `${row} ${path} holds ${shape} — refusing to treat it as unreferenced`);
}

// The atomic delete reads paths raw: a malformed row raises inside the DELETE, so that purge fails closed.
function jsonValue(column: AnySQLiteColumn, path: string): SQL<string | null> {
  return sql<string | null>`json_extract(${column}, ${path})`;
}

// The snapshot reads through `json_valid`, so one corrupt row reaches `assertParses` with its key instead of
// failing the whole SELECT without naming the row.
function readableValue(column: AnySQLiteColumn, path: string): SQL<string | null> {
  return sql<string | null>`CASE WHEN json_valid(${column}) THEN json_extract(${column}, ${path}) END`;
}

function readableType(column: AnySQLiteColumn, path: string): SQL<string | null> {
  return sql<string | null>`CASE WHEN json_valid(${column}) THEN json_type(${column}, ${path}) END`;
}

function jsonValid(column: AnySQLiteColumn): SQL<number | null> {
  return sql<number | null>`json_valid(${column})`;
}

/** Text that is not JSON hides every reference it holds. A NULL column is absent, not corrupt. */
function assertParses(valid: number | null, row: string, column: string): void {
  if (valid === 0) {
    throw unmeasurable(row, column, "text that is not JSON");
  }
}

/** Every container on the way to a reference must be an object, absent or a JSON null. A double-encoded string
 *  or any other value hides what it holds from the path reads beneath it. */
function assertContainer(type: string | null, row: string, path: string): void {
  if (type !== null && type !== JSON_NULL_TYPE && type !== JSON_OBJECT_TYPE) {
    throw unmeasurable(row, path, `a JSON ${type} where an object belongs`);
  }
}

/** The stored string at a reference path; null when the path is absent or a JSON null. Any other JSON type
 *  may name an asset in a shape this reader does not parse, so it refuses. */
function storedString(value: string | null, type: string | null, row: string, path: string): string | null {
  if (type === null || type === JSON_NULL_TYPE) {
    return null;
  }
  if (type !== JSON_TEXT_TYPE) {
    throw unmeasurable(row, path, `a JSON ${type}`);
  }
  return value;
}

/** Over-inclusion is safe (an extra live id never reaps a blob), so any non-empty stored string counts. */
function storedAssetId(value: string | null, type: string | null, row: string, path: string): AssetId | null {
  const text = storedString(value, type, row, path);
  return text === null || text.length === 0 ? null : castId<AssetId>(text);
}

/** Every entry's `assetId` in the stored background library. Absent or JSON null is the documented empty
 *  library. Corrupt settings are preserved for repair, never normalized, so a library that is not an array,
 *  an entry that is not an object, or an `assetId` that is not a string fails this read instead of silently
 *  dropping its ids from the live set. An object entry with no `assetId` names nothing. */
function libraryAssetIds(libraryJson: string | null, type: string | null, row: string): AssetId[] {
  if (type === null || type === JSON_NULL_TYPE) {
    return [];
  }
  if (type !== JSON_ARRAY_TYPE || libraryJson === null) {
    throw unmeasurable(row, APPEARANCE_LIBRARY_PATH, `a JSON ${type}`);
  }
  const parsed: unknown = JSON.parse(libraryJson);
  if (!Array.isArray(parsed)) {
    throw unmeasurable(row, APPEARANCE_LIBRARY_PATH, "a value that is not an array");
  }
  const entries: readonly unknown[] = parsed;
  const ids: AssetId[] = [];
  for (const entry of entries) {
    const id = libraryEntryAssetId(entry, row);
    if (id !== null) {
      ids.push(id);
    }
  }
  return ids;
}

function libraryEntryAssetId(entry: unknown, row: string): AssetId | null {
  if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
    throw unmeasurable(row, APPEARANCE_LIBRARY_PATH, "an entry that is not an object");
  }
  if (!("assetId" in entry) || entry.assetId === null) {
    return null;
  }
  if (typeof entry.assetId !== "string") {
    throw unmeasurable(row, APPEARANCE_LIBRARY_PATH, "an entry whose assetId is not a string");
  }
  return entry.assetId.length > 0 ? castId<AssetId>(entry.assetId) : null;
}

/** The settings JSON pins: the background pick, every background-library entry and the profile avatar. */
async function selectSettingsReferencedAssetIds(db: Db): Promise<Set<AssetId>> {
  // query-local accumulator for GC live-set. Ends if it outlives the call.
  const live = new Set<AssetId>();
  const config = userSettings.config;
  const rows = await db
    .select({
      userId: userSettings.userId,
      valid: jsonValid(config),
      rootType: readableType(config, JSON_ROOT),
      appearanceType: readableType(config, APPEARANCE_PATH),
      profileType: readableType(config, PROFILE_PATH),
      pick: readableValue(config, APPEARANCE_PICK_PATH),
      pickType: readableType(config, APPEARANCE_PICK_PATH),
      library: readableValue(config, APPEARANCE_LIBRARY_PATH),
      libraryType: readableType(config, APPEARANCE_LIBRARY_PATH),
      avatar: readableValue(config, PROFILE_AVATAR_PATH),
      avatarType: readableType(config, PROFILE_AVATAR_PATH),
    })
    .from(userSettings);
  for (const row of rows) {
    const label = `user_settings ${row.userId} config`;
    assertParses(row.valid, label, JSON_ROOT);
    assertContainer(row.rootType, label, JSON_ROOT);
    assertContainer(row.appearanceType, label, APPEARANCE_PATH);
    assertContainer(row.profileType, label, PROFILE_PATH);
    const pinned = [
      storedAssetId(row.pick, row.pickType, label, APPEARANCE_PICK_PATH),
      storedAssetId(row.avatar, row.avatarType, label, PROFILE_AVATAR_PATH),
      ...libraryAssetIds(row.library, row.libraryType, label),
    ];
    for (const id of pinned) {
      if (id !== null) {
        live.add(id);
      }
    }
  }
  return live;
}

function carriedSource(column: AnySQLiteColumn, at: string): { readonly [K in keyof CarriedSourceRow]: SQL<CarriedSourceRow[K]> } {
  return {
    valid: jsonValid(column),
    rootType: readableType(column, JSON_ROOT),
    sourceType: readableType(column, at),
    kind: readableValue(column, `${at}.kind`),
    kindType: readableType(column, `${at}.kind`),
    id: readableValue(column, `${at}.assetId`),
    idType: readableType(column, `${at}.assetId`),
  };
}

/** A carried source names its asset only as `kind:"asset"`. A known non-asset kind carrying a stray `assetId`
 *  (hand-crafted or pre-canonicalization) must not pin a foreign asset — the read-side twin of
 *  `canonicalBackgroundSource`. A kind this file does not know, or a source that is not an object, refuses
 *  the sweep. */
function carriedAssetId(row: CarriedSourceRow, label: string, at: string): AssetId | null {
  assertParses(row.valid, label, JSON_ROOT);
  assertContainer(row.rootType, label, JSON_ROOT);
  assertContainer(row.sourceType, label, at);
  const kind = storedString(row.kind, row.kindType, label, `${at}.kind`);
  if (kind === null || NON_ASSET_SOURCE_KINDS.includes(kind)) {
    return null;
  }
  if (kind !== ASSET_SOURCE_KIND) {
    throw unmeasurable(label, `${at}.kind`, "a background source kind this collector does not know");
  }
  return storedAssetId(row.id, row.idType, label, `${at}.assetId`);
}

/** The carried backgrounds: `characters.background_override` (card) and `chats.metadata.background` (room).
 *  Cross-user by design: a host's room background must not vanish because its asset's owner ran GC. */
async function selectCarriedBackgroundReferencedAssetIds(db: Db): Promise<Set<AssetId>> {
  // query-local accumulator for GC live-set. Ends if it outlives the call.
  const live = new Set<AssetId>();
  const cardRows = await db
    .select({ key: characters.id, ...carriedSource(characters.backgroundOverride, CARD_BACKGROUND_AT) })
    .from(characters)
    .where(isNotNull(characters.backgroundOverride));
  const chatRows = await db.select({ key: chats.id, ...carriedSource(chats.metadata, CHAT_BACKGROUND_AT) }).from(chats);
  const carried = [
    ...cardRows.map((row) => carriedAssetId(row, `characters ${row.key} background_override`, CARD_BACKGROUND_AT)),
    ...chatRows.map((row) => carriedAssetId(row, `chats ${row.key} metadata`, CHAT_BACKGROUND_AT)),
  ];
  for (const id of carried) {
    if (id !== null) {
      live.add(id);
    }
  }
  return live;
}

/** The FK half of the live set. `ownerId === null` is the whole-corpus GC sweep; an owner narrows every
 *  registry column to THAT owner's assets through the `assets` join (the export half — a bundle carries only
 *  its owner's blobs, and a foreign-owned referenced asset is not the exporter's to ship). */
async function selectFkReferencedAssetIds(db: Db, ownerId: UserId | null): Promise<Set<AssetId>> {
  // query-local accumulator for the reference live-set. Ends if it outlives the call.
  const live = new Set<AssetId>();
  for (const ref of ASSET_REFS) {
    // one SELECT per ASSET_REFS registry row, not per data row — each ref names a DIFFERENT table and column, so the twelve reads cannot collapse into one statement. Ends when the registry is expressible as one UNION over a generated view.
    // The `assets` join drops only references to ids that are no asset, so the GC sweep's live set is unchanged by it.
    // `ref` walks the `ASSET_REFS` registry and the read selects only that table's asset FK column — the whole-corpus GC sweep (a trusted system pass, D20, `ownerId === null`) or the exporter's own assets by `eq(assets.ownerId, ownerId)` on the joined asset. Ends if a caller-supplied table or column reaches this registry.
    // the joined asset is owner-scoped by `eq(assets.ownerId, ownerId)` on the export arm; the `ownerId === null` arm is the whole-corpus GC sweep, a trusted system pass (D20) that returns asset ids only. Ends if a Principal-bearing caller reaches the null arm.
    const rows = await db
      .selectDistinct({ id: ref.column })
      .from(ref.table)
      .innerJoin(assets, eq(assets.id, ref.column))
      .where(and(isNotNull(ref.column), ownerId === null ? undefined : eq(assets.ownerId, ownerId)));
    for (const row of rows) {
      const id = row.id as AssetId | null;
      if (id !== null) {
        live.add(id);
      }
    }
  }
  return live;
}

/** SQLite's bound-parameter ceiling is per statement, and the JSON live-sources are cross-user by design
 *  (any user's settings/card/chat may pin any asset), so the owner narrowing runs in bounded batches rather
 *  than one unbounded `IN (…)`. */
const OWNER_FILTER_BATCH = 500;

/** The ids among `candidates` whose `assets` row belongs to `ownerId`. The JSON live-sources cannot express
 *  the owner filter in their own SQL (they read a foreign table's JSON column, and the library array is
 *  parsed in JS precisely so a corrupt value FAILS instead of silently reading empty — see
 *  `libraryAssetIds`), so the narrowing happens here, against the index rows themselves. */
async function narrowToOwner(db: Db, candidates: ReadonlySet<AssetId>, ownerId: UserId): Promise<Set<AssetId>> {
  // query-local accumulator for the reference live-set. Ends if it outlives the call.
  const owned = new Set<AssetId>();
  const ids = [...candidates];
  for (let i = 0; i < ids.length; i += OWNER_FILTER_BATCH) {
    // deliberate chunking: the loop steps by OWNER_FILTER_BATCH because the id set exceeds the libSQL bound-variable cap, so one round trip per chunk IS the batching. Ends if the driver lifts the cap.
    const rows = await db
      .select({ id: assets.id })
      .from(assets)
      .where(and(eq(assets.ownerId, ownerId), inArray(assets.id, ids.slice(i, i + OWNER_FILTER_BATCH))));
    for (const row of rows) {
      owned.add(row.id);
    }
  }
  return owned;
}

/** File the `asset:<id>` refs of one variant's bodies under the row's author. */
function collectInlineCandidates(bodies: readonly (string | null)[], author: UserId, into: Map<UserId, Set<AssetId>>): void {
  // query-local per-author candidate bucket for the reference live-set. Ends if it outlives the call.
  const bucket = into.get(author) ?? new Set<AssetId>();
  for (const body of bodies) {
    if (body !== null) {
      for (const id of extractInlineAssetIds(body)) {
        bucket.add(id);
      }
    }
  }
  into.set(author, bucket);
}

/** `asset:<id>` refs in message bodies, kept only on a row the asset's owner AUTHORED in a room they sit in. That
 *  is the one place an owner renders their own picture by id with no `message_assets` link — a forked room, a
 *  duplicated message, an author's edit. Anyone else's quote retains nothing: a stranger cannot pin a foreign
 *  blob, and a co-member's quote cannot keep an attachment its owner deleted. `ownerId === null` is the
 *  whole-corpus sweep; an owner reads only the rows they authored. */
async function selectInlineBodyReferencedAssetIds(db: Db, ownerId: UserId | null): Promise<Set<AssetId>> {
  // query-local per-author candidate index for the reference live-set. Ends if it outlives the call.
  const candidates = new Map<UserId, Set<AssetId>>();
  let after: MessageVariantId | undefined;
  for (;;) {
    // deliberate keyset paging — each round trip is one bounded page of image-bearing bodies, so memory stays flat on a large corpus. Ends if the driver gains a streaming cursor.
    const page = await db
      .select({
        id: messageVariants.id,
        author: chatParticipants.userId,
        content: messageVariants.content,
        rawContent: messageVariants.rawContent,
        preContinueContent: messageVariants.preContinueContent,
        lastContinuationContent: messageVariants.lastContinuationContent,
      })
      .from(messageVariants)
      .innerJoin(messages, eq(messages.id, messageVariants.messageId))
      // The author's own seat in the row's room: one row per variant (`chat_participants_chat_user_unique`).
      .innerJoin(chatParticipants, and(eq(chatParticipants.chatId, messages.chatId), eq(chatParticipants.userId, messages.authorUserId)))
      .where(
        and(
          ownerId === null ? undefined : eq(messages.authorUserId, ownerId),
          after === undefined ? undefined : gt(messageVariants.id, after),
          or(...INLINE_BODY_COLUMNS.map((column) => like(column, INLINE_REF_LIKE))),
        ),
      )
      .orderBy(asc(messageVariants.id))
      .limit(INLINE_BODY_PAGE);
    for (const row of page) {
      if (row.author !== null) {
        collectInlineCandidates([row.content, row.rawContent, row.preContinueContent, row.lastContinuationContent], row.author, candidates);
      }
    }
    const last = page.at(-1);
    if (last === undefined || page.length < INLINE_BODY_PAGE) {
      break;
    }
    after = last.id;
  }
  return await ownedCandidates(db, candidates);
}

/** Keep each user's candidate ids only where that user owns the asset. */
async function ownedCandidates(db: Db, candidates: ReadonlyMap<UserId, ReadonlySet<AssetId>>): Promise<Set<AssetId>> {
  // query-local accumulator for the reference live-set. Ends if it outlives the call.
  const live = new Set<AssetId>();
  for (const [userId, ids] of candidates) {
    for (const id of await narrowToOwner(db, ids, userId)) {
      live.add(id);
    }
  }
  return live;
}

/** The ONE reference collector — the FK registry UNIONED with every JSON live-source (settings pick, library
 *  and profile avatar, the carried card/chat backgrounds) and the owner-scoped message-body refs, optionally
 *  narrowed to one owner. Both readers derive from it: GC sweeps blobs against the whole-corpus set
 *  (`ownerId === null`), and the portability export ships the owner-scoped set. They MUST NOT diverge — a
 *  reference GC honors but the export misses restores the referencing JSON without its bytes, which is the
 *  same data loss with a longer fuse. */
async function selectReferencedAssetIds(db: Db, ownerId: UserId | null): Promise<Set<AssetId>> {
  const live = await selectFkReferencedAssetIds(db, ownerId);
  // query-local accumulator for the reference live-set. Ends if it outlives the call.
  const jsonPinned = new Set<AssetId>();
  for (const id of await selectSettingsReferencedAssetIds(db)) {
    jsonPinned.add(id);
  }
  for (const id of await selectCarriedBackgroundReferencedAssetIds(db)) {
    jsonPinned.add(id);
  }
  for (const id of ownerId === null ? jsonPinned : await narrowToOwner(db, jsonPinned, ownerId)) {
    live.add(id);
  }
  for (const id of await selectInlineBodyReferencedAssetIds(db, ownerId)) {
    live.add(id);
  }
  return live;
}

/** The whole-corpus live set `collectGarbage` sweeps every blob against. */
export async function selectAllReferencedAssetIds(db: Db): Promise<Set<AssetId>> {
  return await selectReferencedAssetIds(db, null);
}

/** The live set restricted to ONE owner's assets — the portability export's reference walk. */
export async function selectOwnedReferencedAssetIds(db: Db, ownerId: UserId): Promise<Set<AssetId>> {
  return await selectReferencedAssetIds(db, ownerId);
}

/** The subset of `candidateIds` still referenced — the targeted check `reapIfOrphan` runs on ids
 *  `character.remove` just orphaned. Absent from the result ⇒ safe to reap. Intersects against the WHOLE live
 *  set, NOT just the FK columns: the no-grace `reapIfOrphan` MUST honor the JSON pins and body refs too, else
 *  an asset referenced ONLY there is silently reaped the moment its FK ref dies — e.g. a character whose
 *  avatar (FK) doubles as a card/chat background (JSON) via CAS dedup. The registry is tiny and this is
 *  maintenance-time, so the full-set scan is the right cost trade for correctness. */
export async function selectReferencedAmong(db: Db, candidateIds: readonly AssetId[]): Promise<Set<AssetId>> {
  // query-local accumulator for GC candidate check. Ends if it outlives the call.
  const referenced = new Set<AssetId>();
  if (candidateIds.length === 0) {
    return referenced;
  }
  const all = await selectAllReferencedAssetIds(db);
  for (const id of candidateIds) {
    if (all.has(id)) {
      referenced.add(id);
    }
  }
  return referenced;
}

/** A carried source still naming `assetId`. Retains on every kind except the known non-asset ones, so a kind
 *  written after the sweep's snapshot that this file does not know keeps the asset rather than freeing it. */
function carriedReference(column: AnySQLiteColumn, at: string, assetId: AssetId): SQL | undefined {
  return and(eq(jsonValue(column, `${at}.assetId`), assetId), notInArray(jsonValue(column, `${at}.kind`), [...NON_ASSET_SOURCE_KINDS]));
}

/** Delete one asset row only while every retaining relation is absent. The liveness predicate lives in the
 * same SQL statement as the destructive write, so a concurrent writer cannot land a reference between an
 * application-side preflight and the delete. The returned verdict owns whether callers may remove CAS bytes. */
export async function deleteAssetRowIfUnreferenced(db: Db, ownerId: UserId, assetId: AssetId): Promise<boolean> {
  // `ref` walks the `ASSET_REFS` registry and the read selects only that table's asset FK column as an `exists` liveness probe for the owner's asset this delete already holds; no row leaves the statement. Ends if a caller-supplied table or column reaches this registry.
  const fkReferences = ASSET_REFS.map((ref) => exists(db.select({ one: sql`1` }).from(ref.table).where(eq(ref.column, assetId))));
  const settingsReference = exists(
    db
      .select({ one: sql`1` })
      .from(userSettings)
      .where(
        or(
          eq(jsonValue(userSettings.config, APPEARANCE_PICK_PATH), assetId),
          eq(jsonValue(userSettings.config, PROFILE_AVATAR_PATH), assetId),
          sql`EXISTS (
            SELECT 1
            FROM json_tree(${userSettings.config}, ${APPEARANCE_LIBRARY_PATH}) AS library
            WHERE library.key = 'assetId' AND library.atom = ${assetId}
          )`,
        ),
      ),
  );
  const cardReference = exists(
    db
      .select({ one: sql`1` })
      .from(characters)
      .where(carriedReference(characters.backgroundOverride, CARD_BACKGROUND_AT, assetId)),
  );
  const chatReference = exists(
    db
      .select({ one: sql`1` })
      .from(chats)
      .where(carriedReference(chats.metadata, CHAT_BACKGROUND_AT, assetId)),
  );
  const needle = `${ASSET_SCHEME}${assetId}`;
  const bodyReference = exists(
    db
      .select({ one: sql`1` })
      .from(messageVariants)
      .innerJoin(messages, eq(messages.id, messageVariants.messageId))
      .innerJoin(chatParticipants, and(eq(chatParticipants.chatId, messages.chatId), eq(chatParticipants.userId, ownerId)))
      .where(and(eq(messages.authorUserId, ownerId), or(...INLINE_BODY_COLUMNS.map((column) => sql`instr(${column}, ${needle}) > 0`)))),
  );
  const anyReference = or(...fkReferences, settingsReference, cardReference, chatReference, bodyReference) ?? sql`0`;
  const deleted = await db
    .delete(assets)
    .where(and(eq(assets.id, assetId), eq(assets.ownerId, ownerId), not(anyReference)))
    .returning({ id: assets.id });
  return deleted.length === 1;
}
