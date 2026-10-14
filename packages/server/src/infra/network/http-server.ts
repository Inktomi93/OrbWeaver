// Own the production Node HTTP adapter and its bounded connection drain. HTTP routes and authentication
// remain in entry; this module handles physical serving only, without global Request/Response replacement.

import type { ServerOptions } from "node:http";
import type { AddressInfo } from "node:net";
import type { ServerType } from "@hono/node-server";
import { serve } from "@hono/node-server";
import type { NativeHttpBindings } from "./contract/http-server.ts";

// The installed adapter's lightweight Request has the platform prototype but not its private brand.
// Materialize from public fields, not Request(input), and retain its one physical body without a tee.
function nativeRequest(input: Request): Request {
  const body = input.body;
  const method = input.method;
  const request = new Request(input.url, {
    method: method === "TRACE" ? "GET" : method,
    headers: new Headers([...input.headers]),
    signal: input.signal,
    cache: input.cache,
    credentials: input.credentials,
    integrity: input.integrity,
    keepalive: input.keepalive,
    mode: input.mode,
    redirect: input.redirect,
    referrer: input.referrer,
    referrerPolicy: input.referrerPolicy,
    ...(body === null || method === "TRACE" ? {} : { body, duplex: "half" }),
  });
  // The adapter's TRACE cache is GET internally with a public TRACE method; its clone is GET too.
  if (method === "TRACE") {
    Object.defineProperty(request, "method", { value: method });
  }
  return request;
}

/** Cancel the genuine inbound streams and join their close events, not the destroy() call or headers. */
export function joinNativeHttpRequest(bindings: NativeHttpBindings, signal: AbortSignal): Promise<void> {
  const abortError = new DOMException("The owned HTTP request was cancelled.", "AbortError");
  const streams = [bindings.incoming, bindings.outgoing];
  const failures: Error[] = [];
  const onError = (error: Error): void => {
    if (error !== abortError) {
      failures.push(new Error(error.message));
    }
  };
  const closed = streams.map((stream) => {
    stream.on("error", onError);
    return stream.closed ? Promise.resolve() : new Promise<void>((resolve) => stream.once("close", resolve));
  });
  const abort = (): void => {
    using cancellation = new DisposableStack();
    cancellation.defer(() => {
      if (!bindings.outgoing.writableFinished) {
        bindings.outgoing.destroy(abortError);
      }
    });
    cancellation.defer(() => {
      if (!bindings.incoming.closed) {
        bindings.incoming.destroy(abortError);
      }
    });
  };
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) {
    abort();
  }
  return Promise.all(closed).then(() => {
    signal.removeEventListener("abort", abort);
    for (const stream of streams) {
      stream.removeListener("error", onError);
    }
    if (failures.length > 0) {
      throw new AggregateError(failures, "native HTTP stream completion failed");
    }
  });
}

/** The chosen HTTP/1 connection-reuse and inbound-request limits. These do not bound response duration:
 *  `requestTimeout` ends once Node has received the request, so a long-lived SSE response is unaffected. */
export const HTTP_SERVER_TIMEOUTS = {
  keepAliveTimeout: 5000,
  requestTimeout: 300_000,
  headersTimeout: 60_000,
} as const satisfies ServerOptions;

/** Start the Node HTTP/1 adapter with the production timeout policy. The final parameters are focused test
 *  seams for proving adapter forwarding and timeout semantics quickly; boot omits both and receives the
 *  real Hono adapter with {@link HTTP_SERVER_TIMEOUTS}.
 */
export function serveHttpServer(
  options: Pick<Parameters<typeof serve>[0], "fetch" | "port" | "hostname">,
  listeningListener: (info: AddressInfo) => void,
  serverOptions: ServerOptions = HTTP_SERVER_TIMEOUTS,
  serveAdapter: typeof serve = serve,
): ServerType {
  return serveAdapter(
    {
      fetch: (input, bindings) => options.fetch(nativeRequest(input), bindings),
      ...(options.port === undefined ? {} : { port: options.port }),
      overrideGlobalObjects: false,
      serverOptions,
      ...(options.hostname === undefined ? {} : { hostname: options.hostname }),
    },
    listeningListener,
  );
}

