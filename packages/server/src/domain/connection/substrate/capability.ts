// domain/connection/substrate/capability — the substrate MEDIATOR for the `catalog/` subsystem's
// capability factory (domain-substrate-mediates-subsystems: verbs reach a named subsystem ONLY through
// substrate). The verbs call `resolveCapability` here; it finds the OpenRouter catalog entry for the model
// in the passed-in cache snapshot and delegates to `catalog/resolveModelCapability`. PURE: the cache is
// passed in (the verb read it with `ctx.now()`), so this is deterministic + unit-testable.

import type {
  AgentSdkModel,
  ChatApi,
  ChatSource,
  ModelCapability,
  ModelCatalogEntry,
} from "@orb/contracts/connection";
import type { ModelId } from "@orb/kit/ids";
import { resolveModelCapability } from "../catalog/resolve-model-capability";

/** Resolve the ONE `ModelCapability` for a `(model, source, api)`, threading the matching OR catalog entry
 *  (if any) into the synthesis arm AND the cached agent-sdk daemon rows into the max-pro-sub family→version
 *  arm. `api` drives the wire-shape the `turns` cell keys on (D66, part 01 §3). Both caches are passed in
 *  (the verb read them with `ctx.now()`), so this stays pure + deterministic. The single seam verbs use for
 *  the capability descriptor (no direct `catalog/` reach). */
export function resolveCapability(
  model: ModelId | string,
  source: ChatSource,
  api: ChatApi,
  caches: {
    readonly cached: readonly ModelCatalogEntry[] | null;
    readonly agentSdkModels: readonly AgentSdkModel[] | null;
  },
): ModelCapability {
  const entry = caches.cached?.find((m) => m.id === model);
  return resolveModelCapability(model, source, api, {
    orEntry: entry,
    agentSdkModels: caches.agentSdkModels,
  });
}
