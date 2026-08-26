// domain/character/persistence/card — the card WRITE queries.
// Edit-in-place only (D28 — the card IS the flat row; no CAS, no COW, always safe). Queries only: the
// cleanup ORCHESTRATION (best-effort avatar reap via the injected `reapAssets` op) lives in the verbs —
// `persistence/` never closes over a cross-feature op. The per-owner `(ownerId, handle)` unique index is
// the race guard for create/duplicate: a colliding handle surfaces as a constraint violation on INSERT,
// classified into a typed `CharacterOperationError("handle_conflict")` (never a phantom pre-SELECT).

import type { BumpStatsCanonVersion } from "@orb/contracts/stats";
import type { Db } from "@orb/db";
import { assets, characterSnapshots, characters } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import { batchMany, isConstraintViolation } from "@orb/db/kit";
import type { AssetId, CharacterId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { SQL } from "drizzle-orm";
import { and, eq, exists, inArray, sql } from "drizzle-orm";
import { CHARACTER_BACKGROUND_UNAVAILABLE, CHARACTER_HANDLE_CONFLICT, CharacterOperationError } from "../contract/errors.ts";

type CharacterInsert = typeof characters.$inferInsert;
type CharacterEdits = Partial<CharacterInsert>;
type SnapshotInsert = typeof characterSnapshots.$inferInsert;

function backgroundAssetId(value: CharacterInsert["backgroundOverride"]): AssetId | undefined {
  return value?.kind === "asset" && value.assetId.length > 0 ? castId<AssetId>(value.assetId) : undefined;
}

// @owner-scope-ok: character creation may carry a background from an already-authorized duplicate/import
// source owned by someone else. This existence-only arbitration ends if carried backgrounds become
// owner-only or move to a normalized FK-backed relation.
function carriedBackgroundExists(db: Db, assetId: AssetId | undefined): SQL {
  return assetId === undefined ? sql`1` : exists(db.select({ one: sql`1` }).from(assets).where(eq(assets.id, assetId)));
}

function ownedBackgroundExists(db: Db, ownerId: UserId, assetId: AssetId | undefined): SQL {
  return assetId === undefined
    ? sql`1`
    : exists(
        db
          .select({ one: sql`1` })
          .from(assets)
          .where(and(eq(assets.id, assetId), eq(assets.ownerId, ownerId))),
      );
}

/** Insert a new character row. A per-owner handle collision → `CharacterOperationError("handle_conflict")`. */
export async function insertCharacter(db: Db, values: CharacterInsert, bumpCanonVersion: BumpStatsCanonVersion<BatchStmt[], Db>): Promise<void> {
  const guardedId = sql<CharacterId>`(SELECT ${values.id} WHERE ${carriedBackgroundExists(db, backgroundAssetId(values.backgroundOverride))})`;
  try {
    const statements: BatchStmt[] = [db.insert(characters).values({ ...values, id: guardedId })];
    bumpCanonVersion(statements, db, values.ownerId);
    await db.batch(batchMany(statements));
  } catch (err) {
    if (backgroundAssetId(values.backgroundOverride) !== undefined && isConstraintViolation(err)?.kind === "not-null") {
      const unavailable = new CharacterOperationError(CHARACTER_BACKGROUND_UNAVAILABLE, "The background asset is no longer available.");
      unavailable.cause = err;
      throw unavailable;
    }
    if (isConstraintViolation(err)?.kind === "unique") {
      const conflict = new CharacterOperationError(CHARACTER_HANDLE_CONFLICT, `a character with handle "${values.handle}" already exists`);
      conflict.cause = err;
      throw conflict;
    }
    throw err;
  }
}

/** Edit the live card row in place (owner-scoped). Returns `true` if a row was updated (i.e. owned/found).
 *  `updatedAt` is NOT stamped here — the caller includes it in `edits` from its own injected clock (the
 *  X-16 precedent), same as `contentHash`. A `handle` edit can trip the per-owner `(ownerId, handle)`
 *  unique index → the same typed `CharacterOperationError("handle_conflict")` `insertCharacter` raises
 *  (never a raw DB error surfacing). */
export async function writeCardInPlace(
  db: Db,
  characterId: CharacterId,
  ownerId: UserId,
  edits: CharacterEdits,
): Promise<"written" | "missing" | "background-unavailable"> {
  const assetId = backgroundAssetId(edits.backgroundOverride);
  try {
    const updated = await db
      .update(characters)
      .set(edits)
      .where(and(eq(characters.id, characterId), eq(characters.ownerId, ownerId), ownedBackgroundExists(db, ownerId, assetId)))
      .returning({ id: characters.id });
    if (updated.length > 0) {
      return "written";
    }
    if (
      assetId !== undefined &&
      (
        await db
          .select({ id: assets.id })
          .from(assets)
          .where(and(eq(assets.id, assetId), eq(assets.ownerId, ownerId)))
          .limit(1)
      ).length === 0
    ) {
      return "background-unavailable";
    }
    return "missing";
  } catch (err) {
    if (isConstraintViolation(err)?.kind === "unique") {
      const conflict = new CharacterOperationError(CHARACTER_HANDLE_CONFLICT, `a character with handle "${edits.handle}" already exists`);
      conflict.cause = err;
      throw conflict;
    }
    throw err;
  }
}

/** Append a `character_snapshots` history blob (the "git commit"). Nothing FKs this table (invariant 4). */
export async function appendSnapshot(db: Db, values: SnapshotInsert): Promise<void> {
  await db.insert(characterSnapshots).values(values);
}

/** Hard-delete an owned character (cascades snapshots / personas / downstream FKs). Returns `true` when a
 *  row was actually deleted (owned/found). The caller best-effort reaps the avatar asset afterwards. */
export async function deleteOwnedCharacter(
  db: Db,
  characterId: CharacterId,
  ownerId: UserId,
  bumpCanonVersion: BumpStatsCanonVersion<BatchStmt[], Db>,
): Promise<boolean> {
  const statements: BatchStmt[] = [
    db
      .delete(characters)
      .where(and(eq(characters.id, characterId), eq(characters.ownerId, ownerId)))
      .returning({ id: characters.id }),
  ];
  bumpCanonVersion(statements, db, ownerId);
  const results = await db.batch(batchMany(statements));
  const deleted = results[0] as readonly { readonly id: CharacterId }[];
  return deleted.length > 0;
}

/** Archive / un-archive many owned characters in one statement. Returns the ids actually flipped.
 *  Stamps `updatedAt` (the X-16 edited-stamp precedent — a flag flip is still an edit the list re-sorts
 *  on) from the caller's injected clock. */
export async function setArchivedBulk(
  db: Db,
  ownerId: UserId,
  characterIds: readonly CharacterId[],
  patch: { readonly archived: boolean; readonly updatedAt: number },
): Promise<CharacterId[]> {
  if (characterIds.length === 0) {
    return [];
  }
  const updated = await db
    .update(characters)
    .set(patch)
    .where(and(eq(characters.ownerId, ownerId), inArray(characters.id, [...characterIds])))
    .returning({ id: characters.id });
  return updated.map((r) => r.id);
}
