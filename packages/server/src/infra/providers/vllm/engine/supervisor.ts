// Adoptive vLLM engine supervisor. At boot the server probes each engine port and either ADOPTS a
// healthy engine someone else started (the dev stack) or SPAWNS + OWNS it. Owned engines run behind a
// pipe-watchdog holding a stdin pipe from this process, so any server death — incl. SIGKILL — takes the engine's process group with it.

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

const SS_PID_RE = /pid=(\d+)/;

type VllmEngine = (typeof VLLM_ENGINES)[number];
type EngineLifecycleStatus = (typeof ENGINE_LIFECYCLE_STATUSES)[number];

const ENGINES: readonly VllmEngine[] = VLLM_ENGINES;

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60_000;
const HEALTH_TIMEOUT_MS = 2000;
// First boot compiles CUDA graphs; warm boots are ~40s.
const SPAWN_HEALTH_DEADLINE_MS = 360_000;
const HEALTH_POLL_INTERVAL_MS = 2000;
const MONITOR_INTERVAL_MS = 21_000;
const HUNG_THRESHOLD = 3;
// Restart backoff ladder; index = restart count within the breaker window.
const RESTART_BACKOFF_1_MS = 5000;
const RESTART_BACKOFF_2_MS = 15_000;
const RESTART_BACKOFF_3_MS = 45_000;
const RESTART_BACKOFF_MS: readonly number[] = [
  RESTART_BACKOFF_1_MS,
  RESTART_BACKOFF_2_MS,
  RESTART_BACKOFF_3_MS,
];
const BREAKER_MAX_RESTARTS = 3;
const BREAKER_WINDOW_MS = 600_000; // 10 minutes
const BREAKER_HALF_OPEN_MS = 900_000; // 15 minutes
const STACK_BOOT_GRACE_MS = 900_000; // 15 minutes
const ORPHAN_REAP_SETTLE_MS = 3000;
// Mirrors the shell loop: 16 x 0.5s.
const KILL_GRACE_TICKS = 16;

const PROBE_STATES = ["healthy", "occupied", "free"] as const;
type Probe = (typeof PROBE_STATES)[number];

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
  /** A spawn is already queued for this engine — decisions short-circuit to none until it settles. */
  pendingSpawn: boolean;
  /** A LATER engine in the boot chain is healthy — proof the leader already passed this one, so a free port means dead, not pending. */
  laterEngineHealthy: boolean;
}

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

function decideHealthy(t: TickInput): TickAction {
  if (t.status === "owned" || t.status === "starting") {
    return t.childAlive ? { kind: "mark", status: "owned" } : { kind: "adopt" };
  }
  return t.status === "adopted" ? { kind: "none" } : { kind: "adopt" };
}

// TCP answers but /health doesn't; tolerated during warmup, then hung after the streak. Only kill processes we own.
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

