// domain/character/persistence/card — the card WRITE queries.
// Edit-in-place only (D28 — the card IS the flat row; no COW). Queries only: the cleanup ORCHESTRATION
// (best-effort avatar reap via the injected `reapAssets` op) lives in the verbs — `persistence/` never
// closes over a cross-feature op. The per-owner `(ownerId, handle)` unique index is the race guard for
// create/duplicate: a colliding handle surfaces as a constraint violation on INSERT, classified into a
// typed `CharacterOperationError("handle_conflict")` (never a phantom pre-SELECT).
//
// EVERY PRECONDITION RIDES ITS OWN WRITE STATEMENT — that is the shape all three guards here share, and the
// reason none of them is a pre-SELECT: `db.transaction` is banned in product code and `batchMany` bans a
// read ahead of the writes, so the only atomic instrument available is a predicate INSIDE the statement.
// The insert's guards are subqueries feeding its `id` (a refused guard NULLs the PK); the update's are
// extra conjuncts on its WHERE (a refused row simply does not update, and the empty result is then
// disambiguated by an owner-scoped re-read). "No CAS" (the D28 posture) still describes the DEFAULT update
// — the opt-in `expectedContentHash` (#1446) exists only for a caller writing from an OLD basis, and the
// provenance claim (#1432) only for the one caller whose `importedFrom` is an idempotency key.

