// Boot step: decide WHICH local-light model slots this box should warm after the listener binds. The
// DOWNLOAD itself is infra's (`infra/providers/backends/local-light/prefetch.ts`); this file is the half
// that needs a domain read, which is why it lives in entry — infra may not import `domain/connection`, and
// the decision is not infra's to make: only the resolver knows whether embed/rerank land on the in-process
// tier or on vLLM/a cloud gateway for THIS box's owner.
//
// THE RULE: warm a slot ONLY when the resolver actually routes work to local-light for it. A box whose derive
// roles run on vLLM downloads nothing — its weights would be dead bytes, and an unexplained multi-GB fetch on
// a GPU box is worse than a lazy one. `matte` (RMBG-1.4) has no PROVIDER_ROLE to resolve — the alpha-matte op
// is local-light-only by construction (expressions-design/03 §4.1) — so it rides the same verdict: warmed
// only on a box already committed to the in-process tier, never as an unconditional download.
//
// The plan is ORDERED by `LOCAL_LIGHT_MODEL_SLOTS` (smallest weights first) because the prefetch walks it
// sequentially; that order has ONE home, in the model cache, and is not re-spelled here.

import type { RoutingRoleKey } from "@orb/contracts/connection";
import type { Principal } from "@orb/contracts/identity";
import type { ConnectionService } from "#domain/connection";
import { getLog } from "#foundation/observability";
import type { LocalLightModelSlot, LocalLightPrefetchTarget } from "#infra/providers";
import { DEFAULT_EMBED_MODEL, DEFAULT_IMAGE_EMBED_MODEL, DEFAULT_MATTE_MODEL, DEFAULT_RERANK_MODEL, LOCAL_LIGHT_MODEL_SLOTS } from "#infra/providers";

/** Which provider roles feed which prefetch slot, each with the builtin it falls back to when the resolver
 *  reports the config-derived empty model id. `embed` and `imageEmbed` share ONE slot on purpose: they are
 *  the same jina-clip-v2 weights (one joint text↔image space), so warming them separately would be the same
 *  3.5 GB twice — the first of them that lands on local-light claims the slot. `matte` has no role at all;
 *  see the header. */
const ROLE_SLOTS: readonly {
  readonly slot: LocalLightModelSlot;
  readonly roles: readonly { readonly role: RoutingRoleKey; readonly fallback: string }[];
}[] = [
  { slot: "rerank", roles: [{ role: "rerank", fallback: DEFAULT_RERANK_MODEL }] },
  {
    slot: "embed",
    roles: [
      { role: "embed", fallback: DEFAULT_EMBED_MODEL },
      { role: "imageEmbed", fallback: DEFAULT_IMAGE_EMBED_MODEL },
    ],
  },
];

export interface LocalLightPrefetchPlanDeps {
  /** The resolver, read as the box owner — the same verb a turn/search uses, so the plan cannot disagree
   *  with what the first real request will pick. */
  readonly resolveRole: ConnectionService["resolveRole"];
  /** The box owner's Principal. There is no other honest principal at boot, and a box with no owner yet
   *  (a fresh OIDC deploy) simply has no plan until someone logs in. */
  readonly principal: Principal;
  /** `LOCAL_LIGHT_PREFETCH` — `false` short-circuits to an empty plan (nothing published, nothing logged). */
  readonly enabled: boolean;
}

/** Resolve one role and report the local-light model it would use, or `null` when it lands elsewhere. A
 *  resolver THROW (no credential, an incoherent stored pin) is "not local-light" — the prefetch is an
 *  optimization and must never be the thing that fails a boot. */
async function localLightModelForRole(deps: LocalLightPrefetchPlanDeps, role: RoutingRoleKey, fallback: string): Promise<string | null> {
  try {
    const resolved = await deps.resolveRole({ role, principal: deps.principal });
    if (resolved.credential.source !== "local-light") {
      return null;
    }
    // A config-derived source persists "" for its model (the engine serves what it was launched with), so an
    // empty id here is the NORMAL shape, not a defect — it means "the builtin", exactly as the role file's
    // own `resolveModelId` reads it.
    return resolved.model.trim().length > 0 ? resolved.model : fallback;
    // @orb-waive caught-failure-ownership(err): DELIBERATE fail-closed. The owner of a resolver failure is the REQUEST that hits it — this is a speculative pre-warm asking a question it is allowed not to get an answer to, and the only consequence of `null` here is that the box keeps the lazy path it had before this file existed. Surfaced as a structured log naming the role + reason. Ends if the prefetch ever becomes required for correctness rather than latency.
  } catch (err) {
    getLog().debug({ role, err: err instanceof Error ? err.message : String(err) }, "local-light prefetch: role did not resolve; not prefetching it");
    return null;
  }
}

/** Build the ordered warm-up plan for this boot. Empty ⇒ schedule nothing at all. */
export async function planLocalLightPrefetch(deps: LocalLightPrefetchPlanDeps): Promise<readonly LocalLightPrefetchTarget[]> {
  if (!deps.enabled) {
    return [];
  }
  const bySlot = new Map<LocalLightModelSlot, string>();
  for (const { slot, roles } of ROLE_SLOTS) {
    for (const { role, fallback } of roles) {
      if (bySlot.has(slot)) {
        break;
      }
      const modelId = await localLightModelForRole(deps, role, fallback);
      if (modelId !== null) {
        bySlot.set(slot, modelId);
      }
    }
  }
  // Gated on the verdict above, never unconditional (header): no role on the in-process tier ⇒ this box is
  // not a local-light box, and the matte model is 176 MB it would download for nothing.
  if (bySlot.size > 0) {
    bySlot.set("matte", DEFAULT_MATTE_MODEL);
  }
  return LOCAL_LIGHT_MODEL_SLOTS.flatMap((slot: LocalLightModelSlot) => {
    const modelId = bySlot.get(slot);
    return modelId === undefined ? [] : [{ slot, modelId }];
  });
}
