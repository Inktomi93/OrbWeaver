// Adoptive vLLM engine supervisor. At boot the server probes each engine port and either ADOPTS a healthy
// engine or, in the MANAGER posture (adopt-or-start), triggers a DETACHED fleet spawn via the front-door verb
// (engines.sh start). OWNERSHIP INVERSION (A.4): the supervisor no longer forks in-process engine children —
// the detached fleet is nobody's child and survives the server's death (the bit-us-twice class is unmakeable).
// The breaker/backoff/mutex/orphan-reap machinery is retained; only the spawn MECHANISM changed.

import { execFile } from "node:child_process";
import path from "node:path";
import { setTimeout as sleepFor } from "node:timers/promises";
import { env } from "#foundation/env";
import { getLog } from "#foundation/observability";
import { registerVllmEngineController } from "./engine-control.ts";
import type { ENGINE_LIFECYCLE_STATUSES } from "./engine-status.ts";
import { setEngineStatus } from "./engine-status.ts";
import { engineBaseUrl } from "./engine-url.ts";
import { VLLM_ENGINES } from "./engines.ts";
import type { AutoSleepState, EngineMetrics } from "./fleet-control.ts";
import { advanceAutoSleep, enginePortPid, fetchEngineMetrics, fleetRunDir, initialAutoSleepState, isStopped, postSleep } from "./fleet-control.ts";
import { detectGpu } from "./gpu.ts";
import { signalRecordedEngineProcess } from "./process-identity.ts";
import { reapOrphanedFamily } from "./reaper.ts";
import { invalidateAwakeCache } from "./wake-gate.ts";

type VllmEngine = (typeof VLLM_ENGINES)[number];
type EngineLifecycleStatus = (typeof ENGINE_LIFECYCLE_STATUSES)[number];
type EngineSignalVerdict = ReturnType<typeof signalRecordedEngineProcess>;

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
const RESTART_BACKOFF_MS: readonly number[] = [RESTART_BACKOFF_1_MS, RESTART_BACKOFF_2_MS, RESTART_BACKOFF_3_MS];
const BREAKER_MAX_RESTARTS = 3;
const BREAKER_WINDOW_MS = 600_000; // 10 minutes
const BREAKER_HALF_OPEN_MS = 900_000; // 15 minutes
const STACK_BOOT_GRACE_MS = 900_000; // 15 minutes
const ORPHAN_REAP_SETTLE_MS = 3000;

// `sleeping` = /health 200 but /is_sleeping true (weights on CPU, scheduler paused) — only probed when
// sleepMode is on. A sleeping engine is HEALTHY (never respawned) but must not be classified adopted/owned
// (that would lie in status and hang requests); it maps to the sleeping / sleeping-held lifecycle states.
const PROBE_STATES = ["healthy", "sleeping", "occupied", "free"] as const;
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
  /** The supervisor triggered this engine's DETACHED spawn and it hasn't come up / failed yet (the successor
   *  to the old live-child handle under ownership inversion — drives the owned-vs-adopt + restart arms). */
  spawnTriggered: boolean;
  now: number;
  /** A spawn is already queued/running for this engine — decisions short-circuit to none until it settles. */
  pendingSpawn: boolean;
  /** A LATER engine in the boot chain is healthy — proof the leader already passed this one, so a free port means dead, not pending. */
  laterEngineHealthy: boolean;
  /** The manual hold marker (`.cache/stack/engines.hold`) is present — a `sleeping` probe classifies as
   *  `sleeping-held` (the wake gate refuses on the marker even with VRAM free), else plain `sleeping`. */
  sleepHeld: boolean;
  /** The intentional-stop marker (`.cache/stack/engines.stopped`, #1929) is present — `decideFree` refuses
   *  the takeover-respawn while it is set (an operator/automation ran `engines stop` on purpose; a dead
   *  pidfile is not a crash). Cleared by `engines start`'s real spawn attempt, so a GENUINE later crash
   *  (no marker, leader gone) still takes over exactly as before — this gates one axis, not "never respawn". */
  stoppedIntentionally: boolean;
  /** The fleet MANAGER posture (adopt-or-start): spawns/takes over a down engine. False (adopt-only) = a
   *  passive consumer that adopts healthy engines but NEVER spawns — a down engine fails fast. */
  manages: boolean;
}