import type { BumpStatsCanonVersion } from "@orb/contracts/stats";
import type { Db } from "@orb/db";
import { assets, characterSnapshots, characters } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import { batchMany, isConstraintViolation } from "@orb/db/kit";
import type { AssetId, CharacterId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { SQL } from "drizzle-orm";
import { and, eq, exists, inArray, notExists, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { CHARACTER_BACKGROUND_UNAVAILABLE, CHARACTER_HANDLE_CONFLICT, CharacterOperationError } from "../contract/errors.ts";

// The self-join alias the provenance claim's NOT EXISTS reads through — a subquery over the table being
// written needs its own name (the refinery schema-library precedent).
const claimedBy = alias(characters, "claimed_by");

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

/** The INSERT, with its id computed by a guard subquery so every precondition rides the write statement
 *  itself — the batch takes the write lock at its first statement, so a predicate evaluated here is atomic
 *  in a way no pre-SELECT can be (`@orb/db/kit::batchMany` bans a read ahead of the writes outright).
 *  A guard that yields no row makes `id` NULL, which the PK's NOT NULL turns into the constraint violation
 *  the callers classify. */
function guardedInsertStatements(
  db: Db,
  values: CharacterInsert,
  guards: readonly SQL[],
  bumpCanonVersion: BumpStatsCanonVersion<BatchStmt[], Db>,
): BatchStmt[] {
  const id = sql<CharacterId>`(SELECT ${values.id} WHERE ${and(...guards)})`;
  const statements: BatchStmt[] = [db.insert(characters).values({ ...values, id })];
  bumpCanonVersion(statements, db, values.ownerId);
  return statements;
}

/** Insert a new character row. A per-owner handle collision → `CharacterOperationError("handle_conflict")`. */
export async function insertCharacter(db: Db, values: CharacterInsert, bumpCanonVersion: BumpStatsCanonVersion<BatchStmt[], Db>): Promise<void> {
  try {
    await db.batch(
      batchMany(guardedInsertStatements(db, values, [carriedBackgroundExists(db, backgroundAssetId(values.backgroundOverride))], bumpCanonVersion)),
    );
  } catch (err) {
    throw classifyInsertFailure(err, values);
  }
}

/** The two typed refusals an insert's constraint violations mean, in the order they are distinguishable:
 *  a not-null from the id guard when the carried background is gone, a unique from the per-owner handle
 *  index. Anything else is returned unchanged for the caller to rethrow. */
function classifyInsertFailure(err: unknown, values: CharacterInsert): unknown {
  if (backgroundAssetId(values.backgroundOverride) !== undefined && isConstraintViolation(err)?.kind === "not-null") {
    const unavailable = new CharacterOperationError(CHARACTER_BACKGROUND_UNAVAILABLE, "The background asset is no longer available.");
    unavailable.cause = err;
    return unavailable;
  }
  if (isConstraintViolation(err)?.kind === "unique") {
    const conflict = new CharacterOperationError(CHARACTER_HANDLE_CONFLICT, `a character with handle "${values.handle}" already exists`);
    conflict.cause = err;
    return conflict;
  }
  return err;
}

/** Insert a copy that ATOMICALLY CLAIMS its provenance key (#1432): the row lands only while no character
 *  of this owner already carries this `importedFrom`, and `false` says a concurrent writer got there first
 *  (the caller converges on THEIR row — the same answer a sequential retry gives).
 *
 *  WHY A SUBQUERY AND NOT A UNIQUE INDEX: `imported_from` is shared vocabulary — the import path stamps a
 *  source URL there and a user may legitimately import the same file twice into two cards, so a
 *  `(owner_id, imported_from)` unique index would refuse a write that is not a duplicate at all. The claim
 *  belongs to the ONE caller whose key is an idempotency key (the handoff copy's `handoff:<chat>:<source>`),
 *  and it rides the insert's own guard subquery: SQLite's single writer plus the batch's write lock make
 *  "nobody else has this key" true AT THE MOMENT OF THE WRITE, which a find-before-mint read cannot be.
 *
 *  A HANDLE COLLISION IS ALSO A LOST RACE HERE, not a refusal: two accepts of the same offer reserve handles
 *  from the same snapshot of the recipient's library, so the loser's unique violation and the loser's
 *  guard-refusal are the same event seen from two constraints — both mean "their copy landed, use it". A
 *  violation with no provenance row behind it is a REAL failure and is classified/rethrown as usual. */
export async function insertCharacterClaimingProvenance(
  db: Db,
  values: CharacterInsert & { readonly importedFrom: string },
  bumpCanonVersion: BumpStatsCanonVersion<BatchStmt[], Db>,
): Promise<boolean> {
  const unclaimed = notExists(
    db
      .select({ one: sql`1` })
      .from(claimedBy)
      .where(and(eq(claimedBy.ownerId, values.ownerId), eq(claimedBy.importedFrom, values.importedFrom))),
  );
  // @orb-gate-ignore caught-failure-ownership(default:err): the ONE absorbed arm is a LOST RACE, and it is
  // absorbed into this function's own return value rather than swallowed — `false` is the caller's contract
  // ("someone else claimed this key; converge on their row"), which is the same answer the sequential
  // find-before-mint path gives. Every violation with no provenance row behind it is classified and RETHROWN
  // (`classifyInsertFailure`). Ends if the claim ever needs to distinguish WHICH constraint refused.
  try {
    await db.batch(
      batchMany(guardedInsertStatements(db, values, [carriedBackgroundExists(db, backgroundAssetId(values.backgroundOverride)), unclaimed], bumpCanonVersion)),
    );
    return true;
  } catch (err) {
    if (isConstraintViolation(err) !== undefined && (await provenanceClaimed(db, values.ownerId, values.importedFrom))) {
      return false;
    }
    throw classifyInsertFailure(err, values);
  }
}

/** Does a character of this owner already carry this provenance key? Read ONLY on the failure path of
 *  {@link insertCharacterClaimingProvenance}, to tell a lost race from a genuine constraint failure. */
async function provenanceClaimed(db: Db, ownerId: UserId, importedFrom: string): Promise<boolean> {
  const rows = await db
    .select({ id: characters.id })
    .from(characters)
    .where(and(eq(characters.ownerId, ownerId), eq(characters.importedFrom, importedFrom)))
    .limit(1);
  return rows.length > 0;
}

/** Edit the live card row in place (owner-scoped). Returns `true` if a row was updated (i.e. owned/found).
 *  `updatedAt` is NOT stamped here — the caller includes it in `edits` from its own injected clock (the
 *  X-16 precedent), same as `contentHash`. A `handle` edit can trip the per-owner `(ownerId, handle)`
 *  unique index → the same typed `CharacterOperationError("handle_conflict")` `insertCharacter` raises
 *  (never a raw DB error surfacing).
 *
 *  `expectedContentHash` is the OPT-IN compare-and-swap (#1446), and it does not reopen D28: edit-in-place
 *  is still always safe for a caller that read the card and wrote it back in one breath, which is every
 *  ordinary edit and is why this file's header says "no CAS, no COW". What changed is the INPUT — the
 *  refinery's apply constructs its patch from a card it read BEFORE two model calls and a snapshot write,
 *  so for that caller "the row is still what I merged against" is a real question with a real answer. When
 *  supplied it rides the same WHERE as ownership (one statement, no read-then-write window); a row that
 *  moved answers `"stale"` and NOTHING is written. */
export async function writeCardInPlace(
  db: Db,
  target: { readonly characterId: CharacterId; readonly ownerId: UserId; readonly expectedContentHash?: string },
  edits: CharacterEdits,
): Promise<"written" | "missing" | "background-unavailable" | "stale"> {
  const { characterId, ownerId, expectedContentHash } = target;
  const assetId = backgroundAssetId(edits.backgroundOverride);
  try {
    const updated = await db
      .update(characters)
      .set(edits)
      .where(
        and(
          eq(characters.id, characterId),
          eq(characters.ownerId, ownerId),
          ownedBackgroundExists(db, ownerId, assetId),
          ...(expectedContentHash === undefined ? [] : [eq(characters.contentHash, expectedContentHash)]),
        ),
      )
      .returning({ id: characters.id });
    if (updated.length > 0) {
      return "written";
    }
    // Which of the three predicates refused? The owner-scoped re-read separates "gone/not yours" from
    // "someone else's edit landed first" — only reachable on the empty-result path, so the CAS costs the
    // happy path nothing.
    if (expectedContentHash !== undefined) {
      const live = await db
        .select({ contentHash: characters.contentHash })
        .from(characters)
        .where(and(eq(characters.id, characterId), eq(characters.ownerId, ownerId)))
        .limit(1);
      const liveHash = live[0]?.contentHash;
      if (liveHash !== undefined && liveHash !== expectedContentHash) {
        return "stale";
      }
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
