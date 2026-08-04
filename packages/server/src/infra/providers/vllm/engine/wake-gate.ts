// The AUTO-WAKE pre-dispatch gate (B.6/B.7). A request sent to a SLEEPING engine silently QUEUES (never
// errors — B.1), so the gate MUST run BEFORE dispatch, never react to an error. Every role's dispatch funnels
// through client.ts's enginePost/engineStream, which calls `ensureAwake` first.
//
// SLEEP DETECTION IS HONEST (the 2026-07-31 live bug): the gate asks the ENGINE (`GET /is_sleeping`), never
// `/health` and no longer the supervisor's process-local status registry. Both of those LIE about a slept
// engine — /health answers 200 while asleep, and the registry only learns "sleeping" if this process runs a
// supervisor, with sleepMode on, within its 21s tick (a fleet slept by the CLI verb, by another worktree's
// stack, or before this server booted reads `adopted`/`undefined` forever → the gate no-op'd and the turn hung
// on a paused scheduler). The probe is COLD-GATED by a short-TTL awake cache, so a warm engine costs one
// process-local map read per request and one loopback GET per {@link AWAKE_TTL_MS} window; staleness only ever
// costs one extra probe (the TTL is two orders of magnitude below the auto-sleep idle floor, so a request
// can't fall inside the cache window of an engine that just auto-slept).
//
// On a sleeping engine a SINGLE-FLIGHT per-engine wake runs the VRAM headroom + hold-marker gate (decideWake),
// then POST /wake_up + poll until ready (~3s), then the caller dispatches. A refusal (held marker, or
// insufficient VRAM) throws a typed non-retryable ProviderError naming the engine STATE + the holder verbatim
// — a GREAT error ("vllm gen engine is asleep (sleeping-held) and cannot wake: engines held …"), never a CUDA
// OOM, never a hang, never a silent no-op. The orphan reconcile runs FIRST so a dead engine's own core is
// reaped as ours, never named as a foreign tenant. Every arm LOGS (the live bug was also invisible: the
// production deps never wired a logger).
//
// TRACE VOCABULARY: a wake is the largest pre-dispatch latency a request can pay (~3s), so every arm also
// annotates the active request span (`addSpanEvent`, a no-op when there is none — the supervisor's own
// span-less calls cost nothing): `vllm.wake.start`/`vllm.wake.done` around the wake, `vllm.wake.refused`
// {state, reason} for the hold/headroom refusal, `vllm.wake.timeout`, and `vllm.wake.coalesced` for a
// caller that rode another request's in-flight wake (whose start/done land on THAT request's trace, so
// without this marker its own trace shows an unexplained multi-second gap before dispatch). The awake-cache
// hit is deliberately NOT an event — it fires on every dispatch and says nothing when normal.

import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { env } from "#foundation/env";
import { addSpanEvent, getLog } from "#foundation/observability";
import { ProviderError } from "../../contract/index.ts";
import type { VLLM_ENGINES } from "./engines.ts";
import { decideWake, fleetRunDir, getIsSleeping, isHeld, postWakeAndAwait } from "./fleet-control.ts";
import { countGpus } from "./gpu.ts";
import { reapOrphanedFamily } from "./reaper.ts";
import type { EngineUtilFractions } from "./wake-budget.ts";
import { queryGpuVram } from "./wake-budget.ts";

type VllmEngine = (typeof VLLM_ENGINES)[number];

/** How long an honest "not sleeping" observation is trusted before the next probe. Chosen against the
 *  auto-sleep idle FLOOR (VLLM_AUTO_SLEEP_IDLE_MS, 10 minutes by default): an engine cannot fall asleep
 *  inside this window after serving traffic, so the cache can't hand a request to a freshly-slept engine.
 *  It only bounds the wasted probes on a hot chat (one GET per engine per 10s). */
const AWAKE_TTL_MS = 10_000;

/** The launch-floor util fractions (the SAME source the serve argv reads, so the wake footprint can't drift
 *  from the actual allocation). */
function utilFractions(): EngineUtilFractions {
  return {
    embedGpuUtil: env.VLLM_EMBED_GPU_UTIL,
    rerankGpuUtilMulti: env.VLLM_RERANK_GPU_UTIL_MULTI,
    rerankGpuUtilSingle: env.VLLM_RERANK_GPU_UTIL_SINGLE,
    genGpuUtilMulti: env.VLLM_GEN_GPU_UTIL_MULTI,
    genGpuUtilSingle: env.VLLM_GEN_GPU_UTIL_SINGLE,
  };
}

/** The injectable I/O the wake gate needs (real impls default; tests inject fakes). */
export interface WakeGateDeps {
  readonly repoRoot: string;
  /** The HONEST sleep probe — `GET /is_sleeping` on the engine itself (never /health, never the registry). */
  readonly isSleeping: (engine: VllmEngine) => Promise<boolean>;
  readonly reap: (repoRoot: string) => Promise<number[]>;
  readonly queryGpu: typeof queryGpuVram;
  readonly wakeAndAwait: (engine: VllmEngine) => Promise<boolean>;
  readonly held: (repoRoot: string) => boolean;
  readonly now: () => number;
  readonly log?: (msg: string, fields: Record<string, unknown>) => void;
}

