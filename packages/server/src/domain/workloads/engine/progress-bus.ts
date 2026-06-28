// domain/workloads/engine/progress-bus — the per-process lifecycle/progress bus: a single `EventEmitter` +
// a per-workload replay ring (consumes `@orb/kit/replay-buffer`). The tRPC SSE subscription + the buddy
// observer fan out from here; the replay closes the gap where a subscription opening AFTER `start()` returns
// would miss the initial `started`/`progress` events.
//
// ASSUMES(single-replica): the emitter + replay ring are MODULE-SCOPE, per-process — a multi-replica deploy
// would NOT fan events across replicas (the partial unique index handles CLAIM correctness, but the bus does
// not handle cross-replica OBSERVABILITY). This is the documented seam to replace with a shared pub/sub
// (Redis/Postgres LISTEN) iff multi-replica ever ships (workloads.md invariant #9 / esoteric #4).
//
// DETERMINISM: the replay TTL clock is the EVENT-TIME domain — `() => busClock`, the max `at` an emitted
// event carried (the engine stamps `at` from the INJECTED clock). So the bus uses NO ambient `Date.now()`;
// a deterministic test that advances the frozen clock also advances the replay TTL coherently.

import { EventEmitter } from "node:events";
import { DomainOperationError } from "@orb/kit/errors";
import type { WorkloadId } from "@orb/kit/ids";
import { createReplayBuffer } from "@orb/kit/replay-buffer";
import type { WorkloadEvent } from "../contract/workload-events";

// Cap subscription leaks (each open SSE/observer adds a listener). 256 mirrors neo's cap.
const MAX_LISTENERS = 256;
// How long a workload's events stay replayable for a late subscriber (event-time ms).
const REPLAY_TTL_MS = 60_000;
// The single channel every event rides (the subscription filters by `workloadId` on the payload).
const WORKLOAD_EVENT_CHANNEL = "workload";

/** The single per-process emitter the worker emits onto + the SSE/observer subscribe to. */
export const workloadStreamEmitter = new EventEmitter();
workloadStreamEmitter.setMaxListeners(MAX_LISTENERS);

// ASSUMES(single-replica): module-scope event-time clock + replay ring (per-process).
let busClock = 0;
const replay = createReplayBuffer<WorkloadId, WorkloadEvent>(REPLAY_TTL_MS, () => busClock);

/**
 * Record + fan out one lifecycle event. THROWS on an empty `workloadId` (the subscription filters on it; an
 * empty id silently drops client-side — workloads.md invariant #10). Advances the event-time clock (the
 * replay TTL domain) before recording, so the ring evicts relative to the latest event, not a wall clock.
 */
export function emitWorkloadEvent(event: WorkloadEvent): void {
  if (!event.workloadId) {
    throw new DomainOperationError(
      "workload_event_no_id",
      "a WorkloadEvent must carry a non-empty workloadId (the subscription filters on it)",
    );
  }
  busClock = Math.max(busClock, event.at);
  replay.record(event.workloadId, event);
  workloadStreamEmitter.emit(WORKLOAD_EVENT_CHANNEL, event);
}

/** The replayable events for a workload (a late subscriber's catch-up) — newest within the TTL window. */
export function getRecentWorkloadEvents(workloadId: WorkloadId): readonly WorkloadEvent[] {
  return replay.snapshot(workloadId);
}
