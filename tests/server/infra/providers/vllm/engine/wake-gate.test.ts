// Unit tests for the PRE-DISPATCH auto-wake gate (B.1/B.6). The gate asks the ENGINE whether it is asleep
// (`/is_sleeping` — never /health, never the supervisor's status registry, both of which lie about a slept
// engine), cold-gated by a short-TTL awake cache, then runs the injected reconcile → hold+VRAM gate →
// wake+await. All I/O is injected, so this is deterministic. Covers: awake → no-op; sleeping → wake →
// dispatch; the awake cache (cold probes once, warm dispatches without HTTP); a STALE registry never
// suppresses the probe (the live 2026-07-31 bug); held → refusal naming `sleeping-held`; no-headroom →
// holder-named refusal; wake timeout → retryable ProviderError; single-flight (N callers = 1 wake).

import { ProviderError } from "@orb/server/infra/providers";
import type { GpuVram, WakeGateDeps } from "@orb/server/infra/providers/vllm/engine";
import { __resetWakeGateCache, ensureAwake, setEngineStatus } from "@orb/server/infra/providers/vllm/engine";
import { beforeEach, describe } from "vitest";
import { expect, test } from "../../../../../support/fixtures";

const GIB = 1_073_741_824;
const freeGpus: GpuVram[] = [
  { index: 0, totalBytes: 48 * GIB, freeBytes: 40 * GIB, tenants: [] },
  { index: 1, totalBytes: 48 * GIB, freeBytes: 40 * GIB, tenants: [] },
];

// The awake cache is process-local module state — drop it so each spec drives a COLD gate.
beforeEach(() => {
  __resetWakeGateCache();
});

/** A deps bundle for a SLEEPING engine with ample headroom + a successful wake; each test overrides what it
 *  exercises (`isSleeping: () => false` is the awake fleet). */
function deps(over: Partial<WakeGateDeps> = {}): WakeGateDeps {
  return {
    repoRoot: "/repo",
    isSleeping: () => Promise.resolve(true),
    reap: () => Promise.resolve([]),
    queryGpu: () => Promise.resolve(freeGpus),
    wakeAndAwait: () => Promise.resolve(true),
    held: () => false,
    now: () => 1000,
    ...over,
  };
}

async function expectProviderError(p: Promise<unknown>): Promise<ProviderError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ProviderError) {
      return e;
    }
    throw e;
  }
  throw new Error("expected a ProviderError to be thrown");
}

/** A wake tracker: a wakeAndAwait fake that flips a flag when called. */
function trackWake(): { readonly wake: () => Promise<boolean>; called: () => boolean } {
  let waked = false;
  return {
    wake: (): Promise<boolean> => {
      waked = true;
      return Promise.resolve(true);
    },
    called: (): boolean => waked,
  };
}

describe("ensureAwake — awake engines are a no-op", () => {
  test("an engine that reports NOT sleeping never triggers a wake (cheap common path)", async () => {
    const t = trackWake();
    await ensureAwake("embed", deps({ isSleeping: () => Promise.resolve(false), wakeAndAwait: t.wake }));
    expect(t.called()).toBe(false);
  });

  test("a warm awake observation short-circuits the probe (one HTTP probe per TTL window, not per request)", async () => {
    let probes = 0;
    const d = deps({
      isSleeping: () => {
        probes += 1;
        return Promise.resolve(false);
      },
    });
    await ensureAwake("gen", d);
    await ensureAwake("gen", d);
    await ensureAwake("gen", d);
    expect(probes).toBe(1);
  });
});

describe("ensureAwake — sleep detection is HONEST (the engine, not the supervisor registry)", () => {
  test("sleeping + headroom + not held → wake runs, resolves (dispatch proceeds)", async () => {
    const t = trackWake();
    await ensureAwake("rerank", deps({ wakeAndAwait: t.wake }));
    expect(t.called()).toBe(true);
  });

  // THE LIVE BUG (2026-07-31): the fleet was slept by the CLI verb / the idle timer, but this process's
  // status registry still said `adopted` (no supervisor tick had reclassified it — sleepMode off, another
  // owner, or simply not yet). The old gate read that registry, no-op'd, and the turn hung on a paused
  // scheduler. A stale registry must NEVER suppress the engine's own answer.
  test("a STALE 'adopted' registry does not suppress the wake — the engine's own /is_sleeping wins", async () => {
    setEngineStatus("gen", "adopted", "stale — slept out-of-band", 1);
    const t = trackWake();
    await ensureAwake("gen", deps({ wakeAndAwait: t.wake }));
    expect(t.called()).toBe(true);
  });
});

