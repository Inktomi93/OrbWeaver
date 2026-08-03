// verb: readProvenance — read one generated image's durable provenance by asset (doc 04 §3). The gallery
// detail (prompt/model/cost) + the regenerate affordance (re-run with the stored prompt) both read it; rpg's
// generative layer (R9) consumes the same verb. Owner-scoped INSIDE the query (the `assets` join gates on
// `ownerId`) — a foreign or provenance-less asset returns `null`, never a leak. A pure read: no audit, no emit.

import type { ImageryContext, ImageryService } from "../contract/service.ts";
import { readProvenanceByAsset } from "../persistence/queries.ts";

export function createReadProvenance(ctx: ImageryContext): ImageryService["readProvenance"] {
  return (p) => readProvenanceByAsset(ctx.db, p.caller.userId, p.assetId);
}
