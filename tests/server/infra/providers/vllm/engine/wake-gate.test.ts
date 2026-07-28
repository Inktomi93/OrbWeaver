// Unit tests for the PRE-DISPATCH auto-wake gate (B.1/B.6). The gate reads the process-local status registry
// to decide if a wake is needed, then runs the injected reconcile → hold+VRAM gate → wake+await. All I/O is
// injected, so this is deterministic. Covers: awake → no-op; sleeping → wake → dispatch; held → named refusal;
// no-headroom → holder-named refusal; wake timeout → retryable ProviderError; single-flight (N callers = 1 wake).

import { ProviderError } from "@orb/server/infra/providers";
import type { GpuVram, WakeGateDeps } from "@orb/server/infra/providers/vllm/engine";
import { ensureAwake, setEngineStatus } from "@orb/server/infra/providers/vllm/engine";
import { describe } from "vitest";
import { expect, test } from "../../../../../support/fixtures";

const GIB = 1_073_741_824;
const freeGpus: GpuVram[] = [
  { index: 0, totalBytes: 48 * GIB, freeBytes: 40 * GIB, tenants: [] },
  { index: 1, totalBytes: 48 * GIB, freeBytes: 40 * GIB, tenants: [] },
];

/** A deps bundle with ample headroom + a successful wake; each test overrides what it exercises. */
function deps(over: Partial<WakeGateDeps> = {}): WakeGateDeps {
  return {
    repoRoot: "/repo",
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
  test("an owned/adopted engine never triggers a wake (cheap common path)", async () => {
    setEngineStatus("embed", "owned", "", 1);
    const t = trackWake();
    await ensureAwake("embed", deps({ wakeAndAwait: t.wake }));
    expect(t.called()).toBe(false);
  });

  test("an adopted engine is dispatch-through (never woken)", async () => {
    setEngineStatus("gen", "adopted", "", 1);
    const t = trackWake();
    await ensureAwake("gen", deps({ wakeAndAwait: t.wake }));
    expect(t.called()).toBe(false);
  });
});

describe("ensureAwake — sleeping engine wakes then dispatches", () => {
  test("sleeping + headroom + not held → wake runs, resolves (dispatch proceeds)", async () => {
    setEngineStatus("rerank", "sleeping", "", 1);
    const t = trackWake();
    await ensureAwake("rerank", deps({ wakeAndAwait: t.wake }));
    expect(t.called()).toBe(true);
  });
});

describe("ensureAwake — refusals throw a named, non-retryable ProviderError (never a hang/OOM)", () => {
  test("HELD marker → refuse on the marker even with VRAM free", async () => {
    setEngineStatus("embed", "sleeping-held", "", 1);
    const err = await expectProviderError(ensureAwake("embed", deps({ held: () => true })));
    expect(err.retryable).toBe(false);
    expect(err.message).toContain("engines held");
    expect(err.message).toContain("pnpm engines:wake");
  });

  test("no VRAM headroom → refuse and NAME the holders", async () => {
    setEngineStatus("gen", "sleeping", "", 1);
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
    setEngineStatus("rerank", "sleeping", "", 1);
    const err = await expectProviderError(ensureAwake("rerank", deps({ wakeAndAwait: () => Promise.resolve(false) })));
    expect(err.retryable).toBe(true);
    expect(err.message).toContain("waking timed out");
  });
});

describe("ensureAwake — single-flight (N concurrent callers collapse to ONE wake)", () => {
  test("two concurrent ensureAwake calls trigger exactly one wakeAndAwait", async () => {
    setEngineStatus("embed", "sleeping", "", 1);
    let wakeCount = 0;
    const slowWake = (): Promise<boolean> => {
      wakeCount += 1;
      return new Promise((r) => setTimeout(() => r(true), 5));
    };
    const d = deps({ wakeAndAwait: slowWake });
    await Promise.all([ensureAwake("embed", d), ensureAwake("embed", d)]);
    expect(wakeCount).toBe(1);
  });
});