describe("ensureAwake — refusals throw a named, non-retryable ProviderError (never a hang/OOM)", () => {
  test("HELD marker → refuse on the marker even with VRAM free, naming the sleeping-held state", async () => {
    const err = await expectProviderError(ensureAwake("embed", deps({ held: () => true })));
    expect(err.retryable).toBe(false);
    expect(err.message).toContain("sleeping-held");
    expect(err.message).toContain("engines held");
    expect(err.message).toContain("pnpm engines:wake");
  });

  test("a hold refusal never POSTs a wake — the owner's posture is not overridden", async () => {
    const t = trackWake();
    await expectProviderError(ensureAwake("gen", deps({ held: () => true, wakeAndAwait: t.wake })));
    expect(t.called()).toBe(false);
  });

  test("no VRAM headroom → refuse and NAME the holders", async () => {
    const held: GpuVram[] = [
      { index: 0, totalBytes: 48 * GIB, freeBytes: 5 * GIB, tenants: [{ pid: 3_356_292, processName: "python3", usedBytes: 40 * GIB }] },
      { index: 1, totalBytes: 48 * GIB, freeBytes: 5 * GIB, tenants: [] },
    ];
    const err = await expectProviderError(ensureAwake("gen", deps({ queryGpu: () => Promise.resolve(held) })));
    expect(err.retryable).toBe(false);
    expect(err.message).toContain("cannot wake");
    expect(err.message).toContain("python3");
  });

  test("a wake that never completes in the bound → retryable ProviderError (not a hang)", async () => {
    const err = await expectProviderError(ensureAwake("rerank", deps({ wakeAndAwait: () => Promise.resolve(false) })));
    expect(err.retryable).toBe(true);
    expect(err.message).toContain("waking timed out");
  });
});

describe("ensureAwake — single-flight (N concurrent callers collapse to ONE wake)", () => {
  test("two concurrent ensureAwake calls trigger exactly one wakeAndAwait", async () => {
    let wakeCount = 0;
    const slowWake = (): Promise<boolean> => {
      wakeCount += 1;
      return new Promise((r) => setTimeout(() => r(true), 5));
    };
    const d = deps({ wakeAndAwait: slowWake });
    await Promise.all([ensureAwake("embed", d), ensureAwake("embed", d)]);
    expect(wakeCount).toBe(1);
  });

  // Five concurrent turns on one sleeping engine: ONE wake, and every caller resolves (all five dispatch).
  test("five concurrent callers share one wake and ALL proceed", async () => {
    let wakeCount = 0;
    const slowWake = (): Promise<boolean> => {
      wakeCount += 1;
      return new Promise((r) => setTimeout(() => r(true), 5));
    };
    const d = deps({ wakeAndAwait: slowWake });
    await expect(Promise.all(Array.from({ length: 5 }, () => ensureAwake("rerank", d)))).resolves.toHaveLength(5);
    expect(wakeCount).toBe(1);
  });

  // A REFUSED wake must fail every rider too (nobody silently dispatches into a paused scheduler), and the
  // single-flight slot must clear so the NEXT request re-decides instead of inheriting a dead promise.
  test("a refused wake rejects every concurrent caller and releases the single-flight slot", async () => {
    let wakeCount = 0;
    const d = deps({
      held: () => true,
      wakeAndAwait: () => {
        wakeCount += 1;
        return Promise.resolve(true);
      },
    });
    const results = await Promise.allSettled([ensureAwake("embed", d), ensureAwake("embed", d)]);
    expect(results.map((r) => r.status)).toEqual(["rejected", "rejected"]);
    expect(wakeCount).toBe(0);
    // Slot released: a later request runs the gate again (and refuses again) rather than resolving silently.
    await expectProviderError(ensureAwake("embed", d));
  });
});
