import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import { getLog } from "#foundation/observability";
import type { PresetContext } from "../context";
import type { CreatePresetParams } from "../contract/params";
import type { PresetService } from "../contract/service";
import type { PresetDetail } from "../contract/views";
import { insertPreset, listOwnedPresetNames } from "../persistence/queries";
import { uniquePresetName } from "../substrate/names";
import { toPresetDetail } from "../substrate/views";

// verb: create — write a new OWNED preset (ownerId = the resolved caller). The config defaults to
// DEFAULT_PROMPT_CONFIG when the caller omits one (a fresh "start from default" preset); `schemaVersion`
// mirrors `config.schemaVersion` (the reseed-gate compare key). Timestamps come from the injected clock.
// The submitted name is de-collided against the caller's own library at mint time (`uniquePresetName`) —
// the client's Duplicate derives "Copy of X" from a row, so repeat duplicates would otherwise stack
// indistinguishable rows (visual-blech audit F5).

const PRESET_CREATE = "preset.create";
const PRESET_ENTITY = "preset";

export function createCreate(ctx: PresetContext): Pick<PresetService, "create"> {
  async function create(params: CreatePresetParams): Promise<PresetDetail> {
    const id = ctx.newPresetId();
    const now = ctx.now();
    const config = params.config ?? DEFAULT_PROMPT_CONFIG;
    const name = uniquePresetName(params.name, await listOwnedPresetNames(ctx.db, params.userId));
    const row = {
      id,
      ownerId: params.userId,
      name,
      kind: params.kind,
      config,
      schemaVersion: config.schemaVersion,
      // Born here: a create carries no lineage, INCLUDING the client's Duplicate (it posts a config, not a
      // source row — the copy is independent authorship, not a fork of the row it was seeded from).
      forkedFrom: null,
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
        metadata: { name, kind: params.kind },
      },
      now,
    );
    ctx.emitUserEvent(params.userId, { type: "presetsChanged", presetId: id });
    return toPresetDetail(row);
  }
  return { create };
}
