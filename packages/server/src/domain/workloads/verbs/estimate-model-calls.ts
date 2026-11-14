// verb: estimateModelCalls — how many Utility-model calls a run WOULD make, asked before a person confirms a
// library-wide paid run. It resolves the run's scope exactly as `start` does (same mode gate, same bulk owner
// check) and asks the owning domain to count; it writes nothing and enqueues nothing. Its retry twin counts the
// row a retry would clone, under that row's owner, because a retry re-runs the original scope, not the caller's.
// A chained confirm names the stages that run first (`after`): each is parsed, gated and counted exactly as its own
// estimate would be, and only its count travels on, so a stage that grows the next one's input can say so. Naming a
// stage here starts, authorizes and stores nothing.

import type { EveryOwnerEstimate, ModelCallEstimate, PriorStageCount, StartWorkloadInput } from "@orb/contracts/workloads";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { EstimateModelCallsParams, EstimateRetryModelCallsParams } from "../contract/params.ts";
import type { WorkloadService, WorkloadServiceContext } from "../contract/service.ts";
import { loadWorkload } from "../persistence/queries.ts";
import { canCloneRow, mayActOnRow, resolveRunOwner } from "../substrate/authorize.ts";
import { admissionRefusal, assertRunAuthority, countModelCalls, parseWorkloadInput, runAccount } from "../substrate/params.ts";

const ENTITY = "workload";

export function createEstimateModelCalls(ctx: WorkloadServiceContext): Pick<WorkloadService, "estimateModelCalls" | "estimateRetryModelCalls"> {
  async function estimateStage(params: EstimateModelCallsParams, stage: StartWorkloadInput, before: readonly PriorStageCount[]): Promise<ModelCallEstimate> {
    const contributions = ctx.getContributions();
    const input = await parseWorkloadInput(ctx, { caller: params.caller, account: params.caller.userId }, stage);
    const ownerId = resolveRunOwner(ctx.requireOwner, { ...params, ownerId: params.caller.userId }, input.kind);
    // A run `start` would turn away makes no calls, so the confirm must not quote some.
    if (params.assumeAdmitted !== true && (await admissionRefusal(contributions, input.kind, input.params, ownerId)) !== null) {
      return { calls: 0, bound: "exact" };
    }
    return await countModelCalls(
      contributions,
      input.kind,
      input.params,
      ownerId === null
        ? { ownerId: null, everyOwnerEstimate: Object.freeze({}) as EveryOwnerEstimate, funderUserId: params.caller.userId, before }
        : { ownerId, funderUserId: params.caller.userId, before },
    );
  }

  async function estimateModelCalls(params: EstimateModelCallsParams): Promise<ModelCallEstimate> {
    const before: PriorStageCount[] = [];
    for (const stage of params.after ?? []) {
      before.push({ kind: stage.kind, calls: (await estimateStage(params, stage, before)).calls });
    }
    return await estimateStage(params, params.input, before);
  }

  // The same gates `retry` applies before it clones: a row the caller cannot see is leak-free NOT_FOUND, and a bulk
  // row, or any row the box owner owns or funds, is the box owner's alone (a non-owner gets the same NOT_FOUND). A
  // POISON row has no params to count, so it answers `null` like a kind that makes no model call. A row the owning domain would no longer admit makes no
  // calls. Funding remains the original admission, never the retrying caller.
  async function estimateRetryModelCalls(params: EstimateRetryModelCallsParams): Promise<ModelCallEstimate> {
    const contributions = ctx.getContributions();
    const original = await loadWorkload(ctx.db, { contributions, logger: ctx.logger }, params.id, (access) => canCloneRow(ctx, params.caller, access));
    if (original === null || !(await mayActOnRow(ctx, params.caller, original))) {
      throw new DomainNotFoundError(ENTITY, params.id);
    }
    if (original.poison) {
      return { calls: null, bound: "exact" };
    }
    await assertRunAuthority(
      { contributions, isBoxOwner: ctx.isBoxOwner, isAccountEnabled: ctx.isAccountEnabled },
      { caller: params.caller, account: runAccount(original) },
      original.kind,
      original.params,
    );
    if ((await admissionRefusal(contributions, original.kind, original.params, original.ownerId)) !== null) {
      return { calls: 0, bound: "exact" };
    }
    // A retry clones one row; the chain that once ran ahead of it has already run, so nothing precedes it now.
    return await countModelCalls(
      contributions,
      original.kind,
      original.params,
      original.ownerId === null
        ? { ownerId: null, everyOwnerEstimate: Object.freeze({}) as EveryOwnerEstimate, funderUserId: original.funderUserId, before: [] }
        : { ownerId: original.ownerId, funderUserId: original.funderUserId, before: [] },
    );
  }

  return { estimateModelCalls, estimateRetryModelCalls };
}
