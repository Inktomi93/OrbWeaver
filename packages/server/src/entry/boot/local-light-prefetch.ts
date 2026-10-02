// Prefetch only slots that resolve to local-light for an available principal.
// The shared image/text encoder warms once; tuple order keeps downloads sequential.
// Resolver failures preserve lazy loading and never fail boot.

import type { Principal } from "@orb/contracts/identity";
import type { RoutableTask } from "@orb/contracts/inference";
import type { InferenceRuntime, LocalLightModelSlot, LocalLightPrefetchTarget } from "@orb/inference";
import { LOCAL_LIGHT_MODEL_SLOTS, NoConnectionError } from "@orb/inference";
import type { ModelId } from "@orb/kit/ids";
import { getLog } from "#foundation/observability";

const LOCAL_LIGHT_PROVIDER_ID = "local-light";

/** Which tasks feed which prefetch slot. `embed` and `imageEmbed` share ONE slot on purpose: they are the same
 *  jina-clip-v2 weights (one joint text↔image space), so warming them separately would be the same download
 *  twice — the first of them that lands on local-light claims the slot. */
const TASK_SLOTS: readonly { readonly slot: LocalLightModelSlot; readonly tasks: readonly RoutableTask[] }[] = [
  { slot: "rerank", tasks: ["rerank"] },
  { slot: "embed", tasks: ["embed", "imageEmbed"] },
];

export interface LocalLightPrefetchPlanDeps {
  /** The runtime's resolve — the SAME fold a search uses, so the plan cannot disagree with the first request. */
  readonly resolve: InferenceRuntime["resolve"];
  /** The principals whose bindings the plan reads (the box owner at boot; empty ⇒ no plan). */
  readonly principals: readonly Principal[];
  /** `LOCAL_LIGHT_PREFETCH` — `false` short-circuits to an empty plan (nothing published, nothing logged). */
  readonly enabled: boolean;
}

/** Resolve one task for one principal and report the local-light model it would use, or `null` when it lands
 *  elsewhere or nowhere. `no-connection` is the ordinary "not local-light" answer here; any OTHER resolver
 *  failure is logged and treated the same — the prefetch is an optimization and must never fail a boot. */
async function localLightModelFor(deps: LocalLightPrefetchPlanDeps, principal: Principal, task: RoutableTask): Promise<ModelId | null> {
  try {
    const { resolved } = await deps.resolve({ task, principal });
    return resolved.provider.id === LOCAL_LIGHT_PROVIDER_ID ? resolved.model : null;
    // @orb-waive caught-failure-ownership(err): DELIBERATE fail-closed. The owner of a resolver failure is the REQUEST that hits it — this is a speculative pre-warm asking a question it is allowed not to get an answer to, and the only consequence of `null` here is that the box keeps the lazy path it had before this file existed. `no-connection` is the ordinary answer; anything else is surfaced as a structured log naming the task + reason. Ends if the prefetch ever becomes required for correctness rather than latency.
  } catch (err) {
    if (!(err instanceof NoConnectionError)) {
      getLog().debug(
        { task, userId: principal.userId, err: err instanceof Error ? err.message : String(err) },
        "local-light prefetch: task did not resolve; not prefetching it",
      );
    }
    return null;
  }
}

/** The first of a slot's tasks that lands on local-light for this principal claims the slot (header). */
async function firstLocalLightModel(deps: LocalLightPrefetchPlanDeps, principal: Principal, tasks: readonly RoutableTask[]): Promise<ModelId | null> {
  for (const task of tasks) {
    const modelId = await localLightModelFor(deps, principal, task);
    if (modelId !== null) {
      return modelId;
    }
  }
  return null;
}

/** Build the ordered warm-up plan for this boot. Empty ⇒ schedule nothing at all. */
export async function planLocalLightPrefetch(deps: LocalLightPrefetchPlanDeps): Promise<readonly LocalLightPrefetchTarget[]> {
  if (!deps.enabled) {
    return [];
  }
  const bySlot = new Map<LocalLightModelSlot, ModelId>();
  for (const principal of deps.principals) {
    for (const { slot, tasks } of TASK_SLOTS) {
      const modelId = bySlot.has(slot) ? null : await firstLocalLightModel(deps, principal, tasks);
      if (modelId !== null) {
        bySlot.set(slot, modelId);
      }
    }
  }
  return LOCAL_LIGHT_MODEL_SLOTS.flatMap((slot: LocalLightModelSlot) => {
    const modelId = bySlot.get(slot);
    return modelId === undefined ? [] : [{ slot, modelId }];
  });
}
