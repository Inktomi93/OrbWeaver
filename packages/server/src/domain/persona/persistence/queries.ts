// All db access for the feature (queries only). Every read is owner-scoped (the predicate is part of the
// WHERE, never a post-filter). `detailOf` narrows the stored `metadata` blob through the schema at the read
// seam — a corrupt row degrades to `null` instead of poisoning the view.

import { personaMetadataSchema } from "@orb/contracts/persona";
import type { Db } from "@orb/db";
import { assets, characterPersonas, characters, personas } from "@orb/db";
import type { AssetId, CharacterId, PersonaId, UserId } from "@orb/kit/ids";
import { and, desc, eq } from "drizzle-orm";
import { AssetNotFoundError, PersonaCharacterNotFoundError, PersonaNotFoundError } from "../contract/errors";
import type { PersonaDetail } from "../contract/views";

const LIMIT_ONE = 1;

type PersonaRow = typeof personas.$inferSelect;
type AssetRow = typeof assets.$inferSelect;

// Row + the joined avatar asset (null when no avatar is attached). File-local — the verbs chain
// `load…` → `detailOf` without ever naming it.
interface PersonaWithAvatar {
  readonly persona: PersonaRow;
  readonly avatar: AssetRow | null;
}

/** One owned persona + its avatar, or undefined when not found / not the caller's. */
export async function loadOwnedPersonaWithAvatar(db: Db, ownerId: UserId, personaId: PersonaId): Promise<PersonaWithAvatar | undefined> {
  const rows = await db
    .select({ persona: personas, avatar: assets })
    .from(personas)
    .leftJoin(assets, eq(personas.avatarAssetId, assets.id))
    .where(and(eq(personas.id, personaId), eq(personas.ownerId, ownerId)))
    .limit(LIMIT_ONE);
  return rows[0];
}

/** The owner's personas + avatars, newest first. */
export async function listOwnedPersonasWithAvatar(db: Db, ownerId: UserId): Promise<PersonaWithAvatar[]> {
  const rows = await db
    .select({ persona: personas, avatar: assets })
    .from(personas)
    .leftJoin(assets, eq(personas.avatarAssetId, assets.id))
    .where(eq(personas.ownerId, ownerId))
    .orderBy(desc(personas.createdAt));
  return rows;
}

/** The caller's existing owned persona with this exact `name`, or null — the `(ownerId, name)` backup-import
 *  dedup key. Newest wins when names collide. */
export async function findOwnedPersonaByName(db: Db, ownerId: UserId, name: string): Promise<PersonaId | null> {
  const rows = await db
    .select({ id: personas.id })
    .from(personas)
    .where(and(eq(personas.ownerId, ownerId), eq(personas.name, name)))
    .orderBy(desc(personas.createdAt))
    .limit(LIMIT_ONE);
  return rows[0]?.id ?? null;
}

/** Personas connected to a character (via `character_personas`), owner-scoped, newest first. */
export async function listConnectedPersonasWithAvatar(db: Db, ownerId: UserId, characterId: CharacterId): Promise<PersonaWithAvatar[]> {
  const rows = await db
    .select({ persona: personas, avatar: assets })
    .from(characterPersonas)
    .innerJoin(personas, eq(personas.id, characterPersonas.personaId))
    .leftJoin(assets, eq(personas.avatarAssetId, assets.id))
    .where(and(eq(characterPersonas.characterId, characterId), eq(personas.ownerId, ownerId)))
    .orderBy(desc(personas.createdAt));
  return rows;
}

/** Gate: the character must belong to the caller. A foreign/absent character collapses to
 *  {@link PersonaCharacterNotFoundError} (no existence leak). */
export async function ensureCharacterOwned(db: Db, ownerId: UserId, characterId: CharacterId): Promise<void> {
  const rows = await db.select({ ownerId: characters.ownerId }).from(characters).where(eq(characters.id, characterId)).limit(LIMIT_ONE);
  if (rows[0]?.ownerId !== ownerId) {
    throw new PersonaCharacterNotFoundError(characterId);
  }
}

/** Gate: a supplied avatar asset must belong to the caller (the FK alone proves existence, never
 *  ownership). A foreign/absent asset collapses to {@link AssetNotFoundError} (no existence leak). */
export async function ensureAssetOwned(db: Db, ownerId: UserId, assetId: AssetId): Promise<void> {
  const rows = await db.select({ ownerId: assets.ownerId }).from(assets).where(eq(assets.id, assetId)).limit(LIMIT_ONE);
  if (rows[0]?.ownerId !== ownerId) {
    throw new AssetNotFoundError(assetId);
  }
}

/** Gate: the persona must belong to the caller. A foreign/absent persona collapses to
 *  {@link PersonaNotFoundError} (no existence leak). */
export async function ensurePersonaOwned(db: Db, ownerId: UserId, personaId: PersonaId): Promise<void> {
  const rows = await db.select({ ownerId: personas.ownerId }).from(personas).where(eq(personas.id, personaId)).limit(LIMIT_ONE);
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
