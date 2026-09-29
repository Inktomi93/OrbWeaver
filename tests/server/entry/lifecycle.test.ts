// entry/lifecycle — DRAIN-UNBOUNDED: the owed test for the bounded-drain shutdown.
// `drainHttpServer` is exported specifically so this can drive it against a REAL open socket rather than only
// being provable live — a request whose response is IN FLIGHT (written but never `.end()`ed) is exactly the
// SSE case: the server has an open connection with nothing further to finish, so `server.close()` alone would
// hang forever. Asserts the forced path completes within drainMs + slack AND that the warn fired.

import { createServer, Server } from "node:http";
import type { AddressInfo, Socket } from "node:net";
import { connect } from "node:net";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { afterEach, describe, vi } from "vitest";
import { drainHttpServer, HTTP_SERVER_TIMEOUTS, serveHttpServer } from "../../../packages/server/src/entry/lifecycle.ts";
import { expect, test } from "../../support/fixtures.ts";

const DRAIN_MS = 200;
const SLACK_MS = 500;
const NS_PER_MS = 1_000_000;
const SHORT_REQUEST_TIMEOUT_MS = 40;
const STREAM_HOLD_MS = 100;
const STREAM_READ_DEADLINE_MS = 500;

/** Accumulate arbitrary TCP chunks until the wire marker arrives; a single `data` event is not a frame. */
function readSocketThrough(socket: Socket, marker: string): Promise<string> {
  const deadline = AbortSignal.timeout(STREAM_READ_DEADLINE_MS);
  return new Promise<string>((resolve, reject) => {
    let received = "";
    let settled = false;
    function cleanup(): void {
      socket.off("data", onData);
      socket.off("end", onEnd);
      socket.off("error", onError);
      deadline.removeEventListener("abort", onTimeout);
    }
    function settle(result: string | Error): void {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      if (result instanceof Error) {
        reject(result);
      } else {
        resolve(result);
      }
    }
    function onData(chunk: Buffer): void {
      received += chunk.toString("utf8");
      if (received.includes(marker)) {
        settle(received);
      }
    }
    function onEnd(): void {
      settle(new Error(`SSE response ended before ${marker}`));
    }
    function onError(error: Error): void {
      settle(error);
    }
    function onTimeout(): void {
      settle(new Error(`SSE response did not deliver ${marker}`));
    }
    socket.on("data", onData);
    socket.once("end", onEnd);
    socket.once("error", onError);
    deadline.addEventListener("abort", onTimeout, { once: true });
  });
}

describe("HTTP server timeout policy", () => {
  let timeoutServer: ReturnType<typeof serveHttpServer> | undefined;

  afterEach(() => {
    if (timeoutServer instanceof Server) {
      timeoutServer.closeAllConnections();
    }
    timeoutServer?.close();
    timeoutServer = undefined;
  });

  test("the production helper forwards the named timeout policy to the Hono adapter", () => {
    const adapterServer = createServer();
    const fetch = (): Response => new Response("ok");
    const listeningListener = vi.fn();
    const serveAdapter = vi.fn(() => adapterServer);

    const result = serveHttpServer({ fetch, port: 0 }, listeningListener, HTTP_SERVER_TIMEOUTS, serveAdapter);

    expect(result).toBe(adapterServer);
    expect(serveAdapter).toHaveBeenCalledExactlyOnceWith(
      {
        fetch,
        port: 0,
        overrideGlobalObjects: false,
        serverOptions: HTTP_SERVER_TIMEOUTS,
      },
      listeningListener,
    );
  });

  test("requestTimeout bounds request receipt, not an SSE response served through Hono", async () => {
    const listening = Promise.withResolvers<void>();
    const controllerReady = Promise.withResolvers<ReadableStreamDefaultController<Uint8Array>>();
    const encoder = new TextEncoder();
    timeoutServer = serveHttpServer(
      {
        port: 0,
        fetch: () =>
          new Response(
            new ReadableStream<Uint8Array>({
              start(controller): void {
                controllerReady.resolve(controller);
                controller.enqueue(encoder.encode("data: opened\n\n"));
              },
            }),
            { headers: { "content-type": "text/event-stream" } },
          ),
      },
      () => listening.resolve(),
      {
        ...HTTP_SERVER_TIMEOUTS,
        requestTimeout: SHORT_REQUEST_TIMEOUT_MS,
        headersTimeout: SHORT_REQUEST_TIMEOUT_MS,
        connectionsCheckingInterval: SHORT_REQUEST_TIMEOUT_MS,
      },
    );
    await listening.promise;
    const { port } = timeoutServer.address() as AddressInfo;
    const socket = connect(port, "127.0.0.1");
    try {
      await new Promise<void>((resolve, reject) => {
        socket.once("connect", resolve);
        socket.once("error", reject);
      });
      const opened = readSocketThrough(socket, "data: opened");
      socket.write("GET / HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n");
      expect(await opened).toContain("data: opened");

      const controller = await controllerReady.promise;
      await sleep(STREAM_HOLD_MS);
      const stillOpen = readSocketThrough(socket, "data: still-open");
      controller.enqueue(encoder.encode("data: still-open\n\n"));
      controller.close();
      expect(await stillOpen).toContain("data: still-open");
    } finally {
      socket.destroy();
    }
  });
});

