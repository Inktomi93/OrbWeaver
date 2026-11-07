// The core-capture reader accepts every page-error population the writer can publish. The writer reads the
// ring's own retention receipt, so a ring that evicted rows, or filed no receipt, still produces a valid
// artifact; the reader must keep the retained findings and report the population's real completeness.

import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { aggregateScope, artifactRef, exactScope } from "@orb/tooling/floor/artifacts/artifact-scope";
import { BoundedEvidenceRing, BROWSER_EVIDENCE_SOURCES, retentionBatch } from "@orb/tooling/floor/browser/browser-evidence-ring";
import type { SnapRunArtifact } from "../../../../tooling/src/snap/contract/run-index.ts";
import { coreFindingDrafts } from "../../../../tooling/src/snap/lib/run-finding-browser.ts";
import { summarizePageErrorRetention } from "../../../../tooling/src/snap/ops/manifest.ts";

function pageErrorRing(capacity: number, pushes: number): BoundedEvidenceRing<{ readonly message: string }> {
  const ring = new BoundedEvidenceRing<{ readonly message: string }>(capacity);
  for (let index = 0; index < pushes; index += 1) {
    ring.push({ message: `page-error-${String(index)}` }, exactScope(0, 0, 0));
  }
  return ring;
}

function retention(ring: BoundedEvidenceRing<{ readonly message: string }> | null): ReturnType<typeof summarizePageErrorRetention> {
  return summarizePageErrorRetention(retentionBatch(ring === null ? [] : [...ring.receipts(BROWSER_EVIDENCE_SOURCES.pageErrors)]));
}

type PageErrorPopulation = Readonly<Record<string, unknown>>;

/** A core-capture artifact whose page-error population is whatever `population` says over `retained` rows. */
async function coreArtifact(scratch: string, retained: number, population: PageErrorPopulation): Promise<SnapRunArtifact> {
  const path = join(scratch, "core-capture.json");
  await writeFile(
    path,
    JSON.stringify({
      v: 1,
      populations: {
        pageErrors: { records: retained, basis: "all-observed", ...population },
        failedRequests: { records: 0, dropped: null, complete: false, basis: "latest-per-url" },
        captures: { records: 0, dropped: 0, complete: true, basis: "all-pages" },
      },
      failures: {},
      pageErrors: Array.from({ length: retained }, (_, index) => ({ kind: "runtime", name: null, message: `page-error-${String(index)}`, stack: null })),
      failedRequests: [],
      captures: [],
    }),
  );
  return {
    path,
    relativePath: artifactRef("evidence/core-capture.json"),
    bytes: 0,
    producer: "snap",
    producerArm: "app-snapshot",
    channel: "core-capture",
    mediaType: "application/json",
    schema: "snap-core-capture-v1",
    role: "primary",
    completeness: "bounded",
    scope: aggregateScope(),
  };
}

test("a complete page-error population keeps its findings and reads as complete", async ({ scratch }) => {
  const writer = retention(pageErrorRing(8, 5));
  const drafts = await coreFindingDrafts([await coreArtifact(scratch, 5, writer)], []);
  expect(drafts).toHaveLength(5);
  expect(drafts.map((draft) => draft.completeness)).toEqual(["complete", "complete", "complete", "complete", "complete"]);
});

test("a ring that evicted rows keeps the retained findings and reads as bounded", async ({ scratch }) => {
  const writer = retention(pageErrorRing(3, 5));
  expect(writer).toMatchObject({ dropped: 2, complete: false });
  const drafts = await coreFindingDrafts([await coreArtifact(scratch, 3, writer)], []);
  expect(drafts.map((draft) => draft.what)).toEqual(["Error: page-error-0", "Error: page-error-1", "Error: page-error-2"]);
  expect(drafts.map((draft) => draft.completeness)).toEqual(["bounded", "bounded", "bounded"]);
});

test("a population the ring never measured keeps its findings and reads as incomplete", async ({ scratch }) => {
  const writer = retention(null);
  expect(writer).toMatchObject({ dropped: 0, complete: false });
  const drafts = await coreFindingDrafts([await coreArtifact(scratch, 2, writer)], []);
  expect(drafts).toHaveLength(2);
  expect(drafts.map((draft) => draft.completeness)).toEqual(["incomplete", "incomplete"]);
});

test("a page-error receipt no writer could publish is a malformed artifact", async ({ scratch }) => {
  const impossible: readonly PageErrorPopulation[] = [
    { dropped: 2, complete: true },
    { dropped: -1, complete: false },
    { dropped: 1.5, complete: false },
    { dropped: null, complete: false },
    { dropped: 0, complete: "yes" },
    { dropped: 0, complete: true, basis: "latest-per-url" },
    { dropped: 0, complete: true, records: 9 },
  ];
  for (const population of impossible) {
    const drafts = await coreFindingDrafts([await coreArtifact(scratch, 1, population)], []);
    expect(drafts, JSON.stringify(population)).toHaveLength(1);
    expect(drafts[0]?.what, JSON.stringify(population)).toBe("structured evidence is malformed");
    expect(drafts[0]?.conflicts[0], JSON.stringify(population)).toContain("completeness receipt");
  }
});
