// Graph-owned lifecycle/progress bus and per-workload replay ring; a late subscription retains initial
// events. Replay TTL is event-time (max `at` emitted), not wall time; cross-replica delivery needs shared pub/sub.

import { EventEmitter, on } from "node:events";
import type { WorkloadEvent } from "@orb/contracts/workloads";
import { DomainOperationError } from "@orb/kit/errors";
import type { WorkloadId } from "@orb/kit/ids";
import { createReplayBuffer } from "@orb/kit/replay-buffer";
import type { WorkloadProgressBus } from "../contract/progress-bus.ts";

const MAX_LISTENERS = 256;
const REPLAY_TTL_MS = 60_000;
const WORKLOAD_EVENT_CHANNEL = "workload";

function createProgressBus(emitter: EventEmitter): WorkloadProgressBus {
  emitter.setMaxListeners(MAX_LISTENERS);
  const lifetime = new AbortController();
  let busClock = 0;
  const replay = createReplayBuffer<WorkloadId, WorkloadEvent>(REPLAY_TTL_MS, () => busClock);

  /** Throws on an empty workloadId (the subscription filters on it; empty silently drops client-side). */
  function emit(event: WorkloadEvent): void {
    if (lifetime.signal.aborted) {
      return;
    }
    if (event.workloadId === "") {
      throw new DomainOperationError("workload_event_no_id", "a WorkloadEvent must carry a non-empty workloadId (the subscription filters on it)");
    }
    busClock = Math.max(busClock, event.at);
    replay.record(event.workloadId, event);
    emitter.emit(WORKLOAD_EVENT_CHANNEL, event);
  }

  function recent(workloadId: WorkloadId): readonly WorkloadEvent[] {
    return replay.snapshot(workloadId);
  }

  /** Fires on every workload event (the worker re-polls the queue on any lifecycle change). */
  function wake(listener: () => void): () => void {
    lifetime.signal.throwIfAborted();
    emitter.on(WORKLOAD_EVENT_CHANNEL, listener);
    return () => {
      emitter.off(WORKLOAD_EVENT_CHANNEL, listener);
    };
  }

  async function* subscribe(workloadId: WorkloadId, signal: AbortSignal): AsyncGenerator<WorkloadEvent> {
    for await (const args of on(emitter, WORKLOAD_EVENT_CHANNEL, { signal: AbortSignal.any([signal, lifetime.signal]) })) {
      const event = args[0] as WorkloadEvent;
      if (event.workloadId === workloadId) {
        yield event;
      }
    }
  }
  return {
    emitWorkloadEvent: emit,
    getRecentWorkloadEvents: recent,
    subscribeWorkloadWake: wake,
    subscribeWorkloadEvents: subscribe,
    [Symbol.dispose](): void {
      lifetime.abort();
      emitter.removeAllListeners();
      replay.clear();
    },
  };
}

/** Own the progress channel and event-time replay ring of one application graph. */
export function createWorkloadProgressBus(): WorkloadProgressBus {
  return createProgressBus(new EventEmitter());
}

export const workloadStreamEmitter = new EventEmitter();
// biome-ignore lint/nursery/useDisposables: this module owns process compatibility lifetime; createServices uses separate graph owners, and module using would close it at import.
const processBus = createProgressBus(workloadStreamEmitter);
export const emitWorkloadEvent: WorkloadProgressBus["emitWorkloadEvent"] = processBus.emitWorkloadEvent;
export const getRecentWorkloadEvents: WorkloadProgressBus["getRecentWorkloadEvents"] = processBus.getRecentWorkloadEvents;
export const subscribeWorkloadWake: WorkloadProgressBus["subscribeWorkloadWake"] = processBus.subscribeWorkloadWake;
