// Supervisor↔runner status bridge: the adoptive supervisor WRITES one record per engine; the engine
// client READS it to turn a bare connection-refused into an actionable error. Process-local state
// (esoteric #5, single-replica), deliberately not persisted — multi-replica seam is a future DB table.
// `updatedAt` is injected by the caller (no-raw-clock); this module never touches a clock.

import type { VLLM_ENGINES } from "./engines.ts";

/** Every lifecycle state an engine can occupy (the canonical tuple — one home). */
export const ENGINE_LIFECYCLE_STATUSES = [
  /** Healthy engine someone else started (dev stack) — we monitor, never kill. */
  "adopted",
  /** Healthy engine THIS server spawned — death-coupled, restarted on crash. */
  "owned",
  /** Spawned, warming up (model load + CUDA-graph compile). */
  "starting",
  /** Stack mode at boot: the stack leader is expected to bring this engine up. */
  "stack-pending",
  /** Port free, nothing running, no spawn in flight (transient between tick and action). */
  "down",
  /** Port answers TCP but /health fails repeatedly — a wedged process we may not own. */
  "hung",
  /** Port occupied by something that never became a healthy engine — we won't fight it. */
  "foreign",
  /** Crash-loop circuit breaker open: repeated restarts failed; half-open retry later. */
  "failed",
  /** Engine slept by the AUTO idle timer (manager posture): /health 200 but /is_sleeping true. Weights are
   *  on CPU, the scheduler is paused — a request wakes it on demand (the client pre-dispatch wake gate). */
  "sleeping",
  /** Engine slept by a MANUAL hold (`pnpm engines sleep` → the .cache/stack/engines.hold marker) — intent
   *  ahead of a tenant's occupancy. The wake gate refuses on the marker even with VRAM free; only
   *  `pnpm engines wake` clears it. Distinct from `sleeping` so status tells manual-vs-auto apart. */
  "sleeping-held",
] as const;

// Derived file-locally from the canonical tuples (one home; no inline re-spell).
type VllmEngine = (typeof VLLM_ENGINES)[number];
type Status = (typeof ENGINE_LIFECYCLE_STATUSES)[number];

/** One engine's process-local lifecycle record. The infra DI surface the client + admin panel read. */
export interface EngineStatusRecord {
  readonly status: Status;
  /** Human-oriented amplification ("restart 2/3", "breaker opens until 12:41Z"). */
  readonly detail: string;
  /** Epoch-ms write time, injected by the supervisor. */
  readonly updatedAt: number;
}

// ASSUMES(single-replica): per-process engine-status registry (the supervisor owns the one engine).
const registry = new Map<VllmEngine, EngineStatusRecord>();

/** Record the current lifecycle state for an engine. `at` is the injected epoch-ms write time. */
export function setEngineStatus(engine: VllmEngine, status: Status, detail: string, at: number): void {
  registry.set(engine, { status, detail, updatedAt: at });
}

/** The latest record for an engine, or `undefined` before the first tick wrote one. */
export function getEngineStatus(engine: VllmEngine): EngineStatusRecord | undefined {
  return registry.get(engine);
}

/** Snapshot of every engine's status — the shape `/api/healthz` + the admin panel render. */
export function allEngineStatuses(): Record<string, EngineStatusRecord> {
  return Object.fromEntries(registry.entries());
}
