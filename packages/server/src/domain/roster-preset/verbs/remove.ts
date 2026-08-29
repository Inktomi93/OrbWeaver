// verb: remove — delete an owned party. The seats CASCADE with the row; chats started from the preset
// are untouched (a preset is a stamp, not a live link — no back-reference column exists to clean).

import type { RosterPresetContext } from "../context.ts";
import { RosterPresetNotFoundError } from "../contract/errors.ts";
import type { RemoveRosterPresetParams } from "../contract/params.ts";
import type { RosterPresetService } from "../contract/service.ts";
import { deletePresetRow, loadOwnedPresetRow } from "../persistence/queries.ts";

export function createRemove(ctx: RosterPresetContext): RosterPresetService["remove"] {
  return async ({ principal, presetId }: RemoveRosterPresetParams): Promise<void> => {
    const ownerId = principal.userId;
    const existing = await loadOwnedPresetRow(ctx.db, ownerId, presetId);
    if (existing === undefined) {
      throw new RosterPresetNotFoundError(presetId);
    }
    await deletePresetRow(ctx.db, presetId);
    await ctx.audit(
      {
        actorUserId: ownerId,
        action: "rosterPreset.remove",
        entityType: "roster_preset",
        entityId: presetId,
        metadata: { name: existing.name },
      },
      ctx.now(),
    );
    ctx.emitUserEvent(ownerId, { type: "rosterPresetsChanged", rosterPresetId: presetId });
  };
}
