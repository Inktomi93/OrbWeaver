// infra/plugin-host/sandbox — the P1 runtime spike's load-bearing proof. Every claim the design premise
// stands on is EXERCISED here, not asserted (04 P1 test plan): boot/teardown, hello-world, the injected-
// seam host round-trip, DETERMINISM (same seams → byte-identical), DoS CONTAINMENT (deadline kill, deep
// recursion, memory bomb — instance dies, process healthy), handle-leak discipline across 10k invocations,
// and `boundHostFn` (sync round-trip, async promise bridge, result cap, the self-bound deadline race that
// owns the "interrupt doesn't preempt a host call" footgun).
//
// Elapsed time uses `process.hrtime.bigint()` (the test-determinism gate bans Date.now/performance.now);
// injected seams are a fixed clock + seeded LCG + counter ids (no ambient anything).

import process from "node:process";
import type { HostSeams } from "@orb/server/infra/plugin-host";
import { boundHostFn, getPluginQuickJS, Sandbox } from "@orb/server/infra/plugin-host";
import type { QuickJSContext, QuickJSHandle, VmCallResult } from "quickjs-emscripten-core";
import { isFail } from "quickjs-emscripten-core";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

const FIXED_EPOCH = 1_700_000_000_000;
const MS_PER_SEC = 1000;
const NS_PER_MS = 1_000_000;

function makeSeams(seed = 1): HostSeams {
  let state = seed;
  let counter = 0;
  const seams: HostSeams = {
    nowEpochMs: (): number => FIXED_EPOCH,
    nextRandom: (): number => {
      state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
      return state / 2_147_483_648;
    },
    mintId: (): string => `id-${counter++}`,
  };
  return seams;
}

function elapsedMs(start: [number, number]): number {
  const [seconds, nanos] = process.hrtime(start);
  return seconds * MS_PER_SEC + nanos / NS_PER_MS;
}

/** A guest that returns `JSON.stringify(x)` round-trips VERBATIM (03 §5 — a guest STRING return is the result,
 *  never re-JSON-stringified by the host), so the value IS the guest's JSON string. Parse ONE layer. */
function parseGuestJson(value: string | undefined): unknown {
  return JSON.parse(value ?? "null");
}

/** Read an evalCode / resolvePromise result into a string, disposing the handle. Accepts both the
 *  VmCallResult object union and the DisposableResult class union (structurally the same). */
function settledString(ctx: QuickJSContext, result: VmCallResult<QuickJSHandle>): string {
  const handle = isFail(result) ? result.error : result.value;
  const out = ctx.getString(handle);
  handle.dispose();
  return out;
}

describe("Sandbox — lifecycle + hello-world", () => {
  test("boots, runs a hello-world guest, and tears down", async () => {
    const sandbox = await Sandbox.create(makeSeams());
    try {
      const outcome = await sandbox.evalGuest("40 + 2");
      expect(outcome.ok).toBe(true);
      expect(outcome.value).toBe("42");
      expect(sandbox.alive).toBe(true);
    } finally {
      sandbox.dispose();
    }
    expect(sandbox.alive).toBe(false);
  });

  test("a guest object return round-trips as JSON", async () => {
    const sandbox = await Sandbox.create(makeSeams());
    try {
      const outcome = await sandbox.evalGuest("JSON.stringify({ a: 1, b: [2, 3] })");
      expect(outcome.ok).toBe(true);
      expect(parseGuestJson(outcome.value)).toEqual({ a: 1, b: [2, 3] });
    } finally {
      sandbox.dispose();
    }
  });

  test("guest state persists across invocations within one sandbox, isolated across sandboxes", async () => {
    const a = await Sandbox.create(makeSeams());
    const b = await Sandbox.create(makeSeams());
    try {
      await a.evalGuest("globalThis.stash = 99");
      // A guest STRING return flows back verbatim (03 §5) — the value IS "number"/"undefined", not re-quoted.
      expect((await a.evalGuest("typeof globalThis.stash")).value).toBe("number");
      expect((await b.evalGuest("typeof globalThis.stash")).value).toBe("undefined");
    } finally {
      a.dispose();
      b.dispose();
    }
  });
});

describe("Sandbox — injected-seam host round-trip + determinism", () => {
  test("guest reads the injected clock/random/ids through orb.host(1)", async () => {
    const sandbox = await Sandbox.create(makeSeams());
    try {
      const outcome = await sandbox.evalGuest("const h = orb.host(1); JSON.stringify({ now: h.clock.nowEpochMs(), id: h.ids.mint(), r: h.random.next() < 1 })");
      expect(outcome.ok).toBe(true);
      expect(parseGuestJson(outcome.value)).toEqual({ now: FIXED_EPOCH, id: "id-0", r: true });
    } finally {
      sandbox.dispose();
    }
  });

  test("same seams → byte-identical output; different seed → different output", async () => {
    const guest = "const h = orb.host(1); let s=''; for (let i=0;i<8;i++) s += Math.floor(h.random.next()*1e6) + ','; s";
    const run = async (seed: number): Promise<string | undefined> => {
      const sandbox = await Sandbox.create(makeSeams(seed));
      try {
        return (await sandbox.evalGuest(guest)).value;
      } finally {
        sandbox.dispose();
      }
    };
    const a1 = await run(42);
    const a2 = await run(42);
    const b = await run(99);
    expect(a1).toBe(a2);
    expect(a1).not.toBe(b);
  });
});

