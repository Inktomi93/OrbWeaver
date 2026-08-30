// ZERO HYGIENE (#409) — design-audit's half of the fleet rule in _shared/evidence.ts (read that first).
//
// Every check family here is a fold over a sample list, so an EMPTY walk folds to zero findings and the
// report prints "no findings — clean". That is the most dangerous zero in the fleet: a blank mount, a
// swallowed error boundary, or a route that rendered nothing at all audits as the cleanest page in the
// product. The census below is the denominator that verdict rests on.
import type { EvidenceGap } from "@orb/tooling/_shared/evidence";
import type { RawSamples } from "../contract/samples.ts";
import type { DomPopulation } from "../contract/types.ts";
import { THIN_CENSUS_GROWTH_RATIO, THIN_CENSUS_MIN_GROWTH } from "./budgets.ts";

/** How many nodes the in-page walk actually censused, across every family it collects. This is the
 *  number the RESULT line publishes as `census=` — a clean verdict with `census=0` is not a verdict. */
export function censusTotal(samples: RawSamples): number {
  return (
    samples.texts.length +
    samples.textStyles.length +
    samples.images.length +
    samples.tapTargets.length +
    samples.accessibleNames.length +
    samples.headings.length +
    samples.tabIndexes.length +
    samples.zIndexes.length +
    (samples.actionDoors?.length ?? 0) +
    (samples.controlAspects?.length ?? 0)
  );
}

/** The walk itself failing is an INSTRUMENT failure, not an app finding — separated from an HTTP nav
 *  error (which IS a real defect of the page and stays a violation). ops/drive.ts folds both into
 *  `navError`, so the discriminator is the prefix it stamps on the thrown arm. */
export const SAMPLE_COLLECTION_PREFIX = "sample collection threw";

export function walkFailureGap(navError: string): EvidenceGap {
  return {
    evidence: "the in-page node walk",
    detail: `${navError} — no sample of any kind was collected, so every check family below would fold an empty list into "no findings"`,
  };
}

/** The REACH gap (#653): the page offered controls and the viewport-bound censuses reached NONE of them.
 *
 *  `censusGap` above catches a walk that saw nothing at all. This catches its narrower, nastier sibling —
 *  a page whose text census is fat (so `census=` looks healthy and the run reads clean) while every
 *  tap-target, action-door and silhouette verdict rests on an empty list. That is the exact shape #653 was
 *  filed for, one step past the point where a reveal sweep can rescue it: if not one offered control could
 *  be brought into view, the reveal is broken or the surface is entirely off-canvas, and either way the
 *  three families' silence is a statement about the probe. Returns null when the census reached anything —
 *  a PARTIAL miss is a printed denominator (ops/report.ts printCensusReach), not an instrument failure. */
export function reachGap(samples: RawSamples): EvidenceGap | null {
  const reach = samples.censusReach;
  if (reach === undefined || reach.offered === 0 || reach.onScreen + reach.revealed > 0) {
    return null;
  }
  return {
    evidence: "the interactive census's viewport reach",
    detail: `${reach.offered} offered control(s) were found and NONE could be measured in the viewport (${reach.revealScrolls} reveal scroll(s)${reach.budgetExhausted ? ", budget exhausted" : ""}) — the tap-target, action-door and silhouette families each folded an empty list into "no findings", so a clean verdict here would describe an unreachable surface, not a correct one`,
  };
}

/** THE READINESS GAP (#678). The `html[data-app-ready]` wait is deliberately graceful — a `file://`
 *  fixture page is a legitimate audit target and never runs the app. But on an APP ORIGIN that grace is a
 *  false-clean generator: when the app never mounts (a vite dep-optimizer 504 on a cold isolated stage, a
 *  half-booted dev stack, a route that threw before hydration) the walk censuses the SHELL — measured on the
 *  #678 receipt run: 14 nodes and one reachable control, `findings=0`, exit 0, on a tree carrying a planted
 *  1:1 contrast defect that the same command REDed on once the app was actually up (census 332). Fourteen is
 *  not zero and one is not zero, so neither `censusGap` nor `reachGap` catches it — the discriminator has to
 *  be the READINESS SIGNAL ITSELF, which the app publishes exactly for this purpose.
 *
 *  Returns null for a file:// target (no app is expected) and for a page that announced itself ready. */
