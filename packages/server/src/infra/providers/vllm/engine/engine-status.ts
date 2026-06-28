// infra/providers/vllm/engine/engine-status — the supervisor↔runner status bridge.
//
// The adoptive supervisor WRITES one record per engine; the engine client (client.ts) READS it to turn a
// bare connection-refused into an ACTIONABLE error ("crash-looped, circuit open" vs "still warming").
// Engine identity comes from the ./engines leaf, never ./client, so this registry sits below the HTTP
// client with no cycle. Process-local state, deliberately not persisted.
//
// ASSUMES(single-replica): the status registry is a module-scope Map, per-process (tiers/foundation.md
// esoteric #5). It is INTENTIONALLY process-local — each replica supervises only its OWN spawned engines,
// so a peer replica's lifecycle state is meaningless here. The multi-replica replacement seam is a
// DB-backed `vllm_engine_status` table (engine × replica-id → status) the supervisor upserts and the admin
// panel aggregates; until that exists, `/api/healthz` reports the hit replica's view (like the obs rings).
//
// TYPE HOMES: the lifecycle-status VOCAB is vLLM-internal (it never crosses the providers boundary — the
// public surface is the role functions + the lifecycle handle), so it lives here as the canonical `as
// const` tuple. `EngineStatusRecord` is an infra DI surface (`export interface`, like the sibling
// backends' deps interfaces). The union TYPE is derived file-locally per consumer — never an exported
// `type X = union` (the `no-inline-types` gate's one true ban, even in infra).
//
// DETERMINISM (no-raw-clock): `updatedAt` is INJECTED by the caller (the supervisor owns the clock), not
// read from `Date.now()` here — this module never touches a clock.

import type { VLLM_ENGINES } from "./engines";

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

const registry = new Map<VllmEngine, EngineStatusRecord>();

/** Record the current lifecycle state for an engine. `at` is the injected epoch-ms write time. */
export function setEngineStatus(
  engine: VllmEngine,
  status: Status,
  detail: string,
  at: number,
): void {
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
