// Unit tests for the vLLM supervisor's THREE pure decision cores (no IO, injected inputs) — the measured
// lifecycle matrix (Esoteric §4). `decideTick` is the reconciliation judgment; `breakerAllows` is the
// crash-loop window math; `findOrphanedEngineCores` is the cwd-based orphan match. The IO shell
// (spawn/fetch/ps) is NOT unit-tested here — these cores ARE the supervisor's testable logic.

import {
  breakerAllows,
  decideTick,
  findOrphanedEngineCores,
} from "@orb/server/infra/providers/vllm/engine";
import { describe } from "vitest";
import { expect, test } from "../../../../../support/fixtures";

// The measured thresholds (mirrored from the supervisor constants — the matrix asserts against them).
const BREAKER_WINDOW_MS = 600_000; // 10m
const BREAKER_HALF_OPEN_MS = 900_000; // 15m
const STACK_BOOT_GRACE_MS = 900_000; // 15m

// A healthy-standalone baseline; each test overrides only the fields under exercise. `satisfies` types it
// against decideTick's parameter without naming the file-local TickInput (it isn't exported — by design).
const base = {
  status: "down",
  probe: "free",
  seenHealthy: false,
  stackMode: false,
  bootAt: 0,
  unhealthyStreak: 0,
  failedAt: undefined,
  childAlive: false,
  now: 0,
  pendingSpawn: false,
  laterEngineHealthy: false,
} satisfies Parameters<typeof decideTick>[0];

describe("decideTick", () => {
  test("a queued spawn short-circuits every decision to none", () => {
    expect(decideTick({ ...base, pendingSpawn: true, probe: "healthy" })).toEqual({ kind: "none" });
  });

  describe("breaker open ('failed')", () => {
    test("half-open elapsed + free port → a probe spawn", () => {
      const action = decideTick({
        ...base,
        status: "failed",
        failedAt: 0,
        now: BREAKER_HALF_OPEN_MS,
        probe: "free",
      });
      expect(action).toEqual({ kind: "spawn", reason: "breaker half-open probe" });
    });

    test("still inside the half-open window → none", () => {
      expect(
        decideTick({
          ...base,
          status: "failed",
          failedAt: 0,
          now: BREAKER_HALF_OPEN_MS - 1,
          probe: "free",
        }),
      ).toEqual({ kind: "none" });
    });

    test("a hand-fixed healthy port → adopt (even while failed)", () => {
      expect(decideTick({ ...base, status: "failed", probe: "healthy" })).toEqual({
        kind: "adopt",
      });
    });
  });

  describe("healthy port", () => {
    test("owned + live child → keep ownership", () => {
      expect(decideTick({ ...base, status: "owned", probe: "healthy", childAlive: true })).toEqual({
        kind: "mark",
        status: "owned",
      });
    });
    test("owned but child gone → adopt (someone else's healthy engine)", () => {
      expect(decideTick({ ...base, status: "owned", probe: "healthy", childAlive: false })).toEqual(
        {
          kind: "adopt",
        },
      );
    });
    test("already adopted → none (steady state)", () => {
      expect(decideTick({ ...base, status: "adopted", probe: "healthy" })).toEqual({
        kind: "none",
      });
    });
    test("fresh/down → adopt", () => {
      expect(decideTick({ ...base, status: "down", probe: "healthy" })).toEqual({ kind: "adopt" });
    });
  });

  describe("occupied port (TCP up, /health down)", () => {
    test("during starting warmup → tolerate (none)", () => {
      expect(decideTick({ ...base, status: "starting", probe: "occupied" })).toEqual({
        kind: "none",
      });
    });
    test("streak crosses the hung threshold on an owned live child → restart", () => {
      const action = decideTick({
        ...base,
        status: "owned",
        probe: "occupied",
        childAlive: true,
        unhealthyStreak: 2, // +1 this tick = 3 = HUNG_THRESHOLD
      });
      expect(action).toEqual({ kind: "restart", reason: "hung (owned)" });
    });
    test("hung but not ours → mark hung (never kill a process we don't own)", () => {
      expect(
        decideTick({ ...base, status: "foreign", probe: "occupied", unhealthyStreak: 2 }),
      ).toEqual({ kind: "mark", status: "hung", detail: "port open, /health unresponsive" });
    });
    test("below the streak threshold → none", () => {
      expect(
        decideTick({ ...base, status: "owned", probe: "occupied", unhealthyStreak: 0 }),
      ).toEqual({
        kind: "none",
      });
    });
  });

  describe("free port", () => {
    test("owned + child alive but port not bound yet → none (vLLM binds late)", () => {
      expect(decideTick({ ...base, status: "owned", probe: "free", childAlive: true })).toEqual({
        kind: "none",
      });
    });
    test("owned + child exited → restart", () => {
      expect(decideTick({ ...base, status: "owned", probe: "free", childAlive: false })).toEqual({
        kind: "restart",
        reason: "owned engine exited",
      });
    });
    test("stack mode within grace, never seen healthy, no later engine up → stack-pending", () => {
      const action = decideTick({
        ...base,
        stackMode: true,
        probe: "free",
        seenHealthy: false,
        laterEngineHealthy: false,
        now: STACK_BOOT_GRACE_MS - 1,
      });
      expect(action).toEqual({
        kind: "mark",
        status: "stack-pending",
        detail: "waiting for stack leader",
      });
    });
    test("stack mode but a LATER engine is healthy → take over now (leader abandoned this one)", () => {
      const action = decideTick({
        ...base,
        stackMode: true,
        probe: "free",
        laterEngineHealthy: true,
        now: STACK_BOOT_GRACE_MS - 1,
      });
      expect(action).toEqual({ kind: "spawn", reason: "no engine running" });
    });
    test("previously healthy then died → takeover spawn", () => {
      expect(decideTick({ ...base, probe: "free", seenHealthy: true })).toEqual({
        kind: "spawn",
        reason: "takeover: previous engine died",
      });
    });
    test("standalone cold boot → spawn", () => {
      expect(decideTick({ ...base, probe: "free", stackMode: false })).toEqual({
        kind: "spawn",
        reason: "no engine running",
      });
    });
  });
});

