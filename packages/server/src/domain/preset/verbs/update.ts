import type { PromptConfig } from "@orb/contracts/preset";
import { parsePromptConfig } from "@orb/contracts/preset";
import { getLog } from "#foundation/observability";
import { SYSTEM_DEFAULT_PRESET_ID } from "../constants";
import type { PresetContext } from "../context";
import { PresetNotFoundError } from "../contract/errors";
import type { PresetForkIntent, UpdatePresetParams } from "../contract/params";
import type { PresetService } from "../contract/service";
import type { PresetDetail } from "../contract/views";
import { findOwnedForkOf, insertPreset, listOwnedPresetNames, readablePreset, updatePresetRow } from "../persistence/queries";
import { uniquePresetName } from "../substrate/names";
import { toPresetDetail } from "../substrate/views";

// verb: update — patch an OWNED preset, or copy-on-write the system default. When the target is
// SYSTEM_DEFAULT_PRESET_ID an owned fork carries the submission and ITS id is returned — the client detects
// the id change and navigates to the fork, so editing the shared default never loses changes. That fork is
// minted once per owner and reused thereafter (`cowFork` — the `forked_from` convergence + its residual).
//
// WHICH fork carries it is the caller's `fork` INTENT (`contract/params.ts`), because only the client knows
// whether the owner was asked: absent/`converge` is the historical silent behavior (and stays the back-compat
// + race backstop), `{mode:"new", name}` mints an additional fork under that name. The owner sees the choice
// only when they ALREADY have a fork — the first edit of the built-in has nothing to forget, so it stays
// silent (`features/preset/hooks/use-preset-autosave.ts`).

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

/** One fork mint: the source row, the name asked for, and the intent that asked (the audit's discriminator). */
interface ForkMint {
  readonly params: UpdatePresetParams;
  /** The system default's own row, as the fork source. */
  readonly base: NonNullable<Awaited<ReturnType<typeof readablePreset>>>;
  readonly desiredName: string;
  readonly intent: PresetForkIntent["mode"];
  readonly now: number;
}

/** Mint a NEW owned fork of the system default carrying the submission, under `desiredName`.
 *
 *  The name is de-collided at the WRITE with `uniquePresetName` — the same mint-time numbering the derived
 *  "Default (edited)" and the client's Duplicate use (`substrate/names.ts`, visual-blech F5), so the name the
 *  owner sees is the name the row carries. It deliberately does NOT follow `verbs/import.ts`'s merge-on-name:
 *  the import is idempotent by (ownerId, name) so re-importing one backup file can't duplicate a row, whereas
 *  "start a new fork" is an explicit ask for an ADDITIONAL row — merging would silently overwrite whatever
 *  unrelated preset happened to share the name. */
async function mintFork(ctx: PresetContext, { params, base, desiredName, intent, now }: ForkMint): Promise<PresetDetail> {
  const config = params.config ?? parsePromptConfig(base.config);
  const forkId = ctx.newPresetId();
  const name = uniquePresetName(desiredName, await listOwnedPresetNames(ctx.db, params.userId));
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
  getLog().info({ userId: params.userId, presetId: forkId, intent }, "preset: copy-on-write fork of system default");
  await ctx.audit(
    {
      actorUserId: params.userId,
      action: PRESET_FORK,
      entityType: PRESET_ENTITY,
      entityId: forkId,
      metadata: { forkedFrom: SYSTEM_DEFAULT_PRESET_ID, converged: false, intent },
    },
    now,
  );
  ctx.emitUserEvent(params.userId, { type: "presetsChanged", presetId: forkId });
  return toPresetDetail(row);
}

/** COW: land the submission on the caller's fork of the system default, minting that fork on first use.
 *  Returns the fork's detail (its id ≠ the requested one is what signals the client to retarget).
 *
 *  CONVERGENCE (the multi-tab fork-once half): the caller's EXISTING fork of the system default
 *  (`forked_from` lineage) is patched instead of minting a sibling, so two tabs editing the built-in end
 *  up in ONE fork (last write wins per field, exactly as two tabs editing one preset already do) rather
 *  than the "nine Default (edited) rows" the F5 numbering could only make legible.
 *
 *  A SECOND variant of the built-in is now reachable here too — `{mode:"new"}`, the arm the client's
 *  fork-choice dialog sends when the owner picks "start a new fork" over "keep editing <fork>". It always
 *  mints: the `(owner_id, forked_from)` index is deliberately NON-unique (db/schema/preset.ts), so N forks
 *  of one source are legal and two concurrent "new" intents honestly produce two rows. (Duplicate — a plain
 *  `create` off an existing row — remains the way to branch a NON-built-in preset.)
 *
 *  RESIDUAL (stated, not papered over): the converge arm's lookup + insert is read-then-write, not a DB
 *  constraint — two requests that both read "no fork yet" before either inserts still mint two. The
 *  constraint that would close it (UNIQUE `(owner_id, forked_from)`) is NOT available: `clonePackaged` mints
 *  an INDEPENDENT copy of the SAME packaged template per call by contract, and the "new" intent above mints
 *  siblings by design, so uniqueness on that pair would refuse both. The convergence lookup takes the OLDEST
 *  fork, so a pair minted by that race converges from the next save on. */
async function cowFork(ctx: PresetContext, params: UpdatePresetParams, now: number): Promise<PresetDetail> {
  const base = await readablePreset(ctx.db, params.userId, SYSTEM_DEFAULT_PRESET_ID);
  if (base === undefined) {
    throw new PresetNotFoundError(params.id);
  }
  const intent: PresetForkIntent = params.fork ?? { mode: "converge" };
  switch (intent.mode) {
    case "new": {
      return await mintFork(ctx, { params, base, desiredName: intent.name, intent: intent.mode, now });
    }
    case "converge": {
      const existing = await findOwnedForkOf(ctx.db, params.userId, SYSTEM_DEFAULT_PRESET_ID);
      if (existing === undefined) {
        return await mintFork(ctx, { params, base, desiredName: params.name ?? `${base.name} (edited)`, intent: intent.mode, now });
      }
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
          metadata: { forkedFrom: SYSTEM_DEFAULT_PRESET_ID, converged: true, intent: intent.mode },
        },
        now,
      );
      ctx.emitUserEvent(params.userId, { type: "presetsChanged", presetId: converged.id });
      return toPresetDetail(converged);
    }
    default: {
      const _exhaustive: never = intent;
      throw new Error(`unhandled preset fork intent ${JSON.stringify(_exhaustive)}`);
    }
  }
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
