// The fleet sleep/wake control library — the ONE home for the sleep/wake HTTP + the hold-marker + the wake
// DECISION, shared by the CLI front door (tooling/src/stack/ops/engines-ctl.ts, works server-down) AND the in-server
// auto-wake gate (client.ts). Budget math stays one-homed in wake-budget.ts; this composes it with the hold
// marker into the full "may this engine wake?" verdict.
//
// THE HOLD MARKER (B.7-4): `<runDir>/engines.hold` records INTENT ahead of occupancy — engines slept for a
// tenant that hasn't grabbed its VRAM yet. Without it a stray request would wake the engines and take the
// memory back first. So: auto-slept → auto-wake (headroom-gated); HELD (manual `engines sleep`) → the wake
// gate refuses on the MARKER even with VRAM free; `engines wake` clears it then runs the same headroom gate.
// A marker FILE (not a server API) so the verbs work with the server down — the actual tenant workflow — and
// both owners (the standalone verb + the in-server supervisor tick) see one truth.

import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { budget } from "../../../_shared/load-budget.ts";
import { spawnNiced } from "../../../_shared/proc.ts";
import { engineBaseUrl } from "./engine-url.ts";
import { VLLM_ENGINES } from "./engines.ts";
import type { EngineCapacityMetrics, EngineMetrics } from "./fleet-metrics.ts";
import { capacityWarnings, parseEngineCapacity, parseEngineMetrics } from "./fleet-metrics.ts";
import type { EngineUtilFractions, GpuVram, WakeBudgetVerdict } from "./wake-budget.ts";
import { decideWakeBudget, engineVramNeed } from "./wake-budget.ts";

type VllmEngine = (typeof VLLM_ENGINES)[number];

const HOLD_MARKER_NAME = "engines.hold";
// THE STOPPED MARKER (#1929): `<runDir>/engines.stopped` records an INTENTIONAL `engines stop` the same way
// `engines.hold` records an intentional sleep — a fleet-wide file, not per-engine, mirroring the hold
// marker's own scope. Without it, "pidfile present, recorded leader absent" reads as a CRASH to the
// supervisor's `decideFree` and it takes over with a detached respawn (observed live: a fleet stopped to
// free ~37 GiB of host RAM came back asleep within minutes because the prod server's tick treated the
// deliberate kill as a death). The hold marker gates auto-WAKE only; this one gates the supervisor's
// TAKEOVER decision — a DIFFERENT axis, so it is a separate file rather than an overload of `.hold`.
// Written by `engines stop` once every engine is verified stopped (or was already down); cleared by
// `engines start`'s real spawn attempt — an explicit start is the operator/automation superseding the
// earlier stop, exactly like `engines wake` clears the hold before re-running the headroom gate.
const STOPPED_MARKER_NAME = "engines.stopped";

/** The run dir holding the hold marker + pidfile — `<repoRoot>/.cache/stack` (same as the supervisor's log
 *  dir + stack.sh's RUN_DIR). One home so the CLI verb and the supervisor read the same marker path. */
export function fleetRunDir(repoRoot: string): string {
  return path.join(repoRoot, ".cache", "stack");
}

/** The hold-marker path under a run dir. */
export function holdMarkerPath(runDir: string): string {
  return path.join(runDir, HOLD_MARKER_NAME);
}

/** The stopped-marker path under a run dir (#1929). */
export function stoppedMarkerPath(runDir: string): string {
  return path.join(runDir, STOPPED_MARKER_NAME);
}

/** Is the manual hold marker present? (the supervisor tick reads this each tick → sleeping-held). */
export function isHeld(runDir: string): boolean {
  return existsSync(holdMarkerPath(runDir));
}

/** Write the hold marker (manual `engines sleep`). Idempotent; records the epoch-ms for humans. */
export function writeHold(runDir: string, at: number): void {
  mkdirSync(runDir, { recursive: true });
  writeFileSync(holdMarkerPath(runDir), `held at ${new Date(at).toISOString()}\n`);
}

/** Clear the hold marker (`engines wake`). Idempotent. */
export function clearHold(runDir: string): void {
  rmSync(holdMarkerPath(runDir), { force: true });
}

/** Is the intentional-stop marker present? (#1929 — the supervisor's `decideFree` reads this each tick and
 *  refuses the takeover-respawn while it is set, instead of reading a dead pidfile as a crash). */
export function isStopped(runDir: string): boolean {
  return existsSync(stoppedMarkerPath(runDir));
}

/** Write the stopped marker (`engines stop`, once every engine verified stopped). Idempotent; records who
 *  (best-effort, `whoami`-shaped) and when for an operator reading the file by hand. */
export function writeStopped(runDir: string, at: number, who: string): void {
  mkdirSync(runDir, { recursive: true });
  writeFileSync(stoppedMarkerPath(runDir), `stopped by ${who} at ${new Date(at).toISOString()}\n`);
}

