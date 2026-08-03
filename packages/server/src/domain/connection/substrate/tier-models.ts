// domain/connection/substrate/tier-models — the substrate MEDIATOR for the `catalog/` subsystem's
// OR-skin tier-map derivation (domain-substrate-mediates-subsystems: verbs reach a named subsystem ONLY
// through substrate). The `getOrSkinTierModels` verb calls `deriveOrSkin` here; it normalizes the two
// passed-in cache snapshots (null ⇒ empty — a cold catalog degrades through the derivation's own fallback
// chain) and delegates to `catalog/deriveOrSkinTierModels`. PURE: the caches are passed in (the verb read
// them with `ctx.now()`), so this is deterministic + unit-testable.

import type { AgentSdkModel, ModelCatalogEntry } from "@orb/contracts/connection";
import { deriveOrSkinTierModels } from "../catalog/derive-or-skin-tier-models.ts";
import type { OrSkinTierModels } from "../contract/results.ts";

/** Derive the mode-2 tier→OR-slug map from the two cache snapshots. `null` (cold cache) ⇒ empty input —
 *  the derivation falls back to the curated shortlist so a mode-2 turn always gets a coherent trio. The
 *  single seam the verb uses (no direct `catalog/` reach). */
export function deriveOrSkin(cached: readonly ModelCatalogEntry[] | null, agentSdkModels: readonly AgentSdkModel[] | null): OrSkinTierModels {
  return deriveOrSkinTierModels(
    agentSdkModels ?? [],
    (cached ?? []).map((m) => m.id),
  );
}
