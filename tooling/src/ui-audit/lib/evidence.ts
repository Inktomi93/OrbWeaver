// ZERO HYGIENE (#409) — design-audit's half of the fleet rule in _shared/evidence.ts (read that first).
//
// Every check family here is a fold over a sample list, so an EMPTY walk folds to zero findings and the
// report prints "no findings — clean". That is the most dangerous zero in the fleet: a blank mount, a
// swallowed error boundary, or a route that rendered nothing at all audits as the cleanest page in the
// product. The census below is the denominator that verdict rests on.

import type { SettingsShimEvidence, ThemeResolutionEvidence } from "@orb/tooling/_shared/appearance";
import type { EvidenceGap } from "@orb/tooling/_shared/evidence";
import type { ThemeRequest } from "@orb/tooling/_shared/theme";
import type { RawSamples, ThemeRenderInput } from "../contract/samples.ts";
import type { RelationalSamples } from "../contract/samples-populations.ts";
import type { DomPopulation } from "../contract/types.ts";

/** Every RELATIONAL sample family, derived from the ONE contract that declares them
 *  (contract/samples-populations.ts `RelationalSamples`): the array-valued keys, which excludes
 *  `relationalAccounting` because that is the census's bookkeeping, not a censused element.
 *
 *  A mapped-type Record over that union is the enforcement (constitution §5.5): the next relational
 *  family REDs tsc here with a missing property instead of silently going uncounted, which is exactly
 *  how the whole family went uncounted in the first place. */
type RelationalSampleFamily = {
  [K in keyof RelationalSamples]-?: NonNullable<RelationalSamples[K]> extends readonly unknown[] ? K : never;
}[keyof RelationalSamples];

const RELATIONAL_SAMPLE_FAMILIES: Readonly<Record<RelationalSampleFamily, true>> = {
  cohortAnatomies: true,
  emptyStates: true,
  headlineOverhangs: true,
  inlinePaddingLeaks: true,
  paneInks: true,
  quietStates: true,
  rowVoids: true,
  selectionIdioms: true,
  tierDrifts: true,
};

// `Object.keys` widens to string[]; the record above is the exhaustive home, so the cast reads back the
// key type the map was declared with (the house idiom — snap/contract/scenario-presets.ts).
const RELATIONAL_FAMILY_KEYS = Object.keys(RELATIONAL_SAMPLE_FAMILIES) as readonly RelationalSampleFamily[];

/** How many nodes the in-page walk actually censused, across every family it collects. This is the
 *  number the RESULT line publishes as `census=` — a clean verdict with `census=0` is not a verdict.
 *
 *  THE RELATIONAL FAMILIES COUNT (#25). They did not, and that was a polarity error inside the refusal
 *  itself: a fixture built to exercise a RELATIONAL rule is geometry and CSS — no text, no image, no
 *  control — so every counted family folded empty while the walker had seen and JUDGED its elements,
 *  and `censusGap` refused with "the walk censused 0 nodes". The guard could not tell "the walk failed"
 *  from "the walk succeeded in a family I do not count", and the workaround was a stray text node in
 *  every relational fixture, unrelated to the rule under test.
 *
 *  WHY WIDEN THE COUNT rather than give `censusGap` a second, narrower reason: the doc-comment above was
 *  already the intended contract ("across every family it collects"), a relational sample IS a censused
 *  element, and one honest denominator is worth more than two verdicts an operator has to reconcile.
 *  The protection is untouched — a walk that saw nothing in ANY family still totals 0 and still refuses,
 *  and the fraction-shaped false cleans stay owned by `readinessGap`/`censusThinGap`, which do not read
 *  this number at all. */
