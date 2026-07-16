// Unit: the Workloads pane's pure vocabulary (features/workloads/lib/workloads-model). Pure, no DOM —
// the node lane. Guards the CONTRACT-DRIVEN picker invariant: the runnable set is exactly the
// singular-capable kinds from `WORKLOAD_KIND_MODES` (the unbuilt stubs and the genuinely-bulk-only
// refresh-model-catalog are absent WITHOUT any hand-copied list — a kind flipping stub→built appears
// automatically), plus the wire assembly `buildStartInput` (params carry ONLY the kind's own tunable,
// omitted at its default) and the tab predicate's status partition.

import { WORKLOAD_KIND_MODES, WORKLOAD_KINDS, WORKLOAD_STATUSES } from "@orb/contracts/workloads";
import { friendlyWorkloadError } from "../../../../../packages/client/src/features/workloads/lib/workloads-failure-copy";
import {
  buildStartInput,
  isActiveWorkloadStatus,
  isMaintenanceWorkloadKind,
  isRetryableWorkloadStatus,
  isStartableWorkloadKind,
  MAINTENANCE_WORKLOAD_KINDS,
  RUNNABLE_WORKLOAD_KINDS,
  WORKLOAD_FILTERS,
  workloadFilterMatches,
  workloadResultPreview,
} from "../../../../../packages/client/src/features/workloads/lib/workloads-model";
import { expect, test } from "../../../../support/fixtures";

test("the runnable set is the contract's singular-capable built kinds, minus route-started import-bundle", () => {
  // Singular + built (stub:false), EXCEPT `import-bundle` — it is singular but ROUTE-started (the upload route
  // mints its staging-token param), so the picker never offers it.
  const expected = WORKLOAD_KINDS.filter((kind) => WORKLOAD_KIND_MODES[kind].singular && !WORKLOAD_KIND_MODES[kind].stub && kind !== "import-bundle");
  expect(RUNNABLE_WORKLOAD_KINDS).toEqual(expected);
  // The load-bearing exclusions as of the current contract: bulk-only stubs + the global catalog pass + the
  // route-started bundle import.
  expect(RUNNABLE_WORKLOAD_KINDS).not.toContain("refresh-model-catalog");
  expect(RUNNABLE_WORKLOAD_KINDS).not.toContain("reconcile-world-state");
  expect(RUNNABLE_WORKLOAD_KINDS).not.toContain("crew-director");
  expect(RUNNABLE_WORKLOAD_KINDS).not.toContain("import-bundle");
  expect(RUNNABLE_WORKLOAD_KINDS).toContain("index");
  expect(RUNNABLE_WORKLOAD_KINDS).toContain("import-st");
});

test("the maintenance set is the BUILT bulk-only kinds (stub:false), stubs excluded by the flag", () => {
  // Built (stub:false) + bulk-capable + NOT singular — compute-cooccurrence, the assets GC/fsck maintenance
  // kinds, and refresh-model-catalog, in WORKLOAD_KINDS order. A stub flipping built (stub→false) joins here
  // with zero client edits.
  expect([...MAINTENANCE_WORKLOAD_KINDS]).toEqual(["compute-cooccurrence", "assets-gc", "assets-fsck", "refresh-model-catalog"]);
  // No maintenance kind is singular-capable (the two sets are disjoint), none is a stub, none is runnable.
  for (const kind of MAINTENANCE_WORKLOAD_KINDS) {
    expect(WORKLOAD_KIND_MODES[kind].bulk).toBe(true);
    expect(WORKLOAD_KIND_MODES[kind].singular).toBe(false);
    expect(WORKLOAD_KIND_MODES[kind].stub).toBe(false);
    expect(RUNNABLE_WORKLOAD_KINDS).not.toContain(kind);
  }
  // The bulk-only STUBS (stub:true) are NOT surfaced as maintenance — excluded by the contract flag now.
  expect(MAINTENANCE_WORKLOAD_KINDS).not.toContain("crew-director");
  expect(MAINTENANCE_WORKLOAD_KINDS).not.toContain("reconcile-world-state");
  expect(isMaintenanceWorkloadKind("refresh-model-catalog")).toBe(true);
  expect(isMaintenanceWorkloadKind("index")).toBe(false);
  // Both groups are startable through the picker; a stub is not.
  expect(isStartableWorkloadKind("index")).toBe(true);
  expect(isStartableWorkloadKind("refresh-model-catalog")).toBe(true);
  expect(isStartableWorkloadKind("crew-director")).toBe(false);
});

