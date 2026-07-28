// Unit tests for the vLLM supervisor's THREE pure decision cores (no IO, injected inputs) — the measured
// lifecycle matrix (Esoteric §4). `decideTick` is the reconciliation judgment; `breakerAllows` is the
// crash-loop window math; `findOrphanedEngineCores` is the cwd-based orphan match.
//
// PLUS an IO-shell lifecycle test (`startVllmEngines`): the pure cores can't see the `pendingSpawn` flag's
// LIFETIME, so this drives the real shell with mocked IO (spawn/fetch/ps/gpu) + an injected clock+sleep to
// prove the flag stays true across the restart-backoff window — a monitor tick landing in that window must
// NOT double-queue the spawn (which would double-charge the breaker and mislabel an owned engine 'adopted').

import { breakerAllows, decideTick, engineBaseUrl, getEngineStatus, startVllmEngines } from "@orb/server/infra/providers/vllm/engine";
import { afterEach, beforeEach, describe, vi } from "vitest";
import { expect, test } from "../../../../../support/fixtures";

// ── IO-shell harness (hoisted so the vi.mock factories can reach the shared fakes) ──────────────────────
// OWNERSHIP INVERSION: the supervisor no longer forks in-process children — it invokes an injected
// `triggerSpawn` (defaulting to `bash engines.sh start`). The harness simulates the DETACHED verb bringing
// the whole fleet healthy: a trigger records the call and marks the trio healthy (the detached boot's effect).
const io = vi.hoisted(() => {
  // Engines currently answering /health OK. A trigger marks the trio healthy; a simulated crash removes one.
  const healthy = new Set<string>();
  const triggers: number[] = []; // one entry per triggerSpawn call (detached fleet boots)
  return { healthy, triggers };
});

