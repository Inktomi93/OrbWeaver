// domain/connection/substrate/capability — the substrate MEDIATOR for the `catalog/` subsystem's
// capability factory (domain-substrate-mediates-subsystems: verbs reach a named subsystem ONLY through
// substrate). The verbs call `resolveCapability` here; it finds the OpenRouter catalog entry for the model
// in the passed-in cache snapshot and delegates to `catalog/resolveModelCapability`. PURE: the cache is
// passed in (the verb read it with `ctx.now()`), so this is deterministic + unit-testable.

import type { ChatSource, ModelCapability, ModelCatalogEntry } from "@orb/contracts/connection";
import type { ModelId } from "@orb/kit/ids";
import { resolveModelCapability } from "../catalog/resolve-model-capability";

/** Resolve the ONE `ModelCapability` for a `(model, source)`, threading the matching OR catalog entry (if
 *  any) from the passed-in cache snapshot into the synthesis arm. The single seam verbs use for the
 *  capability descriptor (no direct `catalog/` reach). */
export function resolveCapability(
  model: ModelId | string,
  source: ChatSource,
  cached: readonly ModelCatalogEntry[] | null,
): ModelCapability {
  const entry = cached?.find((m) => m.id === model);
  return resolveModelCapability(model, source, entry);
}
