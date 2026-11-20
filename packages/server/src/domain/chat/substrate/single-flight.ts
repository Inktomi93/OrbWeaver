// One run for concurrent equal reads. A caller that arrives while a run for its key is in flight waits on that run
// instead of starting its own, so a burst of the same read costs one run.
//
// CANCELLATION. The run has its own signal. A caller that aborts stops waiting at once with its signal's reason; the
// run itself aborts only when every caller waiting on it has aborted, so one member leaving never fails the others. An
// aborted run leaves the table at once, so a later caller starts a fresh one rather than joining a cancelled one.

interface Flight<V> {
  readonly promise: Promise<V>;
  readonly controller: AbortController;
  waiting: number;
}

export interface SingleFlight<V> {
  /** The result of the run for `key`, starting `work` only when no run for it is in flight. */
  readonly run: (key: string, signal: AbortSignal, work: (signal: AbortSignal) => Promise<V>) => Promise<V>;
}

export function createSingleFlight<V>(): SingleFlight<V> {
  const flights = new Map<string, Flight<V>>();

  const start = (key: string, work: (signal: AbortSignal) => Promise<V>): Flight<V> => {
    const controller = new AbortController();
    const settled = Promise.withResolvers<V>();
    const flight: Flight<V> = { promise: settled.promise, controller, waiting: 0 };
    flights.set(key, flight);
    work(controller.signal)
      .then(settled.resolve, settled.reject)
      .finally(() => {
        if (flights.get(key) === flight) {
          flights.delete(key);
        }
      });
    return flight;
  };

  const run = (key: string, signal: AbortSignal, work: (signal: AbortSignal) => Promise<V>): Promise<V> => {
    signal.throwIfAborted();
    const flight = flights.get(key) ?? start(key, work);
    flight.waiting += 1;
    const left = Promise.withResolvers<never>();
    const onAbort = (): void => {
      flight.waiting -= 1;
      if (flight.waiting === 0) {
        flights.delete(key);
        flight.controller.abort(signal.reason);
      }
      left.reject(signal.reason);
    };
    signal.addEventListener("abort", onAbort, { once: true });
    return Promise.race([flight.promise, left.promise]).finally(() => {
      signal.removeEventListener("abort", onAbort);
    });
  };
  return { run };
}
