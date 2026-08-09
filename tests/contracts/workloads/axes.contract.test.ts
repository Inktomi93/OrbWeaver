import type { WorkloadKind, WorkloadLane, WorkloadModePolicy, WorkloadResumePolicy, WorkloadStatus } from "@orb/contracts/workloads";
import {
  ACTIVE_WORKLOAD_STATUSES,
  DEFAULT_ADMISSION_KEY,
  INDEX_SOURCES,
  indexSourceSchema,
  WORKLOAD_KIND_MODES,
  WORKLOAD_KINDS,
  WORKLOAD_LANES,
  WORKLOAD_MODES,
  WORKLOAD_RESUME_POLICIES,
  WORKLOAD_STATUSES,
  workloadKindSchema,
  workloadModeSchema,
  workloadStatusSchema,
} from "@orb/contracts/workloads";
import { expect, test } from "../../support/fixtures.ts";

// ── The `WorkloadKind` axis (D34 — promoted to contracts so the db column derives it) ─────────────────
// The ONE home for the union (§7.5). This literal list is the pinned canonical membership; a drift here
// would mean the db enum / RUNNERS Record / tRPC wire have re-spelled it.
test("WORKLOAD_KINDS is exactly the pinned 19-member kind axis (the parameterized `index` reindex, the assets GC/fsck maintenance kinds, the workload-backed import-bundle, the databank kinds, the refinery library score sweep + the reconcile-world-state stub)", () => {
  expect(WORKLOAD_KINDS).toEqual([
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
    "import-bundle",
    "reconcile-stats",
    "refresh-model-catalog",
    "reconcile-world-state",
    "databank-ingest",
    "databank-reindex",
    "refine-score-sweep",
  ]);
  expect(workloadKindSchema.options).toEqual(WORKLOAD_KINDS);
  // The two former embed kinds are GONE — collapsed into the parameterized `index` kind.
  expect(WORKLOAD_KINDS).not.toContain("embed-corpus");
  expect(WORKLOAD_KINDS).not.toContain("embed-assets");
});

test("workloadKindSchema round-trips every valid kind and rejects non-members (incl. the removed embed kinds)", () => {
  for (const kind of WORKLOAD_KINDS) {
    expect(workloadKindSchema.parse(kind)).toBe(kind);
  }
  expect(workloadKindSchema.safeParse("embed-corpus").success).toBe(false);
  expect(workloadKindSchema.safeParse("embed-assets").success).toBe(false);
  expect(workloadKindSchema.safeParse("embed").success).toBe(false);
  expect(workloadKindSchema.safeParse("").success).toBe(false);
});

// ── The `index` SOURCE axis (the WorkloadKind-scoped param, which is also that kind's ADMISSION KEY) ────
test("INDEX_SOURCES is [text, image, all] and the sentinel admission key is not one of them", () => {
  expect(INDEX_SOURCES).toEqual(["text", "image", "all"]);
  expect(indexSourceSchema.options).toEqual(INDEX_SOURCES);
  // The lock partition is a free-form KEY, not an axis: there is no tuple `none` belongs to, only the
  // sentinel a kind that declares no `admissionKey` carries. It must never collide with a real key.
  expect(DEFAULT_ADMISSION_KEY).toBe("none");
  expect(INDEX_SOURCES).not.toContain(DEFAULT_ADMISSION_KEY);
});

test("WORKLOAD_STATUSES is exactly the 7-member lifecycle tuple", () => {
  expect(WORKLOAD_STATUSES).toEqual(["queued", "running", "succeeded", "failed", "cancelling", "cancelled", "worker_died"]);
  expect(workloadStatusSchema.options).toEqual(WORKLOAD_STATUSES);
});

test("workloadStatusSchema round-trips every valid status and rejects non-members", () => {
  for (const status of WORKLOAD_STATUSES) {
    expect(workloadStatusSchema.parse(status)).toBe(status);
  }
  expect(workloadStatusSchema.safeParse("done").success).toBe(false);
  expect(workloadStatusSchema.safeParse("pending").success).toBe(false);
});

