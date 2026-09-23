// domain/character/persistence/avatar-link-write — the character-owned avatar-pointer WRITE. A named
// exception to "persistence is queries only", exactly like persona's `import-write.ts`: batch-UPDATEs
// `characters.avatarAssetId` for one owner, in ONE `db.batch`, owner-scoped in every WHERE.
//
// OWNER-SCOPED ON BOTH AXES (#1480 item 4): the character (id + owner, directly) AND the asset the SET
// writes (an EXISTS subquery inside the same UPDATE — see `ownedAssetExists`). Neither id is derived here:
// both arrive from the caller's list, so both are gated here.
//
// It moved here from `assets/persistence/maintenance.ts` (2026-08-02), which is where it was WRITTEN from
// but not where it BELONGS: `characters` is character's table, and a cross-domain write routes through the
// owning domain's persistence helper + an injected op (Tier-1-DB.md §"Cross-tier composition"; Constitution.md §2).
// Assets keeps the READ half (`loadAvatarBackfillCandidates`) — `persistence/` is the sanctioned home for a
// cross-domain read, and the candidate scan is assets' own sweep.
//
// SILENT by design: no audit entry, no user-bus event, no snapshot. A backfill reconciles a pointer the
// import path already meant to set; the workload reports the counts at the run level.
//
// IT DOES STAMP `updatedAt`, THOUGH — and that is the one thing "silent" never covered (#1379 item 2).
// The three omissions above are enumerated deliberately and the timestamp was not among them: it was
// missing, not decided. The precedent is recorded one file over, on the archive flip
// (`persistence/card.ts` setArchivedBulk): *"the X-16 edited-stamp precedent — a flag flip is still an
// edit the list re-sorts on"*, and a character's ART changing is a more visible edit than an archive
// flag. Leaving the row's `updatedAt` stale meant a library sorted by recency showed nothing had
// happened, and anything keying a cache off it kept serving the old avatar.
//
// NOT the same case as the two documented non-stampers in this domain, both of which RULE on it rather
// than omit it: `plugin-card-data.ts` cites D148 clause d (per-card plugin state is METADATA, not card
// content), and `refinery-ops.ts` states the stamp is "a derived-signal refresh (F6), not an authored
// edit". An avatar pointer is neither — it is the card's face.

import type { Db } from "@orb/db";
import { assets, characters } from "@orb/db";
import { batchMany, batchStmt } from "@orb/db/kit";
import type { AssetId, UserId } from "@orb/kit/ids";
import type { SQL } from "drizzle-orm";
import { and, eq, exists, sql } from "drizzle-orm";
import type { CharacterAvatarLinkContext, LinkCharacterAvatars } from "../contract/avatar-link.ts";

/** THE ASSET AXIS OF THE RELINK'S BELT (#1480 item 4). The character axis (id + owner) was always in the
 *  WHERE; the asset the SET writes was not checked at all, so a caller-supplied `link.assetId` naming
 *  ANOTHER owner's asset landed on this owner's own card — a live pointer into a library the card's owner
 *  cannot read, and an FK that GC-roots the other owner's blob through a row they do not control. That is
 *  the failure `queries.ts::ensureAssetOwned` (the create/update front doors) and
 *  `ensureBackgroundOverrideOwned` (the carried background) already refuse; a maintenance op handed a
 *  caller-supplied id list has strictly less standing to skip it, not more.
 *
 *  AS A SUBQUERY IN THE WRITE, not a read-then-write: `db.batch` takes SQLite's write lock at its first
 *  statement, so a predicate evaluated inside the UPDATE is atomic with it, and `@orb/db/kit::batchMany`
 *  bans a SELECT ahead of the writes anyway. Shape precedent: `persistence/card.ts::ownedBackgroundExists`.
 *  A refused row updates ZERO rows, so it does not even take the `updatedAt` stamp — the honest degrade the
 *  workload already reports at the run level (it counts what it asked for, not what the belt allowed). */
function ownedAssetExists(db: Db, ownerId: UserId, assetId: AssetId): SQL {
  return exists(
    db
      .select({ one: sql`1` })
      .from(assets)
      .where(and(eq(assets.id, assetId), eq(assets.ownerId, ownerId))),
  );
}

/** Build the character-owned avatar-relink op. */
export function createLinkCharacterAvatars(ctx: CharacterAvatarLinkContext): LinkCharacterAvatars {
  return async ({ ownerId, links }): Promise<void> => {
    if (links.length === 0) {
      return;
    }
    // ONE instant for the whole batch — a relink is a single reconciliation, so every row it touches
    // carries the same stamp rather than a drifting per-statement clock read.
    const updatedAt = ctx.now();
    const stmts = links.map((link) =>
      batchStmt(
        ctx.db
          .update(characters)
          .set({ avatarAssetId: link.assetId, updatedAt })
          .where(and(eq(characters.id, link.characterId), eq(characters.ownerId, ownerId), ownedAssetExists(ctx.db, ownerId, link.assetId))),
      ),
    );
    await ctx.db.batch(batchMany(stmts));
  };
}
