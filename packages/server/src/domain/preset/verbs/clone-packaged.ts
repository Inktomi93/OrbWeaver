import { parsePromptConfig } from "@orb/contracts/preset";
import { getLog } from "#foundation/observability";
import type { PresetContext } from "../context.ts";
import { PresetNotFoundError } from "../contract/errors.ts";
import { PACKAGED_PRESETS } from "../contract/packaged.ts";
import type { ClonePackagedParams } from "../contract/params.ts";
import type { PresetService } from "../contract/service.ts";
import type { PresetDetail } from "../contract/views.ts";
import { insertPreset, selectPackagedPreset } from "../persistence/queries.ts";
import { toPresetDetail } from "../substrate/views.ts";

// verb: clonePackaged — fork a shipped PACKAGED template preset into the caller's library. The template is an
// ownerless well-known-id row (seeded at boot, kept OUT of the readable list); this reads it by id (missing →
// PresetNotFoundError, the unseeded refusal), then inserts an independent OWNED copy with a fresh id. The
// clone carries the template's name/kind/config verbatim; mutating it never touches the template row (owned-
// scoped writes can't match the null-owner source). The cross-feature clone-source op rpg `createGame` wires
// onto `RpgContext.preset.clonePackaged` → stamps the new id as `rpg_games.gmPresetId` (docs/plans/rpg/design.md 02 §1.1).

const PRESET_CLONE_PACKAGED = "preset.clonePackaged";
const PRESET_ENTITY = "preset";

export function createClonePackaged(ctx: PresetContext): Pick<PresetService, "clonePackaged"> {
  async function clonePackaged(params: ClonePackagedParams): Promise<PresetDetail> {
    const template = PACKAGED_PRESETS[params.key];
    const source = await selectPackagedPreset(ctx.db, template.id);
    if (source === undefined) {
      throw new PresetNotFoundError(template.id);
    }
    const id = ctx.newPresetId();
    const now = ctx.now();
    const config = parsePromptConfig(source.config);
    const row = {
      id,
      ownerId: params.userId,
      name: source.name,
      kind: source.kind,
      config,
      schemaVersion: config.schemaVersion,
      // Lineage: the clone names its template. NOT a convergence key — a repeat clone is by contract an
      // independent second copy, so `(owner_id, forked_from)` is deliberately a non-unique index.
      forkedFrom: template.id,
      createdAt: now,
      updatedAt: now,
    };
    await insertPreset(ctx.db, row);
    getLog().info({ userId: params.userId, presetId: id, packagedKey: params.key }, "preset: cloned packaged");
    await ctx.audit(
      {
        actorUserId: params.userId,
        action: PRESET_CLONE_PACKAGED,
        entityType: PRESET_ENTITY,
        entityId: id,
        metadata: { packagedKey: params.key, clonedFrom: template.id },
      },
      now,
    );
    ctx.emitUserEvent(params.userId, { type: "presetsChanged", presetId: id });
    return toPresetDetail(row);
  }
  return { clonePackaged };
}
