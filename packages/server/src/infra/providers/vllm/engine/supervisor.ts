// infra/providers/vllm/engine/supervisor — the adoptive vLLM engine supervisor (lifecycle owner).
//
// Centralizes engine lifecycle with the SERVER process: at boot the server probes each engine port and
// either ADOPTS a healthy engine someone else started (the dev stack — STACK_ENGINES=yes rides the env) or
// SPAWNS the engine itself and OWNS it. A monitor loop keeps reconciling for the life of the process.
// Status flows into engine-status.ts (the client reads it to make connection errors actionable); manual
// control flows into engine-control.ts (the admin panel reaches it through the providers front door).
//
// OWNERSHIP + DEATH-COUPLING: owned engines are spawned behind a pipe-watchdog wrapper
// (`setsid engine & cat; kill`) holding a stdin pipe from THIS process — ANY server death (including
// SIGKILL, which no signal handler can see) closes the pipe, `cat` exits, the engine's process GROUP is
// killed. No pidfiles, no pattern-matching, no orphaned GPU residents. (neo VERIFIED 2026-06-11: kill -9
// on the server took the engine down within seconds.)
//
// WHY ADOPTION EXISTS: tsx watch restarts the server on every file save. If the server always owned the
// engines, every save would reboot three engines (~1-2 min). Under the dev stack the stack process group
// owns them; each watch-restarted server just adopts. A standalone server finds none, spawns, and owns.
//
// SCENARIO MATRIX (the sad/oh-shit paths this loop covers): owned crash → backoff restart; crash loop →
// breaker → 'failed', half-open later; owned hang (port open, /health dead) → kill-our-child respawn;
// adopted die → takeover when the port frees (stack-grace prevents double-spawn during warmup); adopted
// hang → mark 'hung', takeover when free; foreign owner → never fight, mark 'foreign', adopt if it turns
// healthy; GPU wedge → spawns keep dying → same breaker; orphaned EngineCore (a SIGKILL'd APIServer can't
// reap its EngineCore child, which keeps GPU memory and starves every respawn) → reaped before each spawn.
//
// ONE spawn mutex serializes boot + restarts: vLLM's memory profiler reads device-wide free-memory deltas,
// so two engines must never profile at once (neo MEASURED: concurrent boots gave embed a NEGATIVE KV
// budget). The serve incantations live in a dev launcher script (scripts/dev/vllm-engine.sh) — the single
// source of truth this module and the stack leader both launch.
//
// DETERMINISM: the supervisor takes an injected `now()` (no `Date.now()` — the `no-raw-clock` gate). The
// THREE decision cores (`decideTick`/`breakerAllows`/`findOrphanedEngineCores`) are PURE (no IO, injected
// inputs) and unit-tested; the IO shell below drives them.

