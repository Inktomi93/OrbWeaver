// The fleet sleep/wake control library — the ONE home for the sleep/wake HTTP + the hold-marker + the wake
// DECISION, shared by the CLI front door (scripts/dev/engines-ctl.ts, works server-down) AND the in-server
// auto-wake gate (client.ts). Budget math stays one-homed in wake-budget.ts; this composes it with the hold
// marker into the full "may this engine wake?" verdict.
//
// THE HOLD MARKER (B.7-4): `<runDir>/engines.hold` records INTENT ahead of occupancy — engines slept for a
// tenant that hasn't grabbed its VRAM yet. Without it a stray request would wake the engines and take the
// memory back first. So: auto-slept → auto-wake (headroom-gated); HELD (manual `engines:sleep`) → the wake
// gate refuses on the MARKER even with VRAM free; `engines:wake` clears it then runs the same headroom gate.
// A marker FILE (not a server API) so the verbs work with the server down — the actual tenant workflow — and
// both owners (the standalone verb + the in-server supervisor tick) see one truth.

import { execFile } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { engineBaseUrl } from "./engine-url.ts";
import type { VLLM_ENGINES } from "./engines.ts";
import type { EngineUtilFractions, GpuVram, WakeBudgetVerdict } from "./wake-budget.ts";
import { decideWakeBudget, engineVramNeed } from "./wake-budget.ts";

type VllmEngine = (typeof VLLM_ENGINES)[number];

const HOLD_MARKER_NAME = "engines.hold";

/** The run dir holding the hold marker + pidfile — `<repoRoot>/.cache/stack` (same as the supervisor's log
 *  dir + stack.sh's RUN_DIR). One home so the CLI verb and the supervisor read the same marker path. */
export function fleetRunDir(repoRoot: string): string {
  return path.join(repoRoot, ".cache", "stack");
}

/** The hold-marker path under a run dir. */
export function holdMarkerPath(runDir: string): string {
  return path.join(runDir, HOLD_MARKER_NAME);
}

/** Is the manual hold marker present? (the supervisor tick reads this each tick → sleeping-held). */
export function isHeld(runDir: string): boolean {
  return existsSync(holdMarkerPath(runDir));
}

/** Write the hold marker (manual `engines:sleep`). Idempotent; records the epoch-ms for humans. */
export function writeHold(runDir: string, at: number): void {
  mkdirSync(runDir, { recursive: true });
  writeFileSync(holdMarkerPath(runDir), `held at ${new Date(at).toISOString()}\n`);
}

/** Clear the hold marker (`engines:wake`). Idempotent. */
export function clearHold(runDir: string): void {
  rmSync(holdMarkerPath(runDir), { force: true });
}

// ── the wake DECISION (shared by the CLI + the client auto-wake gate) ────────────────────────────────────

// @orb-gate-ignore no-inline-types: an engine-internal discriminated RESULT verdict — a union (not an
// interface), co-located with its decider `decideWake` below exactly like this file's sibling result
// interfaces (AutoSleepState/AutoSleepDecision); the engine dir has no cross-boundary contract home.
export type WakeDecision = { readonly ok: true } | { readonly ok: false; readonly reason: string; readonly heldMarker: boolean };

/** May this engine wake? Two gates, in order: (1) the HOLD marker refuses even with free VRAM (intent ahead
 *  of occupancy — the tenant hasn't grabbed its memory yet); (2) the VRAM headroom budget. A refusal names
 *  the reason (marker) or the holders (budget). Pure: the marker bool + gpu facts are injected. The orphan
 *  reconcile MUST run FIRST at the call site (a dead engine's own core must be reaped, never named as a
 *  foreign tenant). `held` is ignored on the AUTO-wake path (the caller passes false) — the marker only
 *  gates until `engines:wake` clears it. */
