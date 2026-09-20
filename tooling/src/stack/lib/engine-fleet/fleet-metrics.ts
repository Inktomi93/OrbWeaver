// The PURE metric layer of the dev fleet: every derivation over an engine's Prometheus `/metrics` document
// — the idle snapshot that drives auto-sleep, the contention snapshot behind the capacity route, the KV
// headroom arithmetic, the warning thresholds, and the auto-sleep tick. NOTHING here does I/O: the three
// scrapers live in `fleet-control.ts` and hand a captured document in, which is what lets every threshold
// be tested without an engine and is why `wake-budget.ts` is shaped the same way.
//
// Split out of `fleet-control.ts` 2026-09-20 at the 450-line cap (policy `tooling-size`, Core-Tooling-Law.md
// §4.3), when the fleet yeet moved this tree into the population that judges tool-file size and the
// load-budget derivation pushed the file over. The cut is BY NATURE — pure derivation vs the HTTP seam —
// per the move playbook (§9.1), and this module is the LEAF: it never imports its former home.

import type { VLLM_ENGINES } from "./engines.ts";
import { fleetEnv as env } from "./env.ts";

type VllmEngine = (typeof VLLM_ENGINES)[number];

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
