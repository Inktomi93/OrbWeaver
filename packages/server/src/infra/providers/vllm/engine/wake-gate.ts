// The AUTO-WAKE pre-dispatch gate (B.6/B.7). A request sent to a SLEEPING engine silently QUEUES (never
// errors — B.1), so the gate MUST run BEFORE dispatch, never react to an error. Every role's dispatch funnels
// through client.ts's enginePost/engineStream, which calls `ensureAwake` first: a cheap process-local status
// read (no per-request HTTP) decides if a wake is needed; when it is, a SINGLE-FLIGHT per-engine wake runs the
// VRAM headroom + hold-marker gate (decideWake), then POST /wake_up + poll until ready, then the caller
// dispatches. A refusal (held marker, or insufficient VRAM) throws a typed NON-retryable ProviderError
// carrying the holder-naming message verbatim — a GREAT error ("engine cannot wake: GPU0 held by python3
// (pid …, 38GiB)"), never a CUDA OOM. The orphan reconcile runs FIRST so a dead engine's own core is reaped
// as ours, never named as a foreign tenant.

import process from "node:process";
import { env } from "#foundation/env";
import { ProviderError } from "../../contract";
import { getEngineStatus } from "./engine-status";
import type { VLLM_ENGINES } from "./engines";
import { decideWake, fleetRunDir, isHeld, postWakeAndAwait } from "./fleet-control";
import { countGpus } from "./gpu";
import { reapOrphanedFamily } from "./reaper";
import type { EngineUtilFractions } from "./wake-budget";
import { queryGpuVram } from "./wake-budget";

type VllmEngine = (typeof VLLM_ENGINES)[number];

const SLEEP_STATUSES = new Set(["sleeping", "sleeping-held"]);
const realSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

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
    reap: reapOrphanedFamily,
    queryGpu: queryGpuVram,
    wakeAndAwait: (engine) => postWakeAndAwait(engine, { now: Date.now, sleep: realSleep }),
    held: (repoRoot) => isHeld(fleetRunDir(repoRoot)),
    now: Date.now,
  };
}

// Single-flight per-engine wake promise — N concurrent requests against one sleeping engine trigger ONE wake.
// ASSUMES(single-replica): `inFlight` holds LIVE in-process wake Promises — a Promise is process-local by
// nature and cannot be shared across replicas; the vLLM engines it gates are themselves single-host GPU
// processes (one supervisor per box), so there is no multi-replica seam to DB-back. If the supervisor ever
// fans across hosts, the single-flight seam moves to a per-host lock keyed on the engine's run dir.
const inFlight = new Map<VllmEngine, Promise<void>>();

/** Perform the wake once (single-flighted by the caller): reconcile → hold+VRAM gate → wake+wait. Throws a
 *  non-retryable ProviderError on a refusal (held / no headroom) or a wake timeout. */
async function performWake(engine: VllmEngine, deps: WakeGateDeps): Promise<void> {
  // Reconcile FIRST so a dead engine's own core is reaped as ours, never named as a foreign tenant.
  await deps.reap(deps.repoRoot);
  const decision = decideWake(engine, {
    held: deps.held(deps.repoRoot),
    gpuCount: countGpus(),
    util: utilFractions(),
    gpus: await deps.queryGpu(),
  });
  if (!decision.ok) {
    deps.log?.("vllm-engines: wake refused", { engine, reason: decision.reason });
    throw new ProviderError({
      kind: "server",
      retryable: false, // backoff can't free someone else's VRAM (or clear a manual hold) — the user acts.
      message: `vllm ${engine} engine cannot wake: ${decision.reason}`,
    });
  }
  deps.log?.("vllm-engines: waking", { engine });
  const woke = await deps.wakeAndAwait(engine);
  if (!woke) {
    throw new ProviderError({
      kind: "server",
      retryable: true, // a wake that ran long once may succeed on retry (transient PCIe/scheduler pressure).
      message: `vllm ${engine} engine waking timed out — aborted so the caller's request doesn't hang on a paused scheduler.`,
    });
  }
  deps.log?.("vllm-engines: woke", { engine });
}

/** Pre-dispatch gate: if the status registry says this engine is sleeping, wake it (single-flight, gated)
 *  before the caller dispatches. A no-op for a non-sleeping engine (the cheap common path — one process-local
 *  read, no HTTP). `deps` is injected in tests; production uses the real I/O. Throws on a wake refusal/timeout. */
export async function ensureAwake(engine: VllmEngine, deps: WakeGateDeps = defaultDeps()): Promise<void> {
  const status = getEngineStatus(engine)?.status;
  if (status === undefined || !SLEEP_STATUSES.has(status)) {
    return; // awake (or unknown — the supervisor hasn't marked it sleeping) → dispatch straight through.
  }
  const existing = inFlight.get(engine);
  if (existing !== undefined) {
    await existing; // ride the in-flight wake — N callers collapse to one /wake_up.
    return;
  }
  const promise = performWake(engine, deps).finally(() => inFlight.delete(engine));
  inFlight.set(engine, promise);
  await promise;
}
