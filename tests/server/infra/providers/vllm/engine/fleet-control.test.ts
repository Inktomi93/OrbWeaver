// Unit tests for the fleet sleep/wake control library — the wake DECISION (hold marker ⊕ VRAM budget) and
// the hold-marker file round-trip. The wake decision is pure (marker bool + gpu facts injected); the marker
// helpers touch a tmp dir. The HTTP helpers (postSleep/postWakeAndAwait) are live-only (step 9).

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AutoSleepState, EngineUtilFractions, GpuVram, WakeDecision } from "@orb/server/infra/providers/vllm/engine";
import {
  advanceAutoSleep,
  capacityWarnings,
  clearHold,
  clearStopped,
  decideWake,
  getIsSleeping,
  holdMarkerPath,
  initialAutoSleepState,
  isEngineIdle,
  isHeld,
  isStopped,
  parseEngineCapacity,
  parseEngineMetrics,
  postWakeAndAwait,
  stoppedMarkerPath,
  writeHold,
  writeStopped,
} from "@orb/server/infra/providers/vllm/engine";
import { afterEach, beforeEach, describe, vi } from "vitest";
import { expect, test } from "../../../../../support/fixtures.ts";

/** Narrow a wake decision to its refusal arm or fail the test — avoids conditional-expect. */
function refused(d: WakeDecision): Extract<WakeDecision, { ok: false }> {
  if (d.ok) {
    throw new Error("expected a wake refusal");
  }
  return d;
}

const GIB = 1_073_741_824;

afterEach(() => vi.unstubAllGlobals());

test("an unreadable sleep-state probe cannot be reported as a successful wake", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string | URL) => {
      if (String(input).includes("/wake_up")) {
        return Promise.resolve(new Response(null, { status: 200 }));
      }
      return Promise.reject(new Error("planted sleep-state probe failure"));
    }),
  );
  await expect(getIsSleeping("gen")).resolves.toBeNull();
  let now = 0;
  await expect(
    postWakeAndAwait("gen", {
      now: () => now,
      sleep: (ms) => {
        now += ms;
        return Promise.resolve();
      },
    }),
  ).resolves.toBe(false);
});

const UTIL: EngineUtilFractions = {
  embedGpuUtil: 0.14,
  rerankGpuUtilMulti: 0.16,
  rerankGpuUtilSingle: 0.22,
  genGpuUtilMulti: 0.55,
  genGpuUtilSingle: 0.5,
};

const freeGpus = (freeGib: number): GpuVram[] => [
  { index: 0, totalBytes: 48 * GIB, freeBytes: freeGib * GIB, tenants: [] },
  { index: 1, totalBytes: 48 * GIB, freeBytes: freeGib * GIB, tenants: [] },
];

describe("decideWake — hold marker gate BEFORE the budget", () => {
  test("held → refuses on the marker even with ample VRAM free (intent ahead of occupancy)", () => {
    const decision = refused(decideWake("gen", { held: true, gpuCount: 2, util: UTIL, gpus: freeGpus(48) }));
    expect(decision.heldMarker).toBe(true);
    expect(decision.reason).toContain("engines held");
    expect(decision.reason).toContain("pnpm engines wake");
  });

  test("not held + headroom → ok", () => {
    expect(decideWake("gen", { held: false, gpuCount: 2, util: UTIL, gpus: freeGpus(40) })).toEqual({ ok: true });
  });

  test("not held + a held GPU → refuses on the budget, names the holder (not the marker)", () => {
    const gpus: GpuVram[] = [
      { index: 0, totalBytes: 48 * GIB, freeBytes: 9 * GIB, tenants: [{ pid: 3_356_292, processName: "python3", usedBytes: 38 * GIB }] },
      { index: 1, totalBytes: 48 * GIB, freeBytes: 40 * GIB, tenants: [] },
    ];
    const decision = refused(decideWake("gen", { held: false, gpuCount: 2, util: UTIL, gpus }));
    expect(decision.heldMarker).toBe(false);
    expect(decision.reason).toContain("wake refused");
    expect(decision.reason).toContain("python3");
  });
});

