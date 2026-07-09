import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import { getLog } from "#foundation/observability";
import type { CreatePresetParams } from "../contract/params";
import type { PresetContext, PresetService } from "../contract/service";
import type { PresetDetail } from "../contract/views";
import { insertPreset } from "../persistence/queries";
import { toPresetDetail } from "../substrate/views";

// verb: create — write a new OWNED preset (ownerId = the resolved caller). The config defaults to
// DEFAULT_PROMPT_CONFIG when the caller omits one (a fresh "start from default" preset); `schemaVersion`
// mirrors `config.schemaVersion` (the reseed-gate compare key). Timestamps come from the injected clock.

const PRESET_CREATE = "preset.create";
const PRESET_ENTITY = "preset";

export function createCreate(ctx: PresetContext): Pick<PresetService, "create"> {
  async function create(params: CreatePresetParams): Promise<PresetDetail> {
    const id = ctx.newPresetId();
    const now = ctx.now();
    const config = params.config ?? DEFAULT_PROMPT_CONFIG;
    const row = {
      id,
      ownerId: params.userId,
      name: params.name,
      kind: params.kind,
      config,
      schemaVersion: config.schemaVersion,
      createdAt: now,
      updatedAt: now,
    };
    await insertPreset(ctx.db, row);
    getLog().info({ userId: params.userId, presetId: id }, "preset: created");
    await ctx.audit(
      {
        actorUserId: params.userId,
        action: PRESET_CREATE,
        entityType: PRESET_ENTITY,
        entityId: id,
        metadata: { name: params.name, kind: params.kind },
      },
      now,
    );
    ctx.emitUserEvent(params.userId, { type: "presetsChanged", presetId: id });
    return toPresetDetail(row);
  }
  return { create };
}