// ── The active-status subset (the partial-unique-index `WHERE` mirror) ────────────────────────────────
// PIN: ACTIVE_WORKLOAD_STATUSES is the named mirror of the workloads_kind_active index predicate. The db
// schema derives the index WHERE list from THIS tuple; a behavioral test that they match lives in the db
// .int lane. Here we fix the membership + the subset relation that makes the mirror sound.
test("ACTIVE_WORKLOAD_STATUSES is exactly [queued, running, cancelling] (the single-active slot holders)", () => {
  expect(ACTIVE_WORKLOAD_STATUSES).toEqual(["queued", "running", "cancelling"]);
});

test("every ACTIVE_WORKLOAD_STATUSES member is a real WORKLOAD_STATUSES member (no orphan in the index WHERE)", () => {
  for (const status of ACTIVE_WORKLOAD_STATUSES) {
    expect(WORKLOAD_STATUSES).toContain(status);
  }
  // `cancelling` MUST stay active — a row mid-cancel holds the slot until it terminates.
  expect(ACTIVE_WORKLOAD_STATUSES).toContain("cancelling");
});

// ── Exhaustiveness backstops (compile-time guard behind the runtime asserts) ──────────────────────────
// A `Record<Axis, …>` goes tsc-red if a member is added/removed, so the inline literals here can't drift
// from the tuple without a build break — no inline re-spelling anywhere else.
const KIND_SEEN: Record<WorkloadKind, true> = {
  index: true,
  "distill-characters": true,
  "compute-themes": true,
  "memory-backfill": true,
  "group-character-backfill": true,
  "compute-cooccurrence": true,
  "find-duplicates": true,
  csls: true,
  "assets-backfill": true,
  "assets-gc": true,
  "assets-fsck": true,
  "import-st": true,
  "import-bundle": true,
  "reconcile-stats": true,
  "refresh-model-catalog": true,
  "reconcile-world-state": true,
  "databank-ingest": true,
  "databank-reindex": true,
  "refine-score-sweep": true,
};
test("WorkloadKind has no member beyond the tuple", () => {
  expect(Object.keys(KIND_SEEN).sort()).toEqual(WORKLOAD_KINDS.toSorted());
});

const STATUS_SEEN: Record<WorkloadStatus, true> = {
  queued: true,
  running: true,
  succeeded: true,
  failed: true,
  cancelling: true,
  cancelled: true,
  // biome-ignore lint/style/useNamingConvention: WorkloadStatus member is snake_case (the canonical tuple value).
  worker_died: true,
};
test("WorkloadStatus has no member beyond the tuple", () => {
  expect(Object.keys(STATUS_SEEN).sort()).toEqual(WORKLOAD_STATUSES.toSorted());
});

// ── The EXECUTION axes (lane + resume) — the tuples `@orb/db`'s `workloads.lane` column/CHECK and the
//    client's lane grouping derive from (D34). Pinned here because a member added or reordered silently
//    changes which worker loop a row lands on. ───────────────────────────────────────────────────────────
test("WORKLOAD_LANES is exactly [interactive, sweep] (the two worker poll loops)", () => {
  expect(WORKLOAD_LANES).toEqual(["interactive", "sweep"]);
});

test("WORKLOAD_RESUME_POLICIES is exactly [idempotent-restart, checkpointed, none]", () => {
  expect(WORKLOAD_RESUME_POLICIES).toEqual(["idempotent-restart", "checkpointed", "none"]);
});

const LANE_SEEN: Record<WorkloadLane, true> = { interactive: true, sweep: true };
test("WorkloadLane has no member beyond the tuple", () => {
  expect(Object.keys(LANE_SEEN).sort()).toEqual(WORKLOAD_LANES.toSorted());
});

const RESUME_SEEN: Record<WorkloadResumePolicy, true> = {
  "idempotent-restart": true,
  checkpointed: true,
  none: true,
};
test("WorkloadResumePolicy has no member beyond the tuple", () => {
  expect(Object.keys(RESUME_SEEN).sort()).toEqual(WORKLOAD_RESUME_POLICIES.toSorted());
});