describe("Sandbox — DoS containment (the runtime pin)", () => {
  test("a busy loop dies at the deadline; the process stays healthy", async () => {
    const sandbox = await Sandbox.create(makeSeams(), { limits: { cpuDeadlineMs: 150 } });
    try {
      const start = process.hrtime();
      const outcome = await sandbox.evalGuest("while (true) {}");
      const took = elapsedMs(start);
      expect(outcome.ok).toBe(false);
      expect(outcome.error?.message).toContain("interrupted");
      expect(took).toBeLessThan(2000);
    } finally {
      sandbox.dispose();
    }
  });

  // Only contained because the realm sets an explicit GUEST_MAX_STACK_BYTES — without it this guest blows
  // the host stack AND makes the context un-disposable (P1 finding). This test IS the regression guard for
  // that mitigation: it errors cleanly (ok:false) and the finally-dispose does not abort the WASM module.
  test("unbounded recursion is contained (stack overflow → error, not host crash, cleanly disposable)", async () => {
    const sandbox = await Sandbox.create(makeSeams());
    try {
      const outcome = await sandbox.evalGuest("function f(n){ return f(n + 1); } f(0)");
      expect(outcome.ok).toBe(false);
    } finally {
      sandbox.dispose();
    }
  });

  // CONTAINMENT here is CORRECTNESS-containment (the guest OOMs, the process survives, isolation holds),
  // NOT RSS reclamation. P1 FINDING (README §Sharp edges): `setMemoryLimit` bounds the guest's JS heap and
  // makes the bomb a clean error, but the shared WASM linear memory grows to a MONOTONIC per-process
  // high-water mark that dispose() does NOT return to the OS — so "process RSS stable" (03 §4) is an
  // over-claim. Asserting a tight RSS delta is therefore deliberately omitted (it is unbounded here).
  test("an allocation bomb dies contained; a fresh sandbox still works", async () => {
    const sandbox = await Sandbox.create(makeSeams(), { limits: { memoryLimitBytes: 4_194_304, cpuDeadlineMs: 2000 } });
    let bombOk = true;
    try {
      bombOk = (await sandbox.evalGuest("const a = []; while (true) { a.push(new Array(10000).fill(0)); }")).ok;
    } finally {
      sandbox.dispose();
    }
    expect(bombOk).toBe(false);

    // The process survived: a brand-new instance boots and runs.
    const fresh = await Sandbox.create(makeSeams());
    try {
      expect((await fresh.evalGuest("1 + 1")).value).toBe("2");
    } finally {
      fresh.dispose();
    }
  });
});

describe("Sandbox — handle discipline", () => {
  test("10k invocations leave zero outstanding handles (no leak)", async () => {
    const sandbox = await Sandbox.create(makeSeams());
    try {
      for (let i = 0; i < 10_000; i++) {
        // biome-ignore lint/performance/noAwaitInLoops: invocations MUST be sequential (one shared context) — the loop IS the leak-discipline probe.
        const outcome = await sandbox.evalGuest("1 + 1");
        if (!outcome.ok) {
          throw new Error(`invocation ${i} failed`);
        }
      }
      expect(sandbox.pendingHandles).toBe(0);
      expect(sandbox.alive).toBe(true);
    } finally {
      sandbox.dispose();
    }
  }, 30_000);
});

describe("boundHostFn — the self-bounding membrane call", () => {
  async function withContext(fn: (ctx: QuickJSContext) => Promise<void> | void): Promise<void> {
    const mod = await getPluginQuickJS();
    const ctx = mod.newContext();
    try {
      await fn(ctx);
    } finally {
      ctx.dispose();
    }
  }

  function attach(ctx: QuickJSContext, name: string, handle: QuickJSHandle): void {
    ctx.setProp(ctx.global, name, handle);
    handle.dispose();
  }

  test("sync round-trip: args cross as strings, result marshals back", async () => {
    await withContext((ctx) => {
      attach(
        ctx,
        "echo",
        boundHostFn(ctx, "echo", (args) => `echo:${args[0]}`),
      );
      const result = ctx.evalCode("echo('hi')");
      const value = settledString(ctx, result);
      expect(value).toBe("echo:hi");
    });
  });

  test("async round-trip bridges a host promise into a guest await", async () => {
    await withContext(async (ctx) => {
      attach(
        ctx,
        "afetch",
        boundHostFn(ctx, "afetch", async () => {
          await Promise.resolve();
          return "async-result";
        }),
      );
      const result = ctx.evalCode("(async () => await afetch())()");
      expect(result.error).toBeUndefined();
      if (result.error) {
        result.error.dispose();
        return;
      }
      const native = ctx.resolvePromise(result.value);
      ctx.runtime.executePendingJobs();
      const settled = await native;
      result.value.dispose();
      expect(settledString(ctx, settled)).toBe("async-result");
    });
  });

  test("an oversized result is refused at the cap", async () => {
    await withContext((ctx) => {
      attach(
        ctx,
        "big",
        boundHostFn(ctx, "big", () => "x".repeat(50), { resultCapBytes: 10 }),
      );
      const result = ctx.evalCode("try { big(); 'NO-THROW' } catch (e) { e.message }");
      expect(settledString(ctx, result)).toContain("cap");
    });
  });

  test("a hanging host call self-bounds at its deadline (the reentrancy footgun)", async () => {
    await withContext(async (ctx) => {
      attach(
        ctx,
        "hang",
        boundHostFn(ctx, "hang", () => new Promise<string>(() => undefined), { deadlineMs: 150 }),
      );
      const result = ctx.evalCode("(async () => { try { await hang(); return 'NO-THROW' } catch (e) { return 'bounded:' + e.message } })()");
      if (result.error) {
        throw new Error("hang guest failed to start");
      }
      const native = ctx.resolvePromise(result.value);
      ctx.runtime.executePendingJobs();
      const settled = await native;
      result.value.dispose();
      expect(settledString(ctx, settled)).toContain("host bound");
    });
  });
});
