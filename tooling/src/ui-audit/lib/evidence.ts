// ZERO HYGIENE (#409) — design-audit's half of the fleet rule in _shared/evidence.ts (read that first).
//
// Every check family here is a fold over a sample list, so an EMPTY walk folds to zero findings and the
// report prints "no findings — clean". That is the most dangerous zero in the fleet: a blank mount, a
// swallowed error boundary, or a route that rendered nothing at all audits as the cleanest page in the
// product. The census below is the denominator that verdict rests on.
import type { EvidenceGap } from "@orb/tooling/_shared/evidence";
import type { RawSamples } from "../contract/samples.ts";

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
