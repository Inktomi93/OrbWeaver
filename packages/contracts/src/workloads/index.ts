// `@orb/contracts/workloads` — the workload KIND + STATUS axes, promoted here so `@orb/db` can derive
// its `workloads.kind`/`workloads.status` enum columns (it cannot import a server-tier `domain/*/contract/`).
// These tuples ARE the canonical member lists — every other spelling derives from here.

import { z } from "zod";

/** Every kind of bulk-work the durable queue drives. The one canonical tuple — do NOT invent or
 *  reorder members; several kinds below are STUBS (no real runner yet, v2-reserved). */
export const WORKLOAD_KINDS = [
  // `index`'s `source` param (text|image|all) is also a single-active LOCK dimension: a text reindex
  // and an image reindex run concurrently while same-source runs are single-active.
  "index",
  "distill-characters",
  "compute-themes",
  "memory-backfill",
  "group-character-backfill",
  "compute-cooccurrence",
  "find-duplicates",
  "csls",
  "assets-backfill",
  "assets-gc",
  "assets-fsck",
  "import-st",
  // Distinct from `import-st`: reads ONE staged bundle-zip via the entity-agnostic `runBundleImport`.
  "import-bundle",
  "reconcile-stats",
  "refresh-model-catalog",
  "reconcile-world-state",
  "crew-lorebook-keeper",
  "crew-card-evolution",
  "crew-director",
  "crew-prose-audit",
  "expressions-sprite-sheet",
  "databank-ingest",
  "databank-reindex",
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

/** Which embed source(s) an `index` run sweeps. Also a single-active LOCK sub-dimension: the db
 *  `workloads.source` column keys the lock on (kind, source, owner), so `text` and `image` runs hold
 *  different slots (concurrent) while two `text` runs collide (single-active). */
export const INDEX_SOURCES = ["text", "image", "all"] as const;
export type IndexSource = (typeof INDEX_SOURCES)[number];
export const indexSourceSchema = z.enum(INDEX_SOURCES);

/** {@link INDEX_SOURCES} PLUS the `none` sentinel every non-`index` kind carries. Not NULL: SQLite
 *  treats NULLs as DISTINCT in a unique index, which would silently break the single-active lock. */
export const WORKLOAD_SOURCES = ["none", ...INDEX_SOURCES] as const;
export type WorkloadSource = (typeof WORKLOAD_SOURCES)[number];

/** The `source` sentinel a non-`index` row carries (its shared lock bucket). */
export const NON_INDEX_SOURCE = "none" as const satisfies WorkloadSource;

/** How a workload RUN is scoped. `singular` = one authed user's own data. `bulk` = the box-owner-only
 *  global pass (a maintenance sweep across all owners, or — for a create-kind — a mint into a target). */
export const WORKLOAD_MODES = ["singular", "bulk"] as const;
export type WorkloadMode = (typeof WORKLOAD_MODES)[number];
export const workloadModeSchema = z.enum(WORKLOAD_MODES);

/** A kind's mode policy — which modes it supports + (for bulk) whether it MINTS owner-owned rows. */
export interface WorkloadModePolicy {
  readonly singular: boolean;
  readonly bulk: boolean;
  /** In bulk mode, the kind MINTS owner-owned rows (a CREATE-kind), so the owner must designate a
   *  `targetOwnerId`. `false` = a SWEEP-kind (existing rows carry their own producer FK, no target). */
  readonly bulkRequiresTarget: boolean;
  /** The kind has NO real runner yet (v2-reserved stub) — hidden from the run UI. */
  readonly stub: boolean;
}

/** The per-kind mode policy map. `satisfies Record<WorkloadKind, WorkloadModePolicy>` pins
 *  exhaustiveness — a new kind missing its policy is a tsc error here. */
export const WORKLOAD_KIND_MODES = {
  index: { singular: true, bulk: true, bulkRequiresTarget: false, stub: false },
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
  "assets-gc": { singular: false, bulk: true, bulkRequiresTarget: false, stub: false },
  "assets-fsck": { singular: false, bulk: true, bulkRequiresTarget: false, stub: false },
  "import-st": { singular: true, bulk: true, bulkRequiresTarget: true, stub: false },
  // Singular only: a bundle is one user's own upload, never an all-owners sweep or a mint-into-X.
  "import-bundle": { singular: true, bulk: false, bulkRequiresTarget: false, stub: false },
  "reconcile-stats": { singular: true, bulk: true, bulkRequiresTarget: false, stub: false },
  "refresh-model-catalog": { singular: false, bulk: true, bulkRequiresTarget: false, stub: false },
  "compute-cooccurrence": { singular: false, bulk: true, bulkRequiresTarget: false, stub: false },
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

/** How often a `workload_schedule` auto-enqueues its workload — a NAMED interval preset (no cron string)
 *  resolved to a fixed period via {@link CADENCE_INTERVAL_MS}. `nextRunAt = lastRunAt + interval`
 *  (interval-from-last-run), so "nightly" is a daily interval, not a wall-clock time-of-day. */
export const SCHEDULE_CADENCES = ["hourly", "daily", "weekly", "monthly"] as const;
export type ScheduleCadence = (typeof SCHEDULE_CADENCES)[number];
export const scheduleCadenceSchema = z.enum(SCHEDULE_CADENCES);

/** The interval (ms) each cadence advances by. `satisfies Record<ScheduleCadence, number>` pins
 *  exhaustiveness. `monthly` is a fixed 30-day interval (no calendar-month notion — KISS). */
export const CADENCE_INTERVAL_MS = {
  hourly: 3_600_000,
  daily: 86_400_000,
  weekly: 604_800_000,
  monthly: 2_592_000_000,
} as const satisfies Record<ScheduleCadence, number>;

/** The row's lifecycle state. `queued → running → {succeeded | failed | cancelled | worker_died}`, with
 *  `cancelling` the in-flight "stop requested" state before `cancelled`. `worker_died` is the reaper's
 *  terminal for an orphaned in-flight row. */
export const WORKLOAD_STATUSES = ["queued", "running", "succeeded", "failed", "cancelling", "cancelled", "worker_died"] as const;

export type WorkloadStatus = (typeof WORKLOAD_STATUSES)[number];

export const workloadStatusSchema = z.enum(WORKLOAD_STATUSES);

/** The statuses that hold a kind's single-active slot — the db `workloads_kind_active` partial unique
 *  index derives its predicate list from this tuple. `cancelling` MUST stay in the set — dropping it
 *  wedges the kind forever after a mid-cancel crash. */
export const ACTIVE_WORKLOAD_STATUSES = ["queued", "running", "cancelling"] as const satisfies readonly WorkloadStatus[];
