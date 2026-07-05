// domain/persona/persistence/queries — ALL db access for the feature (queries only, no business logic).
// Every read is owner-scoped (the predicate is part of the WHERE, never a post-filter), so a non-owner can
// never receive another user's row. `ownerId` is `principal.userId` (§7.1) — this layer NEVER reads the
// `users` table (the `no-direct-users-read` chokepoint); the only cross-table reach is `characters`, a
// SANCTIONED schema read for the connection ownership gate (domain-no-cross-feature gates importing the
// character DOMAIN's code, not the shared @orb/db schema; precedent: world-info attachments touch both
// book tables).
//
// `detailOf` narrows the stored `metadata` blob through `personaMetadataSchema` at the read seam (§8.4
// parse-at-the-DB-seam): drizzle hands back whatever `JSON.parse` produced typed as `PersonaMetadata`
// without validating it, so a corrupt row degrades to `null` here instead of poisoning the view.

import { personaMetadataSchema } from "@orb/contracts/persona";
import type { Db } from "@orb/db";
import { assets, characterPersonas, characters, personas } from "@orb/db";
import type { AssetId, CharacterId, PersonaId, UserId } from "@orb/kit/ids";
import { and, desc, eq } from "drizzle-orm";
import {
  AssetNotFoundError,
  CharacterNotFoundError,
  PersonaNotFoundError,
} from "../contract/errors";
import type { PersonaDetail } from "../contract/views";

const LIMIT_ONE = 1;

type PersonaRow = typeof personas.$inferSelect;
type AssetRow = typeof assets.$inferSelect;

// Row + the joined avatar asset (null when no avatar is attached). The hash lives on `assets` (the CAS
// key); `personas` only carries `avatarAssetId`. One LEFT JOIN per read keeps detail builds round-trip-
// cheap. File-LOCAL (not exported): the `types-in-contract` gate forbids an exported type outside
// `contract/`, and this internal join bundle is only ever produced + consumed within `persistence/` — the
// verbs chain `load…` → `detailOf` without ever naming it.
interface PersonaWithAvatar {
  readonly persona: PersonaRow;
  readonly avatar: AssetRow | null;
}

/** One owned persona + its avatar, or undefined when not found / not the caller's. */
export async function loadOwnedPersonaWithAvatar(
  db: Db,
  ownerId: UserId,
  personaId: PersonaId,
): Promise<PersonaWithAvatar | undefined> {
  const rows = await db
    .select({ persona: personas, avatar: assets })
    .from(personas)
    .leftJoin(assets, eq(personas.avatarAssetId, assets.id))
    .where(and(eq(personas.id, personaId), eq(personas.ownerId, ownerId)))
    .limit(LIMIT_ONE);
  return rows[0];
}

/** The owner's personas + avatars, newest first. */
export async function listOwnedPersonasWithAvatar(
  db: Db,
  ownerId: UserId,
): Promise<PersonaWithAvatar[]> {
  const rows = await db
    .select({ persona: personas, avatar: assets })
    .from(personas)
    .leftJoin(assets, eq(personas.avatarAssetId, assets.id))
    .where(eq(personas.ownerId, ownerId))
    .orderBy(desc(personas.createdAt));
  return rows;
}

/** Personas connected to a character (via `character_personas`), owner-scoped, newest first. The
 *  `personas.ownerId` predicate is belt-and-braces: the character is owner-gated by the caller and
 *  connections only link same-owner rows, but it keeps the read self-evidently owner-scoped. */
export async function listConnectedPersonasWithAvatar(
  db: Db,
  ownerId: UserId,
  characterId: CharacterId,
): Promise<PersonaWithAvatar[]> {
  const rows = await db
    .select({ persona: personas, avatar: assets })
    .from(characterPersonas)
    .innerJoin(personas, eq(personas.id, characterPersonas.personaId))
    .leftJoin(assets, eq(personas.avatarAssetId, assets.id))
    .where(and(eq(characterPersonas.characterId, characterId), eq(personas.ownerId, ownerId)))
    .orderBy(desc(personas.createdAt));
  return rows;
}

/** Gate: the character must belong to the caller. Reads `characters.ownerId` directly (the sanctioned
 *  schema read). A foreign/absent character collapses to {@link CharacterNotFoundError} (no existence leak). */
export async function ensureCharacterOwned(
  db: Db,
  ownerId: UserId,
  characterId: CharacterId,
): Promise<void> {
  const rows = await db
    .select({ ownerId: characters.ownerId })
    .from(characters)
    .where(eq(characters.id, characterId))
    .limit(LIMIT_ONE);
  if (rows[0]?.ownerId !== ownerId) {
    throw new CharacterNotFoundError(characterId);
  }
}

/** Gate: a supplied avatar asset must belong to the caller (D21 cross-root belt — `personas` and
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

/** Gate: the persona must belong to the caller. A foreign/absent persona collapses to
 *  {@link PersonaNotFoundError} (no existence leak). */
export async function ensurePersonaOwned(
  db: Db,
  ownerId: UserId,
  personaId: PersonaId,
): Promise<void> {
  const rows = await db
    .select({ ownerId: personas.ownerId })
    .from(personas)
    .where(eq(personas.id, personaId))
    .limit(LIMIT_ONE);
  if (rows[0]?.ownerId !== ownerId) {
    throw new PersonaNotFoundError(personaId);
  }
}

/** Row + joined avatar → the public detail view. Pure (no DB). Narrows `metadata` through the schema
 *  read seam — a corrupt blob degrades to `null` rather than poisoning the typed view. */
export function detailOf({ persona: row, avatar }: PersonaWithAvatar): PersonaDetail {
  return {
    id: row.id,
    name: row.name,
    title: row.title,
    description: row.description,
    starred: row.starred,
    avatarAssetId: row.avatarAssetId,
    avatarHash: avatar?.hash ?? null,
    metadata: personaMetadataSchema.nullable().catch(null).parse(row.metadata),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