describe("hold marker file round-trip", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "orb-hold-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("write → isHeld true; clear → isHeld false; clear is idempotent", () => {
    expect(isHeld(dir)).toBe(false);
    writeHold(dir, 1_700_000_000_000);
    expect(isHeld(dir)).toBe(true);
    expect(holdMarkerPath(dir)).toContain("engines.hold");
    clearHold(dir);
    expect(isHeld(dir)).toBe(false);
    clearHold(dir); // no throw on a missing marker
    expect(isHeld(dir)).toBe(false);
  });
});

// #1929: the stopped marker mirrors the hold marker's file round-trip, but is a SEPARATE file (a different
// axis — takeover-suppression, not wake-suppression) so the two never collide or alias each other.
describe("stopped marker file round-trip (#1929)", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "orb-stopped-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("write → isStopped true; clear → isStopped false; clear is idempotent", () => {
    expect(isStopped(dir)).toBe(false);
    writeStopped(dir, 1_700_000_000_000, "nate");
    expect(isStopped(dir)).toBe(true);
    expect(stoppedMarkerPath(dir)).toContain("engines.stopped");
    clearStopped(dir);
    expect(isStopped(dir)).toBe(false);
    clearStopped(dir); // no throw on a missing marker
    expect(isStopped(dir)).toBe(false);
  });

  test("the stopped marker and the hold marker are independent files", () => {
    writeHold(dir, 1_700_000_000_000);
    expect(isStopped(dir)).toBe(false);
    writeStopped(dir, 1_700_000_000_000, "nate");
    expect(isHeld(dir)).toBe(true);
    expect(isStopped(dir)).toBe(true);
    clearHold(dir);
    expect(isHeld(dir)).toBe(false);
    expect(isStopped(dir)).toBe(true); // clearing the hold never touches the stopped marker
  });
});

describe("parseEngineMetrics — Prometheus /metrics scrape (real vLLM label shapes)", () => {
  const scrape = [
    "# HELP vllm:num_requests_running running",
    'vllm:num_requests_running{engine="0",model_name="Qwen"} 2.0',
    'vllm:num_requests_waiting{engine="0",model_name="Qwen"} 1.0',
    'vllm:num_requests_waiting_by_reason{engine="0",reason="capacity"} 5.0',
    'vllm:request_success_total{engine="0",finished_reason="stop"} 10.0',
    'vllm:request_success_total{engine="0",finished_reason="length"} 3.0',
  ].join("\n");

  test("reads running + waiting, EXCLUDES waiting_by_reason, SUMS success across finished_reasons", () => {
    expect(parseEngineMetrics(scrape)).toEqual({ running: 2, waiting: 1, successTotal: 13 });
  });

  test("empty/absent metrics → all zero (never NaN)", () => {
    expect(parseEngineMetrics("")).toEqual({ running: 0, waiting: 0, successTotal: 0 });
  });
});

