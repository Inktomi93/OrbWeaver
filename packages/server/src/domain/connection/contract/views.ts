// domain/connection/contract/views — the client-facing read-models. Both are ALIASES of the cross-boundary
// contracts shapes (no re-spell, one home): the catalog endpoint ships `ModelCatalogView[]` (the OR catalog
// entries) and the params panel iterates `ModelCapabilityView` (the descriptor) — the panel renders FROM
// the descriptor, never a static knob list (connection.md invariant 10).

import type { ModelCapability, ModelCatalogEntry } from "@orb/contracts/connection";

/** The client-facing model-list entry (the model picker). Alias of the cross-boundary catalog entry. */
export type ModelCatalogView = ModelCatalogEntry;

/** The params-panel descriptor (the panel iterates THIS — honored knobs + real ranges). Alias of the
 *  cross-boundary `ModelCapability`. */
export type ModelCapabilityView = ModelCapability;
