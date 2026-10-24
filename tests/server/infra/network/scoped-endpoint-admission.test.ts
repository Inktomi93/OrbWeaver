import { createServer } from "node:http";
import { setImmediate } from "node:timers/promises";
import { queryObjects } from "node:v8";
import { ANY_HOST, createScopedEgress, systemConnector, systemFetch, systemResolver } from "@orb/server/infra/network";
import { createControlledTimers, createFrozenClock } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { createTestLogger } from "@orb/testkit/node/composed";
import { createTestEnv } from "@orb/testkit/node/helpers";
import { budget } from "@orb/tooling/floor/host/load-budget";

// A fresh scheduler per egress: these cases never wait on a deadline, so nothing advances it.
function quietTimers(): ReturnType<typeof createControlledTimers> {
  return createControlledTimers(createFrozenClock());
}

test("unresolved write-time endpoint admission remains public without attempting a physical request", async () => {
  const failure = new Error("controlled NXDOMAIN");
  let rawCalls = 0;
  await using egress = createScopedEgress({
    log: createTestLogger(),
    env: createTestEnv(),
    timers: quietTimers(),
    buildConnector: systemConnector,
    resolver: () => Promise.reject(failure),
    fetch: () => {
      rawCalls += 1;
      return Promise.reject(new Error("write admission attempted raw HTTP"));
    },
  });
  await expect(egress.resolvedEndpointAdmission("https://unresolved.example/v1")).resolves.toBe("public");
  expect(rawCalls).toBe(0);
});

test.each([
  { address: "93.184.215.14", verdict: "public", allowlist: [] },
  { address: "10.0.0.7", verdict: "refused", allowlist: [] },
  { address: "169.254.169.254", verdict: "refused", allowlist: ["0.0.0.0/0"] },
] as const)("write-time admission preserves $address as $verdict", async ({ address, verdict, allowlist }) => {
  await using egress = createScopedEgress({
    log: createTestLogger(),
    env: createTestEnv(),
    timers: quietTimers(),
    buildConnector: systemConnector,
    resolver: () => Promise.resolve([address]),
    fetch: () => Promise.reject(new Error("write admission attempted raw HTTP")),
  });
  egress.publishPrivateEndpointAllowlist(allowlist);
  await expect(egress.resolvedEndpointAdmission("https://resolved.example/v1")).resolves.toBe(verdict);
});

test("configured and arbitrary URL execution still reject DNS failure before the raw transport", async () => {
  const failure = new Error("controlled physical DNS refusal");
  let rawCalls = 0;
  await using egress = createScopedEgress({
    log: createTestLogger(),
    env: createTestEnv(),
    timers: quietTimers(),
    buildConnector: systemConnector,
    resolver: () => Promise.reject(failure),
    fetch: () => {
      rawCalls += 1;
      return Promise.reject(new Error("a DNS failure reached the raw transport"));
    },
  });
  await expect(egress.configuredEndpointFetch("https://unresolved.example/v1")).rejects.toBe(failure);
  await expect(egress.safeFetch("https://unresolved.example/asset", { allowedHosts: ANY_HOST })).rejects.toBe(failure);
  expect(rawCalls).toBe(0);
});

// The GC=true case has no observable to stop on, so it pays all 12 heap walks: measured 7.8 s on a loaded 24-core box, ~0.6 s per walk.
const FORCED_GC_BASE_MS = 20_000;