// Partial mocks (spread the real module — foundation/config etc. still need readFileSync/the rest).
vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    // reap ps / port-owner ss → empty (no orphans, no foreign owner). The detached spawn is the INJECTED
    // triggerSpawn (not execFile), so nothing here launches a real fleet.
    execFile: (_c: string, _a: readonly string[], cb: (e: unknown, out: string) => void): void => cb(null, ""),
    // detectGpu's nvidia-smi probe: succeed (a GPU is "present").
    execFileSync: (): undefined => undefined,
  };
});

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    mkdirSync: (): undefined => undefined,
    // hasOurMarker readlink → throw ⇒ "not ours" ⇒ nothing to reap.
    readlinkSync: (): string => {
      throw new Error("no /proc in test");
    },
  };
});

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
  spawnTriggered: false,
  now: 0,
  pendingSpawn: false,
  laterEngineHealthy: false,
  sleepHeld: false,
  manages: true,
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
      expect(decideTick({ ...base, status: "owned", probe: "healthy", spawnTriggered: true })).toEqual({
        kind: "mark",
        status: "owned",
      });
    });
    test("owned but child gone → adopt (someone else's healthy engine)", () => {
      expect(decideTick({ ...base, status: "owned", probe: "healthy", spawnTriggered: false })).toEqual({
        kind: "adopt",
      });
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

  describe("sleeping engine (health 200 + is_sleeping)", () => {
    test("no hold marker → mark sleeping (never respawn a healthy engine, never lie adopted)", () => {
      expect(decideTick({ ...base, status: "adopted", probe: "sleeping" })).toEqual({ kind: "mark", status: "sleeping" });
    });
    test("hold marker present → mark sleeping-held", () => {
      expect(decideTick({ ...base, status: "adopted", probe: "sleeping", sleepHeld: true })).toEqual({ kind: "mark", status: "sleeping-held" });
    });
    test("an owned engine that went to sleep → mark sleeping (not a restart)", () => {
      expect(decideTick({ ...base, status: "owned", probe: "sleeping", spawnTriggered: true })).toEqual({ kind: "mark", status: "sleeping" });
    });
    test("a failed engine that comes back sleeping is classified sleeping (up = not a crash loop)", () => {
      expect(decideTick({ ...base, status: "failed", probe: "sleeping", failedAt: 1 })).toEqual({ kind: "mark", status: "sleeping" });
    });
    test("a pending spawn still short-circuits to none even on a sleeping probe", () => {
      expect(decideTick({ ...base, status: "down", probe: "sleeping", pendingSpawn: true })).toEqual({ kind: "none" });
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
        spawnTriggered: true,
        unhealthyStreak: 2, // +1 this tick = 3 = HUNG_THRESHOLD
      });
      expect(action).toEqual({ kind: "restart", reason: "hung (owned)" });
    });
    test("hung but not ours → mark hung (never kill a process we don't own)", () => {
      expect(decideTick({ ...base, status: "foreign", probe: "occupied", unhealthyStreak: 2 })).toEqual({
        kind: "mark",
        status: "hung",
        detail: "port open, /health unresponsive",
      });
    });
    test("below the streak threshold → none", () => {
      expect(decideTick({ ...base, status: "owned", probe: "occupied", unhealthyStreak: 0 })).toEqual({
        kind: "none",
      });
    });
  });

  describe("free port", () => {
    test("owned + child alive but port not bound yet → none (vLLM binds late)", () => {
      expect(decideTick({ ...base, status: "owned", probe: "free", spawnTriggered: true })).toEqual({
        kind: "none",
      });
    });
    test("owned + child exited → restart", () => {
      expect(decideTick({ ...base, status: "owned", probe: "free", spawnTriggered: false })).toEqual({
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
        detail: "waiting for the fleet spawner",
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

  describe("adopt-only posture (manages:false) — a passive consumer never spawns", () => {
    test("free port + never managed → mark down with the fail-fast remedy, NOT a spawn", () => {
      const action = decideTick({ ...base, probe: "free", manages: false });
      expect(action).toEqual({
        kind: "mark",
        status: "down",
        detail: "engines down — `pnpm engines:start` (adopt-only: this stack never spawns)",
      });
    });
    test("healthy port → still adopts (adopt-only adopts, it just never spawns)", () => {
      expect(decideTick({ ...base, status: "down", probe: "healthy", manages: false })).toEqual({ kind: "adopt" });
    });
    test("a half-open breaker never re-spawns under adopt-only", () => {
      expect(decideTick({ ...base, status: "failed", probe: "free", failedAt: 0, now: 10 * 60 * 60 * 1000, manages: false })).toEqual({ kind: "none" });
    });
    test("sleeping engine still classifies (adopt-only adopts + reads sleep state)", () => {
      expect(decideTick({ ...base, status: "adopted", probe: "sleeping", manages: false })).toEqual({ kind: "mark", status: "sleeping" });
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

// (The orphan-family match lives in reaper.ts now — see tests/.../reaper.test.ts for the widened family +
// false-positive + stage-tree-exclusion cases.)

// ── IO shell: the pendingSpawn flag lifetime across the restart-backoff window ─────────────────────────
describe("startVllmEngines — the queued-spawn flag holds across the backoff window", () => {
  const fixedNow = 1_000_000;
  const monitorIntervalMs = 21_000;
  const engines = ["embed", "rerank", "gen"] as const;

  const urlEngine = (url: string): string | undefined => engines.find((e) => url.startsWith(engineBaseUrl(e)));

  beforeEach(() => {
    io.healthy.clear();
    io.triggers.length = 0;
    vi.useFakeTimers();
    // /health: healthy iff the engine is in the healthy set (a trigger boots the fleet; a crash removes one).
    // /is_sleeping: these lifecycle tests never sleep an engine → always {is_sleeping:false}.
    vi.stubGlobal("fetch", (input: unknown): Promise<{ ok: boolean; json: () => Promise<unknown> }> => {
      const url = String(input);
      const engine = urlEngine(url);
      if (engine !== undefined && io.healthy.has(engine)) {
        // biome-ignore lint/style/useNamingConvention: is_sleeping mirrors the vLLM /is_sleeping wire body.
        const body = url.includes("/is_sleeping") ? { is_sleeping: false } : {};
        return Promise.resolve({ ok: true, json: (): Promise<unknown> => Promise.resolve(body) });
      }
      return Promise.reject(new Error("ECONNREFUSED"));
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  // Drain the microtask/promise chain (probes, the spawn mutex) without advancing wall-clock.
  const settle = async (): Promise<void> => {
    for (let i = 0; i < 8; i += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: draining the async chain is inherently sequential.
      await vi.advanceTimersByTimeAsync(0);
    }
  };

  // The injected DETACHED-spawn trigger: records the call and marks the WHOLE fleet healthy (the detached
  // verb boots the trio idempotently). The supervisor then adopts each via its health poll → `owned`.
  const triggerSpawn = (): void => {
    io.triggers.push(io.triggers.length);
    io.healthy.add("embed");
    io.healthy.add("rerank");
    io.healthy.add("gen");
  };

  test("a monitor tick inside the restart backoff does NOT double-queue the respawn", async () => {
    // Injected sleep: park the restart backoff (>=5s) on a manual resolver so a monitor tick can land in
    // the window; health-poll sleeps resolve immediately.
    let parkBackoffs = false;
    const parked: Array<() => void> = [];
    const sleep = (ms: number): Promise<void> => (parkBackoffs && ms >= 5000 ? new Promise<void>((resolve) => parked.push(resolve)) : Promise.resolve());

    const stop = startVllmEngines({ repoRoot: "/repo", now: (): number => fixedNow, sleep, triggerSpawn });
    try {
      // Boot: all three ports free → the first triggerSpawn boots the fleet healthy; each engine adopts owned.
      await settle();
      expect(io.triggers.length).toBeGreaterThanOrEqual(1);
      expect(getEngineStatus("embed")?.status).toBe("owned");
      const triggersAfterBoot = io.triggers.length;

      // Crash embed: /health goes free (the detached engine died out-of-band). The tick applies restart.
      io.healthy.delete("embed");

      // Park backoffs, then a monitor tick fires the restart → the backoff parks; pendingSpawn := true.
      parkBackoffs = true;
      await vi.advanceTimersByTimeAsync(monitorIntervalMs);
      expect(parked.length).toBe(1); // restart backoff is parked
      expect(io.triggers.length).toBe(triggersAfterBoot); // no re-trigger yet

      // A SECOND tick lands INSIDE the parked backoff window. With pendingSpawn held true, the decision
      // short-circuits to none (the bug cleared it early → a second queued spawn double-charged the breaker).
      await vi.advanceTimersByTimeAsync(monitorIntervalMs);
      expect(io.triggers.length).toBe(triggersAfterBoot); // still no double-queue

      // Release the backoff → exactly ONE re-trigger runs, and embed stays OWNED (never mislabeled adopted).
      parkBackoffs = false;
      for (const resolve of parked) {
        resolve();
      }
      await settle();
      expect(io.triggers.length).toBe(triggersAfterBoot + 1);
      expect(getEngineStatus("embed")?.status).toBe("owned");
    } finally {
      stop();
    }
  });

  // THE HMR-TOPOLOGY INVARIANT PIN (#14): a healthy responding port at boot is ADOPTED, never respawned —
  // the watched server must never re-trigger a fleet the standalone launcher already brought up (the old
  // constant-restart hell). The ownership inversion changed the spawn MECHANISM, never this topology.
  test("a healthy responding port is ADOPTED at boot, never respawned", async () => {
    // All three ports already healthy BEFORE the supervisor starts (the detached fleet is warm).
    io.healthy.add("embed");
    io.healthy.add("rerank");
    io.healthy.add("gen");
    const stop = startVllmEngines({ repoRoot: "/repo", now: (): number => fixedNow, sleep: () => Promise.resolve(), triggerSpawn });
    try {
      await settle();
      // ZERO triggers — every engine was adopted, none re-spawned.
      expect(io.triggers).toEqual([]);
      expect(getEngineStatus("embed")?.status).toBe("adopted");
      expect(getEngineStatus("rerank")?.status).toBe("adopted");
      expect(getEngineStatus("gen")?.status).toBe("adopted");
    } finally {
      stop();
    }
  });
});

// ── Auto-sleep: the MANAGER posture /sleep's a continuously-idle engine; adopt-only never does ────────────
describe("startVllmEngines — auto-sleep idle timer", () => {
  const engines = ["embed", "rerank", "gen"] as const;
  const urlEngine = (url: string): string | undefined => engines.find((e) => url.startsWith(engineBaseUrl(e)));
  const idleMs = 600_000;

  beforeEach(() => {
    io.healthy.clear();
    io.triggers.length = 0;
    vi.useFakeTimers();
    vi.stubGlobal("fetch", (input: unknown): Promise<{ ok: boolean; json: () => Promise<unknown> }> => {
      const url = String(input);
      const engine = urlEngine(url);
      if (engine !== undefined && io.healthy.has(engine)) {
        // biome-ignore lint/style/useNamingConvention: is_sleeping mirrors the vLLM /is_sleeping wire body.
        const body = url.includes("/is_sleeping") ? { is_sleeping: false } : {};
        return Promise.resolve({ ok: true, json: (): Promise<unknown> => Promise.resolve(body) });
      }
      return Promise.reject(new Error("ECONNREFUSED"));
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  const settle = async (): Promise<void> => {
    for (let i = 0; i < 8; i += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: draining the async chain is inherently sequential.
      await vi.advanceTimersByTimeAsync(0);
    }
  };

  test("a MANAGER sleeps an engine idle past the window; a busy engine (success bump) never sleeps", async () => {
    io.healthy.add("embed");
    io.healthy.add("rerank");
    io.healthy.add("gen");
    let clock = 1_000_000;
    const slept: string[] = [];
    // embed/gen stay quiet (success flat); rerank bumps success every tick (a steady request stream).
    let rerankSuccess = 0;
    const fetchMetrics = (engine: (typeof engines)[number]): Promise<{ running: number; waiting: number; successTotal: number }> => {
      if (engine === "rerank") {
        rerankSuccess += 1;
        return Promise.resolve({ running: 0, waiting: 0, successTotal: rerankSuccess });
      }
      return Promise.resolve({ running: 0, waiting: 0, successTotal: 5 });
    };
    const postSleep = (engine: (typeof engines)[number]): Promise<boolean> => {
      slept.push(engine);
      io.healthy.delete(engine); // a slept engine drops out of /health-healthy for the next probe
      return Promise.resolve(true);
    };
    const stop = startVllmEngines({
      repoRoot: "/repo",
      now: (): number => clock,
      sleep: () => Promise.resolve(),
      manages: true,
      sleepMode: true,
      autoSleepIdleMs: idleMs,
      fetchMetrics,
      postSleep,
      triggerSpawn: () => undefined,
    });
    try {
      await settle(); // boot tick: adopts all three, sets the metrics baseline (prev) — arms nothing yet.
      // Tick A: quiet + success flat vs the baseline → ARMS idleSince at the current clock (no sleep yet).
      await vi.advanceTimersByTimeAsync(21_000);
      await settle();
      // Now advance PAST the idle window and tick again → the armed timer elapses → sleep.
      clock += idleMs + 1;
      await vi.advanceTimersByTimeAsync(21_000);
      await settle();
      // embed + gen were continuously idle past the window → slept; rerank kept bumping success → never slept.
      expect(slept).toContain("embed");
      expect(slept).toContain("gen");
      expect(slept).not.toContain("rerank");
    } finally {
      stop();
    }
  });

  test("an ADOPT-ONLY posture NEVER auto-sleeps (passive consumer)", async () => {
    io.healthy.add("embed");
    io.healthy.add("rerank");
    io.healthy.add("gen");
    let clock = 1_000_000;
    const slept: string[] = [];
    const stop = startVllmEngines({
      repoRoot: "/repo",
      now: (): number => clock,
      sleep: () => Promise.resolve(),
      manages: false, // adopt-only
      sleepMode: true,
      autoSleepIdleMs: idleMs,
      fetchMetrics: () => Promise.resolve({ running: 0, waiting: 0, successTotal: 5 }),
      postSleep: (e: (typeof engines)[number]): Promise<boolean> => {
        slept.push(e);
        return Promise.resolve(true);
      },
      triggerSpawn: () => undefined,
    });
    try {
      await settle();
      clock += idleMs + 1;
      await vi.advanceTimersByTimeAsync(21_000);
      await settle();
      expect(slept).toEqual([]); // adopt-only is a passive consumer — never sleeps the fleet
    } finally {
      stop();
    }
  });
});