describe("parseEngineCapacity / capacityWarnings — contention + KV headroom (#24)", () => {
  // Label shapes + the cache-config values are COPIED from a live gen engine's /metrics (Qwen3-VL, 2 GPUs).
  const cacheConfig = 'vllm:cache_config_info{block_size="16",engine="0",gpu_memory_utilization="0.55",num_gpu_blocks="15393"} 1.0';
  const scrape = [
    'vllm:num_requests_running{engine="0",model_name="Qwen"} 3.0',
    'vllm:num_requests_waiting{engine="0",model_name="Qwen"} 4.0',
    'vllm:num_requests_waiting_by_reason{engine="0",reason="capacity"} 4.0',
    'vllm:num_requests_waiting_by_reason{engine="0",reason="deferred"} 7.0',
    'vllm:num_preemptions_total{engine="0",model_name="Qwen"} 2.0',
    'vllm:kv_cache_usage_perc{engine="0",model_name="Qwen"} 0.91',
    cacheConfig,
  ].join("\n");

  test("counts only the CAPACITY waiting reason — `deferred` is a grammar wait, not contention", () => {
    const m = parseEngineCapacity(scrape, "gen");
    expect(m.waitingCapacity).toBe(4);
    expect(m.running).toBe(3);
    expect(m.preemptionsTotal).toBe(2);
    expect(m.kvCacheUsagePerc).toBeCloseTo(0.91);
  });

  // The pin that proves the derivation is vLLM's own: blocks × block_size / the env ctx window — at the
  // 32k window this engine printed "Maximum concurrency for 32,768 tokens per request: 7.52x" for these
  // exact blocks (15393 × 16 / 32768); the window default is 65_536 now, so the same fixture derives half.
  test("derives maxConcurrency matching the engine's own startup line", () => {
    const m = parseEngineCapacity(scrape, "gen");
    expect(m.maxConcurrency).not.toBeNull();
    expect(m.maxConcurrency ?? 0).toBeCloseTo(3.758, 2);
    expect(m.kvHeadroomOk).toBe(true);
  });

  // The VERBATIM cache_config_info line from a live engine. It carries four decoy labels ending in
  // `block_size` (`_block_size_resolved`, `hash_block_size`, `mamba_block_size`, `user_specified_block_size`)
  // — a substring-matching read sources the denominator from whichever appears first.
  test("reads the exact label off a REAL cache_config_info line, not a decoy `*_block_size`", () => {
    const real =
      'vllm:cache_config_info{_block_size_resolved="True",block_size="16",cache_dtype="auto",enable_prefix_caching="True",' +
      'engine="0",gpu_memory_utilization="0.55",hash_block_size="None",mamba_block_size="None",num_cpu_blocks="None",' +
      'num_gpu_blocks="15393",num_gpu_blocks_override="None",user_specified_block_size="False"} 1.0';
    const m = parseEngineCapacity(real, "gen");
    // 15393 × 16 / 65536. A decoy read would not land here.
    expect(m.maxConcurrency ?? 0).toBeCloseTo(3.758, 2);
  });

  // The live line's decoys are all non-numeric ("True"/"None"/"False"), which Number() rejects — so the test
  // above passes even under a substring-matching read (verifier planted that exact mutant: green). A NUMERIC
  // decoy sorted before `block_size` is what actually discriminates exact-label from substring matching:
  // a `.includes("block_size")` read takes 512 here and reports 120.2x instead of 3.758x.
  test("a NUMERIC decoy label does not poison the denominator (kills the substring-match mutant)", () => {
    const numericDecoy = 'vllm:cache_config_info{_block_size_resolved="1024",block_size="16",engine="0",mamba_block_size="512",num_gpu_blocks="15393"} 1.0';
    const m = parseEngineCapacity(numericDecoy, "gen");
    expect(m.maxConcurrency ?? 0).toBeCloseTo(3.758, 2);
  });

  test("absent cache_config_info → UNKNOWN headroom (null), never a passing zero", () => {
    const m = parseEngineCapacity('vllm:num_requests_running{engine="0"} 0.0', "gen");
    expect(m.maxConcurrency).toBeNull();
    expect(m.kvHeadroomOk).toBeNull();
    expect(capacityWarnings("gen", m)).toEqual([]);
  });

  test("headroom below 1x warns — the cache cannot hold one full-length request", () => {
    const starved = ['vllm:cache_config_info{block_size="16",engine="0",num_gpu_blocks="1024"} 1.0'].join("\n");
    const m = parseEngineCapacity(starved, "gen");
    expect(m.maxConcurrency ?? 0).toBeCloseTo(0.25, 2);
    expect(m.kvHeadroomOk).toBe(false);
    expect(capacityWarnings("gen", m).some((w) => w.includes("KV headroom"))).toBe(true);
  });

  test("a healthy idle engine produces NO warnings (the warning list is a signal, not decoration)", () => {
    const healthy = [
      'vllm:num_requests_running{engine="0"} 0.0',
      'vllm:num_requests_waiting_by_reason{engine="0",reason="capacity"} 0.0',
      'vllm:num_preemptions_total{engine="0"} 0.0',
      cacheConfig,
    ].join("\n");
    expect(capacityWarnings("gen", parseEngineCapacity(healthy, "gen"))).toEqual([]);
  });

  test("queued-for-capacity and preemptions each raise their own warning", () => {
    const warnings = capacityWarnings("gen", parseEngineCapacity(scrape, "gen"));
    expect(warnings.some((w) => w.includes("queued for CAPACITY"))).toBe(true);
    expect(warnings.some((w) => w.includes("preemption"))).toBe(true);
  });
});

