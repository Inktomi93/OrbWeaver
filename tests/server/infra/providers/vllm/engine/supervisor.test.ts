// Unit tests for the vLLM supervisor's THREE pure decision cores (no IO, injected inputs) — the measured
// lifecycle matrix (Esoteric §4). `decideTick` is the reconciliation judgment; `breakerAllows` is the
// crash-loop window math; `findOrphanedEngineCores` is the cwd-based orphan match.
//
// PLUS an IO-shell lifecycle test (`startVllmEngines`): the pure cores can't see the `pendingSpawn` flag's
// LIFETIME, so this drives the real shell with mocked IO (spawn/fetch/ps/gpu) + an injected clock+sleep to
// prove the flag stays true across the restart-backoff window — a monitor tick landing in that window must
// NOT double-queue the spawn (which would double-charge the breaker and mislabel an owned engine 'adopted').

import { breakerAllows, decideTick, engineBaseUrl, findOrphanedEngineCores, getEngineStatus, startVllmEngines } from "@orb/server/infra/providers/vllm/engine";
import { afterEach, beforeEach, describe, vi } from "vitest";
import { expect, test } from "../../../../../support/fixtures";

// ── IO-shell harness (hoisted so the vi.mock factories can reach the shared fakes) ──────────────────────
interface FakeChild {
  readonly engine: string;
  readonly handlers: Record<string, (arg?: unknown) => void>;
  readonly stdin: { end: () => void };
  readonly on: (event: string, cb: (arg?: unknown) => void) => FakeChild;
}

const io = vi.hoisted(() => {
  // Engines currently answering /health OK. A spawn adds its engine here (the child "boots healthy"); a
  // simulated crash removes it. `fetch` reads this to decide healthy-vs-free.
  const healthy = new Set<string>();
  const spawns: string[] = []; // engine per spawn() call, in order
  const children: FakeChild[] = [];
  const makeChild = (engine: string): FakeChild => {
    const handlers: Record<string, (arg?: unknown) => void> = {};
    const child: FakeChild = {
      engine,
      handlers,
      stdin: { end: (): void => undefined },
      on(event, cb): FakeChild {
        handlers[event] = cb;
        return child;
      },
    };
    return child;
  };
  return { healthy, spawns, children, makeChild };
});

// Partial mocks (spread the real module — foundation/config etc. still need readFileSync/the rest).
vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    // spawnOwned: parse the engine from the death-couple wrapper. The injected spawnSpec (below) stamps a
    // `#engine:<name>#` marker into the argv so the mock can identify the engine without the old .sh path.
    spawn: (_cmd: string, args: readonly string[]): FakeChild => {
      const wrapper = args[1] ?? "";
      const engine = ["embed", "rerank", "gen"].find((e) => wrapper.includes(`#engine:${e}#`)) ?? "?";
      const child = io.makeChild(engine);
      io.children.push(child);
      io.spawns.push(engine);
      io.healthy.add(engine);
      return child;
    },
    // reap ps / port-owner ss → empty (no orphans, no foreign owner).
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
      expect(decideTick({ ...base, status: "owned", probe: "healthy", childAlive: false })).toEqual({
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
    const reaped = findOrphanedEngineCores("  222 333 VLLM::EngineCore", (pid) => new Set([222, 333]).has(pid));
    expect(reaped).toEqual([]);
  });

  test("ignores non-EngineCore rows entirely", () => {
    const reaped = findOrphanedEngineCores("  444   1 python train.py", () => true);
    expect(reaped).toEqual([]);
  });
});

