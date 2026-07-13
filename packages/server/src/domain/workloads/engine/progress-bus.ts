// domain/workloads/engine/progress-bus — per-process lifecycle/progress bus: a single EventEmitter + a
// per-workload replay ring, so a subscription opening after start() returns still catches the initial
// started/progress events. Module-scope, per-process — assumes single-replica (would need a shared pub/sub
// for cross-replica observability). Replay TTL clock is event-time (max `at` emitted), never Date.now().

import { EventEmitter } from "node:events";
import { DomainOperationError } from "@orb/kit/errors";
import type { WorkloadId } from "@orb/kit/ids";
import { createReplayBuffer } from "@orb/kit/replay-buffer";
import type { WorkloadEvent } from "../contract/workload-events";

const MAX_LISTENERS = 256;
const REPLAY_TTL_MS = 60_000;
const WORKLOAD_EVENT_CHANNEL = "workload";

export const workloadStreamEmitter = new EventEmitter();
workloadStreamEmitter.setMaxListeners(MAX_LISTENERS);

let busClock = 0;
const replay = createReplayBuffer<WorkloadId, WorkloadEvent>(REPLAY_TTL_MS, () => busClock);

/** Throws on an empty workloadId (the subscription filters on it; empty silently drops client-side). */
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

export function getRecentWorkloadEvents(workloadId: WorkloadId): readonly WorkloadEvent[] {
  return replay.snapshot(workloadId);
}

export function subscribeWorkloadEvents(listener: (event: WorkloadEvent) => void): () => void {
  workloadStreamEmitter.on(WORKLOAD_EVENT_CHANNEL, listener);
  return () => {
    workloadStreamEmitter.off(WORKLOAD_EVENT_CHANNEL, listener);
  };
}

/** Fires on every workload event (the worker re-polls the queue on any lifecycle change). */
export function subscribeWorkloadWake(listener: () => void): () => void {
  workloadStreamEmitter.on(WORKLOAD_EVENT_CHANNEL, listener);
  return () => {
    workloadStreamEmitter.off(WORKLOAD_EVENT_CHANNEL, listener);
  };
}
