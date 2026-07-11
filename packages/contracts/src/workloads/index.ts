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
 *  it ships now as a no-op stub runner so `exhaustive-dispatch` stays green, the feature is v2. The four
 *  `crew-*` members are the chat-crew kinds (D59), born into the `0000_baseline` kind CHECK with STUB
 *  runners (chat-crew-design/08 CW1 — the decide-before-launch economics); CW2–CW5 land the real runners.
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
  // The assets maintenance/DR passes (PD-26): global BOX-OWNER sweeps (no per-owner concept) — `assets-gc`
  // is the grace-windowed mark-sweep GC, `assets-fsck` the read-only integrity report.
  "assets-gc",
  "assets-fsck",
  "import-st",
  "reconcile-stats",
  "refresh-model-catalog",
  // Seam reservation (reserve now, build v2 — ledger §5, domains/memory.md §9).
  "reconcile-world-state",
  // The chat-crew members (D59) — stubs until CW2–CW5 (chat-crew-design/03 §0).
  "crew-lorebook-keeper",
  "crew-card-evolution",
  "crew-director",
  "crew-prose-audit",
  // Expressions sprite-sheet generation (D49 #4, expressions-design/05 E1) — a STUB runner until E4
  // lands the real bulk pass; born into the `0000_baseline` kind CHECK now.
  "expressions-sprite-sheet",
  // Databank ingest + reindex (D49 #5, databank-design/02) — STUB runners until DB2 proper lands the
  // real chunk/extract/embed passes; born into the baseline kind CHECK now.
  "databank-ingest",
  "databank-reindex",
  // The 10 rpg crew kinds (D58, rpg-design/10 R6/R7/R9/R10) — STUB runners until each real crew chunk
  // lands; born into the baseline kind CHECK now (the R1-subset rider).
  "rpg-world-gen",
  "rpg-recap",
  "rpg-session-distill",
  "rpg-director",
  "rpg-lorebook-upkeep",
  "rpg-illustration",
  "rpg-npc-portrait",
  "rpg-scene-plan",
  "rpg-scene-distill",
  "rpg-recruit-card",
] as const;

export type WorkloadKind = (typeof WORKLOAD_KINDS)[number];

export const workloadKindSchema = z.enum(WORKLOAD_KINDS);

// ── The `WorkloadMode` axis — every RUN is `singular` (one owner) or `bulk` (owner-triggered, all-owners
//    sweep OR create-into-a-target). The ONE declarative home for who-may-run + how the runner scopes. ──

/** How a workload RUN is scoped. `"singular"` = ONE owner's data (a normal authed user over their OWN
 *  `ownerId`; the runner enumerates ONLY that owner's producers). `"bulk"` = the BOX-OWNER-only global pass
 *  (the neo dev/maintenance sweep across ALL owners, or — for a create-kind — a mint INTO a designated
 *  target user). The db `workloads.mode` enum derives this tuple; the tRPC wire + the start input derive it. */
export const WORKLOAD_MODES = ["singular", "bulk"] as const;
export type WorkloadMode = (typeof WORKLOAD_MODES)[number];
export const workloadModeSchema = z.enum(WORKLOAD_MODES);

/** A kind's mode policy — which modes it supports + (for bulk) whether it MINTS owner-owned rows. Read by the
 *  start verb (mode validation + `targetOwnerId` requirement) and the router; a kind never scatters
 *  `if (kind === …)` (the anti-SillyTavern one-home bar). */
export interface WorkloadModePolicy {
  /** may run in `singular` mode (scoped to the caller's own `ownerId`). */
  readonly singular: boolean;
  /** may run in `bulk` mode (BOX-OWNER-only). */
  readonly bulk: boolean;
  /** in bulk mode, the kind MINTS owner-owned rows (a CREATE-kind — e.g. `import-st` mints characters/personas),
   *  so the owner MUST designate a target user (`targetOwnerId`): a bulk create is "import INTO user X", not
   *  "for everyone". `false` = a SWEEP-kind (every existing row carries its own producer FK, so bulk just
   *  doesn't filter by owner — no target). */
  readonly bulkRequiresTarget: boolean;
  /** the kind has NO real runner yet (a v2-reserved fail-closed stub) — hidden from the run UI. The ONE
   *  built-vs-stub signal: the mode shape alone can't distinguish a genuinely-global BUILT bulk-only kind
   *  (e.g. `refresh-model-catalog`) from a not-yet-built stub (both are `{singular:false, bulk:true}`).
   *  Flipped to `false` when the kind's real runner lands. */
  readonly stub: boolean;
}

