// domain/automation/substrate/serial-lanes — the ORDERING primitive this domain kept assuming it had.
// Dispatch is written throughout as if order were semantics (arms mutate a shared env, `runDispatch` recurses
// rather than looping, presets count beats), but every ENTRY into it was fire-and-forget: the watcher detached
// one `handleEvent` per bus event and the confirm verb runs on its own request. Two events for one chat
// therefore read the same variable snapshot, computed the same increment and wrote the same next value —
// order-as-semantics held INSIDE one event and nowhere between two.
//
// A LANE IS A PROMISE CHAIN, NOT A LOCK: a job is queued behind the key's current tail, so there is no
// polling, no busy-wait, no timeout and nothing to release on a throw. A rejecting job never wedges its lane
// (the tail swallows), and a drained key is deleted, so the Map is bounded by the number of CONCURRENTLY
// ACTIVE keys rather than by every key ever seen.
//
// PROCESS-LOCAL, AND THAT IS THE WHOLE GUARANTEE. This serializes the events THIS process handles; it is not a
// distributed lock and does not pretend to be one. Under a second app process the watcher would subscribe
// twice and both would dispatch — an existing property of the fire-and-forget bus that this module neither
// creates nor fixes (filed separately as the process-locality row). Every caller states the key it serializes
// on and why that key covers the state it is protecting.

// ASSUMES(single-replica): the lane table holds LIVE in-process Promises, which is what a promise IS — there
// is no DB-backed replacement seam for this shape, and a row in a `locks` table would be a DIFFERENT mechanism
// (a lease with a timeout, a heartbeat and a stealing policy), not a serialization of this one. A second
// replica would hold its own lanes and interleave with ours; that is the process-locality row, filed
// separately, and every caller states the property in its own words rather than inheriting a false guarantee.
/** The active lanes: key → the tail of its queued work. Deleted when a lane drains (see {@link runInLane}). */
const lanes = new Map<string, Promise<unknown>>();

/**
 * Run `job` after every job already queued on `key`, and before every job queued after it. Jobs on DIFFERENT
 * keys run in parallel — the key IS the serialization scope, so a caller that picks too narrow a key gets no
 * protection and one that picks too wide a key pays head-of-line latency.
 *
 * The caller sees `job`'s own settlement verbatim (value or throw); the lane's internal tail is a separate,
 * always-resolving promise, so one job's failure is invisible to the next.
 */
export function runInLane<T>(key: string, job: () => Promise<T>): Promise<T> {
  const prior = lanes.get(key) ?? Promise.resolve();
  const run = prior.then(job);
  // The tail NEVER rejects: a failed job must not become the next job's failure, and an un-handled rejection
  // stored in the Map would be reported as unhandled the moment the lane drains.
  // @orb-gate-ignore caught-failure-ownership(promise:run): this swallow LOSES NOTHING — the rejection it
  // drops from the TAIL is still owned in full by the caller, on `run`, which is returned below and which
  // every caller holds (`handle-event.ts` logs it inside its own job; `lore-write.ts` returns errors as data).
  // The catch exists so the NEXT job queued on this key is not failed by its predecessor. Ends if this
  // function stops returning `run`, i.e. if the tail ever becomes the only holder of the rejection.
  const tail = run.catch(() => undefined);
  lanes.set(key, tail);
  // @swallowed-ok(tail): the lane sweep is bookkeeping over an in-RAM Map — a Map delete with nothing to
  // trace and no caller to inform, deliberately detached so it cannot delay or fail the caller's own result.
  // Ends if the sweep ever performs I/O or has an outcome a caller could act on.
  tail
    .then(() => {
      // Only the LAST queued job clears the key — an earlier job's completion must not drop a lane that a
      // successor is still holding (that would let the next arrival start beside it).
      if (lanes.get(key) === tail) {
        lanes.delete(key);
      }
    })
    // The tail cannot reject and the cleanup cannot throw; the terminal handler is here because the sweep is
    // deliberately DETACHED from the caller's promise — it must not delay or fail `runInLane`'s own result.
    .catch(() => undefined);
  return run;
}

/** How many lanes are currently active — the drain assertion's only reader (a leak here is unbounded memory). */
export function activeLaneCount(): number {
  return lanes.size;
}
