// domain/connection/contract/results — verb result shapes. `CatalogSnapshot` is the get/refresh result;
// its entries are `ModelCatalogEntry` (the cross-boundary entry, @orb/contracts/connection). The schema is
// the TIGHTENED read-seam parse — connection.md Esoteric §7: neo's blind `value as ModelCatalogSnapshot`
// after a `.loose()` parse is REPLACED by an explicit `z.object` whose inferred type IS `CatalogSnapshot`,
// so a new required field is a compile error at the producer, not a silent pass.

import { modelCatalogEntrySchema } from "@orb/contracts/connection";
import { z } from "zod";

/** The persisted OR catalog snapshot (`settings['openrouter-model-catalog']`). `fetchedAt` is the epoch-ms
 *  the fetch ran (the TTL is measured from it). The schema mirrors the shape EXACTLY (no `.loose()` blind
 *  cast) so the read-seam parse is honest. */
export const catalogSnapshotSchema = z.object({
  fetchedAt: z.number(),
  models: z.array(modelCatalogEntrySchema),
});

/** The get/refresh result — the snapshot connection holds. Inferred from the schema (one home, no drift). */
export type CatalogSnapshot = z.infer<typeof catalogSnapshotSchema>;
