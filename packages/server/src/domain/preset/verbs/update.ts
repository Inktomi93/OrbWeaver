import type { PromptConfig } from "@orb/contracts/preset";
import { parsePromptConfig } from "@orb/contracts/preset";
import { getLog } from "#foundation/observability";
import { SYSTEM_DEFAULT_PRESET_ID } from "../constants";
import { PresetNotFoundError } from "../contract/errors";
import type { UpdatePresetParams } from "../contract/params";
import type { PresetContext, PresetService } from "../contract/service";
import type { PresetDetail } from "../contract/views";
import { insertPreset, readablePreset, updatePresetRow } from "../persistence/queries";
import { toPresetDetail } from "../substrate/views";

// verb: update — patch an OWNED preset, OR copy-on-write the system default (preset.md esoteric #2). The
// COW is a DESIGNED UX, not an error path: when the target is SYSTEM_DEFAULT_PRESET_ID a NEW owned fork is
// minted from the submission (falling back to the system default's own fields for omitted ones) and its
// NEW id is returned — the client's onSuccess detects the id change and navigates to the fork. Without this
// branch, a user editing the system default would lose their changes silently. Owned updates scope on
// `ownerId = userId` (a foreign/missing row → PresetNotFoundError); the system default's `ownerId IS NULL`
// never matches that scope, so the COW branch is the ONLY way it is touched through the verb API.

const PRESET_UPDATE = "preset.update";
const PRESET_CREATE = "preset.create";
const PRESET_ENTITY = "preset";

/** Build the partial SET — only the present keys are written; a config edit also re-stamps schemaVersion. */
function buildPatch(
  params: UpdatePresetParams,
  now: number,
): {
  name?: string;
  kind?: string;
  config?: PromptConfig;
  schemaVersion?: number;
  updatedAt: number;
} {
  return {
    ...(params.name === undefined ? {} : { name: params.name }),
    ...(params.kind === undefined ? {} : { kind: params.kind }),
    ...(params.config === undefined
      ? {}
      : { config: params.config, schemaVersion: params.config.schemaVersion }),
    updatedAt: now,
  };
}

/** COW: mint a new OWNED fork of the system default carrying the submission (omitted fields fall back to
 *  the system default's own). Returns the new fork's detail (its NEW id signals the client to navigate). */
async function cowFork(
  ctx: PresetContext,
  params: UpdatePresetParams,
  now: number,
): Promise<PresetDetail> {
  const base = await readablePreset(ctx.db, params.userId, SYSTEM_DEFAULT_PRESET_ID);
  if (base === undefined) {
    throw new PresetNotFoundError(params.id);
  }
  const config = params.config ?? parsePromptConfig(base.config);
  const forkId = ctx.newPresetId();
  const row = {
    id: forkId,
    ownerId: params.userId,
    name: params.name ?? base.name,
    kind: params.kind ?? base.kind,
    config,
    schemaVersion: config.schemaVersion,
    createdAt: now,
    updatedAt: now,
  };
  await insertPreset(ctx.db, row);
  getLog().info(
    { userId: params.userId, presetId: forkId },
    "preset: copy-on-write fork of system default",
  );
  await ctx.audit(
    {
      actorUserId: params.userId,
      action: PRESET_CREATE,
      entityType: PRESET_ENTITY,
      entityId: forkId,
    },
    now,
  );
  return toPresetDetail(row);
}

export function createUpdate(ctx: PresetContext): Pick<PresetService, "update"> {
  async function update(params: UpdatePresetParams): Promise<PresetDetail> {
    const now = ctx.now();
    if (params.id === SYSTEM_DEFAULT_PRESET_ID) {
      return await cowFork(ctx, params, now);
    }
    const row = await updatePresetRow(ctx.db, params.id, params.userId, buildPatch(params, now));
    if (row === undefined) {
      throw new PresetNotFoundError(params.id);
    }
    await ctx.audit(
      {
        actorUserId: params.userId,
        action: PRESET_UPDATE,
        entityType: PRESET_ENTITY,
        entityId: params.id,
      },
      now,
    );
    return toPresetDetail(row);
  }
  return { update };
}
