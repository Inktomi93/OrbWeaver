// infra/plugin-host/sandbox — the P1 runtime spike's load-bearing proof. Every claim the design premise
// stands on is EXERCISED here, not asserted (04 P1 test plan): boot/teardown, hello-world, the injected-
// seam host round-trip, DETERMINISM (same seams → byte-identical), DoS CONTAINMENT (deadline kill, deep
// recursion, memory bomb — instance dies, process healthy), handle-leak discipline across 10k invocations,
// and the invocation settlement deadline that owns the "interrupt doesn't preempt a host call" footgun.
//
// Elapsed time uses `process.hrtime()`/`process.hrtime.bigint()` (the test-determinism gate bans Date.now/
// performance.now/process.hrtime — #831); injected seams are a fixed clock + seeded LCG + counter ids (no
// ambient anything). Each hrtime call site carries the shared `@orb-waive test-determinism(process.hrtime)`
// marker (the central final-runtime spelling; the legacy `@orb-gate-ignore` it replaced is inert now that
// the gate is a defineGate policy).

import process from "node:process";
import type { HostSeams } from "@orb/server/infra/plugin-host";
import { PLUGIN_INVOCATION_ENDED, Sandbox } from "@orb/server/infra/plugin-host";
import { budget } from "@orb/tooling/_shared/load-budget";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

const FIXED_EPOCH = 1_700_000_000_000;
const MS_PER_SEC = 1000;
const NS_PER_MS = 1_000_000;
/** The bomb's own `cpuDeadlineMs: 2000` plus a fresh sandbox boot + eval measured at ~500 ms combined on a
 *  quiet box — the unit project's shared `budget(BASE_TEST_TIMEOUT_MS)` (5 s, vitest.config.ts) leaves this
 *  ONE test almost no headroom once the bomb's interrupt has to fire under contention. `budget()` (not a
 *  bare number) so it still stretches with the same per-core reading every other wall clock in the repo
 *  uses. */
const ALLOCATION_BOMB_TIMEOUT_MS = budget(10_000);

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
  // @orb-waive test-determinism(process.hrtime): the SUBJECT is elapsed real time — the monotonic clock is the instrument here, no frozen clock could measure a real DoS-deadline race (#831)
  const [seconds, nanos] = process.hrtime(start);
  return seconds * MS_PER_SEC + nanos / NS_PER_MS;
}

/** A guest that returns `JSON.stringify(x)` round-trips VERBATIM (03 §5 — a guest STRING return is the result,
 *  never re-JSON-stringified by the host), so the value IS the guest's JSON string. Parse ONE layer. */
