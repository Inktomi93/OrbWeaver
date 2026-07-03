// verbs: vllmEngines / restartVllmEngine — a thin admin-gated shell over the vLLM supervisor.
// DECIDED (PD-3, 2026-06-28): admin OWNS the engine-status surface (no separate ops-admin home). It is
// admin-gated (owner ∪ admin), then delegates to the injected VllmSupervisorPort — admin owns neither the
// supervisor nor the engine-status vocab (sealed in infra/providers; the compose root adapts the
// `VllmEngineHandle`). `vllmEngines` is a read (no audit); `restartVllmEngine` is privileged (audited).

import { DomainOperationError } from "@orb/kit/errors";
import { ADMIN_OP_CODES } from "../contract/errors";
import type { RestartVllmEngineParams, VllmEnginesParams } from "../contract/params";
import type { VllmEnginesResult } from "../contract/results";
import type { AdminContext, AdminService } from "../contract/service";
import { requireAdmin } from "../guard";

type VllmVerbs = Pick<AdminService, "vllmEngines" | "restartVllmEngine">;

export function createVllm(ctx: AdminContext): VllmVerbs {
  // The supervisor snapshot is synchronous, so the gate runs INSIDE a promise chain — a deny then surfaces
  // as a REJECTED promise (consistent with every other verb), never a synchronous throw at the call site.
  const vllmEngines: AdminService["vllmEngines"] = (params: VllmEnginesParams) =>
    Promise.resolve().then((): VllmEnginesResult => {
      requireAdmin(params.principal);
      return ctx.vllm.allEngineStatuses();
    });

  const restartVllmEngine: AdminService["restartVllmEngine"] = async (
    params: RestartVllmEngineParams,
  ) => {
    requireAdmin(params.principal);
    let status: string;
    try {
      status = await ctx.vllm.restartEngine(params.engine);
    } catch (err) {
      const failed = new DomainOperationError(
        ADMIN_OP_CODES.restartEngine,
        `failed to restart engine '${params.engine}'`,
      );
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
