// domain/buddy/bus — the per-user live reaction feed. A feature-root collaborator: the observer emits
// onto it; the tRPC buddy.stream subscription tails it. One per process, built at the composition root. A
// short replay ring covers a late subscriber that opens after a reaction fired (consumer dedups by
// at/quipId). Durable hover-history is buddy_quips, a separate read — this bus is the ephemeral bubble
// only. Assumes single-replica: emitter + ring are per-process.

import { EventEmitter, on } from "node:events";
import type { UserId } from "@orb/kit/ids";
import { createReplayBuffer } from "@orb/kit/replay-buffer";
import type { BuddyBus, BuddyBusEvent } from "./contract/observer-env";

const REPLAY_TTL_MS = 10_000;
const channelFor = (userId: UserId): string => `buddy:${userId}`;

export function createBuddyBus(): BuddyBus {
  const emitter = new EventEmitter();
  // Many concurrent SSE streams per user → unbounded listeners.
  emitter.setMaxListeners(0);
  const replay = createReplayBuffer<UserId, BuddyBusEvent>(REPLAY_TTL_MS);

  return {
    emit: (event: BuddyBusEvent): void => {
      replay.record(event.userId, event);
      emitter.emit(channelFor(event.userId), event);
    },
    subscribe: (userId: UserId, signal: AbortSignal): AsyncIterable<BuddyBusEvent> => liveEvents(on(emitter, channelFor(userId), { signal })),
    snapshot: (userId: UserId): BuddyBusEvent[] => replay.snapshot(userId),
  };
}

// on() yields the raw emit-args array ([event]); EventEmitter is untyped, unwrapped at this one boundary.
async function* liveEvents(source: AsyncIterable<unknown[]>): AsyncGenerator<BuddyBusEvent> {
  for await (const args of source) {
    yield args[0] as BuddyBusEvent;
  }
}
