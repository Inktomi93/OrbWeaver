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

import { execFile } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fleetEnv as env } from "./env.ts";
import { engineBaseUrl } from "./engine-url.ts";
import { VLLM_ENGINES } from "./engines.ts";
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
  // @orb-waive caught-failure-ownership(catch): a POST /sleep failure returns false (engine not slept) — a local loopback engine-lifecycle op, no auth/credential; false is the conservative "did not sleep". Ends if this call reaches a non-loopback target.
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
 *  reaches the loopback port), needs zero app coupling, and survives a node --watch reload (the counters live in
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

/** Is this engine idle RIGHT NOW vs the previous snapshot? Running/waiting must be zero AND the success
 *  counter unchanged (a completed request bumps it — so a burst that finished between ticks disarms). A null
 *  previous (first observation) is never idle (no baseline to compare the success delta). Pure. */
export function isEngineIdle(prev: EngineMetrics | null, now: EngineMetrics): boolean {
  if (prev === null) {
    return false;
  }
  return now.running === 0 && now.waiting === 0 && now.successTotal === prev.successTotal;
}

// ── concurrency observability (#24) — the CONTENTION half of the same scrape ─────────────────────────────
//
// The auto-sleep snapshot above answers "is this engine doing nothing?". These answer the opposite question —
// "is this engine over its head?" — which is what a queued/preempted backlog looks like from outside the
// process. Same /metrics document, same `sumMetric`; a second scrape file would have duplicated the parser.
//
// KV HEADROOM is the one number that is not a gauge: vLLM prints it once at startup ("Maximum concurrency for
// 32,768 tokens per request: 7.52x") and never exports it. It is DERIVED — `num_gpu_blocks × block_size /
// max_model_len` — from the `vllm:cache_config_info` labels plus the engine's env-declared context length.
// Verified against a live engine: 15393 × 16 / 32768 = 7.52x, matching that engine's own startup line.
// Below 1.0x the cache cannot hold even ONE full-length request, so any request near the context limit
// preempts by construction — that is the warn threshold, not a taste call.

/** One engine's contention snapshot. `maxConcurrency` is null when `cache_config_info` was absent from the
 *  scrape (a sleeping/starting engine) — an unknown headroom is reported as unknown, never as a passing 0. */
export interface EngineCapacityMetrics {
  readonly running: number;
  /** Queued because the KV cache is full — the backlog that actually signals contention. Distinct from the
   *  `deferred` reason (structured-output/grammar waits), which is not a capacity problem. */
  readonly waitingCapacity: number;
  /** Cumulative preemptions since engine start. Non-zero means the scheduler has evicted running work. */
  readonly preemptionsTotal: number;
  /** Fraction of the KV cache in use, 0–1. */
  readonly kvCacheUsagePerc: number;
  /** How many full-context requests the KV cache can hold at once (vLLM's "Maximum concurrency"). */
  readonly maxConcurrency: number | null;
  /** False when `maxConcurrency < 1` — the cache cannot fit one full-length request. Null headroom ⇒ null. */
  readonly kvHeadroomOk: boolean | null;
}

const METRIC_WAITING_BY_REASON_CAPACITY = 'reason="capacity"';
const METRIC_PREEMPTIONS = "vllm:num_preemptions_total";
const METRIC_KV_USAGE = "vllm:kv_cache_usage_perc";
const METRIC_CACHE_CONFIG = "vllm:cache_config_info";

/** The env-declared context length per engine — the denominator of the headroom ratio. vLLM does not export
 *  `max_model_len`, and these are the exact values the supervisor launches each engine with. */
const MAX_MODEL_LEN: Record<VllmEngine, number> = {
  embed: env.VLLM_EMBED_MAX_MODEL_LEN,
  rerank: env.VLLM_RERANK_MAX_MODEL_LEN,
  gen: env.VLLM_GEN_MAX_MODEL_LEN,
};

/** Sum a metric restricted to lines carrying `labelMatch` (e.g. one `reason=` of a by-reason split). */
function sumMetricWithLabel(text: string, name: string, labelMatch: string): number {
  let sum = 0;
  for (const line of text.split("\n")) {
    if (line.startsWith("#") || !line.startsWith(`${name}{`) || !line.includes(labelMatch)) {
      continue;
    }
    const value = Number(line.slice(line.lastIndexOf(" ") + 1));
    if (!Number.isNaN(value)) {
      sum += value;
    }
  }
  return sum;
}

/** Read one label off the `cache_config_info` line (`num_gpu_blocks="15393"` → 15393). Null when the metric
 *  or the label is absent — the caller reports an unknown headroom rather than inventing a denominator.
 *
 *  The label is split out and compared EXACTLY, never substring-matched: a real `cache_config_info` line
 *  carries `_block_size_resolved`, `hash_block_size`, `mamba_block_size` and `user_specified_block_size`
 *  alongside `block_size`, so a contains-style read is one numeric mamba value away from silently sourcing
 *  the headroom denominator from the wrong label. */
function readCacheConfigLabel(text: string, label: string): number | null {
  for (const line of text.split("\n")) {
    const open = line.indexOf("{");
    const close = line.lastIndexOf("}");
    if (line.startsWith("#") || !line.startsWith(`${METRIC_CACHE_CONFIG}{`) || close <= open) {
      continue;
    }
    for (const pair of line.slice(open + 1, close).split(",")) {
      const eq = pair.indexOf("=");
      if (eq === -1 || pair.slice(0, eq) !== label) {
        continue;
      }
      const value = Number(pair.slice(eq + 1).replaceAll('"', ""));
      if (Number.isFinite(value)) {
        return value;
      }
    }
  }
  return null;
}

/** Parse a /metrics scrape into the contention snapshot. Pure — the fetch half is separate so tests can feed
 *  a captured document. */
export function parseEngineCapacity(text: string, engine: VllmEngine): EngineCapacityMetrics {
  const blocks = readCacheConfigLabel(text, "num_gpu_blocks");
  const blockSize = readCacheConfigLabel(text, "block_size");
  const maxConcurrency = blocks === null || blockSize === null ? null : (blocks * blockSize) / MAX_MODEL_LEN[engine];
  return {
    running: sumMetric(text, METRIC_RUNNING),
    waitingCapacity: sumMetricWithLabel(text, METRIC_WAITING_BY_REASON, METRIC_WAITING_BY_REASON_CAPACITY),
    preemptionsTotal: sumMetric(text, METRIC_PREEMPTIONS),
    kvCacheUsagePerc: sumMetric(text, METRIC_KV_USAGE),
    maxConcurrency,
    kvHeadroomOk: maxConcurrency === null ? null : maxConcurrency >= 1,
  };
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

/** Derive the human-legible warnings for one engine's snapshot. Separate from the fetch so the thresholds are
 *  testable without an engine, and so the route can serve gauges + warnings from one pass. */
export function capacityWarnings(engine: VllmEngine, m: EngineCapacityMetrics): string[] {
  const warnings: string[] = [];
  if (m.kvHeadroomOk === false && m.maxConcurrency !== null) {
    warnings.push(
      `${engine}: KV headroom ${m.maxConcurrency.toFixed(2)}x < 1x — the KV cache cannot hold one full-length ` +
        `request (${MAX_MODEL_LEN[engine]} tokens), so a max-context request will preempt. Lower max_model_len ` +
        "or raise gpu_memory_utilization.",
    );
  }
  if (m.waitingCapacity > 0) {
    warnings.push(`${engine}: ${m.waitingCapacity} request(s) queued for CAPACITY — the engine is at its KV limit.`);
  }
  if (m.preemptionsTotal > 0) {
    warnings.push(`${engine}: ${m.preemptionsTotal} preemption(s) since start — running work has been evicted and recomputed.`);
  }
  return warnings;
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

/** The pid bound to an engine's loopback port (via `ss -tlnp`), or null. Used by `engines status` to show
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