export function censusTotal(samples: RawSamples): number {
  const relational = RELATIONAL_FAMILY_KEYS.reduce((total, family) => total + (samples[family]?.length ?? 0), 0);
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
    (samples.controlAspects?.length ?? 0) +
    relational
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

/** THE SUBJECT-ACCOUNTING GAP (#808, exact in #976) — the arm every other one here is structurally blind to.
 *
 *  MEASURED 2026-08-29 on Settings -\> Plugins at 1280x2200: `census=22 reached=3 findings=2 nav=OK`, a
 *  clean-looking verdict; the identical next command censused 1421 and reached 126. Nothing above fires on
 *  that run — the app HAD published `data-app-ready` (so `readinessGap` passes), 22 is not 0 (so
 *  `censusGap` passes) and 3 reached is not 0 (so `reachGap` passes). The false clean is not "nothing was
 *  seen", it is "a FRACTION was seen", and the three zero-arms above cannot express a fraction.
 *
 *  WHY THE READINESS SIGNAL CANNOT COVER IT: `data-app-ready` is ONE-SHOT and fires at BOOT
 *  (packages/client/src/lib/app-ready-signal.ts resolves a single Promise). A surface
 *  reached by a post-boot navigation or an `--actions` click therefore carries a readiness flag that was
 *  earned by a DIFFERENT surface, while its own reads are still in flight — which is exactly the run above.
 *
 *  #976 removes the old 1.5x / eight-element tolerance. The page first proves a bounded quiet window,
 *  then takes one identity snapshot and closes every identity as walked or one explicit skip. A later
 *  addition, detachment, replacement, inaccessible subject, or unexplained term is an instrument error:
 *  there is no honest category of subject the verdict simply did not judge. */
export function censusThinGap(population: DomPopulation | null): EvidenceGap | null {
  if (population === null) {
    return null;
  }
  const { duringWalk, settled, stabilized, accounting } = population;
  const closedSkips = accounting.skipped.documentHead + accounting.skipped.devChrome;
  const explained = accounting.walked + closedSkips;
  const faults: string[] = [];
  if (!stabilized) {
    faults.push("the pre-walk population/revision watch was still moving at its ceiling");
  }
  if (accounting.observed !== settled || accounting.settled !== duringWalk || settled !== duringWalk) {
    faults.push(`the quiet-window population (${settled}) and judged snapshot (${duringWalk}) differ`);
  }
  if (explained !== accounting.settled) {
    faults.push(`${accounting.settled - explained} settled subject(s) have no walked/closed-skip class`);
  }
  if (accounting.inaccessible > 0) {
    faults.push(`${accounting.inaccessible} subject(s) were inaccessible to the walk`);
  }
  if (accounting.final !== accounting.settled) {
    faults.push(`the final population (${accounting.final}) differs from the snapshot (${accounting.settled})`);
  }
  if (accounting.added > 0 || accounting.detached > 0 || accounting.walkMutations > 0) {
    faults.push(
      `${accounting.added} added, ${accounting.detached} detached, ${accounting.walkMutations} element-bearing child-list mutation(s) occurred during the walk`,
    );
  }
  if (faults.length === 0) {
    return null;
  }
  const floorNote = stabilized ? "" : " The population was still moving at the ceiling, so its figure is a floor.";
  return {
    evidence: "the node census's completeness",
    detail: `the page settled at ${settled} element(s), snapshotted ${duringWalk}, walked ${accounting.walked}, and explicitly skipped ${closedSkips} (${accounting.skipped.documentHead} document-head + ${accounting.skipped.devChrome} dev-chrome), but exact accounting failed: ${faults.join("; ")}.${floorNote} Re-run the SAME command only after the surface is actually stable; a clean verdict requires settled = walked + classified closed skips with no identity churn`,
  };
}

function themeResolutionFaults(request: ThemeRequest, shim: SettingsShimEvidence): string[] {
  const faults: string[] = [];
  if (shim.themeApplied !== true) {
    faults.push("the selection patch did not reach a real settings envelope");
  }
  const resolution = shim.themeResolution;
  if (resolution === null) {
    faults.push("the request has no authenticated catalog resolution");
    return faults;
  }
  if (resolution.request !== request) {
    faults.push(`the catalog resolved ${JSON.stringify(resolution.request)} instead of ${JSON.stringify(request)}`);
  }
  if (resolution.source === "unknown") {
    faults.push("the catalog row omitted its seed/custom source discriminator");
  }
  return faults;
}

function themePopulationFaults(render: ThemeRenderInput, walked: number): string[] {
  const faults: string[] = [];
  const sourceTotal = render.subjectSources.default + render.subjectSources.seed + render.subjectSources.custom + render.subjectSources.unknown;
  const polarityTotal = render.subjectPolarities.light + render.subjectPolarities.dark + render.subjectPolarities.mixed + render.subjectPolarities.unknown;
  if (sourceTotal !== walked) {
    faults.push(`${sourceTotal}/${walked} walked subjects have a rendered source class`);
  }
  if (polarityTotal !== walked || render.subjectPolarities.unknown > 0 || render.subjectPolarities.mixed > 0) {
    faults.push(
      `${polarityTotal}/${walked} walked subjects have a polarity class (${render.subjectPolarities.light} light, ${render.subjectPolarities.dark} dark, ${render.subjectPolarities.mixed} mixed, ${render.subjectPolarities.unknown} unknown)`,
    );
  }
  return faults;
}

function themeCarrierFault(resolution: ThemeResolutionEvidence | null, render: ThemeRenderInput): string | null {
  if (resolution?.source === "default") {
    return render.rootDataTheme === null ? null : `the default arm rendered root data-theme=${JSON.stringify(render.rootDataTheme)}`;
  }
  if (resolution?.source === "seed") {
    const expected = resolution.name?.toLowerCase() ?? null;
    const hearthDefault = expected === "hearth" && render.rootDataTheme === null;
    return hearthDefault || (expected !== null && render.rootDataTheme?.toLowerCase() === expected)
      ? null
      : `seed ${JSON.stringify(resolution.name)} rendered root data-theme=${JSON.stringify(render.rootDataTheme)}`;
  }
  if (resolution?.source === "custom") {
    return render.rootDataTheme === null && render.shellScope.inlineBackground !== null
      ? null
      : `custom ${JSON.stringify(resolution.name)} rendered root data-theme=${JSON.stringify(render.rootDataTheme)} and shell inline background=${JSON.stringify(render.shellScope.inlineBackground)}`;
  }
  return null;
}

/** A named theme arm is a claim about what rendered, not merely what argv contained (#976). The shim's
 *  authenticated catalog resolution proves request/id/source; the walk proves the root/scope carrier and
 *  effective computed polarity over the exact judged population. */
export function themeProvenanceGap(
  request: ThemeRequest | null,
  shim: SettingsShimEvidence,
  render: ThemeRenderInput | null,
  walked: number,
): EvidenceGap | null {
  if (request === null) {
    return null;
  }
  const resolution = shim.themeResolution;
  const faults = themeResolutionFaults(request, shim);
  if (render === null) {
    faults.push("the judged walk returned no rendered theme evidence");
  } else {
    faults.push(...themePopulationFaults(render, walked));
    const carrier = themeCarrierFault(resolution, render);
    if (carrier !== null) {
      faults.push(carrier);
    }
  }
  if (faults.length === 0) {
    return null;
  }
  const resolutionLabel =
    resolution === null ? "unresolved" : `id=${resolution.id ?? "none"} name=${resolution.name ?? "(default)"} source=${resolution.source}`;
  return {
    evidence: "the requested theme's rendered provenance",
    detail: `--theme ${JSON.stringify(request)} resolved as ${resolutionLabel}, but ${faults.join("; ")} — requested theme, authenticated catalog row, rendered carrier, and effective subject polarity must agree before this run can claim that arm`,
  };
}

/** WHY an empty census is a HARD gap rather than "the page is simply bare": the walk censuses text,
 *  styles, images, tap targets, accessible names, headings, tab indexes, z-indexes AND every relational
 *  family (`censusTotal` above) — a rendered app surface cannot be empty across ALL of them. Zero means
 *  the walk saw nothing, which is a statement about the probe, not about the design.
 *
 *  The counted set is exactly `censusTotal`'s, and it has to stay that way: a family the walker collects
 *  but the total omits makes this refusal fire on a surface the walk actually judged, and a refusal that
 *  is wrong about WHY reads as a crash (#25). */
export function censusGap(url: string): EvidenceGap {
  return {
    evidence: "the node census",
    detail: `the walk censused 0 nodes on ${url} — the surface rendered nothing the audit can judge (blank mount / error boundary / wrong route), so "no findings" would describe an empty page, not a clean one`,
  };
}