function parseGuestJson(value: string | undefined): unknown {
  return JSON.parse(value ?? "null");
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

  // `Sandbox implements Disposable` is what lets the NON-resident snippet path (`port.runSnippet`) be a `using`
  // declaration instead of a hand-written finally. A resident sandbox is deliberately NOT scope-owned — its
  // ownership belongs to the port's `runtimes` registry — so only the one-shot path takes this.
  test("a `using` sandbox tears down at scope exit, on the throw path too", async () => {
    let escaped: Sandbox | undefined;
    const run = async (): Promise<void> => {
      using sandbox = await Sandbox.create(makeSeams());
      escaped = sandbox;
      expect(sandbox.alive).toBe(true);
      throw new Error("guest work faulted");
    };
    await expect(run()).rejects.toThrow("guest work faulted");
    expect(escaped?.alive).toBe(false);
  });

  test("`[Symbol.dispose]` is teardown, and teardown stays re-entrant", async () => {
    const sandbox = await Sandbox.create(makeSeams());
    sandbox[Symbol.dispose]();
    expect(sandbox.alive).toBe(false);
    // A `using` scope exit landing after a hand `dispose()` (or the reverse) must not double-free the context —
    // quickjs's `Lifetime.dispose` throws on a second call, so the `alive` guard inside teardown is load-bearing.
    sandbox.dispose();
    sandbox[Symbol.dispose]();
    expect(sandbox.alive).toBe(false);
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
      // @orb-waive test-determinism(process.hrtime): the SUBJECT is elapsed real time — proving the busy loop dies at a real deadline, no frozen clock to inject (#831)
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
  test("an allocation bomb dies contained; a fresh sandbox still works", { timeout: ALLOCATION_BOMB_TIMEOUT_MS }, async () => {
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

// The interrupt handler preempts guest BYTECODE only (budgets.ts header), so a guest that STOPS executing —
// `new Promise(() => {})`, an await that never resumes — is structurally invisible to it: before the settlement
// deadline landed, `runToSettlement` awaited such a guest FOREVER (measured: the control below dies at ~5 s
// while a never-settling promise never returned), stranding the context, wedging the per-instance FIFO, and
// hiding the hang from the 3-strike crash policy (which only ever counts a REJECTION).
describe("Sandbox — the invocation SETTLEMENT deadline (what the interrupt cannot bound)", () => {
  test("a guest promise that never settles ENDS the invocation at the wall (not a hang)", async () => {
    const sandbox = await Sandbox.create(makeSeams(), { limits: { cpuDeadlineMs: 100, settleGraceMs: 150 } });
    try {
      // @orb-waive test-determinism(process.hrtime): the SUBJECT is elapsed real time — proving the settlement deadline ends the invocation at the wall, no frozen clock to inject (#831)
      const start = process.hrtime();
      const outcome = await sandbox.evalGuest("new Promise(() => {})");
      const took = elapsedMs(start);
      expect(outcome.ok).toBe(false);
      // The design's `PluginInvocationEnded` (03 §3), as DATA — nothing crosses back into the guest realm.
      expect(outcome.error?.name).toBe(PLUGIN_INVOCATION_ENDED);
      // It ended at the WALL (cpu + grace), not at the cpu deadline and not never.
      expect(took).toBeGreaterThanOrEqual(200);
      expect(took).toBeLessThan(3000);
      // Handle discipline holds through the ended path — the taken guest-promise handle was freed (an alive
      // handle at teardown ABORTS the shared WASM module; see the next test).
      expect(sandbox.pendingHandles).toBe(0);
    } finally {
      sandbox.dispose();
    }
  });

  test("after an ENDED invocation the instance still runs, tears down cleanly, and the PROCESS survives", async () => {
    // THE HOST-CRASH PIN. `dispose()` with the abandoned guest-promise handle still alive aborts the shared
    // WASM module (`Assertion failed: list_empty(&rt->gc_obj_list)` in JS_FreeRuntime) — which would kill every
    // OTHER plugin's context in the process. A hung guest is guest-CONTROLLED, so that abort would be
    // guest-reachable: this asserts the ended path frees what it took.
    const sandbox = await Sandbox.create(makeSeams(), { limits: { cpuDeadlineMs: 100, settleGraceMs: 150 } });
    expect((await sandbox.evalGuest("new Promise(() => {})")).ok).toBe(false);
    // One hung handler must not kill the instance: a resident sandbox is ONE context shared by every
    // tool/transform/event handler, and there is no lazy re-activation to recover it.
    expect(sandbox.alive).toBe(true);
    expect((await sandbox.evalGuest("1 + 1")).value).toBe("2");
    sandbox.dispose();
    expect(sandbox.alive).toBe(false);

    const fresh = await Sandbox.create(makeSeams());
    try {
      expect((await fresh.evalGuest("40 + 2")).value).toBe("42");
    } finally {
      fresh.dispose();
    }
  });

  test("the wall does NOT preempt a guest still burning bytecode — that stays the interrupt's kill", async () => {
    // Ordering pin: the settlement wall sits ABOVE the cpu deadline by the grace, so a busy loop is still
    // killed by the interrupt (`interrupted`), never mis-reported as an ended invocation.
    const sandbox = await Sandbox.create(makeSeams(), { limits: { cpuDeadlineMs: 100, settleGraceMs: 5000 } });
    try {
      const outcome = await sandbox.evalGuest("while (true) {}");
      expect(outcome.ok).toBe(false);
      expect(outcome.error?.message).toContain("interrupted");
      expect(outcome.error?.name).not.toBe(PLUGIN_INVOCATION_ENDED);
    } finally {
      sandbox.dispose();
    }
  });
});

describe("Sandbox — handle discipline", () => {
  test("10k invocations leave zero outstanding handles (no leak)", async () => {
    const sandbox = await Sandbox.create(makeSeams());
    try {
      for (let i = 0; i < 10_000; i++) {
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
