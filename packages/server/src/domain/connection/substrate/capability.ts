// domain/connection/substrate/capability — the substrate MEDIATOR for the `catalog/` subsystem's
// capability factory (domain-substrate-mediates-subsystems: verbs reach a named subsystem ONLY through
// substrate). The verbs call `resolveCapability` here; it finds the OpenRouter catalog entry for the model
// in the passed-in cache snapshot and delegates to `catalog/resolveModelCapability`. PURE: the cache is
// passed in (the verb read it with `ctx.now()`), so this is deterministic + unit-testable.

import type { ComfyuiWorkflowCapability } from "@orb/contracts/comfyui-workflow";
import { BYO_MODEL_PREFIX } from "@orb/contracts/comfyui-workflow";
import type { AgentSdkModel, ChatApi, CredentialSource, ModelCapability, ModelCatalogEntry } from "@orb/contracts/connection";
import type { ModelId, UserId } from "@orb/kit/ids";
import { applyByoWorkflowCapability, resolveModelCapability } from "../catalog/resolve-model-capability";

/** Resolve the ONE `ModelCapability` for a `(model, source, api)`, threading the matching OR catalog entry
 *  (if any) into the synthesis arm AND the cached agent-sdk daemon rows into the max-pro-sub family→version
 *  arm. `api` drives the wire-shape the `turns` cell keys on (D66, part 01 §3). Both caches are passed in
 *  (the verb read them with `ctx.now()`), so this stays pure + deterministic. The single seam verbs use for
 *  the capability descriptor (no direct `catalog/` reach). */
export function resolveCapability(
  model: ModelId | string,
  source: CredentialSource,
  api: ChatApi,
  caches: {
    readonly cached: readonly ModelCatalogEntry[] | null;
    readonly agentSdkModels: readonly AgentSdkModel[] | null;
    /** The custom_openai credential's user-declared context window, threaded from `resolveRole` (the real
     *  turn path holds the resolved credential); undefined on the credential-free panel-preview path. */
    readonly customContextWindow?: number | undefined;
  },
): ModelCapability {
  const entry = caches.cached?.find((m) => m.id === model);
  return resolveModelCapability(model, source, api, {
    orEntry: entry,
    agentSdkModels: caches.agentSdkModels,
    customContextWindow: caches.customContextWindow,
  });
}

/** The `byo:<name>` capability fold (N1 — comfyui-control §4.11.2c): for a `comfyui` source whose model is a
 *  `byo:<name>` selection, resolve the caller's saved workflow (owner-scoped, via the injected reader) and fold
 *  its DERIVED edit/knob capability onto the static `comfyui` base — so a workflow declaring `%init_image%`/
 *  `%mask%`/`%reference_image%` resolves edit-capable (the edit belt binds through the runner instead of the
 *  edit dropping / `editImage` throwing), and a workflow with NO edit placeholders stays honestly non-edit.
 *  Any non-`byo:` comfyui model (raw checkpoint / `orbgen:`) or non-comfyui source returns the base unchanged.
 *  The single seam `resolveRole` uses to enrich a `byo:` descriptor — no direct `catalog/` reach. */
export async function resolveByoCapability(req: {
  readonly base: ModelCapability;
  readonly model: ModelId | string;
  readonly source: CredentialSource;
  readonly ownerId: UserId;
  readonly resolveByoWorkflowCapability: (ownerId: UserId, name: string) => Promise<ComfyuiWorkflowCapability | null>;
}): Promise<ModelCapability> {
  if (req.source !== "comfyui" || !req.model.startsWith(BYO_MODEL_PREFIX)) {
    return req.base;
  }
  const name = req.model.slice(BYO_MODEL_PREFIX.length);
  const capability = await req.resolveByoWorkflowCapability(req.ownerId, name);
  return applyByoWorkflowCapability(req.base, capability);
}
