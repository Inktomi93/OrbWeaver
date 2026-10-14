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

type BodyBranch = Pick<OwnedResponseBody, "cancel">;

/** Own actual reads and cancellation of the producer and every caller-requested clone, without an unused tee. */
export function createOwnedResponseBody(response: Response, signal: AbortSignal): OwnedResponseBody {
  if (response.body === null) {
    return { response, settled: Promise.resolve(), cancel: () => Promise.resolve() };
  }
  const completion = Promise.withResolvers<void>();
  const branches = new Set<BodyBranch>();
  const failures = new Set<unknown>();

  const finish = (branch: BodyBranch): void => {
    branches.delete(branch);
    if (branches.size > 0) {
      return;
    }
    signal.removeEventListener("abort", abort);
    if (failures.size === 0) {
      completion.resolve();
    } else if (failures.size === 1) {
      completion.reject([...failures][0]);
    } else {
      completion.reject(new AggregateError(failures, "response body cancellation failed"));
    }
  };

  const cancel = (reason?: unknown): Promise<void> => {
    // Tee cancellation can wait for the other branch, so every cancellation must start before any join.
    for (const branch of branches) {
      void branch.cancel(reason).then(
        () => undefined,
        () => undefined,
      );
    }
    return completion.promise;
  };
  const abort = (): void => {
    void cancel(signal.reason).then(
      () => undefined,
      () => undefined,
    );
  };

  const ownBranch = (producer: Response): Response => {
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let finished = false;
    let cancellation: Promise<void> | undefined;
    const release = (): void => {
      if (finished) {
        return;
      }
      finished = true;
      reader?.releaseLock();
      finish(branch);
    };
    let outward: ReadableStreamDefaultController<Uint8Array>;
    const branch: BodyBranch = {
      cancel(reason): Promise<void> {
        if (finished) {
          return cancellation ?? Promise.resolve();
        }
        // Native clone() changes the producer's branch; acquire its current body only when work starts.
        reader ??= producer.body?.getReader();
        cancellation ??= (reader?.cancel(reason) ?? Promise.resolve()).then(
          () => {
            release();
            outward.error(reason);
          },
          (error: unknown) => {
            failures.add(error);
            release();
            outward.error(error);
            throw error;
          },
        );
        return cancellation;
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
  return { response: owned, settled: completion.promise, cancel };
}