/** Monotonic elapsed-ms via `process.hrtime` — not the ambient wall clock the determinism gate bans. This
 *  test measures REAL timer behavior (the forced-drain deadline racing a real `setTimeout`), so there is no
 *  frozen clock to inject; hrtime is the monotonic equivalent for a duration measurement. */
function elapsedMsNow(): number {
  // @orb-waive test-determinism(process.hrtime): the SUBJECT is elapsed real time — the forced-drain deadline races a real setTimeout, no frozen clock to inject (#831)
  return Number(process.hrtime.bigint()) / NS_PER_MS;
}

describe("drainHttpServer — the bounded drain (DRAIN-UNBOUNDED)", () => {
  let server: ReturnType<typeof createServer> | undefined;

  afterEach(() => {
    server?.closeAllConnections();
    server = undefined;
  });

  test("a held-open stream (an in-flight response that never ends) is force-closed at the deadline, and the warn fires", async () => {
    // The SSE shape exactly: a request IN FLIGHT whose response never completes. `closeIdleConnections()`
    // (called unconditionally at drain start) only drops keep-alive sockets with NOTHING in flight — a raw
    // socket that never sends a request qualifies as idle and would be dropped immediately, which would not
    // reproduce the bug. Writing (not ending) the response is what keeps this connection un-idle.
    server = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write("data: hello\n\n");
      // deliberately never res.end() — the live defect (an SSE stream that never ends on its own)
    });
    await new Promise<void>((resolve) => {
      server?.listen(0, "127.0.0.1", resolve);
    });
    const { port } = server.address() as AddressInfo;

    const socket = connect(port, "127.0.0.1");
    await new Promise<void>((resolve, reject) => {
      socket.once("connect", () => resolve());
      socket.once("error", reject);
    });
    socket.write("GET / HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: keep-alive\r\n\r\n");
    // Wait for the streamed bytes to actually land before draining, so the connection is provably in-flight.
    await new Promise<void>((resolve, reject) => {
      socket.once("data", () => resolve());
      socket.once("error", reject);
    });

    const warn = vi.fn();
    const startedAt = elapsedMsNow();
    await drainHttpServer(server, { warn }, DRAIN_MS);
    const elapsedMs = elapsedMsNow() - startedAt;

    expect(elapsedMs).toBeGreaterThanOrEqual(DRAIN_MS);
    expect(elapsedMs).toBeLessThan(DRAIN_MS + SLACK_MS);
    expect(warn).toHaveBeenCalledTimes(1);
    const [fields, msg] = warn.mock.calls[0] ?? [];
    expect(fields).toMatchObject({ drainMs: DRAIN_MS });
    expect(msg).toContain("drain deadline hit");

    socket.destroy();
  });

  test("no open connections drains on the fast path — no warn, well under the deadline", async () => {
    server = createServer((_req, res) => {
      res.end("ok");
    });
    await new Promise<void>((resolve) => {
      server?.listen(0, "127.0.0.1", resolve);
    });

    const warn = vi.fn();
    const startedAt = elapsedMsNow();
    await drainHttpServer(server, { warn }, DRAIN_MS);
    const elapsedMs = elapsedMsNow() - startedAt;

    expect(elapsedMs).toBeLessThan(DRAIN_MS);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("workload worker shutdown ownership", () => {
  test("aborts the worker, then holds shutdown until the owned loop settles", async () => {
    const lifecycleModule = await import("../../../packages/server/src/entry/lifecycle.ts");
    const drainWorkloadsWorker = Reflect.get(lifecycleModule, "drainWorkloadsWorker");
    expect(drainWorkloadsWorker).toBeTypeOf("function");
    const workerSettled = Promise.withResolvers<void>();
    const abort = vi.fn();
    let drainSettled = false;

    const drain = Reflect.apply(drainWorkloadsWorker as (...args: never[]) => Promise<void>, undefined, [{ abort, settled: workerSettled.promise }]).then(
      () => {
        drainSettled = true;
      },
    );
    await vi.waitFor(() => {
      expect(abort).toHaveBeenCalledTimes(1);
    });
    await Promise.resolve();
    expect(drainSettled).toBe(false);

    workerSettled.resolve();
    await drain;
    expect(drainSettled).toBe(true);
  });
});
