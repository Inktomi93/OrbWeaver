// The evidence gaps that turn a design-audit run into an INSTRUMENT failure instead of a verdict
// (tooling/src/ui-audit/lib/evidence.ts). The census and reach arms are exercised end-to-end in
// tests/tooling/ui-audit/cli.int.test.ts; this file pins the READINESS arm's pure verdict, whose whole job
// is to be true when the two count-based arms cannot see the problem.
import { readinessGap } from "../../../../tooling/src/ui-audit/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

// @instrument-absence-proof: an app origin whose app never mounted censuses the SHELL — measured on the
// #678 stage receipt: 14 nodes, 1 reachable control, `findings=0`, exit 0, over a planted 1:1 contrast
// defect the same command REDed on at census 332 once the app was up. 14 and 1 are not zero, so censusGap
// and reachGap both pass it through; the readiness signal is the only discriminator.
test("an app origin that never published data-app-ready is a gap, and it NAMES the signal", () => {
  const gap = readinessGap("http://localhost:5273/", false);
  expect(gap?.evidence).toContain("readiness");
  expect(gap?.detail, "the operator needs the remedy, not just the diagnosis").toContain("re-run");
});

test("a ready app origin is no gap — the fence does not refuse every run", () => {
  expect(readinessGap("http://localhost:5273/", true)).toBeNull();
});

test("a file:// fixture is exempt — no app is expected to mount there", () => {
  // The audit's own suite drives file:// pages that declare readiness themselves; a mock or a static
  // export legitimately has no app at all, and refusing those would delete a supported mode.
  expect(readinessGap("file:///tmp/scratch/good.html", false)).toBeNull();
});
