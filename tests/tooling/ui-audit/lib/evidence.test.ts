// The evidence gaps that turn a design-audit run into an INSTRUMENT failure instead of a verdict
// (tooling/src/ui-audit/lib/evidence.ts). The census and reach arms are exercised end-to-end in
// tests/tooling/ui-audit/cli.int.test.ts; this file pins the READINESS arm's pure verdict, whose whole job
// is to be true when the two count-based arms cannot see the problem.

import type { SettingsShimEvidence } from "../../../../tooling/src/_shared/appearance.ts";
import type { DomPopulation, ThemeRenderInput } from "../../../../tooling/src/ui-audit/index.ts";
import { censusThinGap, readinessGap, themeProvenanceGap } from "../../../../tooling/src/ui-audit/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

function population(duringWalk: number, settled: number, stabilized = true): DomPopulation {
  const documentHead = Math.min(2, duringWalk);
  return {
    duringWalk,
    settled,
    stabilized,
    accounting: {
      observed: settled,
      settled: duringWalk,
      stabilized,
      settleMutations: 0,
      walked: duringWalk - documentHead,
      skipped: { documentHead, devChrome: 0 },
      inaccessible: 0,
      final: duringWalk,
      added: 0,
      detached: 0,
      walkMutations: 0,
    },
  };
}

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
  const gap = censusThinGap(population(34, 1421));
  expect(gap?.evidence).toContain("completeness");
  expect(gap?.detail).toContain("34");
  expect(gap?.detail).toContain("1421");
  expect(gap?.detail, "the operator needs the remedy, not just the diagnosis").toContain("Re-run");
});

// @instrument-absence-proof: #976's live Light-theme receipt was 285 at the judged walk and 381 once the
// real settings/theme reads finished. The old 1.5x tolerance returned null because 381/285 = 1.337, even
// though 96 final subjects were never judged. Exact accounting cannot have an "incidental" missing class.
test("the reproduced 285/381 Light-theme omission is an evidence gap", () => {
  const gap = censusThinGap(population(285, 381));

  expect(gap?.evidence).toContain("completeness");
  expect(gap?.detail).toContain("285");
  expect(gap?.detail).toContain("381");
});

test("a count still moving at the ceiling says its figure is a FLOOR", () => {
  expect(censusThinGap(population(20, 900, false))?.detail).toContain("floor");
});

test("a settled surface is no gap — the fence does not refuse every run", () => {
  expect(censusThinGap(population(1421, 1421))).toBeNull();
});

test("even a small unexplained late mount is a gap — every settled subject needs an accounting class", () => {
  expect(censusThinGap(population(1400, 1456))).not.toBeNull();
  expect(censusThinGap(population(6, 12))).not.toBeNull();
});

test("an unexplained shrink is a gap too — detachment can invalidate selectors and rendered facts", () => {
  expect(censusThinGap(population(900, 400))).not.toBeNull();
});

test("no population reading at all is no gap — a nav error reports as itself", () => {
  expect(censusThinGap(null)).toBeNull();
});

const LIGHT_RENDER: ThemeRenderInput = {
  rootDataTheme: "light",
  shellScope: { present: true, inlineBackground: null, colorScheme: "light" },
  subjectSources: { default: 2, seed: 98, custom: 0, unknown: 0 },
  subjectPolarities: { light: 100, dark: 0, mixed: 0, unknown: 0 },
};
const LIGHT_SHIM: SettingsShimEvidence = {
  appearanceApplied: null,
  themeApplied: true,
  themeResolution: { request: "Light", id: "theme_light", name: "Light", source: "seed" },
  themeCatalog: [],
};

test("requested, catalog-resolved, rendered Light with whole-subject polarity is proven", () => {
  expect(themeProvenanceGap("Light", LIGHT_SHIM, LIGHT_RENDER, 100)).toBeNull();
});

test("a planted requested-vs-rendered mismatch is a provenance gap", () => {
  const mochaRender = { ...LIGHT_RENDER, rootDataTheme: "mocha" };
  const gap = themeProvenanceGap("Light", LIGHT_SHIM, mochaRender, 100);

  expect(gap?.evidence).toContain("provenance");
  expect(gap?.detail).toContain("Light");
  expect(gap?.detail).toContain("mocha");
});

test("unknown catalog source and unknown subject polarity are never inferred", () => {
  const unknownShim: SettingsShimEvidence = {
    ...LIGHT_SHIM,
    themeResolution: { request: "Light", id: "theme_light", name: "Light", source: "unknown" },
  };
  const unknownRender: ThemeRenderInput = {
    ...LIGHT_RENDER,
    subjectPolarities: { light: 99, dark: 0, mixed: 0, unknown: 1 },
  };
  expect(themeProvenanceGap("Light", unknownShim, unknownRender, 100)?.detail).toContain("unknown");
});
