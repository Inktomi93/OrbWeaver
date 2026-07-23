import type { WorkloadKind, WorkloadModePolicy, WorkloadStatus } from "@orb/contracts/workloads";
import {
  ACTIVE_WORKLOAD_STATUSES,
  INDEX_SOURCES,
  indexSourceSchema,
  NON_INDEX_SOURCE,
  WORKLOAD_KIND_MODES,
  WORKLOAD_KINDS,
  WORKLOAD_MODES,
  WORKLOAD_SOURCES,
  WORKLOAD_STATUSES,
  workloadKindSchema,
  workloadModeSchema,
  workloadStatusSchema,
} from "@orb/contracts/workloads";
import { expect, test } from "../../support/fixtures";

// ── The `WorkloadKind` axis (D34 — promoted to contracts so the db column derives it) ─────────────────
// The ONE home for the union (§7.5). This literal list is the pinned canonical membership; a drift here
// would mean the db enum / RUNNERS Record / tRPC wire have re-spelled it.
test("WORKLOAD_KINDS is exactly the pinned 33-member kind axis (the parameterized `index` reindex, the assets GC/fsck maintenance kinds, the workload-backed import-bundle, the reserved/crew/expressions/databank stubs + the 10 rpg-* stubs)", () => {
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

// ── The `index` SOURCE axis (the WorkloadKind-scoped param + the single-active LOCK sub-dimension) ──────
test("INDEX_SOURCES is [text, image, all]; WORKLOAD_SOURCES prepends the `none` non-index sentinel", () => {
  expect(INDEX_SOURCES).toEqual(["text", "image", "all"]);
  expect(indexSourceSchema.options).toEqual(INDEX_SOURCES);
  expect(WORKLOAD_SOURCES).toEqual(["none", "text", "image", "all"]);
  // The sentinel is a real WORKLOAD_SOURCES member but NOT a selectable index source.
  expect(NON_INDEX_SOURCE).toBe("none");
  expect(WORKLOAD_SOURCES).toContain(NON_INDEX_SOURCE);
  expect(INDEX_SOURCES).not.toContain(NON_INDEX_SOURCE);
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
    // CW2/CW3/CW4/CW5: the real keeper/card-evolution/director/prose-audit runners — singular-per-chat on the
    // host, no bulk sweep (chat-crew-design/08 CC-C). All four flipped from their CW1 stubs.
    "crew-lorebook-keeper": singularOnlyBuilt,
    "crew-card-evolution": singularOnlyBuilt,
    "crew-director": singularOnlyBuilt,
    "crew-prose-audit": singularOnlyBuilt,
    // E4: the real sprite-sheet runner — a per-character generation an OWNER triggers for their own character,
    // enqueued singular (compose `mode:"singular"`), no bulk sweep. Flipped from its `bulk+stub` mislabel.
    "expressions-sprite-sheet": singularOnlyBuilt,
    // DBK-B(a): flipped to singular+bulk BUILT — compose enqueues `databank-ingest`/`databank-reindex` in
    // mode:"singular" off upload/reindex, and the embed-model change enqueues a bulk `databank-reindex` sweep.
    "databank-ingest": sweepBoth,
    "databank-reindex": sweepBoth,
    // R6: the real world-gen/recap/session-distill runners — singular-per-game on the host, no bulk sweep
    // (rpg-design/10 R6). Flipped from their stubs.
    "rpg-world-gen": singularOnlyBuilt,
    "rpg-recap": singularOnlyBuilt,
    "rpg-session-distill": singularOnlyBuilt,
    // R7: the real director + lorebook-upkeep runners — singular-per-game on the host (rpg-design/10 R7).
    "rpg-director": singularOnlyBuilt,
    "rpg-lorebook-upkeep": singularOnlyBuilt,
    // R9/R10: the real image + scene/recruit runners — singular-per-game/owner on the host, no bulk sweep
    // (rpg-design/10 §R9/§R10). Flipped from their stubs once the runner bodies + tests landed.
    "rpg-illustration": singularOnlyBuilt,
    "rpg-npc-portrait": singularOnlyBuilt,
    "rpg-scene-plan": singularOnlyBuilt,
    "rpg-scene-distill": singularOnlyBuilt,
    "rpg-recruit-card": singularOnlyBuilt,
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