export function decideWake(engine: VllmEngine, opts: { held: boolean; gpuCount: number; util: EngineUtilFractions; gpus: readonly GpuVram[] }): WakeDecision {
  if (opts.held) {
    return { ok: false, heldMarker: true, reason: "engines held — `pnpm engines:wake` releases the manual hold (then re-checks VRAM headroom)" };
  }
  const budget: WakeBudgetVerdict = decideWakeBudget(engine, engineVramNeed(engine, opts.gpuCount, opts.util), opts.gpus);
  return budget.ok ? { ok: true } : { ok: false, heldMarker: false, reason: budget.message };
}

// ── sleep / wake HTTP (loopback, works while the server is down) ──────────────────────────────────────────

const SLEEP_LEVEL_1 = "1";
// Full wake readiness poll bound — wake measures in seconds; 30s is a generous ceiling (B.6).
export const WAKE_READY_TIMEOUT_MS = 30_000;
const WAKE_POLL_INTERVAL_MS = 500;
const HTTP_TIMEOUT_MS = 5000;

/** POST /sleep?level=1 to an engine (mode default `abort` — the idle gate guarantees no in-flight requests).
 *  Level 1 = weights→CPU, KV discarded. Returns true on a 2xx. */
export async function postSleep(engine: VllmEngine): Promise<boolean> {
  try {
    const res = await fetch(`${engineBaseUrl(engine)}/sleep?level=${SLEEP_LEVEL_1}`, { method: "POST", signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) });
    return res.ok;
  } catch {
    return false;
  }
}

// ── auto-sleep idle detection (engine-side /metrics — client-agnostic, survives server restarts) ─────────

/** One engine's idle-relevant metrics snapshot (from /metrics): in-flight running + waiting counts, and the
 *  cumulative Σ request_success_total (across every finished_reason). Idle := running==0 && waiting==0 &&
 *  successTotal unchanged since the last tick — this catches probes / E2E stacks / hand curls (anything that
 *  reaches the loopback port), needs zero app coupling, and survives a tsx-watch reload (the counters live in
 *  the engine, B.5). */
export interface EngineMetrics {
  readonly running: number;
  readonly waiting: number;
  readonly successTotal: number;
}

const METRIC_RUNNING = "vllm:num_requests_running";
const METRIC_WAITING = "vllm:num_requests_waiting";
const METRIC_SUCCESS = "vllm:request_success_total";
// `vllm:num_requests_waiting_by_reason` shares the num_requests_waiting prefix — exclude the _by_reason split.
const METRIC_WAITING_BY_REASON = "vllm:num_requests_waiting_by_reason";

/** Parse the Prometheus-text value of a metric line: `name{labels} 3.0` → 3. Sums matching lines (success
 *  is split per finished_reason). A line matches when it starts with `name{` or `name ` (label-less). */
function sumMetric(text: string, name: string, exclude?: string): number {
  let sum = 0;
  for (const line of text.split("\n")) {
    if (line.startsWith("#") || !(line.startsWith(`${name}{`) || line.startsWith(`${name} `))) {
      continue;
    }
    if (exclude !== undefined && line.startsWith(exclude)) {
      continue;
    }
    const value = Number(line.slice(line.lastIndexOf(" ") + 1));
    if (!Number.isNaN(value)) {
      sum += value;
    }
  }
  return sum;
}

/** Parse an engine's /metrics scrape into the idle-relevant snapshot. */
export function parseEngineMetrics(text: string): EngineMetrics {
  return {
    running: sumMetric(text, METRIC_RUNNING),
    waiting: sumMetric(text, METRIC_WAITING, METRIC_WAITING_BY_REASON),
    successTotal: sumMetric(text, METRIC_SUCCESS),
  };
}