import type { ChildProcess } from "node:child_process";
import { execFile, spawn } from "node:child_process";
import { mkdirSync, readlinkSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { env } from "#foundation/env";
import { getLog } from "#foundation/observability";
import { engineBaseUrl } from "./client";
import { registerVllmEngineController } from "./engine-control";
import type { ENGINE_LIFECYCLE_STATUSES } from "./engine-status";
import { setEngineStatus } from "./engine-status";
import { VLLM_ENGINES } from "./engines";
import { detectGpu } from "./gpu";

// One `ss` row's pid field — hoisted (the rule forbids a per-call regex literal in a hot function).
const SS_PID_RE = /pid=(\d+)/;

// Derived file-locally from the canonical tuples (one home; no inline re-spell).
type VllmEngine = (typeof VLLM_ENGINES)[number];
type EngineLifecycleStatus = (typeof ENGINE_LIFECYCLE_STATUSES)[number];

const ENGINES: readonly VllmEngine[] = VLLM_ENGINES;

// ── tuning constants (named — biome `noMagicNumbers`) ────────────────────────────────────────────────
const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60_000;
const HEALTH_TIMEOUT_MS = 2000;
/** First boot compiles CUDA graphs; warm boots are ~40s. Generous cap. */
const SPAWN_HEALTH_DEADLINE_MS = 360_000;
/** Health re-poll cadence inside the spawn-wait loop. */
const HEALTH_POLL_INTERVAL_MS = 2000;
/** Monitor cadence. Off the round numbers so three engines' probes stagger. */
const MONITOR_INTERVAL_MS = 21_000;
/** Consecutive health-check timeouts (port open, no answer) before 'hung'. */
const HUNG_THRESHOLD = 3;
/** Restart backoff ladder; index = restart count within the breaker window. */
const RESTART_BACKOFF_1_MS = 5000;
const RESTART_BACKOFF_2_MS = 15_000;
const RESTART_BACKOFF_3_MS = 45_000;
const RESTART_BACKOFF_MS: readonly number[] = [
  RESTART_BACKOFF_1_MS,
  RESTART_BACKOFF_2_MS,
  RESTART_BACKOFF_3_MS,
];
/** Breaker: more than MAX restarts inside WINDOW → circuit opens ('failed'). */
const BREAKER_MAX_RESTARTS = 3;
const BREAKER_WINDOW_MS = 600_000; // 10 minutes
/** Circuit half-open: after this long in 'failed', allow one probe spawn. */
const BREAKER_HALF_OPEN_MS = 900_000; // 15 minutes
/** Stack mode: how long the leader's sequential boot chain may take before a free port stops meaning
 *  "leader will get to it" and starts meaning "dead". */
const STACK_BOOT_GRACE_MS = 900_000; // 15 minutes
/** Let the driver release a reaped orphan's GPU allocation before spawning into it. */
const ORPHAN_REAP_SETTLE_MS = 3000;
/** Grace before the watchdog escalates TERM→KILL (mirrors the shell loop: 16 × 0.5s). */
const KILL_GRACE_TICKS = 16;

// Port-probe outcome (one home — the axis declared once as a tuple, the union derived; §7.5).
const PROBE_STATES = ["healthy", "occupied", "free"] as const;
type Probe = (typeof PROBE_STATES)[number];

// ── pure decision core (unit-tested; no IO) ──────────────────────────────────────────────────────────

type TickAction =
  | { kind: "none" }
  | { kind: "adopt" }
  | { kind: "mark"; status: EngineLifecycleStatus; detail?: string }
  | { kind: "restart"; reason: string }
  | { kind: "spawn"; reason: string };

interface TickInput {
  status: EngineLifecycleStatus;
  probe: Probe;
  seenHealthy: boolean;
  stackMode: boolean;
  bootAt: number;
  unhealthyStreak: number;
  failedAt: number | undefined;
  childAlive: boolean;
  now: number;
  /** A spawn for this engine is already queued on the spawn mutex — every decision short-circuits to
   *  none until it has SETTLED (held true through the backoff + spawn + health-wait; see
   *  EngineState.pendingSpawn). */
  pendingSpawn: boolean;
  /** An engine LATER in the leader's sequential boot chain is healthy — proof the leader already attempted
   *  (and abandoned/lost) THIS one, so a free port means dead, not pending. Lets a fresh supervisor (a tsx
   *  restart during an outage) take over immediately instead of sitting out the stack grace window. */
  laterEngineHealthy: boolean;
}

// Circuit-open branch: only the half-open timer (or a hand-fixed healthy port) can move us.
function decideFailed(t: TickInput): TickAction {
  if (
    t.failedAt !== undefined &&
    t.now - t.failedAt >= BREAKER_HALF_OPEN_MS &&
    t.probe === "free"
  ) {
    return { kind: "spawn", reason: "breaker half-open probe" };
  }
  if (t.probe === "healthy") {
    return { kind: "adopt" }; // someone fixed it by hand
  }
  return { kind: "none" };
}

// Healthy-port branch: a healthy engine is usable whatever the prior state.
function decideHealthy(t: TickInput): TickAction {
  if (t.status === "owned" || t.status === "starting") {
    return t.childAlive ? { kind: "mark", status: "owned" } : { kind: "adopt" };
  }
  return t.status === "adopted" ? { kind: "none" } : { kind: "adopt" };
}

// Occupied-port branch: TCP answers but /health doesn't. Tolerate during warmup; after the streak it's
// hung. We only kill processes we own.
function decideOccupied(t: TickInput): TickAction {
  if (t.status === "starting") {
    return { kind: "none" };
  }
  if (t.unhealthyStreak + 1 >= HUNG_THRESHOLD) {
    if (t.status === "owned" && t.childAlive) {
      return { kind: "restart", reason: "hung (owned)" };
    }
    return { kind: "mark", status: "hung", detail: "port open, /health unresponsive" };
  }
  return { kind: "none" };
}

// Free-port branch: nothing is listening.
function decideFree(t: TickInput): TickAction {
  if (t.status === "owned" || t.status === "starting") {
    // child alive but port not bound yet (vLLM binds late in boot) vs the child actually exited.
    return t.childAlive ? { kind: "none" } : { kind: "restart", reason: "owned engine exited" };
  }
  if (
    t.stackMode &&
    !t.seenHealthy &&
    !t.laterEngineHealthy &&
    t.now - t.bootAt < STACK_BOOT_GRACE_MS
  ) {
    return { kind: "mark", status: "stack-pending", detail: "waiting for stack leader" };
  }
  return {
    kind: "spawn",
    reason: t.seenHealthy ? "takeover: previous engine died" : "no engine running",
  };
}

/** One reconciliation decision. Pure — all the supervisor's judgment lives here. */
export function decideTick(t: TickInput): TickAction {
  // A queued spawn owns this engine's fate until it runs — deciding again would double-queue and
  // double-charge the breaker.
  if (t.pendingSpawn) {
    return { kind: "none" };
  }
  if (t.status === "failed") {
    return decideFailed(t);
  }
  if (t.probe === "healthy") {
    return decideHealthy(t);
  }
  if (t.probe === "occupied") {
    return decideOccupied(t);
  }
  return decideFree(t);
}

/** Breaker bookkeeping: prune the window, decide if another restart is allowed. Pure. */
export function breakerAllows(
  restarts: readonly number[],
  now: number,
): { allowed: boolean; pruned: number[] } {
  const pruned = restarts.filter((ts) => now - ts < BREAKER_WINDOW_MS);
  return { allowed: pruned.length < BREAKER_MAX_RESTARTS, pruned };
}

// One `ps` row (pid, ppid, args) — the parse target for orphan detection.
const PS_ROW_RE = /^\s*(\d+)\s+(\d+)\s+(.*)$/;

/**
 * Find orphaned EngineCore workers. A SIGKILL'd APIServer (OOM killer, manual kill -9) can't reap its
 * EngineCore child — the orphan keeps its GPU allocation and starves every respawn.
 *
 * Identification is CWD-based — the only marker that survived reality (each earlier candidate was measured
 * and eliminated): argv is rewritten to a bare `VLLM::EngineCore` (no paths); /proc/exe is a uv-shared
 * interpreter symlink (not the venv); /proc/environ is sanitized by vLLM's spawn-method bootstrap (our
 * cache pins never reach cores). /proc/<pid>/cwd WORKS: every engine we launch starts in the repo root and
 * never chdirs; cores inherit it. Orphan test: the core's cwd is OUR repo AND its parent's cwd is not (a
 * supervised core's parent is the APIServer with the SAME cwd; after it dies the core re-parents to init or
 * — on systemd user sessions — the session subreaper, neither of which has our cwd). Pure: `hasOurMarker`
 * is injected so the /proc read is testable.
 */
export function findOrphanedEngineCores(
  psOutput: string,
  hasOurMarker: (pid: number) => boolean,
): number[] {
  const rows: { pid: number; ppid: number; args: string }[] = [];
  for (const line of psOutput.split("\n")) {
    const m = PS_ROW_RE.exec(line);
    if (m !== null) {
      rows.push({ pid: Number(m[1]), ppid: Number(m[2]), args: m[3] ?? "" });
    }
  }
  return rows
    .filter((r) => r.args.includes("EngineCore"))
    .filter((r) => hasOurMarker(r.pid) && !hasOurMarker(r.ppid))
    .map((r) => r.pid);
}

// ── IO shell ──────────────────────────────────────────────────────────────────────────────────────────

interface EngineState {
  engine: VllmEngine;
  status: EngineLifecycleStatus;
  child?: ChildProcess | undefined;
  /** Ever seen healthy this process lifetime — gates stack-mode takeover. */
  seenHealthy: boolean;
  /** Consecutive occupied-but-unhealthy probes (hung detection). */
  unhealthyStreak: number;
  /** Restart timestamps inside the breaker window. */
  restarts: number[];
  /** When the breaker opened (status 'failed'). */
  failedAt?: number | undefined;
  /** A spawn is queued on the mutex chain and has not SETTLED yet (held true through the backoff sleep +
   *  spawn + health-wait, cleared in `runQueuedSpawn`'s finally). Gates the tick from re-queueing (and
   *  re-charging the breaker) while an earlier engine's cold compile holds the chain OR this engine's own
   *  restart backoff is still ticking — neo MEASURED: rerank/gen burned the whole breaker budget on
   *  queued-never-run spawns behind embed's first boot. */
  pendingSpawn: boolean;
}

/** Reap orphaned EngineCore workers (see {@link findOrphanedEngineCores}); returns the pids killed. */
export async function reapOrphanedEngineCores(repoRoot: string): Promise<number[]> {
  const ps = await new Promise<string>((resolve) => {
    execFile("ps", ["-eo", "pid=,ppid=,args="], (err, stdout) => resolve(err ? "" : stdout));
  });
  const hasOurMarker = (pid: number): boolean => {
    try {
      return readlinkSync(`/proc/${pid}/cwd`) === repoRoot;
    } catch {
      return false; // gone, or not ours to inspect — either way not ours to kill
    }
  };
  const reaped: number[] = [];
  for (const pid of findOrphanedEngineCores(ps, hasOurMarker)) {
    try {
      process.kill(pid, "SIGKILL");
      reaped.push(pid);
    } catch {
      // already gone — fine
    }
  }
  return reaped;
}

// Pid listening on the engine's port (same-uid processes only — exactly ours).
async function portOwnerPid(engine: VllmEngine): Promise<number | null> {
  const out = await new Promise<string>((resolve) => {
    execFile("ss", ["-tlnp"], (err, stdout) => resolve(err ? "" : stdout));
  });
  const port = new URL(engineBaseUrl(engine)).port;
  for (const line of out.split("\n")) {
    if (!line.includes(`:${port} `)) {
      continue;
    }
    const m = SS_PID_RE.exec(line);
    if (m !== null) {
      return Number(m[1]);
    }
  }
  return null;
}

async function probeEngine(engine: VllmEngine): Promise<Probe> {
  try {
    const res = await fetch(`${engineBaseUrl(engine)}/health`, {
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
    return res.ok ? "healthy" : "occupied";
  } catch (err) {
    // TimeoutError → something accepted TCP but won't answer → occupied. Connection-refused → free.
    return err instanceof Error && err.name === "TimeoutError" ? "occupied" : "free";
  }
}

const realSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Start the supervisor; returns a graceful-drain closer. `now` is injected (determinism); `repoRoot` is
 *  the cwd marker the death-couple wrapper + orphan-reap use. `sleep` is the timer seam — the same
 *  determinism lever as `now`; the composition root omits it (the real setTimeout-backed sleep), tests
 *  inject a controllable one to drive the restart-backoff / health-poll windows without wall-clock waits. */
export function startVllmEngines(opts: {
  repoRoot: string;
  now: () => number;
  sleep?: (ms: number) => Promise<void>;
}): () => void {
  const { repoRoot, now } = opts;
  const sleep = opts.sleep ?? realSleep;
  const log = getLog().child({ component: "vllm-engines" });

  // No GPU → no engines: idle with an honest status instead of crash-looping spawns every breaker
  // half-open window (vLLM is the only local inference family; a CPU box just lacks it, runners fail typed).
  if (!detectGpu()) {
    log.warn("vllm-engines: no NVIDIA GPU detected — supervisor idle, engines unavailable");
    for (const engine of ENGINES) {
      setEngineStatus(engine, "down", "no GPU on this host", now());
    }
    return () => {
      // nothing owned — nothing to drain
    };
  }

  const bootAt = now();
  const stackMode = env.STACK_ENGINES === "yes";
  const states = new Map<VllmEngine, EngineState>(
    ENGINES.map((engine) => [
      engine,
      {
        engine,
        status: "down",
        seenHealthy: false,
        unhealthyStreak: 0,
        restarts: [],
        pendingSpawn: false,
      },
    ]),
  );
  let stopped = false;

  // ONE spawn mutex across boot + restarts (the profiling race — see header).
  let spawnChain: Promise<void> = Promise.resolve();

  const mark = (s: EngineState, status: EngineLifecycleStatus, detail = ""): void => {
    if (s.status !== status) {
      log.info({ engine: s.engine, from: s.status, to: status, detail }, "vllm-engines: state");
    }
    s.status = status;
    setEngineStatus(s.engine, status, detail, now());
  };

  function spawnOwned(s: EngineState, reason: string): void {
    const runDir = path.join(repoRoot, ".cache", "stack");
    mkdirSync(runDir, { recursive: true });
    const logPath = path.join(runDir, `vllm-${s.engine}.log`);

    // setsid: the engine becomes its own session + process-GROUP leader (pgid == its pid), so the kills
    // below take the APIServer AND its EngineCore children in one deterministic group signal — no name
    // matching, no orphans from kills WE issue. `cat` blocks on OUR stdin pipe; when this Node process
    // dies — gracefully or SIGKILLed — the pipe closes, cat exits, and the group gets TERM then KILL.
    const wrapper =
      `setsid bash "${repoRoot}/scripts/dev/vllm-engine.sh" ${s.engine} >>"${logPath}" 2>&1 & P=$!; ` +
      `cat >/dev/null; kill -TERM -- "-$P" 2>/dev/null; ` +
      `for _ in $(seq 1 ${KILL_GRACE_TICKS}); do kill -0 "$P" 2>/dev/null || exit 0; sleep 0.5; done; ` +
      `kill -KILL -- "-$P" 2>/dev/null`;
    const child = spawn("bash", ["-c", wrapper], {
      stdio: ["pipe", "ignore", "ignore"],
      detached: false,
    });
    child.on("error", (err) => log.error({ engine: s.engine, err }, "vllm-engines: spawn failed"));
    child.on("exit", (code) => {
      if (s.child === child) {
        s.child = undefined;
        // The monitor tick notices the free port and applies restart/breaker policy; during shutdown
        // this is the expected path.
        if (!stopped) {
          log.warn({ engine: s.engine, code }, "vllm-engines: owned engine exited");
        }
      }
    });
    s.child = child;
    mark(s, "starting", reason);
    log.info({ engine: s.engine, reason, logPath }, "vllm-engines: spawning owned engine");
  }

  // Wait for an owned spawn to become healthy (or hit the deadline / die). Returns when settled.
  async function awaitHealthy(s: EngineState): Promise<void> {
    const deadline = now() + SPAWN_HEALTH_DEADLINE_MS;
    while (now() < deadline && !stopped) {
      // biome-ignore lint/performance/noAwaitInLoops: a health poll is inherently sequential.
      if ((await probeEngine(s.engine)) === "healthy") {
        s.seenHealthy = true;
        s.unhealthyStreak = 0;
        mark(s, "owned");
        return;
      }
      if (!s.child) {
        return; // died during warmup — next tick applies the breaker
      }
      await sleep(HEALTH_POLL_INTERVAL_MS);
    }
    if (s.status === "starting") {
      log.warn(
        { engine: s.engine },
        "vllm-engines: not healthy before deadline — releasing spawn slot",
      );
    }
  }

  // The body of a queued spawn: re-probe inside the mutex, reap orphans, spawn, then wait for health.
  // `pendingSpawn` stays TRUE for the whole body — through the backoff sleep, the spawn, and the
  // health-wait — and is cleared in the `finally` only once the spawn has SETTLED. Clearing it early (the
  // original bug) let a monitor tick landing in the 5-45s backoff window see `down`/`free`/`pendingSpawn:
  // false` and queue a SECOND spawn, double-charging the breaker (opening it below the 3-restart policy)
  // and — after both spawns ran — relabeling an engine we own as `adopted` (losing hung-recovery).
  async function runQueuedSpawn(s: EngineState, reason: string, backoffMs: number): Promise<void> {
    try {
      if (stopped) {
        return;
      }
      if (backoffMs > 0) {
        await sleep(backoffMs);
      }
      // Re-probe inside the mutex — the world may have changed while queued.
      const reprobe = await probeEngine(s.engine);
      if (reprobe !== "free") {
        if (s.child !== undefined) {
          // OWNERSHIP-AWARE skip: a live child means THIS engine is ours (an earlier queued spawn already
          // brought the port up). Never relabel an owned engine `adopted`/`foreign` — that path loses the
          // owned-hang → kill-our-child respawn recovery. Leave its owned/starting status untouched; the
          // next tick reconciles it.
          log.warn(
            { engine: s.engine, probe: reprobe },
            "vllm-engines: queued spawn superseded — engine already ours",
          );
          return;
        }
        if (reprobe === "healthy") {
          mark(s, "adopted", "spawn skipped: port became healthy while queued");
        } else {
          mark(s, "foreign", "spawn skipped: port occupied while queued");
        }
        log.warn(
          { engine: s.engine, probe: reprobe },
          "vllm-engines: queued spawn skipped — port no longer free",
        );
        return;
      }
      // Clear any orphaned EngineCore still holding GPU memory — without this, respawns after an APIServer
      // SIGKILL loop on negative-KV failures.
      const reaped = await reapOrphanedEngineCores(repoRoot);
      if (reaped.length > 0) {
        log.warn(
          { engine: s.engine, reaped },
          "vllm-engines: reaped orphaned EngineCore(s) before spawn",
        );
        await sleep(ORPHAN_REAP_SETTLE_MS);
      }
      spawnOwned(s, reason);
      await awaitHealthy(s);
    } finally {
      s.pendingSpawn = false;
    }
  }

  /** Queue a spawn on the mutex chain, wait for health (or deadline) before releasing. */
  function queueSpawn(s: EngineState, reason: string, backoffMs = 0): void {
    s.pendingSpawn = true;
    spawnChain = spawnChain
      .then(() => runQueuedSpawn(s, reason, backoffMs))
      .catch((err: unknown) => {
        // A rejected spawnChain would skip EVERY future queued spawn (the engine would never respawn,
        // silently) because `.then()` on a rejected promise drops its callback. Swallow here so the
        // mutex always settles fulfilled and the next spawn can run.
        s.pendingSpawn = false;
        log.error({ engine: s.engine, err }, "vllm-engines: spawn-chain error — slot released");
      });
  }

  /** Restart = kill our child (if any) then breaker-gated respawn with backoff. */
  function requestRestart(s: EngineState, reason: string): void {
    const at = now();
    const { allowed, pruned } = breakerAllows(s.restarts, at);
    s.restarts = pruned;
    if (!allowed) {
      s.failedAt = at;
      mark(
        s,
        "failed",
        `crash loop: ${BREAKER_MAX_RESTARTS} restarts in window; half-open in ${Math.round(BREAKER_HALF_OPEN_MS / MS_PER_MINUTE)}m`,
      );
      log.error(
        { engine: s.engine, reason },
        "vllm-engines: breaker OPEN — giving up until half-open",
      );
      return;
    }
    const backoff =
      RESTART_BACKOFF_MS[Math.min(s.restarts.length, RESTART_BACKOFF_MS.length - 1)] ??
      RESTART_BACKOFF_3_MS;
    s.restarts.push(at);
    if (s.child) {
      s.child.stdin?.end(); // watchdog kills the engine
      s.child = undefined;
    }
    mark(s, "down", `restarting (${reason}); backoff ${backoff / MS_PER_SECOND}s`);
    log.warn({ engine: s.engine, reason, backoff }, "vllm-engines: restarting owned engine");
    queueSpawn(s, `restart: ${reason}`, backoff);
  }

  function applyAction(s: EngineState, action: TickAction): void {
    switch (action.kind) {
      case "none":
        break;
      case "adopt":
        s.failedAt = undefined;
        mark(s, "adopted");
        break;
      case "mark":
        mark(s, action.status, action.detail ?? "");
        break;
      case "restart":
        requestRestart(s, action.reason);
        break;
      case "spawn": {
        const at = now();
        const { allowed, pruned } = breakerAllows(s.restarts, at);
        s.restarts = pruned;
        if (!allowed) {
          s.failedAt = s.failedAt ?? at;
          mark(s, "failed", "spawn suppressed: breaker open");
          break;
        }
        s.restarts.push(at);
        s.failedAt = undefined;
        queueSpawn(s, action.reason);
        break;
      }
      default:
        break;
    }
  }

  // Reconcile one engine against the whole-tick probe picture (the pure decision + its state writes).
  function reconcileOne(s: EngineState, probes: ReadonlyMap<VllmEngine, Probe>): void {
    const probe = probes.get(s.engine) ?? "free";
    const laterEngineHealthy = ENGINES.slice(ENGINES.indexOf(s.engine) + 1).some(
      (e) => probes.get(e) === "healthy",
    );
    const action = decideTick({
      status: s.status,
      probe,
      seenHealthy: s.seenHealthy,
      stackMode,
      bootAt,
      unhealthyStreak: s.unhealthyStreak,
      failedAt: s.failedAt,
      childAlive: s.child !== undefined,
      now: now(),
      pendingSpawn: s.pendingSpawn,
      laterEngineHealthy,
    });
    s.unhealthyStreak = probe === "occupied" ? s.unhealthyStreak + 1 : 0;
    if (probe === "healthy") {
      s.seenHealthy = true;
    }
    applyAction(s, action);
  }

  async function tick(): Promise<void> {
    // Probe everything first — laterEngineHealthy needs the whole picture.
    const probes = new Map<VllmEngine, Probe>();
    for (const engine of ENGINES) {
      if (stopped) {
        return;
      }
      // biome-ignore lint/performance/noAwaitInLoops: sequential probes keep the picture coherent per tick.
      probes.set(engine, await probeEngine(engine));
    }
    for (const s of states.values()) {
      if (stopped) {
        return;
      }
      reconcileOne(s, probes);
    }
  }

  /** Admin-panel manual restart (registered into the control registry). A human override RESETS the
   *  breaker — they ARE the half-open probe. Owned engines bounce through the group-kill + breaker-gated
   *  respawn; everything else (adopted, hung-foreign, stack-orphaned) gets the port owner terminated and
   *  the monitor's takeover logic spawns an owned replacement on the next tick. */
  async function adminRestart(engine: VllmEngine): Promise<string> {
    const s = states.get(engine);
    if (s === undefined) {
      return "unknown engine";
    }
    s.restarts = [];
    s.failedAt = undefined;
    if (s.child) {
      requestRestart(s, "admin restart");
      return "owned engine bounced — respawning";
    }
    const pid = await portOwnerPid(engine);
    if (pid !== null) {
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        // already gone — the tick handles the rest either way
      }
      mark(s, "down", "admin restart: terminated port owner; takeover pending");
      setTimeout(() => void tick().catch(() => undefined), ORPHAN_REAP_SETTLE_MS).unref();
      return `terminated pid ${pid} — supervisor takeover in progress`;
    }
    void tick().catch(() => undefined);
    return "no engine on the port — spawn requested";
  }
  registerVllmEngineController({ restart: adminRestart });

  // Boot reconcile + monitor loop. Fire-and-forget; never blocks the server.
  void tick().catch((err: unknown) => log.error({ err }, "vllm-engines: boot reconcile crashed"));
  const monitor = setInterval(() => {
    void tick().catch((err: unknown) => log.error({ err }, "vllm-engines: tick crashed"));
  }, MONITOR_INTERVAL_MS);
  monitor.unref(); // never keeps the process alive

  // Graceful-drain closer: stop the loop and end each owned child's stdin pipe (triggers the watchdog
  // kill) — adopted engines are untouched. Abrupt deaths don't need this; the pipe fires on its own.
  return () => {
    stopped = true;
    registerVllmEngineController(null);
    clearInterval(monitor);
    for (const s of states.values()) {
      if (s.child) {
        log.info({ engine: s.engine }, "vllm-engines: shutting down owned engine");
        s.child.stdin?.end();
      }
    }
  };
}