describe("isEngineIdle — running/waiting zero AND success unchanged since last tick", () => {
  test("first observation (null prev) is never idle — no baseline for the success delta", () => {
    expect(isEngineIdle(null, { running: 0, waiting: 0, successTotal: 0 })).toBe(false);
  });
  test("quiet + success flat → idle", () => {
    expect(isEngineIdle({ running: 0, waiting: 0, successTotal: 5 }, { running: 0, waiting: 0, successTotal: 5 })).toBe(true);
  });
  test("a completed request (success bumped) between ticks → NOT idle", () => {
    expect(isEngineIdle({ running: 0, waiting: 0, successTotal: 5 }, { running: 0, waiting: 0, successTotal: 6 })).toBe(false);
  });
  test("in-flight running/waiting → NOT idle", () => {
    expect(isEngineIdle({ running: 0, waiting: 0, successTotal: 5 }, { running: 1, waiting: 0, successTotal: 5 })).toBe(false);
    expect(isEngineIdle({ running: 0, waiting: 0, successTotal: 5 }, { running: 0, waiting: 2, successTotal: 5 })).toBe(false);
  });
});

describe("advanceAutoSleep — the idle timer (injected clock)", () => {
  const quiet = { running: 0, waiting: 0, successTotal: 5 };
  const idleMs = 600_000;

  test("arms idleSince on the FIRST idle tick, does not sleep yet", () => {
    // First tick sets prev (never idle); second tick (quiet, success flat) arms.
    const t1 = advanceAutoSleep(initialAutoSleepState, quiet, 1000, idleMs);
    expect(t1.shouldSleep).toBe(false);
    const t2 = advanceAutoSleep(t1.state, quiet, 2000, idleMs);
    expect(t2.shouldSleep).toBe(false);
    expect(t2.state.idleSince).toBe(2000);
  });

  test("sleeps once the idle window elapses, then clears idleSince (no immediate re-fire)", () => {
    const armed: AutoSleepState = { prev: quiet, idleSince: 1000 };
    const decision = advanceAutoSleep(armed, quiet, 1000 + idleMs, idleMs);
    expect(decision.shouldSleep).toBe(true);
    expect(decision.state.idleSince).toBeNull();
  });

  test("a request between ticks (success bump) DISARMS the timer (thrash guard)", () => {
    const armed: AutoSleepState = { prev: quiet, idleSince: 1000 };
    const busy = { running: 0, waiting: 0, successTotal: 6 };
    const decision = advanceAutoSleep(armed, busy, 1000 + idleMs, idleMs);
    expect(decision.shouldSleep).toBe(false);
    expect(decision.state.idleSince).toBeNull();
  });

  test("idleMs <= 0 disables — never sleeps even when idle forever", () => {
    const armed: AutoSleepState = { prev: quiet, idleSince: 1 };
    expect(advanceAutoSleep(armed, quiet, 10_000_000, 0).shouldSleep).toBe(false);
  });

  test("a null metrics fetch (engine down / can't tell) disarms — never auto-sleep on missing data", () => {
    const armed: AutoSleepState = { prev: quiet, idleSince: 1000 };
    const decision = advanceAutoSleep(armed, null, 1000 + idleMs, idleMs);
    expect(decision.shouldSleep).toBe(false);
    expect(decision.state).toEqual({ prev: null, idleSince: null });
  });
});
