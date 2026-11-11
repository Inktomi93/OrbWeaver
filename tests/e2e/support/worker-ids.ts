// One seeded id band per Playwright worker, so a worker started after a failure never repeats an id an earlier
// worker drew in the same run. Imports nothing run-scoped, so the surface walk's own runner can load it.

import type { SeededIds } from "@orb/testkit/iso";
import { createSeededIds, FIXTURE_ID_CURSOR } from "@orb/testkit/iso";

/** How many seeded ids one worker may draw before it reaches the next worker's band. */
const WORKER_ID_BAND = 2 ** 16;

/** The seeded id source for one worker's band. */
export function workerIds(workerIndex: number): SeededIds {
  return createSeededIds(FIXTURE_ID_CURSOR + workerIndex * WORKER_ID_BAND);
}
