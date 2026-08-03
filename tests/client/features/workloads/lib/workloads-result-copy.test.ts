// Unit: the per-kind result COPY (features/workloads/lib/workloads-result-copy). Pure, no DOM — the node lane.
// The rule this file exists to hold: a succeeded row shows a SENTENCE or nothing. The pane used to print the
// stored blob verbatim (`{"models":337,"agentSdkModels":4}`), so every assertion below also asserts, by
// construction, that no `{` ever reaches the surface — the last test says so for every kind at once.

import type { WorkloadKind } from "@orb/contracts/workloads";
import { WORKLOAD_KINDS } from "@orb/contracts/workloads";
import { workloadResultSummary } from "../../../../../packages/client/src/features/workloads/lib/workloads-result-copy.ts";
import { expect, test } from "../../../../support/fixtures.ts";

test("the catalog refresh reads as counts, not as JSON — and a FAILED lane says so instead of reading as zero", () => {
  expect(workloadResultSummary("refresh-model-catalog", { models: 337, agentSdkModels: 4 })).toBe("337 models · 4 via Agent SDK");
  expect(workloadResultSummary("refresh-model-catalog", { models: 1, agentSdkModels: 0 })).toBe("1 model · 0 via Agent SDK");
  // `null` is a lane that FAILED (the run only fails when both do) — reporting it as "0 models" would be a lie.
  expect(workloadResultSummary("refresh-model-catalog", { models: null, agentSdkModels: 4 })).toBe("model list unavailable · 4 via Agent SDK");
});

test("each result shape gets its own sentence", () => {
  expect(workloadResultSummary("index", { embedded: 12, skipped: 0 })).toBe("12 embedded");
  expect(workloadResultSummary("index", { embedded: 12, skipped: 3 })).toBe("12 embedded · 3 already up to date");
  expect(workloadResultSummary("compute-themes", { scanned: 512, written: 40 })).toBe("512 rows · 40 written");
  expect(workloadResultSummary("assets-gc", { scanned: 90, changed: 2, dryRun: true })).toBe("90 items · 2 changed · dry run — nothing written");
  expect(workloadResultSummary("group-character-backfill", { scanned: 8, changed: 1 })).toBe("8 chats · 1 updated");
  expect(workloadResultSummary("memory-backfill", { segments: { scanned: 9, changed: 4 }, digests: { scanned: 9, changed: 2 }, failed: 1 })).toBe(
    "4 segments · 2 digests · 1 chat skipped",
  );
  expect(workloadResultSummary("import-bundle", { imported: 42, skipped: 0, failed: 1 })).toBe("42 imported · 1 failed");
  expect(workloadResultSummary("reconcile-stats", { owners: 1, characters: 128 })).toBe("1 owner · 128 characters");
  expect(workloadResultSummary("databank-ingest", { documents: 3, chunksUpserted: 40, chunksNoop: 2, chunksPruned: 0, reExtracted: 0, failed: [] })).toBe(
    "3 documents · 40 chunks written · 2 chunks unchanged",
  );
  // A clean integrity walk is a RESULT, not an absence — three zeroes would read as "nothing happened".
  expect(workloadResultSummary("assets-fsck", { danglingRows: 0, corruptBlobs: 0, orphanBlobs: 0 })).toBe("No faults found.");
  expect(workloadResultSummary("assets-fsck", { danglingRows: 2, corruptBlobs: 0, orphanBlobs: 1 })).toBe("2 dangling rows · 1 orphan blob");
  // An inert v2 stub reported `deferred`, which is "this pass does not exist yet", not "zero work found".
  expect(workloadResultSummary("reconcile-world-state", { deferred: true })).toBe("Nothing to do — this pass isn't implemented yet.");
});

test("no result at all renders nothing; an UNREADABLE result falls back to a sentence, never to the blob", () => {
  expect(workloadResultSummary("index", null)).toBeNull();
  expect(workloadResultSummary("index", undefined)).toBeNull();
  expect(workloadResultSummary("index", {})).toBeNull();

  // The durable `result` column outlives a shape change — a blob this build can no longer read must degrade
  // to honest copy (the poison-row posture), never to `{"legacyField":1}` on screen.
  const stale = workloadResultSummary("index", { legacyField: 1 });
  expect(stale).toBe("Finished — this run reported no readable summary.");
  expect(workloadResultSummary("memory-backfill", { segments: "gone", digests: null, failed: "?" })).toBe(stale);
});

test("EVERY kind renders human copy for a plausible result — no kind can leak JSON", () => {
  // One shape per kind is impossible to hand-write without re-spelling the contract, so this drives every kind
  // with a blob that carries every numeric field name the renderers read. What is asserted is the INVARIANT:
  // whatever comes back is prose, and `{`/`"` never appear in it.
  const everyField = {
    embedded: 1,
    skipped: 1,
    scanned: 1,
    written: 1,
    changed: 1,
    dryRun: false,
    segments: { scanned: 1, changed: 1 },
    digests: { scanned: 1, changed: 1 },
    failed: 1,
    danglingRows: 1,
    corruptBlobs: 1,
    orphanBlobs: 1,
    imported: 1,
    owners: 1,
    characters: 1,
    models: 1,
    agentSdkModels: 1,
    documents: 1,
    chunksUpserted: 1,
    chunksNoop: 1,
    chunksPruned: 1,
    reExtracted: 1,
    deferred: true,
  };
  for (const kind of WORKLOAD_KINDS as readonly WorkloadKind[]) {
    const summary = workloadResultSummary(kind, everyField) ?? "";
    expect(summary).not.toBe("");
    expect(summary).not.toContain("{");
    expect(summary).not.toContain('"');
  }
});
