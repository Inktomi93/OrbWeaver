// The process-global instance of the buddy reaction bus. domain/buddy owns the mechanism (createBuddyBus
// — the replay-buffer-backed emitter); transport owns the one live instance.
//
// ASSUMES(single-replica): module-scope, per-process.

import { createBuddyBus } from "#domain/buddy";

const bus = createBuddyBus();

/** The observer's `emit` — fan one reaction event to its user's live channel + replay ring. */
export const publishBuddyEvent = bus.emit;
/** The `buddy.stream` live tail for a user, torn down on `signal` abort (SSE disconnect). */
export const subscribeBuddy = bus.subscribe;
/** The late-subscriber ramp: the still-live retained events for a user. */
export const snapshotBuddy = bus.snapshot;