test("friendlyWorkloadError maps known classes; unmapped returns null (row falls back to raw)", () => {
  // The side-eye repro — an internal model-path exception maps to a user-actionable line.
  expect(friendlyWorkloadError("Unable to get model file path or buffer.")).toBe(
    "A required local model wasn't available. Check the model is installed, then retry.",
  );
  expect(friendlyWorkloadError("ECONNREFUSED 127.0.0.1:8000")).toBe("A network or provider call failed. Check the connection, then retry.");
  expect(friendlyWorkloadError("HTTP 429 Too Many Requests")).toBe("The provider rate-limited this run. Wait a moment, then retry.");
  // Case-insensitive match.
  expect(friendlyWorkloadError("Request TIMED OUT after 30s")).not.toBeNull();
  // Nothing matches → null (the row surfaces the raw string verbatim).
  expect(friendlyWorkloadError("runtime: something weirdly specific")).toBeNull();
});

test("buildStartInput carries ONLY the kind's own tunable, omitted at its default", () => {
  const defaults = { force: false, dryRun: false, k: null, source: "all" } as const;
  // Default values → an empty params object for the tunable-precedence shapes (the runner resolves it).
  expect(buildStartInput("import-st", defaults)).toEqual({ kind: "import-st", params: {} });
  expect(buildStartInput("compute-themes", defaults)).toEqual({
    kind: "compute-themes",
    params: {},
  });
  // `index` ALWAYS carries its REQUIRED source (it stamps the single-active lock); force omitted at default.
  expect(buildStartInput("index", defaults)).toEqual({ kind: "index", params: { source: "all" } });
  // A set tunable rides — and ONLY on its own kind (stale state from a previous pick stays inert).
  const allSet = { force: true, dryRun: true, k: 12, source: "image" } as const;
  expect(buildStartInput("index", allSet)).toEqual({
    kind: "index",
    params: { source: "image", force: true },
  });
  expect(buildStartInput("import-st", allSet)).toEqual({
    kind: "import-st",
    params: { dryRun: true },
  });
  expect(buildStartInput("compute-themes", allSet)).toEqual({
    kind: "compute-themes",
    params: { k: 12 },
  });
  expect(buildStartInput("distill-characters", allSet)).toEqual({
    kind: "distill-characters",
    params: {},
  });
});

test("the filter tabs partition every status: all admits everything; running/recent/failed are disjoint", () => {
  for (const status of WORKLOAD_STATUSES) {
    expect(workloadFilterMatches("all", status)).toBe(true);
    const buckets = WORKLOAD_FILTERS.filter((filter) => filter !== "all" && workloadFilterMatches(filter, status));
    // Every status lands in exactly ONE non-all bucket — no orphan, no double-count.
    expect(buckets).toHaveLength(1);
  }
  expect(workloadFilterMatches("running", "cancelling")).toBe(true);
  expect(workloadFilterMatches("failed", "worker_died")).toBe(true);
  expect(workloadFilterMatches("recent", "cancelled")).toBe(true);
});

test("cancel/retry affordance predicates: active holds the slot; failure terminals retry", () => {
  expect(isActiveWorkloadStatus("queued")).toBe(true);
  expect(isActiveWorkloadStatus("cancelling")).toBe(true);
  expect(isActiveWorkloadStatus("succeeded")).toBe(false);
  expect(isRetryableWorkloadStatus("failed")).toBe(true);
  expect(isRetryableWorkloadStatus("cancelled")).toBe(true);
  expect(isRetryableWorkloadStatus("worker_died")).toBe(true);
  expect(isRetryableWorkloadStatus("running")).toBe(false);
});

test("workloadResultPreview: compact JSON, ellipsized past the cap, null for nothing-to-show", () => {
  expect(workloadResultPreview(null)).toBeNull();
  expect(workloadResultPreview({})).toBeNull();
  expect(workloadResultPreview({ embedded: 12 })).toBe('{"embedded":12}');
  const long = workloadResultPreview({ text: "x".repeat(500) });
  expect(long).not.toBeNull();
  expect(long?.endsWith("…")).toBe(true);
  expect(long?.length).toBeLessThanOrEqual(121);
});
