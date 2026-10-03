// verb: estimateModelCalls — how many Utility-model calls a run WOULD make, asked before a person confirms a
// library-wide paid run. It resolves the run's scope exactly as `start` does (same mode gate, same bulk owner
// check) and asks the owning domain to count; it writes nothing and enqueues nothing. Its retry twin counts the
// row a retry would clone, under that row's owner, because a retry re-runs the original scope, not the caller's.

import type { ModelCallEstimate } from "@orb/contracts/workloads";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { EstimateModelCallsParams, EstimateRetryModelCallsParams } from "../contract/params.ts";
import type { WorkloadService, WorkloadServiceContext } from "../contract/service.ts";
import { loadWorkload } from "../persistence/queries.ts";
import { isVisibleToCaller, resolveRunOwner } from "../substrate/authorize.ts";
import { countModelCalls, parseWorkloadInput } from "../substrate/params.ts";

const ENTITY = "workload";

export function createEstimateModelCalls(ctx: WorkloadServiceContext): Pick<WorkloadService, "estimateModelCalls" | "estimateRetryModelCalls"> {
  async function estimateModelCalls(params: EstimateModelCallsParams): Promise<ModelCallEstimate> {
    const contributions = ctx.getContributions();
    const input = parseWorkloadInput(contributions, params.input);
    const ownerId = resolveRunOwner(ctx.requireOwner, { ...params, ownerId: params.caller.userId }, input.kind);
    return { calls: await countModelCalls(contributions, input.kind, input.params, { ownerId, funderUserId: params.caller.userId }) };
  }

  // The same gates `retry` applies before it clones: a row the caller cannot see is leak-free NOT_FOUND, and a bulk
  // row is the box owner's alone. A POISON row has no params to count, so it answers `null` like a kind that makes
  // no model call. The funder is the row's owner, whose model the runner spends; a bulk sweep has none, so the
  // person retrying it is the funder, as `start` counts it.
  async function estimateRetryModelCalls(params: EstimateRetryModelCallsParams): Promise<ModelCallEstimate> {
    const contributions = ctx.getContributions();
    const original = await loadWorkload(ctx.db, contributions, params.id);
    if (original === null || !isVisibleToCaller(ctx.isAdmin, params.caller, original.ownerId)) {
      throw new DomainNotFoundError(ENTITY, params.id);
    }
    if (original.mode === "bulk") {
      ctx.requireOwner(params.caller);
    }
    if (original.poison) {
      return { calls: null };
    }
    return {
      calls: await countModelCalls(contributions, original.kind, original.params, {
        ownerId: original.ownerId,
        funderUserId: original.ownerId ?? params.caller.userId,
      }),
    };
  }

  return { estimateModelCalls, estimateRetryModelCalls };
}
