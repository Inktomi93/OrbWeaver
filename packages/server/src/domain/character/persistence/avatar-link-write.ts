// domain/character/persistence/avatar-link-write — the character-owned avatar-pointer WRITE. A named
// exception to "persistence is queries only", exactly like persona's `import-write.ts`: batch-UPDATEs
// `characters.avatarAssetId` for one owner, in ONE `db.batch`, owner-scoped in every WHERE.
//
// It moved here from `assets/persistence/maintenance.ts` (2026-08-02), which is where it was WRITTEN from
// but not where it BELONGS: `characters` is character's table, and a cross-domain write routes through the
// owning domain's persistence helper + an injected op (Tier-1-DB.md §"Cross-tier composition"; AGENTS §2).
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

import { characters } from "@orb/db";
import { batchMany, batchStmt } from "@orb/db/kit";
import { and, eq } from "drizzle-orm";
import type { CharacterAvatarLinkContext, LinkCharacterAvatars } from "../contract/avatar-link.ts";

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
          .where(and(eq(characters.id, link.characterId), eq(characters.ownerId, ownerId))),
      ),
    );
    await ctx.db.batch(batchMany(stmts));
  };
}
