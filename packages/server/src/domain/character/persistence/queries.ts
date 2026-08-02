// domain/character/persistence/queries — all read access for the feature. Every owner read is scoped in
// the WHERE (never a post-filter). `cardOf` narrows JSON columns through the parse-seam: greetings/
// regexScripts are always-a-list (corrupt ⇒ []); depthPrompt/extensions/refinery are nullable (corrupt ⇒ null).

import type { CharacterCard, CharacterListCursor, CharacterListSort } from "@orb/contracts/character";
import { cardDepthPromptSchema, greetingsColumnSchema, refinerySignalsSchema } from "@orb/contracts/character";
import { regexScriptSchema } from "@orb/contracts/regex";
import type { TagView } from "@orb/contracts/tag";
import type { ThemeBackground } from "@orb/contracts/theme";
import { canonicalBackgroundSource } from "@orb/contracts/theme";
import type { Db } from "@orb/db";
import { assets, characterSnapshots, characterStats, characterSummaries, characters, characterTags, tags } from "@orb/db";
import { parseStringArrayColumn } from "@orb/db/kit";
import type { AssetId, CharacterId, CharacterSnapshotId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
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

interface CharacterWithAvatar {
  readonly character: CharacterRow;
  readonly avatar: AssetRow | null;
}

/** A supplied avatar asset must belong to the caller — FK alone proves existence, never ownership. */
export async function ensureAssetOwned(db: Db, ownerId: UserId, assetId: AssetId): Promise<void> {
  const rows = await db.select({ ownerId: assets.ownerId }).from(assets).where(eq(assets.id, assetId)).limit(LIMIT_ONE);
  if (rows[0]?.ownerId !== ownerId) {
    throw new AssetNotFoundError(assetId);
  }
}

/** BG-C ownership belt for a card's carried background (`characters.background_override`): a surviving asset ref
 *  (⇒ `kind:"asset"`) must be the caller's OWN asset — a foreign `assetId` would GC-root someone else's blob
 *  through the JSON live-source (`background_override` is not an FK column, so nothing else gates it). Canonicalizes
 *  first, so a non-asset kind carrying a stray/smuggled `assetId` is a no-op (the ref is emptied on persist). The
 *  `ensureAssetOwned` twin for the carried-background source (the avatar-FK precedent). */
export async function ensureBackgroundOverrideOwned(db: Db, ownerId: UserId, backgroundOverride: ThemeBackground | null | undefined): Promise<void> {
  if (backgroundOverride === null || backgroundOverride === undefined) {
    return;
  }
  const source = canonicalBackgroundSource(backgroundOverride);
  if (source.assetId.length > 0) {
    await ensureAssetOwned(db, ownerId, castId<AssetId>(source.assetId));
  }
}

/** One owned character + its avatar, or undefined when not found / not the caller's. */
export async function loadOwnedCharacterWithAvatar(db: Db, ownerId: UserId, characterId: CharacterId): Promise<CharacterWithAvatar | undefined> {
  const rows = await db
    .select({ character: characters, avatar: assets })
    .from(characters)
    .leftJoin(assets, eq(characters.avatarAssetId, assets.id))
    .where(and(eq(characters.id, characterId), eq(characters.ownerId, ownerId)))
    .limit(LIMIT_ONE);
  return rows[0];
}

interface ListOwnedPageInput {
  readonly ownerId: UserId;
  readonly limit: number;
  readonly sort: CharacterListSort;
  readonly cursor: CharacterListCursor | undefined;
}

interface CharacterListRow extends CharacterWithAvatar {
  readonly elevatorPitch: string | null;
  readonly lastChattedAt: number | null;
  readonly chatCount: number | null;
}

const assertNever = (value: never): never => {
  throw new Error(`unhandled character list sort: ${String(value)}`);
};

// `recent` sinks never-chatted (null lastActivityAt) to the tail via the `is null` leading term, then DESC.
function orderFor(sort: CharacterListSort): SQL[] {
  switch (sort) {
    case "recent":
      return [sql`${characterStats.lastActivityAt} is null`, desc(characterStats.lastActivityAt), desc(characters.createdAt), desc(characters.id)];
    case "alpha":
      return [asc(characters.name), asc(characters.id)];
    case "starred":
      return [desc(characters.starred), asc(characters.name), asc(characters.id)];
    case "newest":
      return [desc(characters.createdAt), desc(characters.id)];
    case "oldest":
      return [asc(characters.createdAt), asc(characters.id)];
    case "mostChats":
      return [sql`${characterStats.chats} is null`, desc(characterStats.chats), desc(characters.id)];
    case "fewestChats":
      // never-chatted null group still sinks to the tail (never "fewest").
      return [sql`${characterStats.chats} is null`, asc(characterStats.chats), asc(characters.id)];
    case "largestCards":
      return [desc(characters.tokenSize), desc(characters.id)];
    case "smallestCards":
      return [asc(characters.tokenSize), asc(characters.id)];
    default:
      return assertNever(sort);
  }
}

// DESC serves both recent's createdAt tiebreak and newest; ASC is oldest's direction-flipped twin.
function createdAtKeysetDesc(createdAt: number, id: CharacterId): SQL | undefined {
  return or(lt(characters.createdAt, createdAt), and(eq(characters.createdAt, createdAt), lt(characters.id, id)));
}
function createdAtKeysetAsc(createdAt: number, id: CharacterId): SQL | undefined {
  return or(gt(characters.createdAt, createdAt), and(eq(characters.createdAt, createdAt), gt(characters.id, id)));
}

// A null-boundary cursor stays within the null tail; a non-null boundary is followed by the whole null
// tail plus the lower/equal-lastActivityAt non-null rows.
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

// Same null-boundary shape as recentKeyset (nulls = no stats row).
function mostChatsKeyset(cursor: Extract<CharacterListCursor, { sort: "mostChats" }>): SQL | undefined {
  if (cursor.chatCount === null) {
    return and(isNull(characterStats.chats), lt(characters.id, cursor.id));
  }
  return or(
    isNull(characterStats.chats),
    lt(characterStats.chats, cursor.chatCount),
    and(eq(characterStats.chats, cursor.chatCount), lt(characters.id, cursor.id)),
  );
}

// Direction-flipped, not a negated copy — the null tail still trails every non-null row.
function fewestChatsKeyset(cursor: Extract<CharacterListCursor, { sort: "fewestChats" }>): SQL | undefined {
  if (cursor.chatCount === null) {
    return and(isNull(characterStats.chats), gt(characters.id, cursor.id));
  }
  return or(
    isNull(characterStats.chats),
    gt(characterStats.chats, cursor.chatCount),
    and(eq(characterStats.chats, cursor.chatCount), gt(characters.id, cursor.id)),
  );
}

function tokenSizeKeysetDesc(tokenSize: number, id: CharacterId): SQL | undefined {
  return or(lt(characters.tokenSize, tokenSize), and(eq(characters.tokenSize, tokenSize), lt(characters.id, id)));
}
function tokenSizeKeysetAsc(tokenSize: number, id: CharacterId): SQL | undefined {
  return or(gt(characters.tokenSize, tokenSize), and(eq(characters.tokenSize, tokenSize), gt(characters.id, id)));
}

function alphaKeyset(name: string, id: CharacterId): SQL | undefined {
  return or(gt(characters.name, name), and(eq(characters.name, name), gt(characters.id, id)));
}

// if-chained (not switch) — biome's noUnnecessaryConditions can't track discriminant narrowing through
// a Zod-inferred discriminated union property switch the way the typed eslint rule can, and misflags
// every case as unreachable. The final arm's comparison is a true tautology once narrowed (all other
// members excluded); suppressed there only, so assertNever still catches a future unhandled sort.
function keysetFor(cursor: CharacterListCursor): SQL | undefined {
  if (cursor.sort === "recent") {
    return recentKeyset(cursor);
  }
  if (cursor.sort === "alpha") {
    return alphaKeyset(cursor.name, cursor.id);
  }
  if (cursor.sort === "starred") {
    return or(lt(characters.starred, cursor.starred), and(eq(characters.starred, cursor.starred), alphaKeyset(cursor.name, cursor.id)));
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
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- tautology after exhaustive narrowing; kept so assertNever still guards a future unhandled member.
  if (cursor.sort === "smallestCards") {
    return tokenSizeKeysetAsc(cursor.tokenSize, cursor.id);
  }
  return assertNever(cursor);
}

/** Owner's non-synthetic characters, sorted + keyset-paged. No offset (skips/dupes under concurrent writes). */
export async function listOwnedCharactersWithAvatar(db: Db, input: ListOwnedPageInput): Promise<CharacterListRow[]> {
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
export async function loadOwnedCharacterRow(db: Db, ownerId: UserId, characterId: CharacterId): Promise<CharacterRow | undefined> {
  const rows = await db
    .select()
    .from(characters)
    .where(and(eq(characters.id, characterId), eq(characters.ownerId, ownerId)))
    .limit(LIMIT_ONE);
  return rows[0];
}

/** No owner scope — the embeddings indexer is a trusted system consumer; not a user-facing surface. */
export async function loadCharacterRowById(db: Db, characterId: CharacterId): Promise<CharacterRow | undefined> {
  const rows = await db.select().from(characters).where(eq(characters.id, characterId)).limit(LIMIT_ONE);
  return rows[0];
}

/** No owner scope — the embeddings bulk pass sweeps the whole corpus; synthetic buckets excluded at source. */
export async function listEmbeddableCharacterIdRows(db: Db, ownerId?: UserId | null): Promise<CharacterId[]> {
  // ownerId scopes the sweep to one owner; omitted/null = every owner (the bulk dev sweep).
  const scope =
    ownerId === undefined || ownerId === null ? eq(characters.synthetic, false) : and(eq(characters.synthetic, false), eq(characters.ownerId, ownerId));
  const rows = await db.select({ id: characters.id }).from(characters).where(scope);
  return rows.map((r) => r.id);
}

/** Find a character by (ownerId, handle) — relies on the per-owner handle unique index. */
export async function findByOwnerHandle(db: Db, ownerId: UserId, handle: string): Promise<CharacterRow | undefined> {
  const rows = await db
    .select()
    .from(characters)
    .where(and(eq(characters.ownerId, ownerId), eq(characters.handle, handle)))
    .limit(LIMIT_ONE);
  return rows[0];
}

/** Re-import dedup oracle: the id of the owner's character already carrying importHash, or undefined. */
export async function findByOwnerImportHash(db: Db, ownerId: UserId, importHash: string): Promise<CharacterId | undefined> {
  const rows = await db
    .select({ id: characters.id })
    .from(characters)
    .where(and(eq(characters.ownerId, ownerId), eq(characters.importHash, importHash)))
    .limit(LIMIT_ONE);
  return rows[0]?.id;
}

/** Batched provenance oracle: the owner's characters whose `importedFrom` is any of `values` (one indexed
 *  `IN` read). Empty `values` short-circuits to no rows (never a bare `IN ()`). Owner-scoped in the WHERE, so
 *  a different owner's same-provenance card is never returned. */
export async function findByOwnerImportedFrom(
  db: Db,
  ownerId: UserId,
  values: readonly string[],
): Promise<{ importedFrom: string; characterId: CharacterId }[]> {
  if (values.length === 0) {
    return [];
  }
  const rows = await db
    .select({ importedFrom: characters.importedFrom, id: characters.id })
    .from(characters)
    .where(and(eq(characters.ownerId, ownerId), inArray(characters.importedFrom, [...values])));
  const out: { importedFrom: string; characterId: CharacterId }[] = [];
  for (const row of rows) {
    if (row.importedFrom !== null) {
      out.push({ importedFrom: row.importedFrom, characterId: row.id });
    }
  }
  return out;
}

/** Every handle the owner already uses — the duplicate verb derives a free `<handle>-copy[-n]` from this. */
export async function listOwnerHandles(db: Db, ownerId: UserId): Promise<string[]> {
  const rows = await db.select({ handle: characters.handle }).from(characters).where(eq(characters.ownerId, ownerId));
  return rows.map((r) => r.handle);
}

/** Browse a character's snapshot history, newest first (the opaque blob is read only on restore). */
export async function listSnapshotSummaries(db: Db, characterId: CharacterId): Promise<SnapshotSummary[]> {
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
export async function loadSnapshotContent(db: Db, characterId: CharacterId, snapshotId: CharacterSnapshotId): Promise<CharacterCard | undefined> {
  const rows = await db
    .select({ content: characterSnapshots.content })
    .from(characterSnapshots)
    .where(and(eq(characterSnapshots.id, snapshotId), eq(characterSnapshots.characterId, characterId)))
    .limit(LIMIT_ONE);
  const row = rows[0];
  return row === undefined ? undefined : cardOf(row.content);
}

/** Live card for a row or a stored snapshot blob — JSON columns narrowed through the parse-seam. */
export function cardOf(src: CharacterCard): CharacterCard {
  return {
    name: src.name,
    description: src.description,
    personality: src.personality,
    scenario: src.scenario,
    greetings: greetingsColumnSchema.parse(src.greetings),
    exampleMessages: src.exampleMessages,
    systemPrompt: src.systemPrompt,
    postHistoryInstructions: src.postHistoryInstructions,
    depthPrompt: depthPromptParser.parse(src.depthPrompt),
    creatorNotes: src.creatorNotes,
    creator: src.creator,
    cardVersion: src.cardVersion,
    nickname: src.nickname,
    source: parseStringArrayColumn(src.source),
    creationDate: src.creationDate,
    modificationDate: src.modificationDate,
    regexScripts: regexScriptsParser.parse(src.regexScripts),
    extensions: extensionsParser.parse(src.extensions),
    residualData: residualDataParser.parse(src.residualData),
    avatarAssetId: src.avatarAssetId,
    refinery: refineryParser.parse(src.refinery),
  };
}

// Read-only join over tag's schema via @orb/db, never an import of domain/tag. Pending rows excluded.
export async function canonicalTagsFor(db: Db, characterIds: readonly CharacterId[]): Promise<Map<CharacterId, TagView[]>> {
  // @orb-gate-ignore persistence-no-in-memory-state: query-local lookup map keyed by characterId
  const map = new Map<CharacterId, TagView[]>();
  if (characterIds.length === 0) {
    return map;
  }
  const rows = await db
    .select({ characterId: characterTags.characterId, tag: tags })
    .from(characterTags)
    .innerJoin(tags, eq(characterTags.tagId, tags.id))
    .where(and(inArray(characterTags.characterId, characterIds), eq(characterTags.status, "accepted")))
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

/** One character's accepted canonical tags. */
export async function canonicalTagsOf(db: Db, characterId: CharacterId): Promise<readonly TagView[]> {
  return (await canonicalTagsFor(db, [characterId])).get(characterId) ?? [];
}

/** Row + joined avatar + accepted tags → the full owner detail view. */
export function detailOf({ character: row, avatar }: CharacterWithAvatar, canonicalTags: readonly TagView[]): CharacterDetail {
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
    backgroundOverride: row.backgroundOverride,
    importedFrom: row.importedFrom,
    importHash: row.importHash,
    contentHash: row.contentHash,
    createdAt: row.createdAt,
    avatarHash: avatar?.hash ?? null,
    tags: canonicalTags,
  };
}

/** Row + joined avatar + denorms + accepted tags → the light library-list summary. */
export function summaryOf({ character: row, avatar, elevatorPitch, lastChattedAt }: CharacterListRow, canonicalTags: readonly TagView[]): CharacterSummary {
  return {
    id: row.id,
    handle: row.handle,
    name: row.name,
    starred: row.starred,
    archived: row.archived,
    forbidExternalMedia: row.forbidExternalMedia,
    trustHtml: row.trustHtml,
    themeOverride: row.themeOverride,
    backgroundOverride: row.backgroundOverride,
    avatarAssetId: row.avatarAssetId,
    avatarHash: avatar?.hash ?? null,
    contentHash: row.contentHash,
    createdAt: row.createdAt,
    tokenSize: row.tokenSize,
    tags: canonicalTags,
    elevatorPitch,
    lastChattedAt,
  };
}