/** Clear the stopped marker (`engines start`'s real spawn attempt). Idempotent. */
export function clearStopped(runDir: string): void {
  rmSync(stoppedMarkerPath(runDir), { force: true });
}

// ── the wake DECISION (shared by the CLI + the client auto-wake gate) ────────────────────────────────────

// @orb-waive no-inline-types(WakeDecision): an engine-internal discriminated RESULT verdict — a union (not an interface), co-located with its decider `decideWake` below exactly like this file's sibling result interfaces (AutoSleepState/AutoSleepDecision); the engine dir has no cross-boundary contract home. Ends when the engine subsystem gains a contract/ slot, or this verdict crosses a boundary and moves into it.
export type WakeDecision = { readonly ok: true } | { readonly ok: false; readonly reason: string; readonly heldMarker: boolean };

/** May this engine wake? Two gates, in order: (1) the HOLD marker refuses even with free VRAM (intent ahead
 *  of occupancy — the tenant hasn't grabbed its memory yet); (2) the VRAM headroom budget. A refusal names
 *  the reason (marker) or the holders (budget). Pure: the marker bool + gpu facts are injected. The orphan
 *  reconcile MUST run FIRST at the call site (a dead engine's own core must be reaped, never named as a
 *  foreign tenant). `held` is ignored on the AUTO-wake path (the caller passes false) — the marker only
 *  gates until `engines wake` clears it. */
export function decideWake(engine: VllmEngine, opts: { held: boolean; gpuCount: number; util: EngineUtilFractions; gpus: readonly GpuVram[] }): WakeDecision {
  if (opts.held) {
    return { ok: false, heldMarker: true, reason: "engines held — `pnpm engines wake` releases the manual hold (then re-checks VRAM headroom)" };
  }
  // Named `vram`, not `budget`: the module-level `budget()` is the LOAD budget (wall clocks) and this is the
  // VRAM headroom verdict — two different budgets, and one shadowing the other reads as the same thing.
  const vram: WakeBudgetVerdict = decideWakeBudget(engine, engineVramNeed(engine, opts.gpuCount, opts.util), opts.gpus);
  return vram.ok ? { ok: true } : { ok: false, heldMarker: false, reason: vram.message };
}

// ── sleep / wake HTTP (loopback, works while the server is down) ──────────────────────────────────────────

const SLEEP_LEVEL_1 = "1";
// Full wake readiness poll bound — wake measures in seconds; 30s is a generous ceiling (B.6) on a QUIET
// box, which is the only box a hand-typed ceiling is ever a statement about. Both clocks are DERIVED
// through the one load budget (`_shared/load-budget.ts`, policy `tooling-clock-budget`): the fleet moved
// into `tooling/` with the inference extraction and joined the population that judges wall clocks, and a
// wake that times out under homelab contention is a false "engine did not wake", not a verdict. The
// quiet-box value is byte-identical to the base.
const WAKE_READY_TIMEOUT_BASE_MS = 30_000;
export const WAKE_READY_TIMEOUT_MS = budget(WAKE_READY_TIMEOUT_BASE_MS);
const WAKE_POLL_INTERVAL_MS = 500;
const HTTP_TIMEOUT_BASE_MS = 5000;
const HTTP_TIMEOUT_MS = budget(HTTP_TIMEOUT_BASE_MS);

/** POST /sleep?level=1 to an engine (mode default `abort` — the idle gate guarantees no in-flight requests).
 *  Level 1 = weights→CPU, KV discarded. Returns true on a 2xx. */
export async function postSleep(engine: VllmEngine): Promise<boolean> {
  // @orb-waive caught-failure-ownership(catch): a POST /sleep failure returns false (engine not slept) — a local loopback engine-lifecycle op, no auth/credential; false is the conservative "did not sleep". Ends if this call reaches a non-loopback target.
  try {
    const res = await fetch(`${engineBaseUrl(engine)}/sleep?level=${SLEEP_LEVEL_1}`, { method: "POST", signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) });
    return res.ok;
  } catch {
    return false;
  }
}

// ── auto-sleep idle detection (engine-side /metrics — client-agnostic, survives server restarts) ─────────

/** GET /metrics and parse the idle snapshot. Any failure ⇒ null (treated as "can't tell" — never auto-sleep). */
export async function fetchEngineMetrics(engine: VllmEngine): Promise<EngineMetrics | null> {
  // @orb-waive caught-failure-ownership(catch): a /metrics scrape failure returns null ("can't tell"), and isEngineIdle/advanceAutoSleep treat null as never-idle — the conservative direction (never auto-sleeps a busy engine); local engine, no auth/credential. Ends if null ever admits an auto-sleep.
  try {
    const res = await fetch(`${engineBaseUrl(engine)}/metrics`, { signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) });
    if (!res.ok) {
      return null;
    }
    return parseEngineMetrics(await res.text());
  } catch {
    return null;
  }
}