/** How long a shutdown waits for open connections before force-closing them. Bounded on purpose: the app's
 *  own SSE stream never ends, so an unbounded drain lets one open browser tab stall a deploy indefinitely
 *  (measured: ~6 minutes on one tab, until it happened to reconnect). Long enough for a normal in-flight
 *  request to finish, short enough that a restart is always a restart. */
export const SHUTDOWN_DRAIN_MS = 10_000;

/** The drain for a closed terminal (SIGHUP). Windows terminates the process about 10 s after its console window
 *  closes, and the stages after the drain (workers, the database) need the rest of that window. */
export const HANGUP_DRAIN_MS = 5000;

/** The two node-http connection-closing methods a bounded drain needs. Present on `http.Server` (node 18.2+),
 *  ABSENT on the http2 servers in `ServerType`'s union — so they are probed, never assumed. */
interface ConnectionCloser {
  readonly closeIdleConnections: () => void;
  readonly closeAllConnections: () => void;
}

/** The probe: the handle iff it carries BOTH methods, else `null` (an http2 server — no forced close available). */
function connectionCloser(handle: ServerType): ConnectionCloser | null {
  const candidate = handle as Partial<ConnectionCloser>;
  return typeof candidate.closeIdleConnections === "function" && typeof candidate.closeAllConnections === "function" ? (candidate as ConnectionCloser) : null;
}

/** The minimal logger shape {@link drainHttpServer} needs — real `getLog()` in production, a spy in tests. */
interface DrainLog {
  readonly warn: (fields: Record<string, unknown>, msg: string) => void;
}

/** Stop accepting, then drain — WITH A DEADLINE.
 *
 *  `server.close()` alone waits for every open connection to end, and an SSE stream never does: one browser
 *  tab held a prod shutdown for ~6 minutes (measured), because the app's own live-update socket is exactly
 *  the connection that never closes on its own. A client must not be able to hold a deploy hostage.
 *
 *  Idle keep-alive sockets are dropped immediately (they have no in-flight request to lose). Everything
 *  still open at the deadline — SSE, and any genuinely long request — is force-closed so `close()` can
 *  settle. The force is LOUD: a shutdown that had to cut connections says so, since that is the case where
 *  a client saw a truncated stream.
 *
 *  Exported (not a `createLifecycle` closure) so the forced path is directly testable against a real open
 *  socket, rather than only provable live (`DRAIN-UNBOUNDED`).
 */
export async function drainHttpServer(
  handle: ServerType,
  log: DrainLog,
  drainMs: number = SHUTDOWN_DRAIN_MS,
  scheduleTimeout: (run: () => void, ms: number) => () => void = (run, ms) => {
    const timer = setTimeout(run, ms);
    return () => clearTimeout(timer);
  },
): Promise<void> {
  const closed = new Promise<void>((resolve) => {
    handle.close(() => {
      resolve();
    });
  });
  // `ServerType` is a union that includes the http2 servers, which do not carry the connection-closing
  // pair — hence a capability probe rather than a cast. Absent (http2), the drain degrades to the old
  // unbounded wait, which is honest: there is no supported way to force those sockets from here.
  const closer = connectionCloser(handle);
  // Keep-alive sockets sitting idle between requests: nothing in flight, drop them now rather than wait.
  closer?.closeIdleConnections();
  let cancelDeadline: (() => void) | undefined;
  const deadline = new Promise<"forced">((resolve) => {
    cancelDeadline = scheduleTimeout(() => {
      resolve("forced");
    }, drainMs);
  });
  const outcome = await Promise.race([closed.then(() => "drained" as const), deadline]);
  if (outcome === "forced") {
    log.warn({ drainMs }, "shutdown: drain deadline hit — force-closing remaining connections (long-lived streams do not end on their own)");
    closer?.closeAllConnections();
    await closed;
  }
  cancelDeadline?.();
}
