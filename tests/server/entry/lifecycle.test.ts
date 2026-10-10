// A real in-flight HTTP stream must remain open until the owned drain deadline forces it closed.

import { createServer, Server } from "node:http";
import type { AddressInfo, Socket } from "node:net";
import { connect } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";
import { afterEach, describe, vi } from "vitest";
import { drainHttpServer, HTTP_SERVER_TIMEOUTS, serveHttpServer } from "../../../packages/server/src/entry/lifecycle.ts";
import { createManualTimer } from "../../support/clock.ts";
import { expect, test } from "../../support/fixtures.ts";

const DRAIN_MS = 200;
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

  test("boot's default call forwards the chosen timeout values, not Node's implicit ones", () => {
    const serveAdapter = vi.fn<NonNullable<Parameters<typeof serveHttpServer>[3]>>(() => createServer());

    // Boot omits the options argument; the literals pin the chosen policy against a silent edit.
    serveHttpServer({ fetch: (): Response => new Response("ok"), port: 0 }, vi.fn(), undefined, serveAdapter);

    expect(serveAdapter.mock.calls[0]?.[0]).toMatchObject({
      serverOptions: { keepAliveTimeout: 5000, requestTimeout: 300_000, headersTimeout: 60_000 },
    });
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

describe("drainHttpServer — the bounded drain (DRAIN-UNBOUNDED)", () => {
  let server: ReturnType<typeof createServer> | undefined;

  afterEach(() => {
    server?.closeAllConnections();
    server = undefined;
  });

  test.each(["controlled", "native"] as const)("a held-open stream is force-closed at the %s deadline, and the warn fires", async (timerKind) => {
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

    try {
      const timer = createManualTimer();
      const warn = vi.fn();
      const forceClose = vi.spyOn(server, "closeAllConnections");
      const socketClosed = new Promise<void>((resolve) => socket.once("close", () => resolve()));
      let settled = false;
      const drained = drainHttpServer(server, { warn }, DRAIN_MS, timerKind === "controlled" ? timer.schedule : undefined).then(() => {
        settled = true;
      });
      expect(timer.armed()).toEqual(timerKind === "controlled" ? [DRAIN_MS] : []);
      await Promise.resolve();
      expect(settled).toBe(false);
      expect(warn).not.toHaveBeenCalled();
      expect(forceClose).not.toHaveBeenCalled();

      if (timerKind === "controlled") {
        timer.fire();
      }
      await drained;
      await socketClosed;
      expect(settled).toBe(true);
      expect(forceClose).toHaveBeenCalledTimes(1);
      expect(server.listening).toBe(false);
      expect(socket.destroyed).toBe(true);
      expect(warn).toHaveBeenCalledTimes(1);
      const [fields, msg] = warn.mock.calls[0] ?? [];
      expect(fields).toMatchObject({ drainMs: DRAIN_MS });
      expect(msg).toContain("drain deadline hit");
      expect(timer.armed()).toEqual([]);
    } finally {
      socket.destroy();
    }
  });

  test("no open connections drains before the deadline and cancels its timer without a late warning", async () => {
    server = createServer((_req, res) => {
      res.end("ok");
    });
    await new Promise<void>((resolve) => {
      server?.listen(0, "127.0.0.1", resolve);
    });

    const warn = vi.fn();
    const timer = createManualTimer();
    const forceClose = vi.spyOn(server, "closeAllConnections");
    await drainHttpServer(server, { warn }, DRAIN_MS, timer.schedule);

    expect(timer.cancelled()).toEqual([DRAIN_MS]);
    expect(timer.armed()).toEqual([]);
    timer.fire();
    await Promise.resolve();
    expect(forceClose).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  test("forcing connections does not complete the drain before the server close callback", async () => {
    const handle = createServer();
    server = handle;
    let completeClose: (() => void) | undefined;
    vi.spyOn(server, "close").mockImplementation((callback) => {
      completeClose = (): void => callback?.();
      return handle;
    });
    const forceClose = vi.spyOn(server, "closeAllConnections");
    const warn = vi.fn();
    const timer = createManualTimer();
    let settled = false;
    const drained = drainHttpServer(server, { warn }, DRAIN_MS, timer.schedule).then(() => {
      settled = true;
    });
    expect(timer.armed()).toEqual([DRAIN_MS]);
    timer.fire();
    await Promise.resolve();
    await Promise.resolve();
    expect(forceClose).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(settled).toBe(false);
    expect(completeClose).toBeTypeOf("function");
    completeClose?.();
    await drained;
    expect(settled).toBe(true);
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
