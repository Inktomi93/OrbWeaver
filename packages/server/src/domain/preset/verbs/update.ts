import type { PromptConfig } from "@orb/contracts/preset";
import { parsePromptConfig } from "@orb/contracts/preset";
import { getLog } from "#foundation/observability";
import { SYSTEM_DEFAULT_PRESET_ID } from "../constants";
import type { PresetContext } from "../context";
import { PresetNotFoundError } from "../contract/errors";
import type { UpdatePresetParams } from "../contract/params";
import type { PresetService } from "../contract/service";
import type { PresetDetail } from "../contract/views";
import { findOwnedForkOf, insertPreset, listOwnedPresetNames, readablePreset, updatePresetRow } from "../persistence/queries";
import { uniquePresetName } from "../substrate/names";
import { toPresetDetail } from "../substrate/views";

// verb: update — patch an OWNED preset, or copy-on-write the system default. When the target is
// SYSTEM_DEFAULT_PRESET_ID an owned fork carries the submission and ITS id is returned — the client detects
// the id change and navigates to the fork, so editing the shared default never loses changes. That fork is
// minted once per owner and reused thereafter (`cowFork` — the `forked_from` convergence + its residual).

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

/** COW: land the submission on the caller's fork of the system default, minting that fork on first use.
 *  Returns the fork's detail (its id ≠ the requested one is what signals the client to retarget).
 *
 *  CONVERGENCE (the multi-tab fork-once half): the caller's EXISTING fork of the system default
 *  (`forked_from` lineage) is patched instead of minting a sibling, so two tabs editing the built-in end
 *  up in ONE fork (last write wins per field, exactly as two tabs editing one preset already do) rather
 *  than the "nine Default (edited) rows" the F5 numbering could only make legible. A second variant of the
 *  built-in is Duplicate's job (a `create`), not a second COW.
 *
 *  RESIDUAL (stated, not papered over): the lookup + insert is read-then-write, not a DB constraint — two
 *  requests that both read "no fork yet" before either inserts still mint two. The constraint that would
 *  close it (UNIQUE `(owner_id, forked_from)`) is NOT available: `clonePackaged` mints an INDEPENDENT copy
 *  of the SAME packaged template per call by contract, so uniqueness on that pair would refuse the second
 *  clone. The convergence lookup takes the OLDEST fork, so a pair minted by that race converges from the
 *  next save on. */
async function cowFork(ctx: PresetContext, params: UpdatePresetParams, now: number): Promise<PresetDetail> {
  const base = await readablePreset(ctx.db, params.userId, SYSTEM_DEFAULT_PRESET_ID);
  if (base === undefined) {
    throw new PresetNotFoundError(params.id);
  }
  const existing = await findOwnedForkOf(ctx.db, params.userId, SYSTEM_DEFAULT_PRESET_ID);
  if (existing !== undefined) {
    const converged = await updatePresetRow(ctx.db, existing.id, params.userId, buildPatch(params, now));
    if (converged === undefined) {
      throw new PresetNotFoundError(existing.id);
    }
    getLog().info({ userId: params.userId, presetId: converged.id }, "preset: copy-on-write converged onto the existing fork");
    await ctx.audit(
      {
        actorUserId: params.userId,
        action: PRESET_FORK,
        entityType: PRESET_ENTITY,
        entityId: converged.id,
        metadata: { forkedFrom: SYSTEM_DEFAULT_PRESET_ID, converged: true },
      },
      now,
    );
    ctx.emitUserEvent(params.userId, { type: "presetsChanged", presetId: converged.id });
    return toPresetDetail(converged);
  }
  const config = params.config ?? parsePromptConfig(base.config);
  const forkId = ctx.newPresetId();
  const name = uniquePresetName(params.name ?? `${base.name} (edited)`, await listOwnedPresetNames(ctx.db, params.userId));
  const row = {
    id: forkId,
    ownerId: params.userId,
    name,
    kind: params.kind ?? base.kind,
    config,
    schemaVersion: config.schemaVersion,
    forkedFrom: SYSTEM_DEFAULT_PRESET_ID,
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
      metadata: { forkedFrom: SYSTEM_DEFAULT_PRESET_ID, converged: false },
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
