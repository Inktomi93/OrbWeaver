// verbs: vllmEngines / restartVllmEngine — a thin admin-gated shell over the vLLM supervisor. Admin owns
// neither the supervisor nor the engine-status vocab (sealed in infra/providers). vllmEngines is a read
// (no audit); restartVllmEngine is privileged (audited).

import { DomainOperationError } from "@orb/kit/errors";
import type { AdminContext } from "../context";
import { ADMIN_OP_CODES } from "../contract/errors";
import type { RestartVllmEngineParams, VllmEnginesParams } from "../contract/params";
import type { VllmEnginesResult } from "../contract/results";
import type { AdminService } from "../contract/service";
import { requireAdmin } from "../guard";

type VllmVerbs = Pick<AdminService, "vllmEngines" | "restartVllmEngine">;

export function createVllm(ctx: AdminContext): VllmVerbs {
  // The supervisor snapshot is synchronous, so the gate runs inside a promise chain — a deny surfaces
  // as a rejected promise, consistent with every other verb.
  const vllmEngines: AdminService["vllmEngines"] = (params: VllmEnginesParams) =>
    Promise.resolve().then((): VllmEnginesResult => {
      requireAdmin(params.principal);
      return ctx.vllm.allEngineStatuses();
    });

  const restartVllmEngine: AdminService["restartVllmEngine"] = async (params: RestartVllmEngineParams) => {
    requireAdmin(params.principal);
    let status: string;
    try {
      status = await ctx.vllm.restartEngine(params.engine);
    } catch (err) {
      const failed = new DomainOperationError(ADMIN_OP_CODES.restartEngine, `failed to restart engine '${params.engine}'`);
      failed.cause = err;
      throw failed;
    }
    await ctx.audit(
      {
        actorUserId: params.principal.userId,
        action: "admin.restartVllmEngine",
        entityType: "vllm_engine",
        entityId: params.engine,
        metadata: { status },
      },
      ctx.now(),
    );
    return status;
  };

  return { vllmEngines, restartVllmEngine };
}
