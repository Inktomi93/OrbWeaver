// verb: updateSession — the session-config patch (the D62 Setup surface's write; collapses the study's
// `renameSession` — one patch verb, the `updateCharacterSchema` precedent). Every present member is
// RE-PARSED through its contracts schema here (the internal-boundary posture, security pass §3.A — the
// tRPC wire parse does not cover a future internal caller). `null` clears the two nullable text fields.
//
// `selection` IS NOT WHOLE-REPLACED — it is the one column with a SECOND writer. `applyFields` remaps
// `greetingIndexes` when an accepted rewrite removes a greeting (the session addresses greetings by
// position), so a scope-dialog save carrying a pre-remap client image used to undo that remap in the very
// next write. The patch now speaks a DELTA (`refinerySelectionPatchSchema`, three-state greetings:
// absent = keep · null = every greeting · array = exactly these) which is merged key-wise onto the stored
// value — the `mergeSheet` (rpg `patchSheet`) precedent. Do not "simplify" it back to a replace.

import type { RefinerySelection, RefinerySelectionPatch } from "@orb/contracts/refinery";
import {
  refineryGuidanceSchema,
  refinerySelectionPatchSchema,
  refinerySelectionSchema,
  refinerySessionNameSchema,
  refinerySessionStatusSchema,
  refineryStageConfigSchema,
} from "@orb/contracts/refinery";
import { refinerySessions } from "@orb/db";
import { DomainNotFoundError } from "@orb/kit/errors";
import { eq } from "drizzle-orm";
import type { RefineryContext } from "../context.ts";
import type { UpdateSessionPatch } from "../contract/params.ts";
import type { RefineryService } from "../contract/service.ts";
import { loadOwnedSessionRow, sessionViewOf } from "../persistence/queries.ts";

export function createUpdateSession(ctx: RefineryContext): RefineryService["updateSession"] {
  return async ({ principal, sessionId, patch }) => {
    const ownerId = principal.userId;
    const row = await loadOwnedSessionRow(ctx.db, ownerId, sessionId);
    if (row === undefined) {
      throw new DomainNotFoundError("refinery session", sessionId);
    }
    await ctx.db
      .update(refinerySessions)
      // The merge basis is the HEALED selection (`sessionViewOf` — the ONE read seam), never the raw
      // column: a corrupt stored value must heal exactly as a read of it would, not throw a save.
      .set({ ...parsePatch(patch, sessionViewOf(row).selection), updatedAt: ctx.now() })
      .where(eq(refinerySessions.id, sessionId));
    const updated = await loadOwnedSessionRow(ctx.db, ownerId, sessionId);
    if (updated === undefined) {
      throw new DomainNotFoundError("refinery session", sessionId);
    }
    ctx.emitUserEvent(ownerId, { type: "refineryChanged", sessionId });
    return sessionViewOf(updated);
  };
}

/** The SELECTION merge (header) — key-wise onto the stored value, the `mergeSheet` (rpg `patchSheet`)
 *  precedent. `greetingIndexes` is three-state in the DELTA (`refinerySelectionPatchSchema`): absent ⇒
 *  keep what is stored (which is what preserves `applyFields`' greeting-removal remap under a scope save
 *  that never addressed greetings), `null` ⇒ every greeting (absence in the VALUE shape), an array ⇒
 *  exactly those positions. The merged WHOLE goes back through `refinerySelectionSchema` — the delta
 *  schema bounds the delta, the value schema stays the stored-shape belt. */
function mergeSelection(current: RefinerySelection, patch: RefinerySelectionPatch): RefinerySelection {
  const greetingIndexes = patch.greetingIndexes === undefined ? current.greetingIndexes : (patch.greetingIndexes ?? undefined);
  return refinerySelectionSchema.parse({
    fields: patch.fields ?? current.fields,
    ...(greetingIndexes === undefined ? {} : { greetingIndexes }),
  });
}

/** The per-member re-parse (header): each present member through its contracts schema; `null` clears. */
function parsePatch(patch: UpdateSessionPatch, current: RefinerySelection): Partial<typeof refinerySessions.$inferInsert> {
  const set: Partial<typeof refinerySessions.$inferInsert> = {};
  if (patch.name !== undefined) {
    set.name = patch.name === null ? null : refinerySessionNameSchema.parse(patch.name);
  }
  if (patch.guidance !== undefined) {
    set.guidance = patch.guidance === null ? null : refineryGuidanceSchema.parse(patch.guidance);
  }
  if (patch.selection !== undefined) {
    set.selection = mergeSelection(current, refinerySelectionPatchSchema.parse(patch.selection));
  }
  if (patch.stageConfig !== undefined) {
    set.stageConfig = refineryStageConfigSchema.parse(patch.stageConfig);
  }
  if (patch.status !== undefined) {
    set.status = refinerySessionStatusSchema.parse(patch.status);
  }
  return set;
}
