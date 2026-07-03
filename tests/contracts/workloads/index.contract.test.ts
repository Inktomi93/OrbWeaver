import type { WorkloadKind, WorkloadStatus } from "@orb/contracts/workloads";
import {
  ACTIVE_WORKLOAD_STATUSES,
  WORKLOAD_KINDS,
  WORKLOAD_STATUSES,
  workloadKindSchema,
  workloadStatusSchema,
} from "@orb/contracts/workloads";
import { expect, test } from "../../support/fixtures";

// ── The `WorkloadKind` axis (D34 — promoted to contracts so the db column derives it) ─────────────────
// The ONE home for the union (§7.5). This literal list is the pinned canonical membership; a drift here
// would mean the db enum / RUNNERS Record / tRPC wire have re-spelled it.
test("WORKLOAD_KINDS is exactly the pinned 14-member kind axis (incl. reserved reconcile-world-state)", () => {
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
    "import-st",
    "reconcile-stats",
    "refresh-model-catalog",
    "reconcile-world-state",
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
  "import-st": true,
  "reconcile-stats": true,
  "refresh-model-catalog": true,
  "reconcile-world-state": true,
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
