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

import type { CharacterCard } from "@orb/contracts/character";
import { cardDepthPromptSchema, refinerySignalsSchema } from "@orb/contracts/character";
import { regexScriptSchema } from "@orb/contracts/regex";
import type { TagView } from "@orb/contracts/tag";
import type { Db } from "@orb/db";
import {
  assets,
  characterSnapshots,
  characters,
  characterTags,
  parseStringArray,
  tags,
} from "@orb/db";
import type { CharacterId, CharacterSnapshotId, UserId } from "@orb/kit/ids";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { SnapshotSummary } from "../contract/results";
import type { CharacterDetail, CharacterSummary } from "../contract/views";
import { cardTokenSize } from "../substrate/card-tokens";

const LIMIT_ONE = 1;

type CharacterRow = typeof characters.$inferSelect;
type AssetRow = typeof assets.$inferSelect;

const regexScriptsParser = z.array(regexScriptSchema).catch([]);
const depthPromptParser = cardDepthPromptSchema.nullable().catch(null);
const refineryParser = refinerySignalsSchema.nullable().catch(null);
const extensionsParser = z.record(z.string(), z.unknown()).nullable().catch(null);

// Row + the joined avatar asset (null when none). The hash lives on `assets` (the CAS key); `characters`
// carries only `avatarAssetId`. File-local: the verbs chain `load…` → `detailOf` without naming it.
interface CharacterWithAvatar {
  readonly character: CharacterRow;
  readonly avatar: AssetRow | null;
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

/** The owner's NON-synthetic characters + avatars, newest first (synthetic group buckets excluded —
 *  every user-facing query filters `synthetic = false`). */
export async function listOwnedCharactersWithAvatar(
  db: Db,
  ownerId: UserId,
): Promise<CharacterWithAvatar[]> {
  const rows = await db
    .select({ character: characters, avatar: assets })
    .from(characters)
    .leftJoin(assets, eq(characters.avatarAssetId, assets.id))
    .where(and(eq(characters.ownerId, ownerId), eq(characters.synthetic, false)))
    .orderBy(desc(characters.createdAt));
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
export async function listEmbeddableCharacterIdRows(db: Db): Promise<CharacterId[]> {
  const rows = await db
    .select({ id: characters.id })
    .from(characters)
    .where(eq(characters.synthetic, false));
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
    importedFrom: row.importedFrom,
    importHash: row.importHash,
    contentHash: row.contentHash,
    createdAt: row.createdAt,
    avatarHash: avatar?.hash ?? null,
    tags: canonicalTags,
  };
}

/** Row + joined avatar + accepted tags → the light library-list summary (with the advisory token estimate). */
export function summaryOf(
  { character: row, avatar }: CharacterWithAvatar,
  canonicalTags: readonly TagView[],
): CharacterSummary {
  return {
    id: row.id,
    handle: row.handle,
    name: row.name,
    starred: row.starred,
    archived: row.archived,
    forbidExternalMedia: row.forbidExternalMedia,
    avatarAssetId: row.avatarAssetId,
    avatarHash: avatar?.hash ?? null,
    contentHash: row.contentHash,
    createdAt: row.createdAt,
    tokenSize: cardTokenSize({ ...row, greetings: parseStringArray(row.greetings) }),
    tags: canonicalTags,
  };
}