// ── IO shell: the pendingSpawn flag lifetime across the restart-backoff window ─────────────────────────
describe("startVllmEngines — the queued-spawn flag holds across the backoff window", () => {
  const fixedNow = 1_000_000;
  const monitorIntervalMs = 21_000;
  const engines = ["embed", "rerank", "gen"] as const;

  const urlEngine = (url: string): string | undefined => engines.find((e) => url.startsWith(engineBaseUrl(e)));

  beforeEach(() => {
    io.healthy.clear();
    io.spawns.length = 0;
    io.children.length = 0;
    vi.useFakeTimers();
    // /health: healthy iff the engine's child has spawned (and not "crashed"); else connection-refused (free).
    vi.stubGlobal("fetch", (input: unknown): Promise<{ ok: boolean }> => {
      const engine = urlEngine(String(input));
      return engine !== undefined && io.healthy.has(engine) ? Promise.resolve({ ok: true }) : Promise.reject(new Error("ECONNREFUSED"));
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

  test("a monitor tick inside the restart backoff does NOT double-queue the respawn", async () => {
    // Injected sleep: park the restart backoff (>=5s) on a manual resolver so a monitor tick can land in
    // the window; health-poll sleeps resolve immediately.
    let parkBackoffs = false;
    const parked: Array<() => void> = [];
    const sleep = (ms: number): Promise<void> => (parkBackoffs && ms >= 5000 ? new Promise<void>((resolve) => parked.push(resolve)) : Promise.resolve());

    // Inject a fake spawn spec — the supervisor is topology-only; the marker lets the mock spawn identify
    // the engine. No real launch flags / DEPLOYMENT resolution runs in the unit test.
    const spawnSpec = (engine: (typeof engines)[number]): { command: string; args: string[]; env: Record<string, string> } => ({
      command: "/fake/vllm",
      args: ["serve", `#engine:${engine}#`],
      env: {},
    });
    const stop = startVllmEngines({ repoRoot: "/repo", now: (): number => fixedNow, sleep, spawnSpec });
    try {
      // Boot: all three ports free → each engine spawns and (the spawn marks it healthy) boots owned.
      await settle();
      expect(io.spawns).toEqual(["embed", "rerank", "gen"]);
      expect(getEngineStatus("embed")?.status).toBe("owned");

      // Crash embed: /health goes free AND the owned child exits (the tick applies restart policy).
      io.healthy.delete("embed");
      io.children.find((c) => c.engine === "embed")?.handlers["exit"]?.(0);

      // Park backoffs, then a monitor tick fires the restart → the backoff parks; pendingSpawn := true.
      parkBackoffs = true;
      await vi.advanceTimersByTimeAsync(monitorIntervalMs);
      expect(parked.length).toBe(1); // restart backoff is parked
      expect(io.spawns).toEqual(["embed", "rerank", "gen"]); // no respawn yet

      // A SECOND tick lands INSIDE the parked backoff window. With the flag held true, the decision
      // short-circuits to none. (The bug cleared pendingSpawn before the sleep → this tick queued a
      // second embed spawn, double-charging the breaker.)
      await vi.advanceTimersByTimeAsync(monitorIntervalMs);
      expect(io.spawns).toEqual(["embed", "rerank", "gen"]); // still no double-queue

      // Release the backoff → exactly ONE respawn runs, and embed stays OWNED (never mislabeled adopted).
      parkBackoffs = false;
      for (const resolve of parked) {
        resolve();
      }
      await settle();
      expect(io.spawns).toEqual(["embed", "rerank", "gen", "embed"]);
      expect(getEngineStatus("embed")?.status).toBe("owned");
    } finally {
      stop();
    }
  });

  // THE HMR-TOPOLOGY INVARIANT PIN (#14): a healthy responding port at boot is ADOPTED, never respawned —
  // the watched server must never re-own an engine the standalone launcher already brought up (the old
  // constant-restart hell). The refactor changed WHERE flags come from, never this topology.
  test("a healthy responding port is ADOPTED at boot, never respawned", async () => {
    // All three ports already healthy BEFORE the supervisor starts (the dev launcher owns them).
    io.healthy.add("embed");
    io.healthy.add("rerank");
    io.healthy.add("gen");
    const spawnSpec = (engine: (typeof engines)[number]): { command: string; args: string[]; env: Record<string, string> } => ({
      command: "/fake/vllm",
      args: ["serve", `#engine:${engine}#`],
      env: {},
    });
    const stop = startVllmEngines({ repoRoot: "/repo", now: (): number => fixedNow, sleep: () => Promise.resolve(), spawnSpec });
    try {
      await settle();
      // ZERO spawns — every engine was adopted, none re-owned.
      expect(io.spawns).toEqual([]);
      expect(getEngineStatus("embed")?.status).toBe("adopted");
      expect(getEngineStatus("rerank")?.status).toBe("adopted");
      expect(getEngineStatus("gen")?.status).toBe("adopted");
    } finally {
      stop();
    }
  });
});