export function readinessGap(url: string, appReady: boolean): EvidenceGap | null {
  if (appReady || url.startsWith("file://")) {
    return null;
  }
  return {
    evidence: "the app-readiness signal",
    detail: `${url} never published html[data-app-ready] — the app did not mount, so the walk censused the shell around it and every check family folded a near-empty list into "no findings". On an isolated stage this is usually a COLD vite (re-run against the now-warm stage); on the dev stack it means the app is broken, which is a finding for a human, not a clean audit`,
  };
}

/** THE THIN-CENSUS GAP (#808) — the arm every other one here is structurally blind to.
 *
 *  MEASURED 2026-08-29 on Settings -\> Plugins at 1280x2200: `census=22 reached=3 findings=2 nav=OK`, a
 *  clean-looking verdict; the identical next command censused 1421 and reached 126. Nothing above fires on
 *  that run — the app HAD published `data-app-ready` (so `readinessGap` passes), 22 is not 0 (so
 *  `censusGap` passes) and 3 reached is not 0 (so `reachGap` passes). The false clean is not "nothing was
 *  seen", it is "a FRACTION was seen", and the three zero-arms above cannot express a fraction.
 *
 *  WHY THE READINESS SIGNAL CANNOT COVER IT: `data-app-ready` is ONE-SHOT and fires at BOOT
 *  (packages/client/src/lib/agent-bridge.ts installAppReadySignal resolves a single Promise). A surface
 *  reached by a post-boot navigation or an `--actions` click therefore carries a readiness flag that was
 *  earned by a DIFFERENT surface, while its own reads are still in flight — which is exactly the run above.
 *
 *  So the denominator is MEASURED instead of assumed: ops/drive.ts brackets the walk with two element
 *  counts and then watches the count until it stops changing. A page that keeps growing after the census
 *  was taken rendered content the census could not have judged, and the size of that growth is the size of
 *  the lie. No persisted baseline (which would be absent on a fresh clone — the floor missing exactly when
 *  it is most needed) and no per-surface calibration: the surface states its own population, twice.
 *
 *  Returns null when the growth is incidental (below THIN_CENSUS_GROWTH_RATIO or fewer than
 *  THIN_CENSUS_MIN_GROWTH elements) — a late tooltip or a lazy image must never refuse a real run. */
export function censusThinGap(population: DomPopulation | null): EvidenceGap | null {
  if (population === null) {
    return null;
  }
  const { duringWalk, settled, stabilized } = population;
  const growth = settled - duringWalk;
  if (growth < THIN_CENSUS_MIN_GROWTH || settled < duringWalk * THIN_CENSUS_GROWTH_RATIO) {
    return null;
  }
  const floorNote = stabilized ? "" : " (and it was STILL growing at the ceiling, so that figure is a floor)";
  return {
    evidence: "the node census's completeness",
    detail: `the page held ${duringWalk} element(s) while the walk censused it and ${settled}${floorNote} once it stopped changing — the surface was still rendering, so the census measured a FRACTION of it and every check family folded the missing part into "no findings". A readiness flag does not cover this: it is one-shot at boot, so a route reached by a navigation or an --actions click carries the previous surface's settle. Re-run the SAME command (the surface is warm now), or raise --wait if this route is genuinely slow to fill`,
  };
}

/** WHY an empty census is a HARD gap rather than "the page is simply bare": the walk censuses text,
 *  styles, images, tap targets, accessible names, headings, tab indexes and z-indexes — a rendered app
 *  surface cannot be empty across ALL of them. Zero means the walk saw nothing, which is a statement
 *  about the probe, not about the design. */
export function censusGap(url: string): EvidenceGap {
  return {
    evidence: "the node census",
    detail: `the walk censused 0 nodes on ${url} — the surface rendered nothing the audit can judge (blank mount / error boundary / wrong route), so "no findings" would describe an empty page, not a clean one`,
  };
}
