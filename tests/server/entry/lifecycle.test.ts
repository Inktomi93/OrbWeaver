// entry/lifecycle — DRAIN-UNBOUNDED (docs/history/dogfood-tracking-2026-08-08.md): the owed test for the bounded-drain shutdown.
// `drainHttpServer` is exported specifically so this can drive it against a REAL open socket rather than only
// being provable live — a request whose response is IN FLIGHT (written but never `.end()`ed) is exactly the
// SSE case: the server has an open connection with nothing further to finish, so `server.close()` alone would
// hang forever. Asserts the forced path completes within drainMs + slack AND that the warn fired.

import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { connect } from "node:net";
import process from "node:process";
import { afterEach, describe, vi } from "vitest";
import { drainHttpServer } from "../../../packages/server/src/entry/lifecycle.ts";
import { expect, test } from "../../support/fixtures.ts";

const DRAIN_MS = 200;
const SLACK_MS = 500;
const NS_PER_MS = 1_000_000;

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
