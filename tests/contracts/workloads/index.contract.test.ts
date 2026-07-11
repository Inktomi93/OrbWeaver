import type { WorkloadKind, WorkloadModePolicy, WorkloadStatus } from "@orb/contracts/workloads";
import {
  ACTIVE_WORKLOAD_STATUSES,
  WORKLOAD_KIND_MODES,
  WORKLOAD_KINDS,
  WORKLOAD_MODES,
  WORKLOAD_STATUSES,
  workloadKindSchema,
  workloadModeSchema,
  workloadStatusSchema,
} from "@orb/contracts/workloads";
import { expect, test } from "../../support/fixtures";

// ── The `WorkloadKind` axis (D34 — promoted to contracts so the db column derives it) ─────────────────
// The ONE home for the union (§7.5). This literal list is the pinned canonical membership; a drift here
// would mean the db enum / RUNNERS Record / tRPC wire have re-spelled it.
test("WORKLOAD_KINDS is exactly the pinned 33-member kind axis (incl. the assets GC/fsck maintenance kinds, the reserved/crew/expressions/databank stubs + the 10 rpg-* stubs)", () => {
  expect(WORKLOAD_KINDS).toEqual([
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
    "assets-gc",
    "assets-fsck",
    "import-st",
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
  ]);
  expect(workloadKindSchema.options).toEqual(WORKLOAD_KINDS);
});

test("workloadKindSchema round-trips every valid kind and rejects non-members", () => {
  for (const kind of WORKLOAD_KINDS) {
    expect(workloadKindSchema.parse(kind)).toBe(kind);
  }
  expect(workloadKindSchema.safeParse("embed").success).toBe(false);
  expect(workloadKindSchema.safeParse("reindex").success).toBe(false);
  expect(workloadKindSchema.safeParse("").success).toBe(false);
});

test("WORKLOAD_STATUSES is exactly the 7-member lifecycle tuple", () => {
  expect(WORKLOAD_STATUSES).toEqual([
    "queued",
    "running",
    "succeeded",
    "failed",
    "cancelling",
    "cancelled",
    "worker_died",
  ]);
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
  "embed-corpus": true,
  "embed-assets": true,
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
  "reconcile-stats": true,
  "refresh-model-catalog": true,
  "reconcile-world-state": true,
  "crew-lorebook-keeper": true,
  "crew-card-evolution": true,
  "crew-director": true,
  "crew-prose-audit": true,
  "expressions-sprite-sheet": true,
  "databank-ingest": true,
  "databank-reindex": true,
  "rpg-world-gen": true,
  "rpg-recap": true,
  "rpg-session-distill": true,
  "rpg-director": true,
  "rpg-lorebook-upkeep": true,
  "rpg-illustration": true,
  "rpg-npc-portrait": true,
  "rpg-scene-plan": true,
  "rpg-scene-distill": true,
  "rpg-recruit-card": true,
};
test("WorkloadKind has no member beyond the tuple", () => {
  expect(Object.keys(KIND_SEEN).sort()).toEqual([...WORKLOAD_KINDS].sort());
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
  expect(Object.keys(STATUS_SEEN).sort()).toEqual([...WORKLOAD_STATUSES].sort());
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
  const expected: Record<WorkloadKind, WorkloadModePolicy> = {
    "embed-corpus": sweepBoth,
    "embed-assets": sweepBoth,
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
    "reconcile-stats": sweepBoth,
    "refresh-model-catalog": bulkOnlyBuilt,
    "reconcile-world-state": bulkOnlyStub,
    "crew-lorebook-keeper": bulkOnlyStub,
    "crew-card-evolution": bulkOnlyStub,
    "crew-director": bulkOnlyStub,
    "crew-prose-audit": bulkOnlyStub,
    "expressions-sprite-sheet": bulkOnlyStub,
    "databank-ingest": bulkOnlyStub,
    "databank-reindex": bulkOnlyStub,
    "rpg-world-gen": bulkOnlyStub,
    "rpg-recap": bulkOnlyStub,
    "rpg-session-distill": bulkOnlyStub,
    "rpg-director": bulkOnlyStub,
    "rpg-lorebook-upkeep": bulkOnlyStub,
    "rpg-illustration": bulkOnlyStub,
    "rpg-npc-portrait": bulkOnlyStub,
    "rpg-scene-plan": bulkOnlyStub,
    "rpg-scene-distill": bulkOnlyStub,
    "rpg-recruit-card": bulkOnlyStub,
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