/** GET /metrics and parse the idle snapshot. Any failure ⇒ null (treated as "can't tell" — never auto-sleep). */
export async function fetchEngineMetrics(engine: VllmEngine): Promise<EngineMetrics | null> {
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

/** Is this engine idle RIGHT NOW vs the previous snapshot? Running/waiting must be zero AND the success
 *  counter unchanged (a completed request bumps it — so a burst that finished between ticks disarms). A null
 *  previous (first observation) is never idle (no baseline to compare the success delta). Pure. */
export function isEngineIdle(prev: EngineMetrics | null, now: EngineMetrics): boolean {
  if (prev === null) {
    return false;
  }
  return now.running === 0 && now.waiting === 0 && now.successTotal === prev.successTotal;
}

/** Per-engine auto-sleep timer state: the previous metrics snapshot + the epoch-ms the engine went
 *  continuously idle (null = not currently idle). Advanced each tick by `advanceAutoSleep`. */
export interface AutoSleepState {
  readonly prev: EngineMetrics | null;
  readonly idleSince: number | null;
}

export const initialAutoSleepState: AutoSleepState = { prev: null, idleSince: null };

export interface AutoSleepDecision {
  readonly state: AutoSleepState;
  readonly shouldSleep: boolean;
}

/** The pure auto-sleep tick: given the prior state + the fresh metrics + now + the idle window, advance the
 *  idle timer and decide whether to /sleep. `idleMs <= 0` disables (never sleeps). `shouldSleep` fires ONCE
 *  when the engine has been continuously idle for \>= idleMs; the caller sleeps it (is_sleeping-guarded) and
 *  the next tick sees the metrics unchanged but the engine sleeping, so it won't re-fire spuriously (the
 *  caller resets idleSince on a successful sleep, or a wake resets prev). A null metrics fetch (engine down /
 *  can't tell) disarms the timer — never auto-sleep on missing data. Thrash guard: any running/waiting or a
 *  success bump resets idleSince to null. */
export function advanceAutoSleep(state: AutoSleepState, metrics: EngineMetrics | null, now: number, idleMs: number): AutoSleepDecision {
  if (metrics === null) {
    return { state: { prev: null, idleSince: null }, shouldSleep: false };
  }
  const idle = isEngineIdle(state.prev, metrics);
  if (!idle || idleMs <= 0) {
    return { state: { prev: metrics, idleSince: null }, shouldSleep: false };
  }
  const idleSince = state.idleSince ?? now;
  const shouldSleep = now - idleSince >= idleMs;
  // On a sleep decision, clear idleSince so the timer must re-arm after the next wake (no immediate re-fire).
  return { state: { prev: metrics, idleSince: shouldSleep ? null : idleSince }, shouldSleep };
}

/** GET /is_sleeping — true iff the engine reports asleep. Any failure ⇒ false (fail toward awake). */
export async function getIsSleeping(engine: VllmEngine): Promise<boolean> {
  try {
    const res = await fetch(`${engineBaseUrl(engine)}/is_sleeping`, { signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) });
    if (!res.ok) {
      return false;
    }
    const body = (await res.json()) as { is_sleeping?: boolean };
    return body.is_sleeping === true;
  } catch {
    return false;
  }
}

/** POST /wake_up (no tags = full wake) then poll /is_sleeping until false, bounded. Returns whether the
 *  engine woke within the bound. `sleep`/`now` injected for deterministic tests. */
export async function postWakeAndAwait(engine: VllmEngine, deps: { now: () => number; sleep: (ms: number) => Promise<void> }): Promise<boolean> {
  try {
    await fetch(`${engineBaseUrl(engine)}/wake_up`, { method: "POST", signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) });
  } catch {
    return false;
  }
  const deadline = deps.now() + WAKE_READY_TIMEOUT_MS;
  while (deps.now() < deadline) {
    // biome-ignore lint/performance/noAwaitInLoops: a readiness poll is inherently sequential.
    if (!(await getIsSleeping(engine))) {
      return true;
    }
    await deps.sleep(WAKE_POLL_INTERVAL_MS);
  }
  return false;
}

// ── nvidia-smi-free port owner probe (for status; ss-based, loopback) ─────────────────────────────────────

const SS_PID_RE = /pid=(\d+)/;

/** The pid bound to an engine's loopback port (via `ss -tlnp`), or null. Used by `engines:status` to show
 *  the APIServer pid per engine without importing the supervisor's process-local registry (works server-down). */
export async function enginePortPid(engine: VllmEngine): Promise<number | null> {
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
