import type { PromptConfig } from "@orb/contracts/preset";
import { parsePromptConfig } from "@orb/contracts/preset";
import { getLog } from "#foundation/observability";
import { SYSTEM_DEFAULT_PRESET_ID } from "../constants";
import type { PresetContext } from "../context";
import { PresetNotFoundError } from "../contract/errors";
import type { UpdatePresetParams } from "../contract/params";
import type { PresetService } from "../contract/service";
import type { PresetDetail } from "../contract/views";
import { insertPreset, readablePreset, updatePresetRow } from "../persistence/queries";
import { toPresetDetail } from "../substrate/views";

// verb: update — patch an OWNED preset, or copy-on-write the system default. When the target is
// SYSTEM_DEFAULT_PRESET_ID a new owned fork is minted from the submission and its new id returned — the
// client detects the id change and navigates to the fork, so editing the shared default never loses changes.

const PRESET_UPDATE = "preset.update";
const PRESET_FORK = "preset.fork";
const PRESET_ENTITY = "preset";

/** A config edit also re-stamps `schemaVersion` (kept in sync with the blob). */
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
    ...(params.config === undefined ? {} : { config: params.config, schemaVersion: params.config.schemaVersion }),
    updatedAt: now,
  };
}

/** COW: mint a new OWNED fork of the system default carrying the submission (omitted fields fall back to
 *  the system default's own). Returns the new fork's detail (its NEW id signals the client to navigate). */
async function cowFork(ctx: PresetContext, params: UpdatePresetParams, now: number): Promise<PresetDetail> {
  const base = await readablePreset(ctx.db, params.userId, SYSTEM_DEFAULT_PRESET_ID);
  if (base === undefined) {
    throw new PresetNotFoundError(params.id);
  }
  const config = params.config ?? parsePromptConfig(base.config);
  const forkId = ctx.newPresetId();
  const row = {
    id: forkId,
    ownerId: params.userId,
    name: params.name ?? `${base.name} (edited)`,
    kind: params.kind ?? base.kind,
    config,
    schemaVersion: config.schemaVersion,
    createdAt: now,
    updatedAt: now,
  };
  await insertPreset(ctx.db, row);
  getLog().info({ userId: params.userId, presetId: forkId }, "preset: copy-on-write fork of system default");
  await ctx.audit(
    {
      actorUserId: params.userId,
      action: PRESET_FORK,
      entityType: PRESET_ENTITY,
      entityId: forkId,
      metadata: { forkedFrom: SYSTEM_DEFAULT_PRESET_ID },
    },
    now,
  );
  ctx.emitUserEvent(params.userId, { type: "presetsChanged", presetId: forkId });
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
    const edits = {
      ...(params.name === undefined ? {} : { name: params.name }),
      ...(params.kind === undefined ? {} : { kind: params.kind }),
    };
    await ctx.audit(
      {
        actorUserId: params.userId,
        action: PRESET_UPDATE,
        entityType: PRESET_ENTITY,
        entityId: params.id,
        metadata: { edits, configUpdated: params.config !== undefined },
      },
      now,
    );
    ctx.emitUserEvent(params.userId, { type: "presetsChanged", presetId: params.id });
    return toPresetDetail(row);
  }
  return { update };
}
