// @instrument-proof: the core-capture manifest's page-error population is DERIVED from the ring's own
// retention receipt, in both directions and in the un-measured case.
// @instrument-absence-proof: a run that filed no page-error receipt may not report a clean, complete zero —
// "we never measured" is not "nothing was dropped".
//
// #1507: `writeCoreCaptureEvidence` used to publish `pageErrors: { dropped: 0, complete: true }` as a
// LITERAL, over a `BoundedEvidenceRing` that has always counted its own evictions per scope. The lie only
// showed up once the evidence mattered — a run noisy enough to overflow the ring is exactly the run whose
// missing page errors change the verdict. The receipts below come from the REAL ring, not hand-built JSON,
// so the pin dies if the ring's accounting changes shape (it emits `[aggregate, ...per-scope]`, which is
// why the summarizer counts aggregates only — summing every row double-counts every eviction).
import { exactScope } from "@orb/tooling/_shared/artifact-scope";
import { BoundedEvidenceRing, BROWSER_EVIDENCE_SOURCES, retentionBatch } from "@orb/tooling/_shared/browser-evidence-ring";
import { summarizePageErrorRetention } from "../../../../tooling/src/snap/ops/manifest.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

/** A page-error ring driven past `capacity`, so its receipts carry a REAL drop count. */
function pageErrorRing(capacity: number, pushes: number, context = 0): BoundedEvidenceRing<{ readonly message: string }> {
  const ring = new BoundedEvidenceRing<{ readonly message: string }>(capacity);
  for (let index = 0; index < pushes; index += 1) {
    ring.push({ message: `page-error-${String(index)}` }, exactScope(context, 0, 0));
  }
  return ring;
}

function pageErrorBatch(...rings: readonly BoundedEvidenceRing<{ readonly message: string }>[]): ReturnType<typeof retentionBatch> {
  return retentionBatch(rings.flatMap((ring) => [...ring.receipts(BROWSER_EVIDENCE_SOURCES.pageErrors)]));
}

test("an evicting page-error ring reports its real drop count, never 0/complete (#1507)", () => {
  expect(summarizePageErrorRetention(pageErrorBatch(pageErrorRing(3, 5)))).toEqual({ dropped: 2, complete: false, rows: 1 });
});

test("a below-capacity ring is complete with zero dropped (#1507 positive control)", () => {
  expect(summarizePageErrorRetention(pageErrorBatch(pageErrorRing(8, 5)))).toEqual({ dropped: 0, complete: true, rows: 1 });
});

test("EVERY context must be complete — one evicting ring sinks the population (#1507)", () => {
  const summary = summarizePageErrorRetention(pageErrorBatch(pageErrorRing(8, 1), pageErrorRing(2, 5, 1)));
  expect(summary).toEqual({ dropped: 3, complete: false, rows: 2 });
});

test("only the PAGE-ERROR source counts — a lossy console ring never speaks for it (#1507)", () => {
  const consoleRing = new BoundedEvidenceRing<{ readonly text: string }>(2);
  for (let index = 0; index < 6; index += 1) {
    consoleRing.push({ text: `log-${String(index)}` }, exactScope(0, 0, 0));
  }
  const batch = retentionBatch([
    ...consoleRing.receipts(BROWSER_EVIDENCE_SOURCES.console),
    ...pageErrorRing(8, 1).receipts(BROWSER_EVIDENCE_SOURCES.pageErrors),
  ]);
  expect(summarizePageErrorRetention(batch)).toEqual({ dropped: 0, complete: true, rows: 1 });
});

test("NO page-error receipt is 'not measured', not a clean population (#1507 loud refusal)", () => {
  // The failure mode the hardcoded literal hid: nothing filed a receipt, so the writer has nothing to
  // report — which must read as INCOMPLETE, and the artifact's completenessDetail then says so.
  expect(summarizePageErrorRetention(retentionBatch([]))).toEqual({ dropped: 0, complete: false, rows: 0 });
});
