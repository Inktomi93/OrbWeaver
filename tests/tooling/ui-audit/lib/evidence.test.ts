// The evidence gaps that turn a design-audit run into an INSTRUMENT failure instead of a verdict
// (tooling/src/ui-audit/lib/evidence.ts). The census and reach arms are exercised end-to-end in
// tests/tooling/ui-audit/cli.int.test.ts; this file pins the READINESS arm's pure verdict, whose whole job
// is to be true when the two count-based arms cannot see the problem.
import { censusThinGap, readinessGap } from "../../../../tooling/src/ui-audit/index.ts";
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

// ── the THIN-CENSUS arm (#808) — the fraction the three zero-arms cannot express ──────────────────

// @instrument-absence-proof: MEASURED 2026-08-29 on Settings → Plugins at 1280x2200 —
// `census=22 reached=3 findings=2 nav=OK` printed as a verdict; the identical next run censused 1421 and
// reached 126. readinessGap passes (the app HAD published data-app-ready — it is one-shot at boot, so a
// surface reached by an --actions click inherits the previous surface's settle), censusGap passes (22 ≠ 0)
// and reachGap passes (3 ≠ 0). Only the population delta names it.
test("a page that kept growing after the walk is a gap, and it NAMES both numbers", () => {
  const gap = censusThinGap({ duringWalk: 34, settled: 1421, stabilized: true });
  expect(gap?.evidence).toContain("completeness");
  expect(gap?.detail).toContain("34");
  expect(gap?.detail).toContain("1421");
  expect(gap?.detail, "the operator needs the remedy, not just the diagnosis").toContain("Re-run");
});

test("a count still moving at the ceiling says its figure is a FLOOR", () => {
  expect(censusThinGap({ duringWalk: 20, settled: 900, stabilized: false })?.detail).toContain("floor");
});

test("a settled surface is no gap — the fence does not refuse every run", () => {
  expect(censusThinGap({ duringWalk: 1421, settled: 1421, stabilized: true })).toBeNull();
});

test("incidental late mounting is no gap — a late tooltip must not refuse a real run", () => {
  // 4% growth on a real surface: a portal, a lazy image, a focus ring's helper node.
  expect(censusThinGap({ duringWalk: 1400, settled: 1456, stabilized: true })).toBeNull();
  // …and the ABSOLUTE floor: a tiny fixture page where a handful of nodes is a big ratio.
  expect(censusThinGap({ duringWalk: 6, settled: 12, stabilized: true })).toBeNull();
});

test("a SHRINKING page is no gap — the walk saw more than remains, not less", () => {
  // The boot veil unmounting (~300 strands) is the standing case; only growth means the census missed
  // content, and refusing on shrink would red every run that audits a page right after its splash exits.
  expect(censusThinGap({ duringWalk: 900, settled: 400, stabilized: true })).toBeNull();
});

test("no population reading at all is no gap — a nav error reports as itself", () => {
  expect(censusThinGap(null)).toBeNull();
});
