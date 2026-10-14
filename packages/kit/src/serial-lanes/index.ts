/** Instance-owned promise ordering; job outcomes belong to their callers, never the queue tail. */
export interface SerialLanes {
  readonly run: <T>(key: string, job: () => Promise<T>) => Promise<T>;
  readonly activeCount: () => number;
}

/** Own ordered promise lanes; different keys stay parallel and drained keys are released. */
export function createSerialLanes(): SerialLanes {
  const lanes = new Map<string, Promise<unknown>>();
  function runInLane<T>(key: string, job: () => Promise<T>): Promise<T> {
    const prior = lanes.get(key) ?? Promise.resolve();
    const run = prior.then(job);
    // The tail NEVER rejects: a failed job must not become the next job's failure, and an un-handled rejection
    // stored in the Map would be reported as unhandled the moment the lane drains.
    const tail = run.catch(() => undefined);
    lanes.set(key, tail);
    return run.finally(() => {
      // Only the LAST queued job clears the key — an earlier job's completion must not drop a lane that a
      // successor is still holding (that would let the next arrival start beside it).
      if (lanes.get(key) === tail) {
        lanes.delete(key);
      }
    });
  }
  return { run: runInLane, activeCount: () => lanes.size };
}
