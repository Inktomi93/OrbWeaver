import { getLog } from "#foundation/observability";
import { SYSTEM_DEFAULT_PRESET_ID } from "../constants";
import { PRESET_OP_CODES, PresetNotFoundError, PresetOperationError } from "../contract/errors";
import type { RemovePresetParams } from "../contract/params";
import type { PresetContext, PresetService } from "../contract/service";
import { deletePreset } from "../persistence/queries";

// verb: remove — delete an OWNED preset. The system default is GUARDED (its lifecycle is the boot seeder's
// alone — never removable through the verb API). Owned deletes scope on `ownerId = userId`, so a foreign or
// missing row deletes nothing → PresetNotFoundError. No `chats`/`messages` FK references presets (D26 —
// provenance lives on `message_variants.params`), so a delete cascades nothing dangerous.

const PRESET_REMOVE = "preset.remove";
const PRESET_ENTITY = "preset";

export function createRemove(ctx: PresetContext): Pick<PresetService, "remove"> {
  async function remove(params: RemovePresetParams): Promise<void> {
    if (params.id === SYSTEM_DEFAULT_PRESET_ID) {
      throw new PresetOperationError(
        PRESET_OP_CODES.cannotRemoveSystemDefault,
        "the system default preset cannot be removed",
      );
    }
    const removed = await deletePreset(ctx.db, params.id, params.userId);
    if (!removed) {
      throw new PresetNotFoundError(params.id);
    }
    getLog().info({ userId: params.userId, presetId: params.id }, "preset: removed");
    await ctx.audit(
      {
        actorUserId: params.userId,
        action: PRESET_REMOVE,
        entityType: PRESET_ENTITY,
        entityId: params.id,
      },
      ctx.now(),
    );
  }
  return { remove };
}
