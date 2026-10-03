// verb: estimateModelCalls — how many Utility-model calls a run WOULD make, asked before a person confirms a
// library-wide paid run. It resolves the run's scope exactly as `start` does (same mode gate, same bulk owner
// check) and asks the owning domain to count; it writes nothing and enqueues nothing.

import type { ModelCallEstimate } from "@orb/contracts/workloads";
import type { EstimateModelCallsParams } from "../contract/params.ts";
import type { WorkloadService, WorkloadServiceContext } from "../contract/service.ts";
import { resolveRunOwner } from "../substrate/authorize.ts";
import { countModelCalls, parseWorkloadInput } from "../substrate/params.ts";

export function createEstimateModelCalls(ctx: WorkloadServiceContext): Pick<WorkloadService, "estimateModelCalls"> {
  async function estimateModelCalls(params: EstimateModelCallsParams): Promise<ModelCallEstimate> {
    const contributions = ctx.getContributions();
    const input = parseWorkloadInput(contributions, params.input);
    const ownerId = resolveRunOwner(ctx.requireOwner, { ...params, ownerId: params.caller.userId }, input.kind);
    return { calls: await countModelCalls(contributions, input.kind, input.params, { ownerId, funderUserId: params.caller.userId }) };
  }
  return { estimateModelCalls };
}