function defaultDeps(): WakeGateDeps {
  return {
    repoRoot: process.cwd(),
    isSleeping: getIsSleeping,
    reap: reapOrphanedFamily,
    queryGpu: queryGpuVram,
    wakeAndAwait: (engine) => postWakeAndAwait(engine, { now: Date.now, sleep }),
    held: (repoRoot) => isHeld(fleetRunDir(repoRoot)),
    now: Date.now,
    // The live bug was INVISIBLE as well as broken — production never wired a logger, so a refused/attempted
    // wake left zero trace. Every arm now lands in the server log under the supervisor's component name.
    log: (msg, fields) => getLog().child({ component: "vllm-engines" }).info(fields, msg),
  };
}

// Single-flight per-engine wake promise — N concurrent requests against one sleeping engine trigger ONE wake.
// ASSUMES(single-replica): `inFlight` holds LIVE in-process wake Promises — a Promise is process-local by
// nature and cannot be shared across replicas; the vLLM engines it gates are themselves single-host GPU
// processes (one supervisor per box), so there is no multi-replica seam to DB-back. If the supervisor ever
// fans across hosts, the single-flight seam moves to a per-host lock keyed on the engine's run dir.
const inFlight = new Map<VllmEngine, Promise<void>>();

// The cold gate on the honest probe: epoch-ms through which each engine was OBSERVED awake (see AWAKE_TTL_MS).
// ASSUMES(single-replica): same reasoning as `inFlight` — per-process, and the engines are host-local.
const awakeUntil = new Map<VllmEngine, number>();

/** Perform the wake once (single-flighted by the caller): reconcile → hold+VRAM gate → wake+wait. Throws a
 *  non-retryable ProviderError on a refusal (held / no headroom) or a wake timeout. */
async function performWake(engine: VllmEngine, deps: WakeGateDeps): Promise<void> {
  // Reconcile FIRST so a dead engine's own core is reaped as ours, never named as a foreign tenant.
  await deps.reap(deps.repoRoot);
  const held = deps.held(deps.repoRoot);
  const decision = decideWake(engine, {
    held,
    gpuCount: countGpus(),
    util: utilFractions(),
    gpus: await deps.queryGpu(),
  });
  if (!decision.ok) {
    // The HOLD is an owner POSTURE (`pnpm engines:sleep` = "stay down for the tenant that hasn't grabbed its
    // VRAM yet"), never something a stray turn may override — so it refuses like a headroom shortfall, but
    // names the DISTINCT state (`sleeping-held`) so the operator reads "your hold did this", not "no VRAM".
    const state = decision.heldMarker ? "sleeping-held" : "sleeping";
    addSpanEvent("vllm.wake.refused", { engine, state, reason: decision.reason });
    deps.log?.("vllm-engines: wake refused", { engine, state, reason: decision.reason });
    throw new ProviderError({
      kind: "server",
      retryable: false, // backoff can't free someone else's VRAM (or clear a manual hold) — the user acts.
      message: `vllm ${engine} engine is asleep (${state}) and cannot wake: ${decision.reason}`,
    });
  }
  addSpanEvent("vllm.wake.start", { engine });
  deps.log?.("vllm-engines: waking on demand", { engine });
  const woke = await deps.wakeAndAwait(engine);
  if (!woke) {
    addSpanEvent("vllm.wake.timeout", { engine });
    throw new ProviderError({
      kind: "server",
      retryable: true, // a wake that ran long once may succeed on retry (transient PCIe/scheduler pressure).
      message: `vllm ${engine} engine is asleep and waking timed out — aborted so the caller's request doesn't hang on a paused scheduler.`,
    });
  }
  addSpanEvent("vllm.wake.done", { engine });
  deps.log?.("vllm-engines: woke on demand", { engine });
}

/** Pre-dispatch gate: ask the engine whether it is asleep (cold-gated by the awake cache) and, if it is, wake
 *  it (single-flight, VRAM/hold-gated) before the caller dispatches. `deps` is injected in tests; production
 *  uses the real loopback I/O. Throws a named ProviderError on a wake refusal/timeout — never returns while
 *  the engine is still asleep. */
export async function ensureAwake(engine: VllmEngine, deps: WakeGateDeps = defaultDeps()): Promise<void> {
  const until = awakeUntil.get(engine);
  if (until !== undefined && deps.now() < until) {
    return; // observed awake within the TTL — dispatch straight through (no HTTP).
  }
  if (!(await deps.isSleeping(engine))) {
    awakeUntil.set(engine, deps.now() + AWAKE_TTL_MS);
    return; // the engine itself says it is awake (a down engine also lands here — the dispatch maps that error).
  }
  const existing = inFlight.get(engine);
  if (existing !== undefined) {
    // This request pays the ~3s wake WITHOUT any wake event of its own (the start/done pair lands on the
    // first caller's span) — without this marker its trace shows an unexplained 3s gap before dispatch.
    addSpanEvent("vllm.wake.coalesced", { engine });
    await existing; // ride the in-flight wake — N callers collapse to one /wake_up.
    return;
  }
  const promise = performWake(engine, deps).finally(() => inFlight.delete(engine));
  inFlight.set(engine, promise);
  await promise;
  awakeUntil.set(engine, deps.now() + AWAKE_TTL_MS);
}

/** @internal test seam — drop the awake cache so a spec can drive cold/warm transitions (mirrors the
 *  vllm-window cache's reset seam). Never called by production code. */
export function __resetWakeGateCache(): void {
  awakeUntil.clear();
}
