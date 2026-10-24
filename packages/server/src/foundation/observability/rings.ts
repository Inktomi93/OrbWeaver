// The in-memory flight recorders one composition root owns: its logger feeds the log ring, its request middleware
// the request ring, its request roots the trace ring, and its /api/_debug surface and bug report read them.
// ASSUMES(single-replica): an admin browsing /api/_debug on a multi-replica deploy sees only the replica they hit.

import { createBoundedRing } from "@orb/kit/bounded-ring";
import type { ObservabilityRings } from "./contract/logging.ts";
import { createTraceRing } from "./tracing.ts";

export type { ObservabilityRings } from "./contract/logging.ts";

const LOG_RING_CAPACITY = 2000;
const REQUEST_RING_CAPACITY = 500;

/** A root's empty rings; the composition root builds them once and hands the same object to every writer and reader. */
export function createObservabilityRings(): ObservabilityRings {
  return {
    logs: createBoundedRing(LOG_RING_CAPACITY),
    requests: createBoundedRing(REQUEST_RING_CAPACITY),
    traces: createTraceRing(),
  };
}
