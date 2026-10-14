// Own requests, bodies and optional native ingress over the same production HTTP graph. Native bindings
// retain their genuine physical peer; teardown joins handlers, locked bodies and actual server close.

import type { AddressInfo } from "node:net";
import { errorMessage } from "@orb/kit/error-message";
import type { createHttpApp } from "@orb/server/entry/compose";
import { getLog } from "@orb/server/foundation/observability";
import type { NativeHttpBindings } from "@orb/server/infra/network";
import { createOwnedResponseBody, drainHttpServer, joinNativeHttpRequest, serveHttpServer } from "@orb/server/infra/network";

type HttpApp = ReturnType<typeof createHttpApp>;

export interface OwnedHttpRequests extends Pick<HttpApp, "request">, AsyncDisposable {
  readonly fetch: (...args: Parameters<Parameters<typeof serveHttpServer>[0]["fetch"]>) => Promise<Response>;
  readonly listen: () => Promise<Readonly<AddressInfo>>;
}

interface ActiveRequest {
  readonly controller: AbortController;
  readonly completion: PromiseWithResolvers<void>;
}

/** Forward the actual Hono request operation; disposal cancels bodies and joins handlers before graph teardown. */
export function createOwnedHttpRequests(app: HttpApp, scheduleTimeout: Parameters<typeof drainHttpServer>[3]): OwnedHttpRequests {
  const active = new Set<ActiveRequest>();
  const failures: Error[] = [];
  let closed = false;
  let disposal: Promise<void> | undefined;
  let listening: Promise<Readonly<AddressInfo>> | undefined;
  let server: ReturnType<typeof serveHttpServer> | undefined;

  const release = (entry: ActiveRequest): void => {
    active.delete(entry);
    entry.completion.resolve();
  };

  const perform = async (
    callerSignal: AbortSignal | null | undefined,
    execute: (signal: AbortSignal) => ReturnType<HttpApp["fetch"]>,
    bindings?: NativeHttpBindings,
  ): Promise<Response> => {
    if (closed) {
      throw new Error("server harness HTTP lifetime is closed");
    }
    const entry: ActiveRequest = { controller: new AbortController(), completion: Promise.withResolvers<void>() };
    active.add(entry);
    const signal = callerSignal === undefined || callerSignal === null ? entry.controller.signal : AbortSignal.any([entry.controller.signal, callerSignal]);
    const nativeClosed = (bindings === undefined ? Promise.resolve() : joinNativeHttpRequest(bindings, signal)).then(
      (): void => undefined,
      (error: unknown): void => {
        failures.push(error instanceof Error ? error : new Error(errorMessage(error), { cause: error }));
      },
    );
    const finish = (): void => {
      void nativeClosed.then(
        () => release(entry),
        (error: unknown) => {
          failures.push(error instanceof Error ? error : new Error(errorMessage(error), { cause: error }));
          release(entry);
        },
      );
    };
    let bodyOwned = false;
    try {
      const response = await execute(signal);
      const owned = createOwnedResponseBody(response, signal);
      void owned.settled.then(finish, (error: unknown) => {
        failures.push(error instanceof Error ? error : new Error(errorMessage(error), { cause: error }));
        finish();
      });
      bodyOwned = true;
      return owned.response;
    } finally {
      if (!bodyOwned) {
        finish();
      }
    }
  };

  const request: HttpApp["request"] = (input, init, bindings, executionContext): Promise<Response> =>
    perform(init?.signal === null ? undefined : (init?.signal ?? (input instanceof Request ? input.signal : undefined)), (signal) =>
      app.request(input, { ...init, signal }, bindings, executionContext),
    );
  const fetch: OwnedHttpRequests["fetch"] = (input, bindings): Promise<Response> =>
    perform(
      input.signal,
      (signal) => {
        const forwarded = new Request(input, { signal });
        Object.defineProperty(forwarded, "method", { value: input.method });
        return app.fetch(forwarded, bindings);
      },
      bindings,
    );

  async function settleHttp(): Promise<void> {
    closed = true;
    const requests = [...active];
    for (const entry of requests) {
      entry.controller.abort();
    }
    const listenerClosed = listening?.then(() => (server === undefined ? undefined : drainHttpServer(server, getLog(), undefined, scheduleTimeout)));
    const settled = await Promise.allSettled([Promise.all(requests.map((entry) => entry.completion.promise)), listenerClosed]);
    for (const result of settled) {
      if (result.status === "rejected") {
        failures.push(result.reason instanceof Error ? result.reason : new Error(errorMessage(result.reason), { cause: result.reason }));
      }
    }
    if (failures.length > 0) {
      throw new AggregateError(failures, "server harness HTTP body cancellation failed");
    }
  }

  return {
    request,
    fetch,
    listen(): Promise<Readonly<AddressInfo>> {
      if (closed) {
        return Promise.reject(new Error("server harness HTTP lifetime is closed"));
      }
      listening ??= new Promise((resolve, reject) => {
        const onError = (error: Error): void => {
          server?.close(() => reject(error));
        };
        server = serveHttpServer({ fetch, hostname: "127.0.0.1", port: 0 }, (address) => {
          server?.removeListener("error", onError);
          resolve(address);
        });
        server.once("error", onError);
      });
      return listening;
    },
    [Symbol.asyncDispose]: (): Promise<void> => {
      disposal ??= settleHttp();
      return disposal;
    },
  };
}