function decideFailed(t: TickInput): TickAction {
  // Only the manager re-spawns on a half-open breaker; adopt-only never spawns.
  if (t.manages && t.failedAt !== undefined && t.now - t.failedAt >= BREAKER_HALF_OPEN_MS && t.probe === "free") {
    return { kind: "spawn", reason: "breaker half-open probe" };
  }
  if (t.probe === "healthy") {
    return { kind: "adopt" }; // someone fixed it by hand
  }
  return { kind: "none" };
}

function decideHealthy(t: TickInput): TickAction {
  // `owned` is durable provenance for a detached launch; `spawnTriggered` is only the in-flight poll flag
  // and is deliberately cleared once that launch becomes healthy. Requiring the transient flag here erased
  // ownership on the very next tick and disabled later hung-engine recovery.
  if (t.status === "owned") {
    return { kind: "mark", status: "owned" };
  }
  if (t.status === "starting") {
    return t.spawnTriggered ? { kind: "mark", status: "owned" } : { kind: "adopt" };
  }
  return t.status === "adopted" ? { kind: "none" } : { kind: "adopt" };
}

// TCP answers but /health doesn't; tolerated during warmup, then hung after the streak. Only kill processes we own.
function decideOccupied(t: TickInput): TickAction {
  if (t.status === "starting") {
    return { kind: "none" };
  }
  if (t.unhealthyStreak + 1 >= HUNG_THRESHOLD) {
    if (t.status === "owned") {
      return { kind: "restart", reason: "hung (owned)" };
    }
    return { kind: "mark", status: "hung", detail: "port open, /health unresponsive" };
  }
  return { kind: "none" };
}

function decideFree(t: TickInput): TickAction {
  if (t.status === "owned" || t.status === "starting") {
    // Child alive but port not bound yet (vLLM binds late) vs. the child actually exited.
    return t.spawnTriggered ? { kind: "none" } : { kind: "restart", reason: "owned engine exited" };
  }
  // adopt-only (a passive consumer: snap/e2e/alt) NEVER spawns — a down engine fails fast with the remedy,
  // no implicit 3-min cold boot. adopt-or-start (the manager) spawns/takes over.
  if (!t.manages) {
    return { kind: "mark", status: "down", detail: "engines down — `pnpm engines start` (adopt-only: this stack never spawns)" };
  }
  // #1929: an operator/automation ran `engines stop` on purpose — the marker says so, and a dead pidfile is
  // not evidence of a crash. Refuse the takeover for BOTH free-port arms (a fresh boot finding the fleet
  // down, and a mid-run "previous engine died" transition) — the marker is cleared only by `engines start`'s
  // real spawn attempt, so a GENUINE later crash (marker absent) still takes over exactly as before.
  if (t.stoppedIntentionally) {
    return {
      kind: "mark",
      status: "down",
      detail: "engines stopped intentionally (`engines stop`) — `pnpm engines start` resumes; supervisor will not take over",
    };
  }
  if (t.stackMode && !t.seenHealthy && !t.laterEngineHealthy && t.now - t.bootAt < STACK_BOOT_GRACE_MS) {
    return { kind: "mark", status: "stack-pending", detail: "waiting for the fleet spawner" };
  }
  return {
    kind: "spawn",
    reason: t.seenHealthy ? "takeover: previous engine died" : "no engine running",
  };
}

// A sleeping engine is HEALTHY-but-idle: never respawn it, never lie 'adopted/owned'. Mark sleeping-held
// when the manual hold marker is present (so the wake gate refuses on the marker), else plain sleeping.
function decideSleeping(t: TickInput): TickAction {
  return { kind: "mark", status: t.sleepHeld ? "sleeping-held" : "sleeping" };
}

