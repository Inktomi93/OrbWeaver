// Queue output preserves the clean per-kind contract and keeps corrupt stored rows explicitly poison.

import type { WorkloadRowAnyKind } from "@orb/contracts/workloads";
import { WORKLOAD_KINDS, workloadRowAnyKindSchema, workloadRunnableRowSchema, workloadScheduleViewSchema } from "@orb/contracts/workloads";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "../../support/fixtures.ts";

const row = {
  id: mintTypeId(ID_PREFIX.workload),
  status: "succeeded",
  mode: "singular",
  lane: "sweep",
  ownerId: null,
  dependsOn: null,
  error: null,
  progress: { message: "indexed", current: 2, total: 2, pct: 100 },
  scheduledAt: 1,
  createdAt: 1,
  updatedAt: 2,
  kind: "index",
  params: { source: "text" },
  result: { embedded: 2, skipped: 0 },
  poison: false,
} satisfies WorkloadRowAnyKind;

test("clean workload output preserves a correlated result and rejects wrong-kind or private payloads", () => {
  expect(workloadRowAnyKindSchema.parse(row)).toEqual(row);
  expect(workloadRowAnyKindSchema.safeParse({ ...row, params: {} }).success).toBe(false);
  expect(workloadRowAnyKindSchema.safeParse({ ...row, result: { scanned: 2, written: 2 } }).success).toBe(false);
  expect(workloadRowAnyKindSchema.safeParse({ ...row, result: { ...row.result, privateCandidateIds: ["secret"] } }).success).toBe(false);
  expect(workloadRowAnyKindSchema.safeParse({ ...row, params: { ...row.params, privateJobSecret: "secret" } }).success).toBe(false);
});

test("poison is a visible corrupt-params arm, never a loophole for a clean row", () => {
  const poison = { ...row, poison: true, params: null, result: { oldBuildPayload: ["retained"] } } satisfies WorkloadRowAnyKind;
  expect(workloadRowAnyKindSchema.parse(poison)).toEqual(poison);
  expect(workloadRowAnyKindSchema.safeParse({ ...poison, poison: false }).success).toBe(false);
  expect(workloadRowAnyKindSchema.safeParse({ ...poison, params: { source: "text" } }).success).toBe(false);
});

test("every declared workload kind has exactly one clean output arm and deploy-skew kinds refuse", () => {
  expect(workloadRunnableRowSchema.options.map((option) => option.shape.kind.value)).toEqual(WORKLOAD_KINDS);
  expect(workloadRowAnyKindSchema.safeParse({ ...row, kind: "new-unregistered-kind" }).success).toBe(false);
  expect(workloadRowAnyKindSchema.safeParse({ ...row, kind: "new-unregistered-kind", poison: true, params: null }).success).toBe(false);
});

test("schedule output preserves stored params rather than pretending they are a clean run", () => {
  const schedule = {
    id: mintTypeId(ID_PREFIX.workloadSchedule),
    ownerId: "scheduler",
    kind: "index",
    mode: "singular",
    params: { source: "old-build-source" },
    cadence: "daily",
    nextRunAt: 2,
    lastRunAt: null,
    enabled: true,
    createdAt: 1,
    updatedAt: 1,
  };
  expect(workloadScheduleViewSchema.parse(schedule)).toEqual(schedule);
  expect(workloadScheduleViewSchema.safeParse({ ...schedule, privateLease: 7 }).success).toBe(false);
});

// Rows written before imports carried a memory scope stay readable: a stored result or params blob is what it is,
// and one old row must never fail the whole Jobs list.
test("stored import and memory rows from before the memory scope still parse, as having no scope", () => {
  const bundle = { ...row, kind: "import-bundle", params: { token: "import-bundle-x.zip" }, result: { imported: 3, skipped: 0, failed: 0, notes: [] } };
  const profile = { ...row, kind: "import-st", params: {}, result: { scanned: 9, changed: 4, dryRun: false, failed: 0 } };
  const memory = {
    ...row,
    kind: "memory-backfill",
    params: {},
    result: { segments: { scanned: 1, changed: 1 }, digests: { scanned: 1, changed: 1 }, segmentsSkippedOverWindow: 0, failed: 0 },
  };

  expect(workloadRowAnyKindSchema.parse(bundle)).toMatchObject({ poison: false, result: { imported: 3, memoryScope: null } });
  expect(workloadRowAnyKindSchema.parse(profile)).toEqual(profile);
  expect(workloadRowAnyKindSchema.parse(memory)).toEqual(memory);
});

// A stored scope is read for what it is: a coherence refine here would brick a row on read, so an inverted span
// stored by a clock that stepped back still lists. Input refuses it (`memoryBackfillWorkloadParams`).
test("a stored inverted import span still parses on read", () => {
  const bundle = {
    ...row,
    kind: "import-bundle",
    params: { token: "import-bundle-x.zip" },
    result: { imported: 1, skipped: 0, failed: 0, notes: [], memoryScope: { from: 9, to: 1 } },
  };
  expect(workloadRowAnyKindSchema.parse(bundle)).toMatchObject({ poison: false, result: { memoryScope: { from: 9, to: 1 } } });
});
