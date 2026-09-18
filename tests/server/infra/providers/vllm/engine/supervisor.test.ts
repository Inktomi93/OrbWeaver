// Unit tests for the vLLM supervisor's THREE pure decision cores (no IO, injected inputs) — the measured
// lifecycle matrix (Esoteric §4). `decideTick` is the reconciliation judgment; `breakerAllows` is the
// crash-loop window math; `findOrphanedEngineCores` is the cwd-based orphan match.
//
// PLUS an IO-shell lifecycle test (`startVllmEngines`): the pure cores can't see the `pendingSpawn` flag's
// LIFETIME, so this drives the real shell with mocked IO (spawn/fetch/ps/gpu) + an injected clock+sleep to
// prove the flag stays true across the restart-backoff window — a monitor tick landing in that window must
// NOT double-queue the spawn (which would double-charge the breaker and mislabel an owned engine 'adopted').

import nodeProcess from "node:process";
import {
  __resetWakeGateCache,
  breakerAllows,
  decideTick,
  engineBaseUrl,
  ensureAwake,
  getEngineStatus,
  getVllmEngineController,
  startVllmEngines,
} from "@orb/server/infra/providers/vllm/engine";
import { afterEach, beforeEach, describe, vi } from "vitest";
import { expect, test } from "../../../../../support/fixtures.ts";

// ── IO-shell harness (hoisted so the vi.mock factories can reach the shared fakes) ──────────────────────
// OWNERSHIP INVERSION: the supervisor no longer forks in-process children — it invokes an injected
// `triggerSpawn` (defaulting to `bash engines.sh start`). The harness simulates the DETACHED verb bringing
// the whole fleet healthy: a trigger records the call and marks the trio healthy (the detached boot's effect).
const io = vi.hoisted(() => {
  // Engines currently answering /health OK. A trigger marks the trio healthy; a simulated crash removes one.
  const healthy = new Set<string>();
  // Configured ports that accept TCP but never answer /health — the production probe classifies the timeout
  // as occupied, which is the hung transition the lifecycle tests must reach through the real shell.
  const occupied = new Set<string>();
  const triggers: number[] = []; // one entry per triggerSpawn call (detached fleet boots)
  // detectGpu's nvidia-smi probe outcome. Default false = a GPU is "present"; the manager-scoped-GPU
  // describe flips it true to drive a GPU-less box (and resets it in its afterEach).
  return { healthy, occupied, triggers, gpuAbsent: false };
});

