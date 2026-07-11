// transport/trpc/buddy-bus — the process-global instance of the buddy reaction bus (PD-45). The `domain/
// buddy` code owns the MECHANISM (`createBuddyBus` — the replay-buffer-backed emitter); the transport owns
// the ONE live instance, mirroring notifications-bus ("domain owns the durable/mechanism half, transport
// owns the per-user live bus"). The observer's env (assembled at `entry/compose`) is handed `publishBuddyEvent`
// as its `emit`; the `buddy.stream` subscription tails `subscribeBuddy` + ramps from `snapshotBuddy`.
//
// ASSUMES(single-replica): module-scope, per-process (the mechanism's documented seam).

import { createBuddyBus } from "#domain/buddy";

const bus = createBuddyBus();

/** The observer's `emit` — fan one reaction event to its user's live channel + replay ring. */
export const publishBuddyEvent = bus.emit;
/** The `buddy.stream` live tail for a user, torn down on `signal` abort (SSE disconnect). */
export const subscribeBuddy = bus.subscribe;
/** The late-subscriber ramp: the still-live retained events for a user. */
export const snapshotBuddy = bus.snapshot;
