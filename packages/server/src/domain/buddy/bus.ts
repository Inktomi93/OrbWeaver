// domain/buddy/bus — the per-user live reaction feed (PD-45). A FEATURE-ROOT collaborator (the chat/bus.ts
// precedent — a root file, exempt from the substrate-below-verbs rule): the observer emits onto it; the tRPC
// `buddy.stream` subscription tails it. ONE per process, built at the composition root (the transport owns
// the singleton, mirroring notifications-bus — domain owns the mechanism, transport owns the live instance).
//
// LATE-SUBSCRIBER RAMP: a subscription opening AFTER a reaction fired would miss it, so each user's channel
// keeps a short replay ring (`@orb/kit/replay-buffer`, shared with chat/workloads) the subscription snapshots
// after attaching its listener + before tailing live — the same idempotent replay/live overlap those buses
// use (a consumer dedups by the event's `at`/`quipId`). The durable hover-history is `buddy_quips`
// (loadRecentQuips), a SEPARATE read — this bus is the ephemeral live bubble only.
//
// ASSUMES(single-replica): the emitter + ring are per-process (the same seam chat/workloads document; a
// multi-replica deploy replaces both with a shared pub/sub).

import { EventEmitter, on } from "node:events";
import type { UserId } from "@orb/kit/ids";
import { createReplayBuffer } from "@orb/kit/replay-buffer";
import type { BuddyBus, BuddyBusEvent } from "./contract/observer-env";

// How long a reaction stays replayable for a late subscriber (wall-clock ms). Short — the live bubble is
// ephemeral; deeper history is `buddy_quips`.
const REPLAY_TTL_MS = 10_000;
// One channel per user (the subscription filters by attaching to only its own).
const channelFor = (userId: UserId): string => `buddy:${userId}`;

/** Build the per-process buddy reaction bus (ONE instance, wired at the composition root). */
export function createBuddyBus(): BuddyBus {
  const emitter = new EventEmitter();
  // One live feed per connected device per user → unbounded listeners (many concurrent SSE streams).
  emitter.setMaxListeners(0);
  const replay = createReplayBuffer<UserId, BuddyBusEvent>(REPLAY_TTL_MS);

  return {
    emit: (event: BuddyBusEvent): void => {
      replay.record(event.userId, event);
      emitter.emit(channelFor(event.userId), event);
    },
    subscribe: (userId: UserId, signal: AbortSignal): AsyncIterable<BuddyBusEvent> =>
      liveEvents(on(emitter, channelFor(userId), { signal })),
    snapshot: (userId: UserId): BuddyBusEvent[] => replay.snapshot(userId),
  };
}

// `on()` yields the raw emit-args array (`[event]`); EventEmitter is untyped, so the element is unwrapped +
// annotated at this single boundary.
async function* liveEvents(source: AsyncIterable<unknown[]>): AsyncGenerator<BuddyBusEvent> {
  for await (const args of source) {
    yield args[0] as BuddyBusEvent;
  }
}
