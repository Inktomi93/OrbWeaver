import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import { getLog } from "#foundation/observability";
import { SYSTEM_DEFAULT_PRESET_ID } from "../constants.ts";
import type { PresetContext } from "../context.ts";
import { PresetNotFoundError } from "../contract/errors.ts";
import type { ResetToDefaultParams } from "../contract/params.ts";
import type { PresetService } from "../contract/service.ts";
import type { PresetDetail } from "../contract/views.ts";
import { readablePreset, replacePresetConfig } from "../persistence/queries.ts";
import { toPresetDetail } from "../substrate/views.ts";

// verb: resetToDefault — replace an OWNED preset's config with DEFAULT_PROMPT_CONFIG (re-stamping the
// mirrored schemaVersion). Targeting the system default is a NO-OP that returns the row as-is: it already
// IS the default, and it is un-owned (the COW/fork path is `update`'s job, not reset's). Owned resets scope
// on `ownerId = userId` (foreign/missing → PresetNotFoundError).

const PRESET_RESET = "preset.resetToDefault";
const PRESET_ENTITY = "preset";

export function createResetToDefault(ctx: PresetContext): Pick<PresetService, "resetToDefault"> {
  async function resetToDefault(params: ResetToDefaultParams): Promise<PresetDetail> {
    if (params.id === SYSTEM_DEFAULT_PRESET_ID) {
      const current = await readablePreset(ctx.db, params.userId, params.id);
      if (current === undefined) {
        throw new PresetNotFoundError(params.id);
      }
      return toPresetDetail(current);
    }
    const now = ctx.now();
    // `replacePresetConfig`, not `updatePresetRow`: the new content is DEFAULT_PROMPT_CONFIG, which does
    // not descend from the row's stored blob — so the #471 refusal does not apply, and resetting stays
    // available as the in-place repair for a preset the current build cannot read (#1026).
    const row = await replacePresetConfig(ctx.db, params.id, params.userId, {
      config: DEFAULT_PROMPT_CONFIG,
      schemaVersion: DEFAULT_PROMPT_CONFIG.schemaVersion,
      updatedAt: now,
    });
    if (row === undefined) {
      throw new PresetNotFoundError(params.id);
    }
    getLog().info({ userId: params.userId, presetId: params.id }, "preset: reset to default");
    await ctx.audit(
      {
        actorUserId: params.userId,
        action: PRESET_RESET,
        entityType: PRESET_ENTITY,
        entityId: params.id,
      },
      now,
    );
    ctx.emitUserEvent(params.userId, { type: "presetsChanged", presetId: params.id });
    return toPresetDetail(row);
  }
  return { resetToDefault };
}