// ── The WorkloadMode axis + the per-kind MODE POLICY map (WORKLOAD_KIND_MODES) — the ONE declarative home ─
test("WORKLOAD_MODES is exactly [singular, bulk]", () => {
  expect(WORKLOAD_MODES).toEqual(["singular", "bulk"]);
  expect(workloadModeSchema.options).toEqual(WORKLOAD_MODES);
});

// The FULL classification, pinned. SWEEP-kinds = both modes, no bulk target; CREATE-kind (import-st) = both,
// bulk REQUIRES a target; BULK-ONLY = the global rollup/catalog/corpus analytics; stubs = bulk-only
// (fail-closed owner-only) until their real runner lands + is re-classified.
test("WORKLOAD_KIND_MODES classifies every kind to its expected mode policy", () => {
  const sweepBoth: WorkloadModePolicy = {
    singular: true,
    bulk: true,
    bulkRequiresTarget: false,
    stub: false,
  };
  const createBoth: WorkloadModePolicy = {
    singular: true,
    bulk: true,
    bulkRequiresTarget: true,
    stub: false,
  };
  // BUILT bulk-only (a genuinely-global pass) vs a not-yet-built STUB — same mode shape, split by `stub`.
  const bulkOnlyBuilt: WorkloadModePolicy = {
    singular: false,
    bulk: true,
    bulkRequiresTarget: false,
    stub: false,
  };
  const bulkOnlyStub: WorkloadModePolicy = {
    singular: false,
    bulk: true,
    bulkRequiresTarget: false,
    stub: true,
  };
  // SINGULAR-ONLY built: a per-owner run with no bulk mode (the workload-backed bundle import — one user's
  // upload for themselves, never an all-owners sweep or a mint-into-X).
  const singularOnlyBuilt: WorkloadModePolicy = {
    singular: true,
    bulk: false,
    bulkRequiresTarget: false,
    stub: false,
  };
  const expected: Record<WorkloadKind, WorkloadModePolicy> = {
    index: sweepBoth,
    "distill-characters": sweepBoth,
    "compute-themes": sweepBoth,
    "memory-backfill": sweepBoth,
    "group-character-backfill": sweepBoth,
    "compute-cooccurrence": bulkOnlyBuilt,
    "find-duplicates": sweepBoth,
    csls: sweepBoth,
    "assets-backfill": sweepBoth,
    "assets-gc": bulkOnlyBuilt,
    "assets-fsck": bulkOnlyBuilt,
    "import-st": createBoth,
    "import-bundle": singularOnlyBuilt,
    "reconcile-stats": sweepBoth,
    "refresh-model-catalog": bulkOnlyBuilt,
    "reconcile-world-state": bulkOnlyStub,
    // DBK-B(a): singular+bulk BUILT — compose enqueues `databank-ingest`/`databank-reindex` in
    // mode:"singular" off upload/reindex, and the embed-model change enqueues a bulk `databank-reindex` sweep.
    "databank-ingest": sweepBoth,
    "databank-reindex": sweepBoth,
    // The library score sweep: MY cards (singular) or every owner's (bulk); each card carries its own
    // owner FK, so bulk designates no mint target.
    "refine-score-sweep": sweepBoth,
  };
  expect(WORKLOAD_KIND_MODES).toEqual(expected);
});

test("every kind supports at least one mode + only import-st requires a bulk target", () => {
  for (const kind of WORKLOAD_KINDS) {
    const policy = WORKLOAD_KIND_MODES[kind];
    // A kind with NO supported mode would be unstartable — every kind must allow singular OR bulk.
    expect(policy.singular || policy.bulk).toBe(true);
    // A bulk target only makes sense for a bulk-capable kind (an implication, no conditional expect).
    expect(!policy.bulkRequiresTarget || policy.bulk).toBe(true);
  }
  // import-st is the ONLY create-kind (bulk mints owner-owned rows → needs a target).
  const needsTarget = WORKLOAD_KINDS.filter((k) => WORKLOAD_KIND_MODES[k].bulkRequiresTarget);
  expect(needsTarget).toEqual(["import-st"]);
});