// Partial mocks (spread the real module — foundation/config etc. still need readFileSync/the rest).
vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    // reap ps / port-owner ss → empty (no orphans, no foreign owner). The detached spawn is the INJECTED
    // triggerSpawn (not execFile), so nothing here launches a real fleet.
    execFile: (_c: string, _a: readonly string[], cb: (e: unknown, out: string) => void): void => cb(null, ""),
    // detectGpu's nvidia-smi probe: succeed (a GPU is "present") unless the harness flips gpuAbsent.
    execFileSync: (): undefined => {
      if (io.gpuAbsent) {
        throw new Error("nvidia-smi: command not found");
      }
    },
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
  stoppedIntentionally: false,
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
    test("owned after its detached launch settles → keep durable ownership", () => {
      expect(decideTick({ ...base, status: "owned", probe: "healthy", spawnTriggered: false })).toEqual({
        kind: "mark",
        status: "owned",
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
    test("streak crosses the hung threshold after the detached spawn flag clears → restart", () => {
      expect(decideTick({ ...base, status: "owned", probe: "occupied", spawnTriggered: false, unhealthyStreak: 2 })).toEqual({
        kind: "restart",
        reason: "hung (owned)",
      });
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

  // #1929: `engines stop` leaves the pidfile behind, and the supervisor used to read "pidfile present,
  // leader absent" as a crash — resurrecting a fleet deliberately stopped to free host RAM. The marker
  // (isStopped/`.cache/stack/engines.stopped`) is the operator's "I meant it" the takeover decision honors.
  describe("stoppedIntentionally marker (#1929) — the must-not-widen pair", () => {
    // CONTROL (a): stopped-on-purpose → the takeover path does NOT spawn.
    test("previously healthy then died, but STOPPED intentionally → no takeover spawn", () => {
      const action = decideTick({ ...base, probe: "free", seenHealthy: true, stoppedIntentionally: true });
      expect(action).toEqual({
        kind: "mark",
        status: "down",
        detail: "engines stopped intentionally (`engines stop`) — `pnpm engines start` resumes; supervisor will not take over",
      });
    });
    // The marker also suppresses a FRESH boot's cold-start spawn (a server that boots while the fleet is
    // intentionally down must not treat that as "no engine running yet" and spawn it anyway).
    test("fresh boot, never seen healthy, but STOPPED intentionally → no cold-boot spawn either", () => {
      const action = decideTick({ ...base, probe: "free", seenHealthy: false, stoppedIntentionally: true });
      expect(action.kind).toBe("mark");
    });
    // CONTROL (b), the MUST-NOT-WIDEN guard: a GENUINE crash (no stop marker, leader gone) still takes
    // over exactly as before. Without this pin the fix could regress into "the supervisor never respawns".
    test("previously healthy then genuinely crashed (marker ABSENT) → takeover spawn still happens", () => {
      const action = decideTick({ ...base, probe: "free", seenHealthy: true, stoppedIntentionally: false });
      expect(action).toEqual({ kind: "spawn", reason: "takeover: previous engine died" });
    });
    // adopt-only never spawns regardless of the marker — the marker must not change that arm's own message.
    test("adopt-only + stopped marker present → still the adopt-only fail-fast, not the stopped detail", () => {
      const action = decideTick({ ...base, probe: "free", manages: false, stoppedIntentionally: true });
      expect(action).toEqual({
        kind: "mark",
        status: "down",
        detail: "engines down — `pnpm engines start` (adopt-only: this stack never spawns)",
      });
    });
  });

  describe("adopt-only posture (manages:false) — a passive consumer never spawns", () => {
    test("free port + never managed → mark down with the fail-fast remedy, NOT a spawn", () => {
      const action = decideTick({ ...base, probe: "free", manages: false });
      expect(action).toEqual({
        kind: "mark",
        status: "down",
        detail: "engines down — `pnpm engines start` (adopt-only: this stack never spawns)",
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
    io.occupied.clear();
    io.triggers.length = 0;
    // @orb-waive test-determinism(vi.useFakeTimers): legacy fake-timers usage not yet migrated to the frozen-clock composition seam; ends when this test adopts tests/support/clock.ts
    vi.useFakeTimers();
    // /health: healthy iff the engine is in the healthy set (a trigger boots the fleet; a crash removes one).
    // /is_sleeping: these lifecycle tests never sleep an engine → always {is_sleeping:false}.
    vi.stubGlobal("fetch", (input: unknown): Promise<{ ok: boolean; json: () => Promise<unknown> }> => {
      const url = String(input);
      const engine = urlEngine(url);
      if (engine !== undefined && io.occupied.has(engine)) {
        const timeout = new Error("health timed out");
        timeout.name = "TimeoutError";
        return Promise.reject(timeout);
      }
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

  test("a manager-owned healthy engine that becomes hung is identity-verified, killed, and restarted once", async () => {
    const signals: NodeJS.Signals[] = [];
    const stop = startVllmEngines({
      repoRoot: "/repo",
      now: (): number => fixedNow,
      sleep: () => Promise.resolve(),
      triggerSpawn,
      portOwnerPid: () => Promise.resolve(7331),
      signalEngineProcess: (engine, _listenerPid, signal) => {
        signals.push(signal);
        io.occupied.delete(engine);
        return { verdict: "signaled", pgid: 7331 };
      },
    });
    try {
      await settle();
      expect(getEngineStatus("embed")?.status).toBe("owned");
      const triggersAfterBoot = io.triggers.length;

      io.healthy.delete("embed");
      io.occupied.add("embed");
      for (let tick = 0; tick < 3; tick += 1) {
        await vi.advanceTimersByTimeAsync(monitorIntervalMs);
        await settle();
      }

      expect(signals).toEqual(["SIGKILL"]);
      expect(io.triggers).toHaveLength(triggersAfterBoot + 1);
      expect(getEngineStatus("embed")?.status).toBe("owned");
    } finally {
      stop();
    }
  });

  test("a hung port whose durable launch identity is foreign is never killed or spawned over", async () => {
    const signals: NodeJS.Signals[] = [];
    const stop = startVllmEngines({
      repoRoot: "/repo",
      now: (): number => fixedNow,
      sleep: () => Promise.resolve(),
      triggerSpawn,
      portOwnerPid: () => Promise.resolve(7331),
      signalEngineProcess: (_engine, _listenerPid, signal) => {
        signals.push(signal);
        return { verdict: "refused", reason: "configured port is owned by a foreign process" };
      },
    });
    try {
      await settle();
      const triggersAfterBoot = io.triggers.length;

      io.healthy.delete("embed");
      io.occupied.add("embed");
      for (let tick = 0; tick < 3; tick += 1) {
        await vi.advanceTimersByTimeAsync(monitorIntervalMs);
        await settle();
      }

      expect(signals).toEqual(["SIGKILL"]);
      expect(io.triggers).toHaveLength(triggersAfterBoot);
      expect(getEngineStatus("embed")?.status).toBe("foreign");
    } finally {
      stop();
    }
  });

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

  // #761: pendingSpawn was a single shared boolean on EngineState. Two same-engine operations queued
  // back-to-back (admin restart isn't gated by decideTick's pendingSpawn check, so a caller CAN queue two)
  // chain sequentially through the one spawn mutex — but the FIRST operation's `finally` cleared the flag
  // even while the SECOND was still genuinely in flight. A monitor tick landing in that window then read
  // "nothing pending" and admitted a third, unintended restart (double-charging the breaker and — once the
  // real second spawn completed — getting itself superseded, which relabels the engine 'adopted' instead of
  // leaving it 'owned'). The fix counts queued/running operations per engine instead of clobbering a bool.
  test("two concurrent same-engine admin restarts: the first's completion must not admit a monitor-tick third operation (#761)", async () => {
    const parked: Array<() => void> = [];
    let parkAll = false;
    // ORPHAN_REAP_SETTLE_MS (3000ms) backs off BOTH the admin-restart backoff and the post-kill settle —
    // park every >=3000ms wait once armed; health-poll (2000ms) sleeps always resolve immediately.
    const sleep = (ms: number): Promise<void> => (parkAll && ms >= 3000 ? new Promise<void>((resolve) => parked.push(resolve)) : Promise.resolve());
    const release = async (): Promise<void> => {
      const next = parked.shift();
      expect(next).toBeDefined();
      next?.();
      await settle();
    };

    const stop = startVllmEngines({
      repoRoot: "/repo",
      now: (): number => fixedNow,
      sleep,
      triggerSpawn,
      portOwnerPid: () => Promise.resolve(7331),
      signalEngineProcess: (engine, _listenerPid, _signal) => {
        io.healthy.delete(engine);
        return { verdict: "signaled", pgid: 7331 };
      },
    });
    try {
      await settle();
      expect(getEngineStatus("embed")?.status).toBe("owned");
      const triggersAfterBoot = io.triggers.length;

      const controller = getVllmEngineController();
      parkAll = true;
      const p1 = controller?.restart("embed");
      const p2 = controller?.restart("embed");
      await settle();
      expect(parked.length).toBe(1); // op1 parked at its backoff; op2 is queued behind it, not yet running

      await release(); // op1's backoff → op1 kills the (already-owned) port → parks at the kill-settle sleep
      expect(parked.length).toBe(1);
      await release(); // op1's kill-settle → op1 re-triggers the detached spawn and re-adopts owned
      await p1;
      expect(getEngineStatus("embed")?.status).toBe("owned");
      expect(io.triggers.length).toBe(triggersAfterBoot + 1);

      // op2 now starts (chained after op1) and parks at ITS own initial backoff.
      expect(parked.length).toBe(1);
      await release(); // op2's backoff → op2 kills the port AGAIN → parks at its own kill-settle sleep
      expect(parked.length).toBe(1);
      expect(getEngineStatus("embed")?.status).toBe("owned"); // still owned — op2 hasn't re-triggered yet

      // op2 is genuinely still in flight right now (parked mid-operation, port freed, not yet re-spawned).
      // THE TELL: under the shared-boolean bug, op1's completion above already cleared pendingSpawn, so
      // this tick reads "owned engine, port free, not our spawn yet" and admits an unintended THIRD
      // operation — `requestRestart` fires immediately (charging the breaker) and marks the engine 'down'
      // before op2 ever gets a chance to bring it back up. The fix's per-engine count is still >0 (op2 is
      // still queued/running), so decideTick short-circuits to none and the engine stays 'owned'.
      await vi.advanceTimersByTimeAsync(monitorIntervalMs);
      await settle();
      expect(getEngineStatus("embed")?.status).toBe("owned");

      await release(); // op2's kill-settle → op2 re-triggers the detached spawn and re-adopts owned
      await p2;
      await settle();

      // The bogus third operation (if queued) sits BEHIND op2 in the one spawn mutex and only starts once
      // op2 resolves — so its own backoff wait shows up here as a stray parked entry, and once it runs it
      // finds the port already healthy (op2 beat it there) and gets superseded via `skipSupersededSpawn`,
      // which relabels the engine 'adopted' — exactly the mislabel this file's own header warns against.
      expect(parked.length).toBe(0); // no bogus third operation queued behind the two real restarts
      expect(io.triggers.length).toBe(triggersAfterBoot + 2); // exactly the two REAL admin restarts
      expect(getEngineStatus("embed")?.status).toBe("owned"); // never mislabeled 'adopted' by a phantom third
    } finally {
      for (const resolve of parked) {
        resolve(); // drain any stray parked wait (a still-live bug) so the interval/promise chain settle
      }
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

describe("startVllmEngines — admin restart proves durable process ownership", () => {
  const fixedNow = 1_000_000;

  beforeEach(() => {
    io.healthy.clear();
    io.triggers.length = 0;
    io.healthy.add("embed");
    io.healthy.add("rerank");
    io.healthy.add("gen");
    // @orb-waive test-determinism(vi.useFakeTimers): legacy fake-timers usage not yet migrated to the frozen-clock composition seam; ends when this test adopts tests/support/clock.ts
    vi.useFakeTimers();
    vi.stubGlobal("fetch", (input: unknown): Promise<{ ok: boolean; json: () => Promise<unknown> }> => {
      const url = String(input);
      const engine = (["embed", "rerank", "gen"] as const).find((candidate) => url.startsWith(engineBaseUrl(candidate)));
      if (engine !== undefined && io.healthy.has(engine)) {
        // biome-ignore lint/style/useNamingConvention: is_sleeping mirrors the vLLM wire body.
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
      await vi.advanceTimersByTimeAsync(0);
    }
  };

  test("a foreign configured-port listener is refused without queuing a spawn", async () => {
    const signalAttempts: NodeJS.Signals[] = [];
    const stop = startVllmEngines({
      repoRoot: "/repo",
      now: (): number => fixedNow,
      sleep: () => Promise.resolve(),
      triggerSpawn: () => io.triggers.push(io.triggers.length),
      portOwnerPid: () => Promise.resolve(7331),
      signalEngineProcess: (_engine, _listenerPid, signal) => {
        signalAttempts.push(signal);
        return { verdict: "refused", reason: "configured port is owned by a foreign process" };
      },
    });
    try {
      await settle();
      const result = await getVllmEngineController()?.restart("embed");
      await settle();
      expect(result).toContain("restart refused");
      expect(signalAttempts).toEqual(["SIGTERM"]);
      expect(io.triggers).toEqual([]);
      expect(getEngineStatus("embed")?.status).toBe("foreign");
    } finally {
      stop();
    }
  });

  test("a verified owned listener receives TERM then a verified KILL before one detached restart", async () => {
    const signals: NodeJS.Signals[] = [];
    const stop = startVllmEngines({
      repoRoot: "/repo",
      now: (): number => fixedNow,
      sleep: () => Promise.resolve(),
      triggerSpawn: () => {
        io.triggers.push(io.triggers.length);
        io.healthy.add("embed");
      },
      portOwnerPid: () => Promise.resolve(4242),
      signalEngineProcess: (engine, _listenerPid, signal) => {
        signals.push(signal);
        io.healthy.delete(engine);
        return { verdict: "signaled", pgid: 4242 };
      },
    });
    try {
      await settle();
      const result = await getVllmEngineController()?.restart("embed");
      expect(result).toContain("terminated verified pgid 4242");
      await settle();
      expect(signals).toEqual(["SIGTERM", "SIGKILL"]);
      expect(io.triggers).toHaveLength(1);
      expect(getEngineStatus("embed")?.status).toBe("owned");
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
    // @orb-waive test-determinism(vi.useFakeTimers): legacy fake-timers usage not yet migrated to the frozen-clock composition seam; ends when this test adopts tests/support/clock.ts
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
      await vi.advanceTimersByTimeAsync(0);
    }
  };

  test("a successful auto-sleep invalidates the pre-dispatch awake observation", async () => {
    __resetWakeGateCache();
    io.healthy.add("embed");
    io.healthy.add("rerank");
    io.healthy.add("gen");
    let probes = 0;
    const wakeDeps = {
      repoRoot: "/repo",
      isSleeping: (): Promise<boolean> => {
        probes += 1;
        return Promise.resolve(false);
      },
      reap: (): Promise<number[]> => Promise.resolve([]),
      queryGpu: (): Promise<[]> => Promise.resolve([]),
      wakeAndAwait: (): Promise<boolean> => Promise.resolve(true),
      held: (): boolean => false,
      now: (): number => 1_000_000,
    };
    await ensureAwake("embed", wakeDeps);
    let clock = 1_000_000;
    const stop = startVllmEngines({
      repoRoot: "/repo",
      now: (): number => clock,
      sleep: () => Promise.resolve(),
      manages: true,
      sleepMode: true,
      autoSleepIdleMs: idleMs,
      fetchMetrics: () => Promise.resolve({ running: 0, waiting: 0, successTotal: 5 }),
      postSleep: () => Promise.resolve(true),
      triggerSpawn: () => undefined,
    });
    try {
      await settle();
      await vi.advanceTimersByTimeAsync(21_000);
      await settle();
      clock += idleMs + 1;
      await vi.advanceTimersByTimeAsync(21_000);
      await settle();
      await ensureAwake("embed", wakeDeps);
      expect(probes).toBe(2);
    } finally {
      stop();
    }
  });

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

// ── GPU-less boxes: the local-GPU requirement is MANAGER-scoped ──────────────────────────────────────────
// A MANAGING supervisor spawns engines on THIS host, so no local GPU ⇒ idle ("no GPU on this host").
// adopt-only is a passive consumer of a fleet that may be REMOTE (VLLM_ENGINE_HOST — profile-2/D2,
// docs/design/containerize-prod-image-spec.md §3.6): a GPU-less app box must still probe and adopt.
describe("startVllmEngines — the local-GPU requirement is MANAGER-scoped", () => {
  const engines = ["embed", "rerank", "gen"] as const;
  const urlEngine = (url: string): string | undefined => engines.find((e) => url.startsWith(engineBaseUrl(e)));

  beforeEach(() => {
    io.healthy.clear();
    io.triggers.length = 0;
    io.gpuAbsent = true; // every test in this describe runs on a GPU-less box
    // @orb-waive test-determinism(vi.useFakeTimers): legacy fake-timers usage not yet migrated to the frozen-clock composition seam; ends when this test adopts tests/support/clock.ts
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
    io.gpuAbsent = false;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  const settle = async (): Promise<void> => {
    for (let i = 0; i < 8; i += 1) {
      await vi.advanceTimersByTimeAsync(0);
    }
  };

  test("adopt-only on a GPU-less box still probes and ADOPTS a healthy (remote) fleet — never idles on 'no GPU'", async () => {
    io.healthy.add("embed");
    io.healthy.add("rerank");
    io.healthy.add("gen");
    const stop = startVllmEngines({
      repoRoot: "/repo",
      now: (): number => 1_000_000,
      sleep: () => Promise.resolve(),
      manages: false,
      triggerSpawn: () => {
        io.triggers.push(io.triggers.length);
      },
    });
    try {
      await settle();
      expect(getEngineStatus("embed")?.status).toBe("adopted");
      expect(getEngineStatus("rerank")?.status).toBe("adopted");
      expect(getEngineStatus("gen")?.status).toBe("adopted");
      expect(io.triggers).toEqual([]); // adopt-only NEVER spawns, GPU or not
    } finally {
      stop();
    }
  });

  test("adopt-only on a GPU-less box with the fleet DOWN fail-fasts on the probe verdict, not on the GPU", async () => {
    const stop = startVllmEngines({
      repoRoot: "/repo",
      now: (): number => 1_000_000,
      sleep: () => Promise.resolve(),
      manages: false,
      triggerSpawn: () => {
        io.triggers.push(io.triggers.length);
      },
    });
    try {
      await settle();
      // decideFree's adopt-only arm — the honest fail-fast with the remedy — NOT the pre-probe GPU idle.
      expect(getEngineStatus("embed")?.status).toBe("down");
      expect(getEngineStatus("embed")?.detail).toContain("adopt-only: this stack never spawns");
      expect(io.triggers).toEqual([]);
    } finally {
      stop();
    }
  });

  test("the MANAGER posture still idles without a local GPU (it would have to spawn locally)", async () => {
    io.healthy.add("embed"); // even a healthy port doesn't matter — the manager idles before probing
    const stop = startVllmEngines({
      repoRoot: "/repo",
      now: (): number => 1_000_000,
      sleep: () => Promise.resolve(),
      triggerSpawn: () => {
        io.triggers.push(io.triggers.length);
      },
    });
    try {
      await settle();
      expect(getEngineStatus("embed")?.status).toBe("down");
      expect(getEngineStatus("embed")?.detail).toBe("no GPU on this host");
      expect(getEngineStatus("gen")?.detail).toBe("no GPU on this host");
      expect(io.triggers).toEqual([]);
    } finally {
      stop();
    }
  });
});

// The two OS-SPECIFIC doors this supervisor owns are the `/proc`-backed port-owner read (`enginePortPid`,
// which shells `ss`) and the PROCESS-GROUP kill (`signalRecordedEngineProcess`). Neither exists on Windows,
// and macOS has no `/proc` at all — so a non-Linux box may only ever run the PASSIVE postures. `off` never
// constructs the supervisor (the compose site gates on `postureManages`/`vllmDisabled`), which leaves
// `adopt-only` as the one posture that DOES construct it on such a box: it must reach neither door, on any
// platform, whatever the fleet's probe says. Both doors are injected here, so a call is observable.
describe("startVllmEngines — the passive postures never reach a /proc read or a process-group kill", () => {
  const engines = ["embed", "rerank", "gen"] as const;
  const urlEngine = (url: string): string | undefined => engines.find((e) => url.startsWith(engineBaseUrl(e)));
  const realPlatform = nodeProcess.platform;

  beforeEach(() => {
    io.healthy.clear();
    io.occupied.clear();
    io.triggers.length = 0;
    // @orb-waive test-determinism(vi.useFakeTimers): legacy fake-timers usage not yet migrated to the frozen-clock composition seam; ends when this test adopts tests/support/clock.ts
    vi.useFakeTimers();
    vi.stubGlobal("fetch", (input: unknown): Promise<{ ok: boolean; json: () => Promise<unknown> }> => {
      const url = String(input);
      const engine = urlEngine(url);
      if (engine !== undefined && io.occupied.has(engine)) {
        const timeout = new Error("health timed out");
        timeout.name = "TimeoutError";
        return Promise.reject(timeout);
      }
      if (engine !== undefined && io.healthy.has(engine)) {
        // biome-ignore lint/style/useNamingConvention: is_sleeping mirrors the vLLM /is_sleeping wire body.
        const body = url.includes("/is_sleeping") ? { is_sleeping: false } : {};
        return Promise.resolve({ ok: true, json: (): Promise<unknown> => Promise.resolve(body) });
      }
      return Promise.reject(new Error("ECONNREFUSED"));
    });
  });

  afterEach(() => {
    Object.defineProperty(nodeProcess, "platform", { value: realPlatform, configurable: true });
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const settle = async (): Promise<void> => {
    for (let i = 0; i < 8; i += 1) {
      await vi.advanceTimersByTimeAsync(0);
    }
  };

  // POSITIVE CONTROL for the whole describe: the same doors, the same drive, the MANAGER posture. Without
  // it every assertion below could be green because the harness never reached a decision at all.
  test("CONTROL — the manager posture DOES read the port owner and kill the group when an engine hangs", async () => {
    const portReads: string[] = [];
    const signals: NodeJS.Signals[] = [];
    // The fleet starts DOWN so the manager's own spawn makes each engine `owned` — only an OWNED engine's
    // hang reaches the kill (`decideOccupied`), which is precisely why the adopt-only arms below are safe.
    const stop = startVllmEngines({
      repoRoot: "/repo",
      now: (): number => 1_000_000,
      sleep: () => Promise.resolve(),
      triggerSpawn: () => {
        io.triggers.push(io.triggers.length);
        io.healthy.add("embed");
        io.healthy.add("rerank");
        io.healthy.add("gen");
      },
      portOwnerPid: (engine) => {
        portReads.push(engine);
        return Promise.resolve(7331);
      },
      signalEngineProcess: (engine, _listenerPid, signal) => {
        signals.push(signal);
        io.occupied.delete(engine);
        return { verdict: "signaled", pgid: 7331 };
      },
    });
    try {
      await settle();
      io.healthy.delete("embed");
      io.occupied.add("embed");
      for (let tick = 0; tick < 3; tick += 1) {
        await vi.advanceTimersByTimeAsync(21_000);
        await settle();
      }
      expect(portReads).toContain("embed");
      expect(signals).toEqual(["SIGKILL"]);
    } finally {
      stop();
    }
  });

  test.each(["win32", "darwin", "linux"] as const)("adopt-only on %s touches neither door while the fleet hangs", async (platform) => {
    Object.defineProperty(nodeProcess, "platform", { value: platform, configurable: true });
    const portReads: string[] = [];
    const signals: NodeJS.Signals[] = [];
    io.healthy.add("embed");
    io.healthy.add("rerank");
    io.healthy.add("gen");
    const stop = startVllmEngines({
      repoRoot: "/repo",
      now: (): number => 1_000_000,
      sleep: () => Promise.resolve(),
      manages: false,
      triggerSpawn: () => {
        io.triggers.push(io.triggers.length);
      },
      portOwnerPid: (engine) => {
        portReads.push(engine);
        return Promise.resolve(7331);
      },
      signalEngineProcess: (_engine, _listenerPid, signal) => {
        signals.push(signal);
        return { verdict: "signaled", pgid: 7331 };
      },
    });
    try {
      await settle();
      // The harshest arm the passive posture can meet: an adopted engine goes HUNG (port held, /health dead).
      // A manager kills the group here; adopt-only may only re-mark it.
      io.healthy.delete("embed");
      io.occupied.add("embed");
      for (let tick = 0; tick < 4; tick += 1) {
        await vi.advanceTimersByTimeAsync(21_000);
        await settle();
      }
      expect(portReads).toEqual([]);
      expect(signals).toEqual([]);
      expect(io.triggers).toEqual([]);
      // …and it still reports the truth, so the refusal is visible rather than silent.
      expect(getEngineStatus("embed")?.status).not.toBe("owned");
    } finally {
      stop();
    }
  });

  test.each(["win32", "darwin"] as const)("adopt-only on %s with the whole fleet DOWN never probes a pid", async (platform) => {
    Object.defineProperty(nodeProcess, "platform", { value: platform, configurable: true });
    const portReads: string[] = [];
    const signals: NodeJS.Signals[] = [];
    const stop = startVllmEngines({
      repoRoot: "/repo",
      now: (): number => 1_000_000,
      sleep: () => Promise.resolve(),
      manages: false,
      triggerSpawn: () => {
        io.triggers.push(io.triggers.length);
      },
      portOwnerPid: (engine) => {
        portReads.push(engine);
        return Promise.resolve(null);
      },
      signalEngineProcess: (_engine, _listenerPid, signal) => {
        signals.push(signal);
        return { verdict: "signaled", pgid: 7331 };
      },
    });
    try {
      await settle();
      for (let tick = 0; tick < 3; tick += 1) {
        await vi.advanceTimersByTimeAsync(21_000);
        await settle();
      }
      expect(portReads).toEqual([]);
      expect(signals).toEqual([]);
      expect(getEngineStatus("embed")?.detail).toContain("adopt-only: this stack never spawns");
    } finally {
      stop();
    }
  });
});
