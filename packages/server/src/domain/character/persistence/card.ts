// domain/character/persistence/card — the card WRITE queries (character.md §8-slot persistence/card.ts).
// Edit-in-place only (D28 — the card IS the flat row; no CAS, no COW, always safe). Queries only: the
// cleanup ORCHESTRATION (best-effort avatar reap via the injected `reapAssets` op) lives in the verbs —
// `persistence/` never closes over a cross-feature op. The per-owner `(ownerId, handle)` unique index is
// the race guard for create/duplicate: a colliding handle surfaces as a constraint violation on INSERT,
// classified into a typed `CharacterOperationError("handle_conflict")` (never a phantom pre-SELECT).

import type { Db } from "@orb/db";
import { characterSnapshots, characters, isConstraintViolation } from "@orb/db";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { and, eq, inArray } from "drizzle-orm";
import { CHARACTER_HANDLE_CONFLICT, CharacterOperationError } from "../contract/errors";

type CharacterInsert = typeof characters.$inferInsert;
type CharacterEdits = Partial<CharacterInsert>;
type SnapshotInsert = typeof characterSnapshots.$inferInsert;

/** Insert a new character row. A per-owner handle collision → `CharacterOperationError("handle_conflict")`. */
export async function insertCharacter(db: Db, values: CharacterInsert): Promise<void> {
  try {
    await db.insert(characters).values(values);
  } catch (err) {
    if (isConstraintViolation(err)?.kind === "unique") {
      const conflict = new CharacterOperationError(
        CHARACTER_HANDLE_CONFLICT,
        `a character with handle "${values.handle}" already exists`,
      );
      conflict.cause = err;
      throw conflict;
    }
    throw err;
  }
}

/** Edit the live card row in place (owner-scoped). Returns `true` if a row was updated (i.e. owned/found).
 *  No `updatedAt` column exists (D28) — the caller recomputes `contentHash` and includes it in `edits`. */
export async function writeCardInPlace(
  db: Db,
  characterId: CharacterId,
  ownerId: UserId,
  edits: CharacterEdits,
): Promise<boolean> {
  const updated = await db
    .update(characters)
    .set(edits)
    .where(and(eq(characters.id, characterId), eq(characters.ownerId, ownerId)))
    .returning({ id: characters.id });
  return updated.length > 0;
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
): Promise<boolean> {
  const deleted = await db
    .delete(characters)
    .where(and(eq(characters.id, characterId), eq(characters.ownerId, ownerId)))
    .returning({ id: characters.id });
  return deleted.length > 0;
}

/** Archive / un-archive many owned characters in one statement. Returns the ids actually flipped. */
export async function setArchivedBulk(
  db: Db,
  ownerId: UserId,
  characterIds: readonly CharacterId[],
  archived: boolean,
): Promise<CharacterId[]> {
  if (characterIds.length === 0) {
    return [];
  }
  const updated = await db
    .update(characters)
    .set({ archived })
    .where(and(eq(characters.ownerId, ownerId), inArray(characters.id, [...characterIds])))
    .returning({ id: characters.id });
  return updated.map((r) => r.id);
}
