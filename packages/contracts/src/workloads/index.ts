// `@orb/contracts/workloads` — the workload KIND + STATUS axes, promoted to contracts so `@orb/db` can
// derive its `workloads.kind` / `workloads.status` enum columns from the ONE canonical tuple (D34).
//
// Why this lives here and not in `domain/workloads/contract/` (its §7.5 "domain-internal" home): a db
// enum column must constrain these axes, but `@orb/db` deps are `@orb/kit` + `@orb/contracts` + drizzle
// only — it CANNOT import a server-tier `domain/*/contract/`. Rather than weaken the column to a bare
// `text()` (losing the CHECK + the integrity guarantee), D34 promotes the tuples up the cake into
// contracts: the db column derives + CHECK-enforces them, a `.int` test-mirror pins db === contracts, and
// the tRPC wire `z.enum(WORKLOAD_STATUSES)` derives from the same tuple — one home, no re-spelling
// (`no-inline-union-redecl`). The DOMAIN's richer per-kind machinery (`ParamsByKind`/`ResultByKind`/the
// `RUNNERS` Record / `Runner<K>` / `WorkloadError` / `WorkloadEvent`) stays in `domain/workloads/contract`
// and imports these tuples DOWN — this namespace owns ONLY the two bare string-union axes a db column needs
// plus the active-status subset the partial-unique index keys on.
//
// These tuples ARE the canonical member lists (including the reserved v2 `reconcile-world-state`) —
// every other spelling (db enum, RUNNERS Record, tRPC wire) derives from here.

import { z } from "zod";

// ── The `WorkloadKind` axis (the §7.5 GOLD STANDARD — `workloads.kind` is the reference dispatch axis) ──

/** Every kind of bulk-work the durable queue drives. ONE canonical tuple (the db `workloads.kind` enum,
 *  the `RUNNERS: { [K in WorkloadKind]: Runner<K> }` exhaustiveness pin, and the tRPC wire enum all derive
 *  from it — no inline re-spelling). `reconcile-world-state` is a RESERVED v2 seam (council 2026-06-25):
 *  it ships now as a no-op stub runner so `exhaustive-dispatch` stays green, the feature is v2.
 *  This tuple is the ONE canonical member list — do NOT invent or reorder members. */
export const WORKLOAD_KINDS = [
  "embed-corpus",
  "embed-assets",
  "distill-characters",
  "compute-themes",
  "memory-backfill",
  "group-character-backfill",
  "compute-cooccurrence",
  "find-duplicates",
  "csls",
  "assets-backfill",
  "import-st",
  "reconcile-stats",
  "refresh-model-catalog",
  // Seam reservation (reserve now, build v2 — ledger §5, domains/memory.md §9).
  "reconcile-world-state",
] as const;

export type WorkloadKind = (typeof WORKLOAD_KINDS)[number];

/** The wire schema for the kind axis — `z.enum` over {@link WORKLOAD_KINDS} (the single source of truth). */
export const workloadKindSchema = z.enum(WORKLOAD_KINDS);

// ── The `WorkloadStatus` lifecycle axis ──────────────────────────────────────────────────────────────

/** The row's lifecycle state. `queued → running → {succeeded | failed | cancelled | worker_died}`, with
 *  `cancelling` the in-flight "stop requested" state a running row passes through before `cancelled`.
 *  `worker_died` is the reaper's terminal for an orphaned in-flight row (a dead worker). The db
 *  `workloads.status` enum derives this tuple; tRPC builds `z.enum(WORKLOAD_STATUSES)` from it. */
export const WORKLOAD_STATUSES = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelling",
  "cancelled",
  "worker_died",
] as const;

export type WorkloadStatus = (typeof WORKLOAD_STATUSES)[number];

/** The wire schema for the status axis — `z.enum` over {@link WORKLOAD_STATUSES}. */
export const workloadStatusSchema = z.enum(WORKLOAD_STATUSES);

// ── The active-status subset (the partial-unique-index `WHERE` axis) ──────────────────────────────────

/** The statuses that hold a kind's single-active slot — the NAMED mirror of the
 *  `workloads_kind_active` partial unique index's `WHERE status IN (…)` predicate. The db index derives
 *  its predicate list from THIS tuple (`db/schema/workloads.ts`), so the two cannot drift: a status added
 *  to the lock without the tuple (or vice versa) is a silent concurrency bug. `cancelling` MUST stay in
 *  the set — a row mid-cancel still holds the slot until it terminates; dropping it wedges the kind
 *  forever after a mid-cancel crash. `satisfies readonly WorkloadStatus[]` pins every member as a real
 *  status. */
export const ACTIVE_WORKLOAD_STATUSES = [
  "queued",
  "running",
  "cancelling",
] as const satisfies readonly WorkloadStatus[];
