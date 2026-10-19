import type { OwnedResponseBody } from "./contract/response-body.ts";

// The producer owns metadata and the native Headers guard; this view owns only outward consumption.
function createConsumptionView(body: ReadableStream<Uint8Array>, producer: Response, cloneProducer: () => Response): Response {
  const response = new Response(body, { status: producer.status, statusText: producer.statusText, headers: producer.headers });
  Object.defineProperties(response, {
    headers: { get: (): Headers => producer.headers, configurable: true, enumerable: true },
    url: { get: (): string => producer.url, configurable: true, enumerable: true },
    redirected: { get: (): boolean => producer.redirected, configurable: true, enumerable: true },
    type: { get: (): Response["type"] => producer.type, configurable: true, enumerable: true },
    clone: {
      value(this: Response): Response {
        if (this.body?.locked === true || this.bodyUsed) {
          throw new TypeError("Response.clone: Body has already been consumed.");
        }
        return cloneProducer();
      },
      configurable: true,
      writable: true,
    },
    blob: {
      async value(this: Response): Promise<Blob> {
        return await new Response(this.body, { headers: this.headers }).blob();
      },
      configurable: true,
      writable: true,
    },
    formData: {
      async value(this: Response): Promise<FormData> {
        // eslint-disable-next-line @typescript-eslint/no-deprecated -- The native Response contract requires formData passthrough; Undici's parser advice supplies no native replacement.
        return await new Response(this.body, { headers: this.headers }).formData();
      },
      configurable: true,
      writable: true,
    },
  });
  return response;
}

/** What a branch's physical cancellation ended with: nothing, or the cleanup error to hand to whoever asks. */
type CancelOutcome = { readonly error: unknown } | undefined;

interface BodyBranch {
  /** Start the physical cancellation once and record its outcome; creates no promise anyone must handle. */
  readonly begin: (reason?: unknown) => void;
  /** `begin`, then a promise derived from the recorded outcome: it rejects with the cleanup error. */
  readonly cancel: (reason?: unknown) => Promise<void>;
}

const rethrow = (outcome: CancelOutcome): void => {
  if (outcome !== undefined) {
    throw outcome.error;
  }
};

/**
 * Own actual reads and cancellation of the producer and every caller-requested clone, without an unused tee.
 *
 * @remarks A cancellation failure is recorded as state (`failures`) and a rejecting promise exists only for a caller
 * that reads `settled` or calls `cancel`, so an ignored failure cannot surface as an unhandled rejection.
 */
export function createOwnedResponseBody(response: Response, signal: AbortSignal): OwnedResponseBody {
  if (response.body === null) {
    return { response, settled: Promise.resolve(), cancel: () => Promise.resolve() };
  }
  const done = Promise.withResolvers<void>();
  const branches = new Set<BodyBranch>();
  const failures = new Set<unknown>();
  let aggregate: AggregateError | undefined;

  const finish = (branch: BodyBranch): void => {
    branches.delete(branch);
    if (branches.size > 0) {
      return;
    }
    signal.removeEventListener("abort", abort);
    done.resolve();
  };

  // Derived on demand from the recorded failures: one failure is itself, several are one shared aggregate.
  const join = (): Promise<void> =>
    done.promise.then(() => {
      if (failures.size === 1) {
        throw [...failures][0];
      }
      if (failures.size > 1) {
        aggregate ??= new AggregateError(failures, "response body cancellation failed");
        throw aggregate;
      }
    });

  const startCancel = (reason?: unknown): void => {
    // Tee cancellation can wait for the other branch, so every cancellation must start before any join.
    for (const branch of branches) {
      branch.begin(reason);
    }
  };
  const cancel = (reason?: unknown): Promise<void> => {
    startCancel(reason);
    return join();
  };
  const abort = (): void => {
    startCancel(signal.reason);
  };

  const ownBranch = (producer: Response): Response => {
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let finished = false;
    // Never rejects: a failure is an outcome value, rethrown only into a promise a caller asked for.
    let cancellation: Promise<CancelOutcome> | undefined;
    const release = (): void => {
      if (finished) {
        return;
      }
      finished = true;
      reader?.releaseLock();
      finish(branch);
    };
    let outward: ReadableStreamDefaultController<Uint8Array>;
    const begin = (reason?: unknown): void => {
      if (finished) {
        return;
      }
      // Native clone() changes the producer's branch; acquire its current body only when work starts.
      reader ??= producer.body?.getReader();
      const closedByAbort =
        reader?.closed.then(
          () => false,
          (error: unknown) => signal.aborted && error === reason && error === signal.reason,
        ) ?? Promise.resolve(false);
      cancellation ??= (reader?.cancel(reason) ?? Promise.resolve()).then(
        (): CancelOutcome => {
          release();
          outward.error(reason);
          return undefined;
        },
        async (error: unknown): Promise<CancelOutcome> => {
          // An already-errored native fetch rejects cancel with its owned abort; a rejecting cancel hook closes its reader instead.
          if (error === reason && (await closedByAbort)) {
            release();
            outward.error(reason);
            return undefined;
          }
          failures.add(error);
          release();
          outward.error(error);
          return { error };
        },
      );
    };
    const branch: BodyBranch = {
      begin,
      cancel(reason): Promise<void> {
        begin(reason);
        return cancellation === undefined ? Promise.resolve() : cancellation.then(rethrow);
      },
    };
    branches.add(branch);
    const body = new ReadableStream<Uint8Array>(
      {
        start(controller): void {
          outward = controller;
        },
        async pull(controller): Promise<void> {
          try {
            reader ??= producer.body?.getReader();
            const next = await reader?.read();
            if (finished || cancellation !== undefined) {
              return;
            }
            if (next === undefined || next.done) {
              release();
              controller.close();
            } else {
              controller.enqueue(next.value);
            }
          } catch (error) {
            if (cancellation !== undefined) {
              return;
            }
            release();
            controller.error(error);
          }
        },
        cancel: branch.cancel,
      },
      { highWaterMark: 0 },
    );
    return createConsumptionView(body, producer, () => ownBranch(producer.clone()));
  };

  const owned = ownBranch(response);
  if (signal.aborted) {
    abort();
  } else {
    signal.addEventListener("abort", abort, { once: true });
  }
  return {
    response: owned,
    get settled(): Promise<void> {
      return join();
    },
    cancel,
  };
}
