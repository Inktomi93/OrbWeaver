// Unit tests for the fleet sleep/wake control library — the wake DECISION (hold marker ⊕ VRAM budget) and
// the hold-marker file round-trip. The wake decision is pure (marker bool + gpu facts injected); the marker
// helpers touch a tmp dir. The HTTP helpers (postSleep/postWakeAndAwait) are live-only (step 9).

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AutoSleepState, EngineUtilFractions, GpuVram, WakeDecision } from "@orb/server/infra/providers/vllm/engine";
import {
  advanceAutoSleep,
  clearHold,
  decideWake,
  holdMarkerPath,
  initialAutoSleepState,
  isEngineIdle,
  isHeld,
  parseEngineMetrics,
  writeHold,
} from "@orb/server/infra/providers/vllm/engine";
import { afterEach, beforeEach, describe } from "vitest";
import { expect, test } from "../../../../../support/fixtures.ts";

/** Narrow a wake decision to its refusal arm or fail the test — avoids conditional-expect. */
function refused(d: WakeDecision): Extract<WakeDecision, { ok: false }> {
  if (d.ok) {
    throw new Error("expected a wake refusal");
  }
  return d;
}

const GIB = 1_073_741_824;

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
    expect(decision.reason).toContain("pnpm engines:wake");
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
