// domain/workloads/substrate/shim-contributions — TRANSITIONAL (the junk-drawer exit, stage A → D).
//
// The engine now dispatches through the injected `WorkloadContributions` registry. Until every kind has been
// re-homed as a real contribution in its OWNING domain, this adapter wraps the surviving `runners/` over the
// old `WorkloadRunnerEnv` hub so each kind behaves byte-identically while the ownership moves land stage by
// stage. It is DELETED with `runners/` + `runner-env.ts` in the final stage — nothing new may be added here.
//
// Every shimmed kind is `sweep`/`idempotent-restart`: the lanes are not live yet (one worker loop, exactly as
// before), and every current runner is safe to re-run whole.

import type { WorkloadLane, WorkloadResultByKind, WorkloadResumePolicy } from "@orb/contracts/workloads";
import {
  databankIngestWorkloadParams,
  databankReindexWorkloadParams,
  emptyWorkloadParams,
  importBundleWorkloadParams,
  importStWorkloadParams,
  maintenanceWorkloadParams,
} from "@orb/contracts/workloads";
import type { z } from "zod";
import type { AnyWorkloadContribution, WorkloadContribution } from "../contract/contribution";
import type { Runner, ShimmedKind } from "../contract/runner";
import type { ShimContributionDeps, WorkloadRunnerContext } from "../contract/service";
import { RUNNERS } from "./dispatch";

const SHIM_LANE: WorkloadLane = "sweep";
const SHIM_RESUME: WorkloadResumePolicy = "idempotent-restart";

/** Adapt ONE surviving runner onto the contribution seam: rebuild its old context per dispatch, then call it. */
function shim<K extends ShimmedKind>(deps: ShimContributionDeps, kind: K, params: WorkloadContribution<K>["params"]): WorkloadContribution<K> {
  return {
    kind,
    params,
    lane: SHIM_LANE,
    resume: SHIM_RESUME,
    run: async (ctx, runParams, report, signal): Promise<WorkloadResultByKind[K]> => {
      const runnerCtx: WorkloadRunnerContext = {
        userId: ctx.userId,
        ownerId: ctx.ownerId,
        roleClients: await deps.bindRoleClients(ctx.userId),
        loadUserSettings: () => deps.loadUserSettings(ctx.userId),
        env: deps.env,
        now: ctx.now,
      };
      return await (RUNNERS[kind] as unknown as Runner<K>)(runnerCtx, runParams, report, signal);
    },
  };
}

/** The empty-params schema, typed for a kind whose params are `{}`. */
const empty = emptyWorkloadParams as z.ZodType<Record<string, never>>;

/** The still-unmoved kinds, adapted onto the seam. Shrinks to nothing as the ownership moves land. */
export function buildShimContributions(deps: ShimContributionDeps): readonly AnyWorkloadContribution[] {
  return [
    shim(deps, "memory-backfill", empty),
    shim(deps, "group-character-backfill", empty),
    shim(deps, "assets-backfill", maintenanceWorkloadParams),
    shim(deps, "assets-gc", maintenanceWorkloadParams),
    shim(deps, "assets-fsck", empty),
    shim(deps, "import-st", importStWorkloadParams),
    shim(deps, "import-bundle", importBundleWorkloadParams),
    shim(deps, "reconcile-world-state", empty),
    shim(deps, "databank-ingest", databankIngestWorkloadParams),
    shim(deps, "databank-reindex", databankReindexWorkloadParams),
  ];
}