describe("breakerAllows", () => {
  test("under the cap → allowed; the window keeps recent timestamps", () => {
    const { allowed, pruned } = breakerAllows([100, 200], 1000);
    expect(allowed).toBe(true);
    expect(pruned).toEqual([100, 200]);
  });

  test("prunes timestamps older than the window before counting", () => {
    const now = BREAKER_WINDOW_MS + 500;
    // 100 and 400 are now outside the 10m window; 500 (= now - (WINDOW-... )) check: keep only within.
    const { pruned } = breakerAllows([100, 400, now - 1], now);
    expect(pruned).toEqual([now - 1]);
  });

  test("at/over the cap inside the window → not allowed (circuit should open)", () => {
    const { allowed } = breakerAllows([10, 20, 30], 40); // 3 restarts = BREAKER_MAX_RESTARTS
    expect(allowed).toBe(false);
  });
});

describe("findOrphanedEngineCores", () => {
  // An orphan: an EngineCore whose cwd is ours but whose PARENT's cwd is not (the APIServer died, the core
  // re-parented to init/the session subreaper). A supervised core's parent is the APIServer (also ours).
  const ps = [
    "  111   1 VLLM::EngineCore", // orphan: parent (1) is init — not ours
    "  222 333 VLLM::EngineCore", // supervised: parent 333 is the APIServer — ours
    "  444   1 some-other-process", // not an EngineCore
    "  555   1 VLLM::EngineCore", // a bystander's core — not ours
  ].join("\n");

  test("returns only cores whose cwd is ours AND whose parent's is not", () => {
    const ours = new Set([111, 222, 333]); // 555 is a bystander (marker false)
    const reaped = findOrphanedEngineCores(ps, (pid) => ours.has(pid));
    expect(reaped).toEqual([111]);
  });

  test("a fully-supervised tree (parent also ours) yields nothing to reap", () => {
    const reaped = findOrphanedEngineCores("  222 333 VLLM::EngineCore", (pid) =>
      new Set([222, 333]).has(pid),
    );
    expect(reaped).toEqual([]);
  });

  test("ignores non-EngineCore rows entirely", () => {
    const reaped = findOrphanedEngineCores("  444   1 python train.py", () => true);
    expect(reaped).toEqual([]);
  });
});
