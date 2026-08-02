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

import { characters } from "@orb/db";
import { batchMany, batchStmt } from "@orb/db/kit";
import { and, eq } from "drizzle-orm";
import type { CharacterAvatarLinkContext, LinkCharacterAvatars } from "../contract/avatar-link";

/** Build the character-owned avatar-relink op. */
export function createLinkCharacterAvatars(ctx: CharacterAvatarLinkContext): LinkCharacterAvatars {
  return async ({ ownerId, links }): Promise<void> => {
    if (links.length === 0) {
      return;
    }
    const stmts = links.map((link) =>
      batchStmt(
        ctx.db
          .update(characters)
          .set({ avatarAssetId: link.assetId })
          .where(and(eq(characters.id, link.characterId), eq(characters.ownerId, ownerId))),
      ),
    );
    await ctx.db.batch(batchMany(stmts));
  };
}
