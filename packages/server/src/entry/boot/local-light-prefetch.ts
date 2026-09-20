// Boot step: decide WHICH local-light model slots this box should warm after the listener binds. The
// DOWNLOAD itself is the runtime's (`@orb/inference` local-light `prefetch`); this file is the half that
// needs a RESOLVE — which is why it lives in entry: only the runtime's binding fold knows whether a task
// lands on the in-process tier or on a hosted/endpoint row for a given user (inference program §8.3).
//
// THE RULE: warm a slot ONLY when a task ACTUALLY resolves to a local-light connection. A box whose vector
// tasks run on vLLM or OpenRouter downloads nothing — its weights would be dead bytes, and an unexplained
// multi-GB fetch on a GPU box is worse than a lazy one. `matte` (RMBG-1.4) has no task to resolve — the
// alpha-matte op is local-light-only by construction (expressions-design/03 §4.1) — so it rides the same
// verdict: warmed only on a box already committed to the in-process tier, never as an unconditional download.
//
// WHOSE bindings: the boot passes the principals it can honestly ask for (today the box owner; a user-less
// OIDC box has none and keeps the lazy path — §15c). The plan is ORDERED by `LOCAL_LIGHT_MODEL_SLOTS`
// (smallest weights first) because the prefetch walks it sequentially; that order has ONE home.

import type { Principal } from "@orb/contracts/identity";
import type { RoutableTask } from "@orb/contracts/inference";
import type { InferenceRuntime, LocalLightModelSlot, LocalLightPrefetchTarget } from "@orb/inference";
import { DEFAULT_MATTE_MODEL, LOCAL_LIGHT_MODEL_SLOTS, NoConnectionError } from "@orb/inference";
import { getLog } from "#foundation/observability";

const LOCAL_LIGHT_PROVIDER_ID = "local-light";

/** Which tasks feed which prefetch slot. `embed` and `imageEmbed` share ONE slot on purpose: they are the same
 *  jina-clip-v2 weights (one joint text↔image space), so warming them separately would be the same download
 *  twice — the first of them that lands on local-light claims the slot. `matte` has no task; see the header. */
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
async function localLightModelFor(deps: LocalLightPrefetchPlanDeps, principal: Principal, task: RoutableTask): Promise<string | null> {
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
async function firstLocalLightModel(deps: LocalLightPrefetchPlanDeps, principal: Principal, tasks: readonly RoutableTask[]): Promise<string | null> {
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
  const bySlot = new Map<LocalLightModelSlot, string>();
  for (const principal of deps.principals) {
    for (const { slot, tasks } of TASK_SLOTS) {
      const modelId = bySlot.has(slot) ? null : await firstLocalLightModel(deps, principal, tasks);
      if (modelId !== null) {
        bySlot.set(slot, modelId);
      }
    }
  }
  // Gated on the verdict above, never unconditional (header): no task on the in-process tier ⇒ this box is
  // not a local-light box, and the matte model is 176 MB it would download for nothing.
  if (bySlot.size > 0) {
    bySlot.set("matte", DEFAULT_MATTE_MODEL);
  }
  return LOCAL_LIGHT_MODEL_SLOTS.flatMap((slot: LocalLightModelSlot) => {
    const modelId = bySlot.get(slot);
    return modelId === undefined ? [] : [{ slot, modelId }];
  });
}
