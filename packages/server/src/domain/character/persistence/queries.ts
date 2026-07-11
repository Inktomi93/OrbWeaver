// domain/character/persistence/queries — ALL read access for the feature (queries only). Every owner read
// is scoped in the WHERE (never a post-filter), so a non-owner can never receive another user's row;
// `ownerId` is `principal.userId` (§7.1) — this layer NEVER reads the `users` table (`no-direct-users-read`).
//
// `cardOf` narrows the row's JSON columns through the parse-seam (§8.4 parse-at-the-DB-seam): drizzle hands
// back whatever `JSON.parse` produced typed as the column type WITHOUT validating it, so a corrupt blob
// degrades to a safe default here instead of poisoning a view. The null-vs-`[]` asymmetry is load-bearing:
// `greetings`/`regexScripts` are ALWAYS-A-LIST columns (corrupt ⇒ `[]`); `depthPrompt`/`extensions`/
// `refinery` are nullable (corrupt ⇒ `null`).
//
// The view/card shapes are file-LOCAL where they're intermediate (`CharacterWithAvatar`): the
// `types-in-contract` gate forbids an EXPORTED type outside `contract/`, and the join bundle is only ever
// produced + consumed within `persistence/`.

import type {
  CharacterCard,
  CharacterListCursor,
  CharacterListSort,
} from "@orb/contracts/character";
import { cardDepthPromptSchema, refinerySignalsSchema } from "@orb/contracts/character";
import { regexScriptSchema } from "@orb/contracts/regex";
import type { TagView } from "@orb/contracts/tag";
import type { Db } from "@orb/db";
import {
  assets,
  characterSnapshots,
  characterStats,
  characterSummaries,
  characters,
  characterTags,
  parseStringArray,
  tags,
} from "@orb/db";
import type { AssetId, CharacterId, CharacterSnapshotId, UserId } from "@orb/kit/ids";
import type { SQL } from "drizzle-orm";
import { and, asc, desc, eq, gt, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import { AssetNotFoundError } from "../contract/errors";
import type { SnapshotSummary } from "../contract/results";
import type { CharacterDetail, CharacterSummary } from "../contract/views";

const LIMIT_ONE = 1;

type CharacterRow = typeof characters.$inferSelect;
type AssetRow = typeof assets.$inferSelect;

const regexScriptsParser = z.array(regexScriptSchema).catch([]);
const depthPromptParser = cardDepthPromptSchema.nullable().catch(null);
const refineryParser = refinerySignalsSchema.nullable().catch(null);
const extensionsParser = z.record(z.string(), z.unknown()).nullable().catch(null);
const residualDataParser = z.record(z.string(), z.unknown()).nullable().catch(null);

// Row + the joined avatar asset (null when none). The hash lives on `assets` (the CAS key); `characters`
// carries only `avatarAssetId`. File-local: the verbs chain `load…` → `detailOf` without naming it.
interface CharacterWithAvatar {
  readonly character: CharacterRow;
  readonly avatar: AssetRow | null;
}

/** Gate: a supplied avatar asset must belong to the caller (D21 cross-root belt — `characters` and
 *  `assets` are BOTH owner-stamped producers, so the FK alone proves existence, never ownership; an
 *  unchecked link would leak a foreign asset's CAS hash through the detail JOIN). A foreign/absent
 *  asset collapses to {@link AssetNotFoundError} (no existence leak). */
export async function ensureAssetOwned(db: Db, ownerId: UserId, assetId: AssetId): Promise<void> {
  const rows = await db
    .select({ ownerId: assets.ownerId })
    .from(assets)
    .where(eq(assets.id, assetId))
    .limit(LIMIT_ONE);
  if (rows[0]?.ownerId !== ownerId) {
    throw new AssetNotFoundError(assetId);
  }
}

/** One owned character + its avatar, or undefined when not found / not the caller's. */
export async function loadOwnedCharacterWithAvatar(
  db: Db,
  ownerId: UserId,
  characterId: CharacterId,
): Promise<CharacterWithAvatar | undefined> {
  const rows = await db
    .select({ character: characters, avatar: assets })
    .from(characters)
    .leftJoin(assets, eq(characters.avatarAssetId, assets.id))
    .where(and(eq(characters.id, characterId), eq(characters.ownerId, ownerId)))
    .limit(LIMIT_ONE);
  return rows[0];
}

/** Load a character + avatar ignoring ownership (for membership-gated chat roster views). */
export async function loadCharacterWithAvatarById(
  db: Db,
  characterId: CharacterId,
): Promise<CharacterWithAvatar | undefined> {
  const rows = await db
    .select({ character: characters, avatar: assets })
    .from(characters)
    .leftJoin(assets, eq(characters.avatarAssetId, assets.id))
    .where(eq(characters.id, characterId))
    .limit(LIMIT_ONE);
  return rows[0];
}

// The library keyset page args (file-local — types-in-contract forbids an exported shape here; the
// `list` verb owns the public `ListCharactersParams`/`CharacterListCursor` contract shapes). `cursor` is the
// FULL sort-discriminated wire cursor — the verb has already checked its `sort` matches `input.sort`.
interface ListOwnedPageInput {
  readonly ownerId: UserId;
  readonly limit: number;
  readonly sort: CharacterListSort;
  readonly cursor: CharacterListCursor | undefined;
}

// The list-page row bundle: the character + avatar join PLUS the two FIX-#2 denorm LEFT JOINs
// (`elevatorPitch` from `character_summaries`; `lastChattedAt` from `character_stats.lastActivityAt`). Both
// source tables are keyed uniquely by characterId (PK / unique index) → no row fan-out. File-local (the
// list verb consumes it via `summaryOf`; `types-in-contract` forbids exporting it).
interface CharacterListRow extends CharacterWithAvatar {
  readonly elevatorPitch: string | null;
  readonly lastChattedAt: number | null;
  // `character_stats.chats` via the same LEFT JOIN — null when the card has no stats row (never chatted). The
  // `most/fewestChats` sorts derive the next cursor's `chatCount` from it; the summary view does not carry it.
  readonly chatCount: number | null;
}

const assertNever = (value: never): never => {
  throw new Error(`unhandled character list sort: ${String(value)}`);
};

// The per-sort ORDER BY (§4.5). `recent` sinks never-chatted (null `lastActivityAt`) to the tail via the
// `… is null` leading term (the `domain/tag` NULLS-LAST precedent), then DESC within each group; `alpha`/
// `starred` order by `name` under the DB's default (binary) collation — the keyset comparisons below use the
// SAME collation so paging is consistent (`name` is not unique → `id` tiebreaks).
function orderFor(sort: CharacterListSort): SQL[] {
  switch (sort) {
    case "recent":
      return [
        sql`${characterStats.lastActivityAt} is null`,
        desc(characterStats.lastActivityAt),
        desc(characters.createdAt),
        desc(characters.id),
      ];
    case "alpha":
      return [asc(characters.name), asc(characters.id)];
    case "starred":
      return [desc(characters.starred), asc(characters.name), asc(characters.id)];
    case "newest":
      return [desc(characters.createdAt), desc(characters.id)];
    case "oldest":
      return [asc(characters.createdAt), asc(characters.id)];
    case "mostChats":
      // `chats` is join-nullable (no stats row = never chatted) → the leading `is null` term sinks that group
      // to the tail (NULLS-LAST), same construction as `recent`; then chat-count DESC, `id` DESC tiebreak.
      return [
        sql`${characterStats.chats} is null`,
        desc(characterStats.chats),
        desc(characters.id),
      ];
    case "fewestChats":
      // ASC twin: fewest chats first, but the never-chatted null group STILL sinks to the tail (never "fewest").
      return [sql`${characterStats.chats} is null`, asc(characterStats.chats), asc(characters.id)];
    case "largestCards":
      // `token_size` is notNull (default 0) → NO null handling; heftiest first, `id` DESC tiebreak.
      return [desc(characters.tokenSize), desc(characters.id)];
    case "smallestCards":
      return [asc(characters.tokenSize), asc(characters.id)];
    default:
      return assertNever(sort);
  }
}

// The `(createdAt, id)` keyset — rows strictly after the boundary. DESC form serves BOTH `recent`'s
// createdAt-DESC tiebreak AND the `newest` primary sort; the ASC form is `oldest`'s direction-flipped twin
// (an own predicate, never a negated copy). `createdAt` is not unique → `id` is the deterministic tiebreak.
function createdAtKeysetDesc(createdAt: number, id: CharacterId): SQL | undefined {
  return or(
    lt(characters.createdAt, createdAt),
    and(eq(characters.createdAt, createdAt), lt(characters.id, id)),
  );
}
function createdAtKeysetAsc(createdAt: number, id: CharacterId): SQL | undefined {
  return or(
    gt(characters.createdAt, createdAt),
    and(eq(characters.createdAt, createdAt), gt(characters.id, id)),
  );
}

// The keyset predicate for the `recent` order `(lastActivityAt DESC NULLS-LAST, createdAt DESC, id DESC)`:
// rows strictly AFTER the boundary. Null-boundary handling is explicit — when the boundary row is itself in
// the null tail (`lastChattedAt === null`), ONLY further null rows remain (every non-null row already ranked
// above it); otherwise the whole null tail plus the lower/equal-`lastActivityAt` non-null rows follow.
function recentKeyset(cursor: Extract<CharacterListCursor, { sort: "recent" }>): SQL | undefined {
  const olderTiebreak = createdAtKeysetDesc(cursor.createdAt, cursor.id);
  if (cursor.lastChattedAt === null) {
    return and(isNull(characterStats.lastActivityAt), olderTiebreak);
  }
  return or(
    isNull(characterStats.lastActivityAt),
    lt(characterStats.lastActivityAt, cursor.lastChattedAt),
    and(eq(characterStats.lastActivityAt, cursor.lastChattedAt), olderTiebreak),
  );
}

// The keyset predicate for the `mostChats` order `(chats DESC NULLS-LAST, id DESC)` — rows strictly AFTER the
// boundary. Same null-boundary shape as `recent` (nulls = no stats row): a null-boundary cursor stays within
// the null tail (`id` DESC); a non-null boundary is followed by the whole null tail plus the lower/equal-count
// non-null rows. `chats` is not unique → `id` DESC tiebreaks.
function mostChatsKeyset(
  cursor: Extract<CharacterListCursor, { sort: "mostChats" }>,
): SQL | undefined {
  if (cursor.chatCount === null) {
    return and(isNull(characterStats.chats), lt(characters.id, cursor.id));
  }
  return or(
    isNull(characterStats.chats),
    lt(characterStats.chats, cursor.chatCount),
    and(eq(characterStats.chats, cursor.chatCount), lt(characters.id, cursor.id)),
  );
}

// The `fewestChats` twin `(chats ASC NULLS-LAST, id ASC)` — direction-flipped, NOT a negated copy. The null
// tail STILL trails every non-null row (never-chatted is never "fewest"), so a non-null boundary is followed by
// higher-count non-null rows, the equal-count `id`-ASC remainder, AND the whole null tail; a null boundary
// stays within the tail (`id` ASC).
function fewestChatsKeyset(
  cursor: Extract<CharacterListCursor, { sort: "fewestChats" }>,
): SQL | undefined {
  if (cursor.chatCount === null) {
    return and(isNull(characterStats.chats), gt(characters.id, cursor.id));
  }
  return or(
    isNull(characterStats.chats),
    gt(characterStats.chats, cursor.chatCount),
    and(eq(characterStats.chats, cursor.chatCount), gt(characters.id, cursor.id)),
  );
}

// The `(token_size, id)` keyset — rows strictly after the boundary. `token_size` is notNull (no null tail);
// DESC serves `largestCards`, the ASC twin serves `smallestCards` (direction-flipped, not a negated copy).
// `token_size` is not unique → `id` is the deterministic tiebreak.
function tokenSizeKeysetDesc(tokenSize: number, id: CharacterId): SQL | undefined {
  return or(
    lt(characters.tokenSize, tokenSize),
    and(eq(characters.tokenSize, tokenSize), lt(characters.id, id)),
  );
}
function tokenSizeKeysetAsc(tokenSize: number, id: CharacterId): SQL | undefined {
  return or(
    gt(characters.tokenSize, tokenSize),
    and(eq(characters.tokenSize, tokenSize), gt(characters.id, id)),
  );
}

// The keyset predicate for the `alpha` order `(name ASC, id ASC)` — rows strictly after the boundary.
function alphaKeyset(name: string, id: CharacterId): SQL | undefined {
  return or(gt(characters.name, name), and(eq(characters.name, name), gt(characters.id, id)));
}

// The keyset predicate per sort. Built off the cursor's OWN discriminant (== `input.sort`, verb-checked).
// `if`-chained (not `switch`) so the exhaustiveness `assertNever` guard holds — the `latency.ts` precedent
// (a `z.infer` discriminated union the switch-reachability lint mis-reads, but the `if`-form doesn't).
function keysetFor(cursor: CharacterListCursor): SQL | undefined {
  if (cursor.sort === "recent") {
    return recentKeyset(cursor);
  }
  if (cursor.sort === "alpha") {
    return alphaKeyset(cursor.name, cursor.id);
  }
  if (cursor.sort === "starred") {
    // starred-first: a row follows if it's in a LOWER starred group (false after true) OR the same group and
    // after in the alpha keyset. `starred < :starred` is only satisfiable when the boundary is starred.
    return or(
      lt(characters.starred, cursor.starred),
      and(eq(characters.starred, cursor.starred), alphaKeyset(cursor.name, cursor.id)),
    );
  }
  if (cursor.sort === "newest") {
    return createdAtKeysetDesc(cursor.createdAt, cursor.id);
  }
  if (cursor.sort === "oldest") {
    return createdAtKeysetAsc(cursor.createdAt, cursor.id);
  }
  if (cursor.sort === "mostChats") {
    return mostChatsKeyset(cursor);
  }
  if (cursor.sort === "fewestChats") {
    return fewestChatsKeyset(cursor);
  }
  if (cursor.sort === "largestCards") {
    return tokenSizeKeysetDesc(cursor.tokenSize, cursor.id);
  }
  if (cursor.sort === "smallestCards") {
    return tokenSizeKeysetAsc(cursor.tokenSize, cursor.id);
  }
  return assertNever(cursor);
}

/** The owner's NON-synthetic characters + avatars + the FIX-#2 denorms, sorted per `input.sort` and
 *  keyset-paged (synthetic group buckets excluded — every user-facing query filters `synthetic = false`).
 *  No offset (which skips/dupes rows under concurrent writes). Fetches exactly `limit` rows; the caller (the
 *  `list` verb) derives `nextCursor` from whether a full page came back. */
export async function listOwnedCharactersWithAvatar(
  db: Db,
  input: ListOwnedPageInput,
): Promise<CharacterListRow[]> {
  const scope = and(eq(characters.ownerId, input.ownerId), eq(characters.synthetic, false));
  const keyset = input.cursor === undefined ? undefined : keysetFor(input.cursor);
  const rows = await db
    .select({
      character: characters,
      avatar: assets,
      elevatorPitch: characterSummaries.elevatorPitch,
      lastChattedAt: characterStats.lastActivityAt,
      chatCount: characterStats.chats,
    })
    .from(characters)
    .leftJoin(assets, eq(characters.avatarAssetId, assets.id))
    .leftJoin(characterSummaries, eq(characterSummaries.characterId, characters.id))
    .leftJoin(characterStats, eq(characterStats.characterId, characters.id))
    .where(keyset === undefined ? scope : and(scope, keyset))
    .orderBy(...orderFor(input.sort))
    .limit(input.limit);
  return rows;
}

/** One owned character row (no avatar join) — the `getCard`/remove fast path. Undefined when not owned. */
export async function loadOwnedCharacterRow(
  db: Db,
  ownerId: UserId,
  characterId: CharacterId,
): Promise<CharacterRow | undefined> {
  const rows = await db
    .select()
    .from(characters)
    .where(and(eq(characters.id, characterId), eq(characters.ownerId, ownerId)))
    .limit(LIMIT_ONE);
  return rows[0];
}

/** One character row by id ALONE — NO owner scope (D20). The embeddings indexer is a trusted SYSTEM consumer:
 *  vectors carry no `ownerId`, so the card-text re-read happens un-principal, keyed only by the branded id the
 *  `character.updated` event carried. This is NOT a user-facing surface — it is never routed through `can()`/
 *  owner-gating; the only caller is `loadCardText` (the indexer's canon re-reader). Undefined when absent. */
export async function loadCharacterRowById(
  db: Db,
  characterId: CharacterId,
): Promise<CharacterRow | undefined> {
  const rows = await db
    .select()
    .from(characters)
    .where(eq(characters.id, characterId))
    .limit(LIMIT_ONE);
  return rows[0];
}

/** Every NON-synthetic character id, ALL owners — NO owner scope (D20). The embeddings BULK embed pass
 *  (PD-53) is a trusted SYSTEM sweep over the whole corpus: vectors carry no `ownerId`, so the enumeration
 *  happens un-principal, exactly like `loadCharacterRowById` above. Synthetic group buckets are excluded at
 *  the source (they have no card text and are never embedded). NOT a user-facing
 *  surface; the only caller is `listEmbeddableCharacterIds` (the bulk pass's enumeration read). */
export async function listEmbeddableCharacterIdRows(
  db: Db,
  ownerId?: UserId | null,
): Promise<CharacterId[]> {
  // `ownerId` scopes the sweep to ONE owner (the workloads SINGULAR mode — embed MY corpus); omitted/null =
  // every owner (the BULK dev sweep, D20 un-principal). Owner-scoping stays in the WHERE, never a post-filter.
  const scope =
    ownerId === undefined || ownerId === null
      ? eq(characters.synthetic, false)
      : and(eq(characters.synthetic, false), eq(characters.ownerId, ownerId));
  const rows = await db.select({ id: characters.id }).from(characters).where(scope);
  return rows.map((r) => r.id);
}

/** Find a character by (ownerId, handle) — the synthetic-group find-or-mint + the duplicate handle dedup
 *  rely on the per-owner handle unique index. Undefined when absent. */
export async function findByOwnerHandle(
  db: Db,
  ownerId: UserId,
  handle: string,
): Promise<CharacterRow | undefined> {
  const rows = await db
    .select()
    .from(characters)
    .where(and(eq(characters.ownerId, ownerId), eq(characters.handle, handle)))
    .limit(LIMIT_ONE);
  return rows[0];
}

/** The id of the owner's character that already carries `importHash` (the re-import dedup oracle), or
 *  undefined when none. Owner-scoped in the WHERE (a different owner's same-hash card is never returned).
 *  Selects only the id — the dedup caller wants the identity, not the row. */
export async function findByOwnerImportHash(
  db: Db,
  ownerId: UserId,
  importHash: string,
): Promise<CharacterId | undefined> {
  const rows = await db
    .select({ id: characters.id })
    .from(characters)
    .where(and(eq(characters.ownerId, ownerId), eq(characters.importHash, importHash)))
    .limit(LIMIT_ONE);
  return rows[0]?.id;
}

/** Every handle the owner already uses — the duplicate verb derives a free `<handle>-copy[-n]` from this
 *  (small per-owner set; computed in JS to avoid LIKE-wildcard handling on user-controlled handles). */
export async function listOwnerHandles(db: Db, ownerId: UserId): Promise<string[]> {
  const rows = await db
    .select({ handle: characters.handle })
    .from(characters)
    .where(eq(characters.ownerId, ownerId));
  return rows.map((r) => r.handle);
}

/** Browse a character's snapshot history, newest first (the opaque blob is read only on restore). */
export async function listSnapshotSummaries(
  db: Db,
  characterId: CharacterId,
): Promise<SnapshotSummary[]> {
  const rows = await db
    .select({
      id: characterSnapshots.id,
      label: characterSnapshots.label,
      createdAt: characterSnapshots.createdAt,
    })
    .from(characterSnapshots)
    .where(eq(characterSnapshots.characterId, characterId))
    .orderBy(desc(characterSnapshots.createdAt));
  return rows;
}

/** Load one snapshot's stored card blob, scoped to its character. Undefined when absent / wrong character. */
export async function loadSnapshotContent(
  db: Db,
  characterId: CharacterId,
  snapshotId: CharacterSnapshotId,
): Promise<CharacterCard | undefined> {
  const rows = await db
    .select({ content: characterSnapshots.content })
    .from(characterSnapshots)
    .where(
      and(eq(characterSnapshots.id, snapshotId), eq(characterSnapshots.characterId, characterId)),
    )
    .limit(LIMIT_ONE);
  const row = rows[0];
  return row === undefined ? undefined : cardOf(row.content);
}

/** The live card for a row OR a stored snapshot blob (the card IS the row) — JSON columns narrowed
 *  through the parse-seam (corrupt → safe defaults). Accepts either source: a `CharacterRow` has every
 *  card field (structural superset), so verbs pass the row and `loadSnapshotContent` passes the blob. */
export function cardOf(src: CharacterCard): CharacterCard {
  return {
    name: src.name,
    description: src.description,
    personality: src.personality,
    scenario: src.scenario,
    greetings: parseStringArray(src.greetings),
    exampleMessages: src.exampleMessages,
    systemPrompt: src.systemPrompt,
    postHistoryInstructions: src.postHistoryInstructions,
    depthPrompt: depthPromptParser.parse(src.depthPrompt),
    creatorNotes: src.creatorNotes,
    creator: src.creator,
    cardVersion: src.cardVersion,
    regexScripts: regexScriptsParser.parse(src.regexScripts),
    extensions: extensionsParser.parse(src.extensions),
    residualData: residualDataParser.parse(src.residualData),
    avatarAssetId: src.avatarAssetId,
    refinery: refineryParser.parse(src.refinery),
  };
}

// ── canonical tags (a deliberate db-layer junction consumer read) ───────────────────────────────────────
// The character views carry the ACCEPTED `character_tags ⋈ tags` labels (the library tag filter + editor
// chips). This is the sanctioned "pool.ts pattern" (a db-layer consumer, not a violation to route): a
// read-only join over the junction-owner's schema via `@orb/db`, NEVER an import of `domain/tag` (the
// front door exposes no per-entity read; routing through it would be a sideways runtime dep). Pending
// (staged-suggestion) rows are excluded — the views show canon, the suggestion UI reads tag's own surface.
// The row→TagView projection is the same column pick tag's `toTagView` makes (the columns ARE the wire
// shape); ordering mirrors tag's list contract (sortOrder ASC nulls-last, then name).

/** The accepted canonical tags per character — `Map` keyed by character id (absent = no tags). */
export async function canonicalTagsFor(
  db: Db,
  characterIds: readonly CharacterId[],
): Promise<Map<CharacterId, TagView[]>> {
  const map = new Map<CharacterId, TagView[]>();
  if (characterIds.length === 0) {
    return map;
  }
  const rows = await db
    .select({ characterId: characterTags.characterId, tag: tags })
    .from(characterTags)
    .innerJoin(tags, eq(characterTags.tagId, tags.id))
    .where(
      and(inArray(characterTags.characterId, characterIds), eq(characterTags.status, "accepted")),
    )
    .orderBy(sql`${tags.sortOrder} is null`, tags.sortOrder, tags.name);
  for (const { characterId, tag } of rows) {
    const view: TagView = {
      id: tag.id,
      name: tag.name,
      color: tag.color,
      color2: tag.color2,
      source: tag.source,
      folderType: tag.folderType,
      sortOrder: tag.sortOrder,
      isHiddenOnCard: tag.isHiddenOnCard,
    };
    const bucket = map.get(characterId);
    if (bucket === undefined) {
      map.set(characterId, [view]);
    } else {
      bucket.push(view);
    }
  }
  return map;
}

/** One character's accepted canonical tags (the single-detail convenience over {@link canonicalTagsFor}). */
export async function canonicalTagsOf(
  db: Db,
  characterId: CharacterId,
): Promise<readonly TagView[]> {
  return (await canonicalTagsFor(db, [characterId])).get(characterId) ?? [];
}

/** Row + joined avatar + accepted tags → the full owner detail view (the live card + identity/provenance +
 *  avatar hash + the canonical tag chips). */
export function detailOf(
  { character: row, avatar }: CharacterWithAvatar,
  canonicalTags: readonly TagView[],
): CharacterDetail {
  return {
    ...cardOf(row),
    id: row.id,
    handle: row.handle,
    starred: row.starred,
    archived: row.archived,
    synthetic: row.synthetic,
    forbidExternalMedia: row.forbidExternalMedia,
    trustHtml: row.trustHtml,
    themeOverride: row.themeOverride,
    importedFrom: row.importedFrom,
    importHash: row.importHash,
    contentHash: row.contentHash,
    createdAt: row.createdAt,
    avatarHash: avatar?.hash ?? null,
    tags: canonicalTags,
  };
}

/** Row + joined avatar + the FIX-#2 denorms + accepted tags → the light library-list summary (with the
 *  advisory token estimate). `elevatorPitch`/`lastChattedAt` ride the {@link CharacterListRow} bundle (the
 *  two LEFT JOINs), so this projection is only meaningful over a `listOwnedCharactersWithAvatar` row. */
export function summaryOf(
  { character: row, avatar, elevatorPitch, lastChattedAt }: CharacterListRow,
  canonicalTags: readonly TagView[],
): CharacterSummary {
  return {
    id: row.id,
    handle: row.handle,
    name: row.name,
    starred: row.starred,
    archived: row.archived,
    forbidExternalMedia: row.forbidExternalMedia,
    trustHtml: row.trustHtml,
    themeOverride: row.themeOverride,
    avatarAssetId: row.avatarAssetId,
    avatarHash: avatar?.hash ?? null,
    contentHash: row.contentHash,
    createdAt: row.createdAt,
    // Reads the DENORM column (the write path stamps it via `cardTokenSize`; one home). NOT re-estimated
    // per page — the `largestCards`/`smallestCards` keyset sorts on this same column.
    tokenSize: row.tokenSize,
    tags: canonicalTags,
    elevatorPitch,
    lastChattedAt,
  };
}