/**
 * The per-kind mode policy map — FIRST-CLASS declarative metadata (the ONE home). The
 * `satisfies Record<WorkloadKind, WorkloadModePolicy>` clause pins exhaustiveness — a new kind missing its
 * policy is a `tsc` error here. Classification grounded in each runner's actual reads/writes:
 *   • SWEEP-kinds, both modes (singular = MY producers; bulk = every owner, no target):
 *     embed-corpus, embed-assets, distill-characters, memory-backfill, group-character-backfill,
 *     assets-backfill, compute-themes, find-duplicates, reconcile-stats (per-owner-native rollup rebuild),
 *     csls (ALWAYS owner-scoped — analyzes YOUR OWN library only, never cross-tenant; bulk = a per-owner
 *     fan-out, never a whole-space read).
 *   • CREATE-kind, both modes, bulk REQUIRES a target: import-st (mints owner-owned characters/personas —
 *     singular imports MINE; bulk imports INTO a designated user X).
 *   • BULK-ONLY (a genuinely global pass — no per-owner concept): refresh-model-catalog (the shared provider
 *     catalog).
 *   • STUBS (`stub:true`) → no real runner yet (v2-reserved), hidden from the run UI: reconcile-world-state,
 *     crew-*, expressions-sprite-sheet, databank-*, rpg-*. (compute-cooccurrence is now BUILT — a per-owner
 *     keyword-cooccurrence subsystem — so `stub:false`; it stays bulk-only owner-maintenance until a
 *     per-owner singular mode lands.)
 */
export const WORKLOAD_KIND_MODES = {
  "embed-corpus": { singular: true, bulk: true, bulkRequiresTarget: false, stub: false },
  "embed-assets": { singular: true, bulk: true, bulkRequiresTarget: false, stub: false },
  "distill-characters": { singular: true, bulk: true, bulkRequiresTarget: false, stub: false },
  "compute-themes": { singular: true, bulk: true, bulkRequiresTarget: false, stub: false },
  "memory-backfill": { singular: true, bulk: true, bulkRequiresTarget: false, stub: false },
  "group-character-backfill": {
    singular: true,
    bulk: true,
    bulkRequiresTarget: false,
    stub: false,
  },
  "find-duplicates": { singular: true, bulk: true, bulkRequiresTarget: false, stub: false },
  csls: { singular: true, bulk: true, bulkRequiresTarget: false, stub: false },
  "assets-backfill": { singular: true, bulk: true, bulkRequiresTarget: false, stub: false },
  // Assets GC/fsck are admin/deployment MAINTENANCE over the whole store — BULK-ONLY (BOX-OWNER, no per-owner
  // concept), and BUILT (their runners land this wave) so `stub:false`.
  "assets-gc": { singular: false, bulk: true, bulkRequiresTarget: false, stub: false },
  "assets-fsck": { singular: false, bulk: true, bulkRequiresTarget: false, stub: false },
  "import-st": { singular: true, bulk: true, bulkRequiresTarget: true, stub: false },
  "reconcile-stats": { singular: true, bulk: true, bulkRequiresTarget: false, stub: false },
  "refresh-model-catalog": { singular: false, bulk: true, bulkRequiresTarget: false, stub: false },
  // BUILT — a per-owner keyword-cooccurrence subsystem; bulk-only owner-maintenance until a singular mode lands.
  "compute-cooccurrence": { singular: false, bulk: true, bulkRequiresTarget: false, stub: false },
  // STUBS (`stub:true`) — no real runner yet (v2 reserved); NOT startable, hidden from the run UI.
  "reconcile-world-state": { singular: false, bulk: true, bulkRequiresTarget: false, stub: true },
  "crew-lorebook-keeper": { singular: false, bulk: true, bulkRequiresTarget: false, stub: true },
  "crew-card-evolution": { singular: false, bulk: true, bulkRequiresTarget: false, stub: true },
  "crew-director": { singular: false, bulk: true, bulkRequiresTarget: false, stub: true },
  "crew-prose-audit": { singular: false, bulk: true, bulkRequiresTarget: false, stub: true },
  "expressions-sprite-sheet": {
    singular: false,
    bulk: true,
    bulkRequiresTarget: false,
    stub: true,
  },
  "databank-ingest": { singular: false, bulk: true, bulkRequiresTarget: false, stub: true },
  "databank-reindex": { singular: false, bulk: true, bulkRequiresTarget: false, stub: true },
  "rpg-world-gen": { singular: false, bulk: true, bulkRequiresTarget: false, stub: true },
  "rpg-recap": { singular: false, bulk: true, bulkRequiresTarget: false, stub: true },
  "rpg-session-distill": { singular: false, bulk: true, bulkRequiresTarget: false, stub: true },
  "rpg-director": { singular: false, bulk: true, bulkRequiresTarget: false, stub: true },
  "rpg-lorebook-upkeep": { singular: false, bulk: true, bulkRequiresTarget: false, stub: true },
  "rpg-illustration": { singular: false, bulk: true, bulkRequiresTarget: false, stub: true },
  "rpg-npc-portrait": { singular: false, bulk: true, bulkRequiresTarget: false, stub: true },
  "rpg-scene-plan": { singular: false, bulk: true, bulkRequiresTarget: false, stub: true },
  "rpg-scene-distill": { singular: false, bulk: true, bulkRequiresTarget: false, stub: true },
  "rpg-recruit-card": { singular: false, bulk: true, bulkRequiresTarget: false, stub: true },
} as const satisfies Record<WorkloadKind, WorkloadModePolicy>;

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

export const workloadStatusSchema = z.enum(WORKLOAD_STATUSES);

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
