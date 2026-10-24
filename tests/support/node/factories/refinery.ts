// The Refinery row and result shapes; the reads that return them live in the rows tier (`rows/refinery.ts`).

import type { refineryRuns, refinerySchemas, refinerySessions } from "@orb/db";

export type RefinerySessionRow = typeof refinerySessions.$inferSelect;
export type RefinerySchemaRow = typeof refinerySchemas.$inferSelect;
export type RefineryRunRow = typeof refineryRuns.$inferSelect;