/** One reconciliation decision. Pure — all the supervisor's judgment lives here. */
export function decideTick(t: TickInput): TickAction {
  // A queued spawn owns this engine's fate until it runs — deciding again would double-charge the breaker.
  if (t.pendingSpawn) {
    return { kind: "none" };
  }
  // A sleeping probe is unambiguous — the engine is UP (health 200, scheduler paused). Classify it before
  // the failed-breaker arm: a hand-fixed engine that comes back asleep clears the breaker via the mark.
  if (t.probe === "sleeping") {
    return decideSleeping(t);
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
export function breakerAllows(restarts: readonly number[], now: number): { allowed: boolean; pruned: number[] } {
  const pruned = restarts.filter((ts) => now - ts < BREAKER_WINDOW_MS);
  return { allowed: pruned.length < BREAKER_MAX_RESTARTS, pruned };
}

interface EngineState {
  engine: VllmEngine;
  status: EngineLifecycleStatus;
  // OWNERSHIP INVERSION (A.4): the supervisor no longer holds engine CHILDREN. A spawn routes through the
  // detached front-door verb (engines.sh start), so a triggered engine is nobody's child — it survives the
  // server's death (the bit-us-twice class dies permanently). This flag records "we triggered this engine's
  // detached spawn and it hasn't come up / failed yet" — the successor to the old live-child handle, driving
  // the same decideTick arms (owned-vs-adopt, restart-on-exit) without a ChildProcess.
  spawnTriggered: boolean;
  seenHealthy: boolean;
  unhealthyStreak: number;
  restarts: number[];
  failedAt?: number | undefined;
  // #761: COUNTS queued/running operations for this engine — never a shared boolean. Two same-engine
  // operations (e.g. two concurrent admin restarts) chain sequentially through the one spawn mutex
  // (`spawnChain`), but each holds its OWN slot: incremented in `queueSpawn`, decremented in
  // `runQueuedSpawn`'s finally. A boolean here let the FIRST operation's completion clear the flag while
  // a SECOND was still genuinely queued/running, so a monitor tick landing in that window read "nothing
  // pending" and admitted an unintended THIRD operation (double-charging the breaker). The count stays
  // >0 for the whole span from the first queueSpawn to the last runQueuedSpawn settling.
  pendingSpawns: number;
}

/** Ask a healthy engine whether it is asleep. Only meaningful when sleepMode is on (else /is_sleeping is
 *  unregistered → 404, treated as "not sleeping"). Any failure/non-200 ⇒ not sleeping (fail toward healthy —
 *  a sleeping-mislabel would only cost a needless wake, never a hang). */
async function probeIsSleeping(engine: VllmEngine): Promise<boolean> {
  // @orb-waive caught-failure-ownership(catch): an /is_sleeping probe failure returns false ("not sleeping" — fails toward healthy, at worst a needless wake, never a hang); local engine health probe, no auth/credential. Ends if false ever suppresses a needed wake into a hang.
  try {
    const res = await fetch(`${engineBaseUrl(engine)}/is_sleeping`, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
    if (!res.ok) {
      return false;
    }
    const body = (await res.json()) as { is_sleeping?: boolean };
    return body.is_sleeping === true;
  } catch {
    return false;
  }
}

async function probeEngine(engine: VllmEngine, sleepMode: boolean): Promise<Probe> {
  // @orb-waive caught-failure-ownership(err): a /health probe failure is classified into a typed Probe verdict (TimeoutError → occupied, refused → free); local engine health classification, no auth/credential, failure propagated as a verdict. Ends if the classification stops feeding the caller.
  try {
    const res = await fetch(`${engineBaseUrl(engine)}/health`, {
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
    if (!res.ok) {
      return "occupied";
    }
    // Healthy — but a slept engine also answers /health 200 (sleeping ≠ errored). Only the is_sleeping arm
    // tells them apart, and only when sleepMode is on (endpoints registered). One extra loopback GET/tick.
    return sleepMode && (await probeIsSleeping(engine)) ? "sleeping" : "healthy";
  } catch (err) {
    // TimeoutError: something accepted TCP but won't answer → occupied. Connection-refused → free.
    return err instanceof Error && err.name === "TimeoutError" ? "occupied" : "free";
  }
}

/** The default detached-spawn trigger: run the front-door verb `engines.sh start` (reconcile → VRAM
 *  pre-check → setsid-detached boot + pidfile). Idempotent, so concurrent triggers from N adopters collapse
 *  to one spawn. Fire-and-forget — the supervisor's own health-poll watches for the engine to come up; the
 *  verb OWNS the process topology (the engines are nobody's child, surviving the server's death). Injected in
 *  tests so no real fleet is launched. */
function realTriggerSpawn(repoRoot: string): void {
  execFile("bash", [path.join(repoRoot, "tooling", "src", "stack", "engines.sh"), "start"], () => undefined);
}

/** Start the supervisor; returns a graceful-drain closer. `now`/`sleep` are injected for determinism (tests
 *  drive backoff without wall-clock waits). OWNERSHIP INVERSION (A.4): the supervisor no longer spawns
 *  in-process children — a spawn action invokes the DETACHED front-door verb (`triggerSpawn`, defaulting to
 *  `engines.sh start`), which reconciles + VRAM-prechecks + boots the fleet setsid-detached. The engines
 *  survive the server's death; the breaker/backoff/mutex machinery is retained, only the spawn MECHANISM
 *  changed. NOTE: the detached verb reads the ENV FLOOR launch config, not an admin AppSettings override —
 *  an admin retune-restart rides `engine-control.ts` (which bounces the port owner, then the verb re-boots
 *  from the current floor). */
export function startVllmEngines(opts: {
  repoRoot: string;
  now: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** Trigger a DETACHED fleet spawn (defaults to running `engines.sh start`). Injected in tests. */
  triggerSpawn?: (repoRoot: string) => void;
  /** Sleep mode is on (engines launched with `--enable-sleep-mode`) — gates the is_sleeping probe arm and
   *  the auto-sleep timer. Defaults to the env floor so the in-server compose need not thread it. */
  sleepMode?: boolean;
  /** Reads the manual hold marker (`.cache/stack/engines.hold`) each tick — present ⇒ a sleeping engine
   *  classifies as `sleeping-held`. Defaults to false (no hold). */
  sleepHeld?: () => boolean;
  /** Reads the intentional-stop marker (`.cache/stack/engines.stopped`, #1929) each tick — present ⇒
   *  `decideFree` refuses the takeover-respawn. Defaults to reading {@link isStopped} on the real run dir
   *  (the compose site injects the same read the CLI verb writes, so both owners see one truth). */
  stoppedHeld?: () => boolean;
  /** The fleet MANAGER posture (adopt-or-start) spawns/takes over; adopt-only never spawns (fail-fast on a
   *  down engine). Omitted ⇒ FALSE: the composition root always resolves a posture and passes it, so an
   *  absent value means nobody decided — and the arm that spawns 38 GB of vLLM is never the one a silence
   *  selects (owner ruling 2026-09-19, #2421, the same reasoning that made the env schema's unset default
   *  adopt-only). */
  manages?: boolean;
  /** Auto-sleep idle window (ms). `0` disables. Defaults to the env floor. Only the MANAGER posture arms it. */
  autoSleepIdleMs?: number;
  /** Fetch one engine's idle metrics (injected in tests). Defaults to the loopback /metrics scrape. */
  fetchMetrics?: (engine: VllmEngine) => Promise<EngineMetrics | null>;
  /** POST /sleep?level=1 to an engine (injected in tests). Defaults to the loopback sleep POST. */
  postSleep?: (engine: VllmEngine) => Promise<boolean>;
  /** Current configured-port listener. Injected only to prove foreign-listener refusal without touching OS processes. */
  portOwnerPid?: (engine: VllmEngine) => Promise<number | null>;
  /** The one verified signal door. Production reads the durable launch record immediately before kill. */
  signalEngineProcess?: (engine: VllmEngine, listenerPid: number | null, signal: NodeJS.Signals) => EngineSignalVerdict;
}): () => void {
  const { repoRoot, now } = opts;
  const triggerSpawn = opts.triggerSpawn ?? realTriggerSpawn;
  const sleep = opts.sleep ?? sleepFor;
  const sleepMode = opts.sleepMode ?? env.VLLM_SLEEP_MODE;
  const isSleepHeld = opts.sleepHeld ?? ((): boolean => false);
  const isStoppedHeld = opts.stoppedHeld ?? ((): boolean => isStopped(fleetRunDir(repoRoot)));
  const manages = opts.manages ?? false;
  const autoSleepIdleMs = opts.autoSleepIdleMs ?? env.VLLM_AUTO_SLEEP_IDLE_MS;
  const fetchMetrics = opts.fetchMetrics ?? fetchEngineMetrics;
  const postSleepFn = opts.postSleep ?? postSleep;
  const readPortOwner = opts.portOwnerPid ?? enginePortPid;
  const signalEngineProcess =
    opts.signalEngineProcess ??
    ((engine: VllmEngine, listenerPid: number | null, signal: NodeJS.Signals): EngineSignalVerdict =>
      signalRecordedEngineProcess({ repoRoot, engine, port: Number(new URL(engineBaseUrl(engine)).port), listenerPid, signal }));
  const autoSleepStates = new Map<VllmEngine, AutoSleepState>(ENGINES.map((e) => [e, initialAutoSleepState]));
  const log = getLog().child({ component: "vllm-engines" });

  // The local-GPU requirement is MANAGER-scoped: a MANAGING supervisor spawns engines on THIS host, so no
  // local GPU ⇒ idle (engines unavailable). adopt-only is a passive consumer of a fleet that may be REMOTE
  // (VLLM_ENGINE_HOST — profile-2/D2, docs/design/containerize-prod-image-spec.md §3.6): it probes and
  // adopts regardless of the local GPU, and its decideFree arm already fail-fasts when nothing answers.
  if (manages && !detectGpu()) {
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
        spawnTriggered: false,
        seenHealthy: false,
        unhealthyStreak: 0,
        restarts: [],
        pendingSpawns: 0,
      },
    ]),
  );
  let stopped = false;

  // One spawn mutex across boot + restarts — two engines profiling memory at once corrupts both KV budgets.
  let spawnChain: Promise<void> = Promise.resolve();

  // The lifecycle status for a `sleeping` probe: held (manual marker) vs plain auto-slept.
  const sleepingStatus = (): EngineLifecycleStatus => (isSleepHeld() ? "sleeping-held" : "sleeping");

  const mark = (s: EngineState, status: EngineLifecycleStatus, detail = ""): void => {
    if (s.status !== status) {
      log.info({ engine: s.engine, from: s.status, to: status, detail }, "vllm-engines: state");
    }
    s.status = status;
    setEngineStatus(s.engine, status, detail, now());
  };

  // OWNERSHIP INVERSION (A.4): trigger a DETACHED fleet spawn via the front-door verb instead of forking an
  // in-process pipe-watchdog child. The verb reconciles + VRAM-prechecks + boots the whole fleet setsid-
  // detached (idempotent, so triggering for one engine that also brings up its siblings is fine — the tick
  // adopts them). `spawnTriggered` marks the in-flight spawn (the successor to the old live-child handle);
  // awaitHealthy watches for the engine to come up and marks it `owned`, else the deadline releases the slot.
  function triggerSpawnFor(s: EngineState, reason: string): void {
    triggerSpawn(repoRoot);
    s.spawnTriggered = true;
    mark(s, "starting", reason);
    log.info({ engine: s.engine, reason }, "vllm-engines: triggered detached fleet spawn (engines.sh start)");
  }

  // A fresh spawn came up (`healthy`, or `sleeping` = health 200 + is_sleeping) — record it and mark owned
  // (or the sleeping status). Returns true when the engine is up so the poll loop can stop.
  const markSpawnUp = (s: EngineState, p: Probe): boolean => {
    if (p !== "healthy" && p !== "sleeping") {
      return false;
    }
    s.seenHealthy = true;
    s.unhealthyStreak = 0;
    s.spawnTriggered = false;
    mark(s, p === "sleeping" ? sleepingStatus() : "owned");
    return true;
  };

  async function awaitHealthy(s: EngineState): Promise<void> {
    const deadline = now() + SPAWN_HEALTH_DEADLINE_MS;
    while (now() < deadline && !stopped) {
      if (markSpawnUp(s, await probeEngine(s.engine, sleepMode))) {
        return;
      }
      await sleep(HEALTH_POLL_INTERVAL_MS);
    }
    // Detached spawn didn't come up in time (a boot refusal / a failed venv / a genuinely slow cold boot) —
    // clear the in-flight marker so the next tick can re-decide (breaker-gated).
    s.spawnTriggered = false;
    if (s.status === "starting") {
      log.warn({ engine: s.engine }, "vllm-engines: not healthy before deadline — releasing spawn slot");
    }
  }

  // The queued port is no longer free (a race adopted/occupied it) — relabel and skip the spawn. Returns
  // true when the spawn should be abandoned. An in-flight trigger = already ours (never relabel adopted/foreign).
  const skipSupersededSpawn = (s: EngineState, reprobe: Probe): boolean => {
    if (reprobe === "free") {
      return false;
    }
    if (s.spawnTriggered) {
      log.warn({ engine: s.engine, probe: reprobe }, "vllm-engines: queued spawn superseded — engine already ours");
      return true;
    }
    if (reprobe === "healthy") {
      mark(s, "adopted", "spawn skipped: port became healthy while queued");
    } else if (reprobe === "sleeping") {
      mark(s, sleepingStatus(), "spawn skipped: port became a sleeping engine while queued");
    } else {
      mark(s, "foreign", "spawn skipped: port occupied while queued");
    }
    log.warn({ engine: s.engine, probe: reprobe }, "vllm-engines: queued spawn skipped — port no longer free");
    return true;
  };

  // A hung engine we're RESTARTING owns its port but won't serve — kill its process group so the port frees
  // and the re-triggered detached spawn can bind. (A cleanly-exited engine leaves a free port; nothing to do.)
  async function killHungPortOwner(s: EngineState): Promise<void> {
    const listenerPid = await readPortOwner(s.engine);
    const outcome = signalEngineProcess(s.engine, listenerPid, "SIGKILL");
    if (outcome.verdict === "signaled") {
      log.warn({ engine: s.engine, pgid: outcome.pgid }, "vllm-engines: killed verified hung engine process group before re-spawn");
      await sleep(ORPHAN_REAP_SETTLE_MS);
    } else if (outcome.verdict === "refused") {
      mark(s, "foreign", outcome.reason);
      log.error({ engine: s.engine, listenerPid, reason: outcome.reason }, "vllm-engines: refused hung-engine kill — launch identity did not match");
    }
  }

  // #761: pendingSpawns is a per-engine COUNT, not a boolean — decrementing THIS operation's own slot in
  // finally leaves a still-queued/still-running sibling operation's slot untouched, so the tick's
  // short-circuit stays armed for as long as ANY same-engine operation is in flight (never just the last
  // one to finish). Clearing the whole flag early (the pre-#761 bug) let a monitor tick mid-backoff, or
  // mid a second queued operation, double-queue a spawn and double-charge the breaker.
  async function runQueuedSpawn(s: EngineState, reason: string, backoffMs: number, killFirst: boolean): Promise<void> {
    try {
      if (stopped) {
        return;
      }
      if (backoffMs > 0) {
        await sleep(backoffMs);
      }
      // A restart of a hung engine: kill its port owner first so the port frees for the re-trigger.
      if (killFirst) {
        await killHungPortOwner(s);
      }
      if (skipSupersededSpawn(s, await probeEngine(s.engine, sleepMode))) {
        return;
      }
      const reaped = await reapOrphanedFamily(repoRoot);
      if (reaped.length > 0) {
        log.warn({ engine: s.engine, reaped }, "vllm-engines: reaped orphaned engine-family process(es) before spawn");
        await sleep(ORPHAN_REAP_SETTLE_MS);
      }
      triggerSpawnFor(s, reason);
      await awaitHealthy(s);
    } finally {
      s.pendingSpawns = Math.max(0, s.pendingSpawns - 1);
    }
  }

  function queueSpawn(s: EngineState, reason: string, backoffMs = 0, killFirst = false): void {
    s.pendingSpawns += 1;
    spawnChain = spawnChain
      .then(() => runQueuedSpawn(s, reason, backoffMs, killFirst))
      .catch((err: unknown) => {
        // runQueuedSpawn's own finally already released THIS operation's slot above; a rejected spawnChain
        // would otherwise silently skip every future queued spawn, so just log and keep the mutex settled.
        log.error({ engine: s.engine, err }, "vllm-engines: spawn-chain error — slot released");
      });
  }

  function requestRestart(s: EngineState, reason: string): void {
    const at = now();
    const { allowed, pruned } = breakerAllows(s.restarts, at);
    s.restarts = pruned;
    if (!allowed) {
      s.failedAt = at;
      mark(s, "failed", `crash loop: ${BREAKER_MAX_RESTARTS} restarts in window; half-open in ${Math.round(BREAKER_HALF_OPEN_MS / MS_PER_MINUTE)}m`);
      log.error({ engine: s.engine, reason }, "vllm-engines: breaker OPEN — giving up until half-open");
      return;
    }
    const backoff = RESTART_BACKOFF_MS[Math.min(s.restarts.length, RESTART_BACKOFF_MS.length - 1)] ?? RESTART_BACKOFF_3_MS;
    s.restarts.push(at);
    // No in-process child to end anymore (ownership inversion). A hung engine's port owner is killed in the
    // queued-spawn reprobe path before the re-trigger; a cleanly-exited engine just leaves a free port.
    s.spawnTriggered = false;
    mark(s, "down", `restarting (${reason}); backoff ${backoff / MS_PER_SECOND}s`);
    log.warn({ engine: s.engine, reason, backoff }, "vllm-engines: restarting engine (re-trigger detached spawn)");
    queueSpawn(s, `restart: ${reason}`, backoff, true);
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
    // A later engine that is up (healthy OR sleeping) proves the boot leader already passed this one.
    const laterEngineHealthy = ENGINES.slice(ENGINES.indexOf(s.engine) + 1).some((e) => {
      const p = probes.get(e);
      return p === "healthy" || p === "sleeping";
    });
    const action = decideTick({
      status: s.status,
      probe,
      seenHealthy: s.seenHealthy,
      stackMode,
      bootAt,
      unhealthyStreak: s.unhealthyStreak,
      failedAt: s.failedAt,
      spawnTriggered: s.spawnTriggered,
      now: now(),
      pendingSpawn: s.pendingSpawns > 0,
      laterEngineHealthy,
      sleepHeld: isSleepHeld(),
      stoppedIntentionally: isStoppedHeld(),
      manages,
    });
    s.unhealthyStreak = probe === "occupied" ? s.unhealthyStreak + 1 : 0;
    if (probe === "healthy" || probe === "sleeping") {
      s.seenHealthy = true;
    }
    applyAction(s, action);
  }

  // Auto-sleep (MANAGER posture only, B.5): a fleet manager reclaims the GPU by /sleep'ing an engine that has
  // been continuously idle for autoSleepIdleMs. Idle is read engine-side (/metrics running+waiting+success),
  // client-agnostic + restart-surviving. Only a HEALTHY-and-awake engine (this tick's probe) is a candidate;
  // is_sleeping-guarded + catch-and-ignore, so a manager-vs-manager race just does a duplicate (idempotent)
  // sleep. The hold marker doesn't gate auto-sleep — it gates auto-WAKE (an auto-slept engine wakes on demand).
  const autoSleepEnabled = (): boolean => manages && sleepMode && autoSleepIdleMs > 0;

  async function autoSleepOne(engine: VllmEngine, probe: Probe): Promise<void> {
    const prior = autoSleepStates.get(engine) ?? initialAutoSleepState;
    // Only an awake, healthy engine is a sleep candidate; a down/occupied/already-sleeping engine disarms.
    if (probe !== "healthy") {
      autoSleepStates.set(engine, { prev: null, idleSince: null });
      return;
    }
    const metrics = await fetchMetrics(engine);
    const { state, shouldSleep } = advanceAutoSleep(prior, metrics, now(), autoSleepIdleMs);
    autoSleepStates.set(engine, state);
    if (shouldSleep) {
      log.info({ engine, idleMs: autoSleepIdleMs }, "vllm-engines: auto-sleeping idle engine (level 1)");
      const ok = await postSleepFn(engine);
      if (!ok) {
        log.warn({ engine }, "vllm-engines: auto-sleep POST /sleep failed (engine down or sleep-mode off?)");
      } else {
        invalidateAwakeCache(engine);
      }
    }
  }

  async function autoSleepPass(probes: ReadonlyMap<VllmEngine, Probe>): Promise<void> {
    if (!autoSleepEnabled()) {
      return;
    }
    for (const engine of ENGINES) {
      if (stopped) {
        return;
      }
      await autoSleepOne(engine, probes.get(engine) ?? "free");
    }
  }

  async function tick(): Promise<void> {
    const probes = new Map<VllmEngine, Probe>();
    for (const engine of ENGINES) {
      if (stopped) {
        return;
      }
      probes.set(engine, await probeEngine(engine, sleepMode));
    }
    for (const s of states.values()) {
      if (stopped) {
        return;
      }
      reconcileOne(s, probes);
    }
    await autoSleepPass(probes);
  }

  // A human override RESETS the breaker — they are the half-open probe. Under ownership inversion there is no
  // in-process child: bounce only the durable launch identity that still owns the configured port, then
  // re-trigger the detached spawn. The re-trigger reboots from the CURRENT env-floor launch config.
  async function adminRestart(engine: VllmEngine): Promise<string> {
    const s = states.get(engine);
    if (s === undefined) {
      return "unknown engine";
    }
    const listenerPid = await readPortOwner(engine);
    const outcome = signalEngineProcess(engine, listenerPid, "SIGTERM");
    if (outcome.verdict === "refused") {
      mark(s, "foreign", `admin restart refused: ${outcome.reason}`);
      log.error({ engine, listenerPid, reason: outcome.reason }, "vllm-engines: admin restart refused — launch identity did not match");
      return `restart refused — ${outcome.reason}`;
    }
    s.restarts = [];
    s.failedAt = undefined;
    if (outcome.verdict === "signaled") {
      mark(s, "down", "admin restart: terminated port owner; re-triggering detached spawn");
      queueSpawn(s, "admin restart", ORPHAN_REAP_SETTLE_MS, true);
      return `terminated verified pgid ${outcome.pgid} — detached re-spawn in progress`;
    }
    queueSpawn(s, "admin restart", 0, false);
    return "no owned engine on the port — detached spawn requested";
  }
  registerVllmEngineController({ restart: adminRestart });

  void tick().catch((err: unknown) => log.error({ err }, "vllm-engines: boot reconcile crashed"));
  const monitor = setInterval(() => {
    void tick().catch((err: unknown) => log.error({ err }, "vllm-engines: tick crashed"));
  }, MONITOR_INTERVAL_MS);
  monitor.unref();

  // OWNERSHIP INVERSION: the drain closer no longer kills engines — the detached fleet is nobody's child and
  // deliberately SURVIVES the server's death (warm for the next orb; `pnpm engines stop` is the only kill).
  // Draining just stops the reconcile loop + deregisters the controller.
  return () => {
    stopped = true;
    registerVllmEngineController(null);
    clearInterval(monitor);
  };
}