/** GET /metrics and parse the contention snapshot. Any failure ⇒ null (engine down/asleep/unreachable —
 *  an absent answer, never a fabricated healthy one). */
export async function fetchEngineCapacity(engine: VllmEngine): Promise<EngineCapacityMetrics | null> {
  // @orb-waive caught-failure-ownership(catch): a /metrics capacity scrape failure returns null (absent, never a fabricated healthy snapshot); local engine observability, no auth/credential. Ends if null is read as a healthy snapshot.
  try {
    const res = await fetch(`${engineBaseUrl(engine)}/metrics`, { signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) });
    if (!res.ok) {
      return null;
    }
    return parseEngineCapacity(await res.text(), engine);
  } catch {
    return null;
  }
}

/** The whole-fleet contention snapshot behind `/api/_debug/vllm/metrics`. An unreachable engine reports
 *  `null` metrics (asleep/down) rather than dropping out of the map — "which engines answered" is itself the
 *  answer to half the questions this route gets asked. */
export async function fleetCapacitySnapshot(): Promise<{
  engines: Record<string, EngineCapacityMetrics | null>;
  warnings: string[];
}> {
  const results = await Promise.all(VLLM_ENGINES.map(async (engine) => [engine, await fetchEngineCapacity(engine)] as const));
  const engines: Record<string, EngineCapacityMetrics | null> = {};
  const warnings: string[] = [];
  for (const [engine, metrics] of results) {
    engines[engine] = metrics;
    if (metrics !== null) {
      warnings.push(...capacityWarnings(engine, metrics));
    }
  }
  return { engines, warnings };
}

/** GET /is_sleeping — null means the engine's state could not be measured. */
export async function getIsSleeping(engine: VllmEngine): Promise<boolean | null> {
  // @orb-waive caught-failure-ownership(catch): an /is_sleeping probe failure returns null ("could not measure"); local engine state read, no auth/credential — null disarms the auto-sleep timer (never sleeps on missing data). Ends if null ever admits an auto-sleep.
  try {
    const res = await fetch(`${engineBaseUrl(engine)}/is_sleeping`, { signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) });
    if (!res.ok) {
      return null;
    }
    const body = (await res.json()) as { is_sleeping?: boolean };
    return typeof body.is_sleeping === "boolean" ? body.is_sleeping : null;
  } catch {
    return null;
  }
}

/** POST /wake_up (no tags = full wake) then poll /is_sleeping until false, bounded. Returns whether the
 *  engine woke within the bound. `sleep`/`now` injected for deterministic tests. */
export async function postWakeAndAwait(engine: VllmEngine, deps: { now: () => number; sleep: (ms: number) => Promise<void> }): Promise<boolean> {
  // @orb-waive caught-failure-ownership(catch): a POST /wake_up failure returns false (engine did not wake); local engine-lifecycle op, no auth/credential. Ends if this call reaches a non-loopback target.
  try {
    await fetch(`${engineBaseUrl(engine)}/wake_up`, { method: "POST", signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) });
  } catch {
    return false;
  }
  const deadline = deps.now() + WAKE_READY_TIMEOUT_MS;
  while (deps.now() < deadline) {
    if ((await getIsSleeping(engine)) === false) {
      return true;
    }
    await deps.sleep(WAKE_POLL_INTERVAL_MS);
  }
  return false;
}

// ── nvidia-smi-free port owner probe (for status; ss-based, loopback) ─────────────────────────────────────

const SS_PID_RE = /pid=(\d+)/;

/** The listening-socket table through the ONE subprocess door (policy `tooling-child-process-door`): the
 *  fleet moved into `tooling/` with the inference extraction, so its probes ride the homelab's nice -19
 *  floor. `nice` EXECS the target, so a box with no `ss` is the child's own non-zero exit rather than a
 *  spawn error — "" on anything but a clean exit is the whole failure handling. */
async function listListeningSockets(): Promise<string> {
  // @orb-waive caught-failure-ownership(catch): a failed `ss` listing yields "" and the caller answers null (pid unknown) — a read-only local socket listing for a status display, no auth/credential/network. Ends if the pid this feeds ever authorizes a signal.
  try {
    const res = await spawnNiced("ss", ["-tlnp"]);
    return res.code === 0 ? res.stdout : "";
  } catch {
    return "";
  }
}

/** The pid bound to an engine's loopback port (via `ss -tlnp`), or null. Used by `engines status` to show
 *  the APIServer pid per engine without importing the supervisor's process-local registry (works server-down). */
export async function enginePortPid(engine: VllmEngine): Promise<number | null> {
  const out = await listListeningSockets();
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