test.each([false, true])(
  "caller abort after Request GC=%s cancels the locked physical response and closes its unfinished socket",
  { timeout: budget(FORCED_GC_BASE_MS) },
  async (collectRequest) => {
    await using lifetime = new AsyncDisposableStack();
    let responseClosed = false;
    let socketClosed = false;
    let responseFinished = false;
    const server = createServer((incoming, outgoing) => {
      incoming.socket.once("close", () => {
        socketClosed = true;
      });
      outgoing.once("close", () => {
        responseClosed = true;
        responseFinished = outgoing.writableFinished;
      });
      outgoing.writeHead(200, { "content-type": "text/plain" });
      outgoing.write("held physical bytes");
    });
    lifetime.defer(async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close((error) => (error === undefined ? resolve() : reject(error))));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("native egress control requires a physical loopback listener");
    }
    // The physical loopback control: the real request and DNS against a real listener.
    await using egress = createScopedEgress({
      log: createTestLogger(),
      env: createTestEnv(),
      timers: quietTimers(),
      buildConnector: systemConnector,
      fetch: systemFetch,
      resolver: systemResolver,
    });
    egress.publishPrivateEndpointAllowlist([`127.0.0.1:${address.port}`]);
    const stop = new AbortController();
    const response = await egress.configuredEndpointFetch(`http://127.0.0.1:${address.port}/held`, { signal: stop.signal });
    const reader = response.body?.getReader();
    if (reader === undefined) {
      throw new Error("native egress control requires a response body");
    }
    try {
      expect(new TextDecoder().decode((await reader.read()).value)).toBe("held physical bytes");
      if (collectRequest) {
        for (let turn = 0; turn < 12; turn += 1) {
          await setImmediate();
          queryObjects(Request, { format: "count" });
        }
      }
      let rejected = false;
      const reading = reader.read().catch((error: unknown) => {
        rejected = true;
        return error;
      });
      stop.abort();
      await expect.poll(() => ({ responseClosed, socketClosed, rejected })).toEqual({ responseClosed: true, socketClosed: true, rejected: true });
      expect(responseFinished).toBe(false);
      expect(await reading).toBe(stop.signal.reason);
    } finally {
      stop.abort();
      try {
        await egress[Symbol.asyncDispose]();
      } finally {
        reader.releaseLock();
      }
    }
  },
);

test.each(["EOF", "error", "cancel"] as const)(
  "configured Request ownership releases after physical body %s while its context remains live",
  async (terminal) => {
    await using lifetime = new AsyncDisposableStack();
    const finish = Promise.withResolvers<() => void>();
    let physicallyClosed = false;
    const server = createServer((incoming, outgoing) => {
      if (incoming.url === "/still-live") {
        outgoing.end("fresh physical bytes");
        return;
      }
      outgoing.once("close", () => {
        physicallyClosed = true;
      });
      outgoing.writeHead(200, { "content-type": "text/plain" });
      outgoing.write("held");
      finish.resolve(() => {
        if (terminal === "error") {
          outgoing.destroy(new Error("controlled physical response failure"));
        } else {
          outgoing.end(" completed");
        }
      });
    });
    lifetime.defer(async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close((error) => (error === undefined ? resolve() : reject(error))));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("native Request ownership control requires a physical loopback listener");
    }
    let normalized: WeakRef<Request> | undefined;
    await using egress = createScopedEgress({
      log: createTestLogger(),
      env: createTestEnv(),
      timers: quietTimers(),
      buildConnector: systemConnector,
      resolver: systemResolver,
      fetch: (input, init) => {
        if (!(input instanceof Request)) {
          throw new Error("configured egress did not normalize its native Request");
        }
        normalized = new WeakRef(input);
        return globalThis.fetch(input, init);
      },
    });
    egress.publishPrivateEndpointAllowlist([`127.0.0.1:${address.port}`]);
    const response = await egress.configuredEndpointFetch(`http://127.0.0.1:${address.port}/release`);
    const reader = response.body?.getReader();
    if (reader === undefined) {
      throw new Error("native Request ownership control requires a response body");
    }
    try {
      expect(new TextDecoder().decode((await reader.read()).value)).toBe("held");
      await setImmediate();
      queryObjects(Request, { format: "count" });
      expect(normalized?.deref()).toBeDefined();
      if (terminal === "cancel") {
        await reader.cancel("caller abandoned the physical body");
      } else {
        (await finish.promise)();
      }
      const remaining = await reader.read().then(
        (next) => ({ error: false, done: next.done, bytes: new TextDecoder().decode(next.value) }),
        (error: unknown) => ({ error: error instanceof Error, done: false, bytes: "" }),
      );
      expect(remaining).toEqual({ error: terminal === "error", done: terminal === "cancel", bytes: terminal === "EOF" ? " completed" : "" });
      const ended = await reader.read().then(
        (next) => next.done,
        () => false,
      );
      expect(ended).toBe(terminal !== "error");
      await expect.poll(() => physicallyClosed).toBe(true);
      // Each queryObjects walks the whole heap; stop at the first turn that collects the Request.
      for (let turn = 0; turn < 12 && normalized?.deref() !== undefined; turn += 1) {
        await setImmediate();
        queryObjects(Request, { format: "count" });
      }
      expect(normalized?.deref()).toBeUndefined();
      expect(await (await egress.configuredEndpointFetch(`http://127.0.0.1:${address.port}/still-live`)).text()).toBe("fresh physical bytes");
    } finally {
      try {
        await egress[Symbol.asyncDispose]();
      } finally {
        reader.releaseLock();
      }
    }
  },
);