function decideFree(t: TickInput): TickAction {
  if (t.status === "owned" || t.status === "starting") {
    // Child alive but port not bound yet (vLLM binds late) vs. the child actually exited.
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
  // A queued spawn owns this engine's fate until it runs — deciding again would double-charge the breaker.
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

const PS_ROW_RE = /^\s*(\d+)\s+(\d+)\s+(.*)$/;

/**
 * Find orphaned EngineCore workers. A SIGKILL'd APIServer can't reap its EngineCore child, which keeps
 * its GPU allocation and starves every respawn. Identification is CWD-based: every engine we launch
 * starts in the repo root and never chdirs, so a core's cwd matching ours + its parent's NOT matching
 * means the parent died and it re-parented. Pure: `hasOurMarker` is injected so the /proc read is testable.
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

interface EngineState {
  engine: VllmEngine;
  status: EngineLifecycleStatus;
  child?: ChildProcess | undefined;
  seenHealthy: boolean;
  unhealthyStreak: number;
  restarts: number[];
  failedAt?: number | undefined;
  // Held true through backoff + spawn + health-wait, cleared in runQueuedSpawn's finally — gates the tick
  // from re-queueing (and re-charging the breaker) while a spawn is still in flight.
  pendingSpawn: boolean;
}

export async function reapOrphanedEngineCores(repoRoot: string): Promise<number[]> {
  const ps = await new Promise<string>((resolve) => {
    execFile("ps", ["-eo", "pid=,ppid=,args="], (err, stdout) => resolve(err ? "" : stdout));
  });
  const hasOurMarker = (pid: number): boolean => {
    try {
      return readlinkSync(`/proc/${pid}/cwd`) === repoRoot;
    } catch {
      return false;
    }
  };
  const reaped: number[] = [];
  for (const pid of findOrphanedEngineCores(ps, hasOurMarker)) {
    try {
      process.kill(pid, "SIGKILL");
      reaped.push(pid);
    } catch {
      // already gone
    }
  }
  return reaped;
}

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
    // TimeoutError: something accepted TCP but won't answer → occupied. Connection-refused → free.
    return err instanceof Error && err.name === "TimeoutError" ? "occupied" : "free";
  }
}

const realSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Start the supervisor; returns a graceful-drain closer. `now`/`sleep` are injected for determinism (tests drive backoff without wall-clock waits). */
export function startVllmEngines(opts: {
  repoRoot: string;
  now: () => number;
  sleep?: (ms: number) => Promise<void>;
}): () => void {
  const { repoRoot, now } = opts;
  const sleep = opts.sleep ?? realSleep;
  const log = getLog().child({ component: "vllm-engines" });

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

  // One spawn mutex across boot + restarts — two engines profiling memory at once corrupts both KV budgets.
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

    // setsid makes the engine its own process-group leader, so the group-kill below takes the APIServer
    // and its EngineCore children in one signal. cat blocks on our stdin pipe; when this process dies the pipe closes and the group gets TERM then KILL.
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
        if (!stopped) {
          log.warn({ engine: s.engine, code }, "vllm-engines: owned engine exited");
        }
      }
    });
    s.child = child;
    mark(s, "starting", reason);
    log.info({ engine: s.engine, reason, logPath }, "vllm-engines: spawning owned engine");
  }

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
        return; // died during warmup; next tick applies the breaker
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

  // pendingSpawn stays true for the whole body and clears only in finally, once settled — clearing it
  // early let a monitor tick mid-backoff double-queue a spawn and double-charge the breaker.
  async function runQueuedSpawn(s: EngineState, reason: string, backoffMs: number): Promise<void> {
    try {
      if (stopped) {
        return;
      }
      if (backoffMs > 0) {
        await sleep(backoffMs);
      }
      const reprobe = await probeEngine(s.engine);
      if (reprobe !== "free") {
        if (s.child !== undefined) {
          // A live child means this engine is already ours; never relabel it adopted/foreign (that
          // would lose the owned-hang → kill-our-child respawn recovery path).
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

  function queueSpawn(s: EngineState, reason: string, backoffMs = 0): void {
    s.pendingSpawn = true;
    spawnChain = spawnChain
      .then(() => runQueuedSpawn(s, reason, backoffMs))
      .catch((err: unknown) => {
        // A rejected spawnChain would silently skip every future queued spawn; swallow so the mutex settles fulfilled.
        s.pendingSpawn = false;
        log.error({ engine: s.engine, err }, "vllm-engines: spawn-chain error — slot released");
      });
  }

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
      s.child.stdin?.end();
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

  // A human override RESETS the breaker — they are the half-open probe.
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
        // already gone
      }
      mark(s, "down", "admin restart: terminated port owner; takeover pending");
      setTimeout(() => void tick().catch(() => undefined), ORPHAN_REAP_SETTLE_MS).unref();
      return `terminated pid ${pid} — supervisor takeover in progress`;
    }
    void tick().catch(() => undefined);
    return "no engine on the port — spawn requested";
  }
  registerVllmEngineController({ restart: adminRestart });

  void tick().catch((err: unknown) => log.error({ err }, "vllm-engines: boot reconcile crashed"));
  const monitor = setInterval(() => {
    void tick().catch((err: unknown) => log.error({ err }, "vllm-engines: tick crashed"));
  }, MONITOR_INTERVAL_MS);
  monitor.unref();

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
