import { getLog } from "#foundation/observability";
import { SYSTEM_DEFAULT_PRESET_ID } from "../constants.ts";
import { PRESET_OP_CODES, PresetNotFoundError, PresetOperationError } from "../contract/errors.ts";
import type { RemovePresetParams } from "../contract/params.ts";
import type { PresetContext, PresetService } from "../contract/service.ts";
import { deletePreset } from "../persistence/queries.ts";

// verb: remove — delete an OWNED preset. The system default is GUARDED (its lifecycle is the boot seeder's
// alone — never removable through the verb API). Owned deletes scope on `ownerId = userId`, so a foreign or
// missing row deletes nothing → PresetNotFoundError. No `chats`/`messages` FK references presets (D26 —
// provenance lives on `message_variants.params`), so a delete cascades nothing dangerous.
//
// THE PRESET'S OWN SCRIPTS. The delete CASCADEs the preset's script attachments, never the scripts. The owner's chosen
// `scriptIds` go after the preset row, through regex's injected op, which deletes only those now on no junction: a
// script another preset, a character, a room or the global tier uses is kept even when named.

const PRESET_REMOVE = "preset.remove";
const PRESET_ENTITY = "preset";

export function createRemove(ctx: PresetContext): Pick<PresetService, "remove"> {
  async function remove(params: RemovePresetParams): Promise<void> {
    if (params.id === SYSTEM_DEFAULT_PRESET_ID) {
      throw new PresetOperationError(PRESET_OP_CODES.cannotRemoveSystemDefault, "the system default preset cannot be removed");
    }
    const removed = await deletePreset(ctx.db, params.id, params.userId);
    if (!removed) {
      throw new PresetNotFoundError(params.id);
    }
    const { affected } = await ctx.removeUnattachedScripts({ ownerId: params.userId, scriptIds: params.scriptIds });
    getLog(ctx.logger).info({ userId: params.userId, presetId: params.id, scriptsRemoved: affected }, "preset: removed");
    await ctx.audit(
      {
        actorUserId: params.userId,
        action: PRESET_REMOVE,
        entityType: PRESET_ENTITY,
        entityId: params.id,
      },
      ctx.now(),
    );
    ctx.emitUserEvent(params.userId, { type: "presetsChanged", presetId: params.id });
  }
  return { remove };
}
