// ZERO HYGIENE (#409) — design-audit's half of the fleet rule in _shared/evidence.ts (read that first).
//
// Every check family here is a fold over a sample list, so an EMPTY walk folds to zero findings and the
// report prints "no findings — clean". That is the most dangerous zero in the fleet: a blank mount, a
// swallowed error boundary, or a route that rendered nothing at all audits as the cleanest page in the
// product. The census below is the denominator that verdict rests on.
//
// AT THE CAP (449/450): the next addition lands as a SIBLING module — evidence-viewport-frame.ts is the
// precedent — never as an arm here, and never by deleting a comment to buy its line
// (docs/architecture/core/Core-Tooling-Law.md §4.3).

import type { SettingsShimEvidence, ThemeResolutionEvidence } from "@orb/tooling/_shared/appearance";
import type { EvidenceGap } from "@orb/tooling/_shared/evidence";
import type { ThemeRequest } from "@orb/tooling/_shared/theme";
import type { RawSamples, ThemeRenderInput } from "../contract/samples.ts";
import type { RelationalSamples } from "../contract/samples-populations.ts";
import { CENSUS_CAP_FAMILIES } from "../contract/samples-populations.ts";
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
  offGridTexts: true,
  offGridTransforms: true,
  paneInks: true,
  promotedLayerOffsets: true,
  quietStates: true,
  rowVoids: true,
  selectionIdioms: true,
  tierDrifts: true,
};

// `Object.keys` widens to string[]; the record above is the exhaustive home, so the cast reads back the
// key type the map was declared with (the house idiom — snap/contract/scenario-presets.ts).
const RELATIONAL_FAMILY_KEYS = Object.keys(RELATIONAL_SAMPLE_FAMILIES) as readonly RelationalSampleFamily[];

/** Every NON-relational array family the walker returns, derived from `RawSamples` the same way the
 *  relational half above is derived from `RelationalSamples` (#1317 item 6). The relational members are
 *  excluded because `RawSamples extends RelationalSamples`, so the two maps stay disjoint and no family
 *  can be counted twice. */
type FlatSampleFamily = Exclude<
  {
    [K in keyof RawSamples]-?: NonNullable<RawSamples[K]> extends readonly unknown[] ? K : never;
  }[keyof RawSamples],
  RelationalSampleFamily
>;

/** WHICH flat families the census DENOMINATOR counts — the half that used to be a hand-written sum whose
 *  own comment ("the counted set is exactly `censusTotal`'s, and it has to stay that way") was the only
 *  thing holding it. It is now the same enforcement the relational half carries: a mapped-type Record
 *  over the derived union, so a family added to `RawSamples` REDs tsc HERE with a missing property and
 *  its author must decide `true`/`false` rather than have it silently omitted.
 *
 *  `false` is a REAL classification, not a leftover: those families are DETECTOR inputs whose members are
 *  already findings or already counted as one of the counted families' subjects (a shadow glow is a
 *  `textStyles`/`texts` subject read a second way), so adding them would double-count the same node and
 *  inflate the one denominator a reader uses to decide whether `findings=0` means anything. The counted
 *  ten are the SUBJECT censuses — one member per censused element. */
const COUNTED_FLAT_FAMILIES: Readonly<Record<FlatSampleFamily, boolean>> = {
  accentBorders: false,
  accessibleNames: true,
  actionDoors: true,
  animatedImgHovers: false,
  bgPatterns: false,
  // A form control is ALREADY a censused subject through accessibleNames/tapTargets; counting its
  // boundary a second time would inflate the one denominator a reader uses to size `findings=0`.
  borderContrasts: false,
  brokenImages: false,
  buriedRasters: false,
  clippedOverflows: false,
  controlAspects: true,
  edgeFlushCards: false,
  gradientTexts: false,
  headings: true,
  hoverStates: false,
  iconTiles: false,
  images: true,
  motionStatics: false,
  nestedCards: false,
  obscuredTargets: false,
  overflows: false,
  radialGlows: false,
  repeatedTexts: false,
  shadowGlows: false,
  tabIndexes: true,
  tapTargets: true,
  textStyles: true,
  texts: true,
  truncatedTexts: false,
  // A tooltip TRIGGER is already a censused subject through accessibleNames/tapTargets — this census reads
  // the same element a second way (its description wiring), so counting it would inflate the denominator.
  unreachableHints: false,
  zIndexes: true,
};

// Same cast idiom as `RELATIONAL_FAMILY_KEYS` above: `Object.keys` widens to string[], and the record is
// the exhaustive home the key type is read back from.
const FLAT_CENSUS_KEYS = Object.keys(COUNTED_FLAT_FAMILIES) as readonly FlatSampleFamily[];

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
  const flat = FLAT_CENSUS_KEYS.reduce((total, family) => total + (COUNTED_FLAT_FAMILIES[family] ? (samples[family]?.length ?? 0) : 0), 0);
  return flat + relational;
}

/** THE CAP GAP (#1038) — a census that stopped PUSHING and reads complete.
 *
 *  Five walker censuses carried a silent representative bound (`shadowGlows` 200, `accentBorders` 200,
 *  `radialGlows` 100, `motionStatics` 100, `bgPatterns` 50) and four more carried one whose families are
 *  rung-1 WALKER-PROVEN (`overflows` 100, `repeatedTexts` 40, `clippedOverflows` 40, `edgeFlushCards` 20 —
 *  lib/collect.ts's rung table). The bound was applied BEFORE anything downstream could see it, so a page
 *  past the bound published a truncated `candidates=` that read complete AND, for the WALKER-PROVEN four,
 *  simply LOST the findings past the bound: the walker returns only findings there, so the 41st clipped
 *  overflow was not under-counted, it was deleted.
 *
 *  The bound stays — an unbounded sample payload is a real risk on a pathological surface — and the SCAN
 *  now runs past it, so `dropped` is EXACT rather than a floor. This arm is the run-level half of the
 *  refusal and covers every capped family including the four with no population row at all;
 *  `partitionedFindings`' `capExceeded` is the per-rule half, and the redundancy is deliberate — a reader
 *  looking at the rule table and a reader looking at the verdict line must each be told.
 *
 *  MEASURED HEADROOM, so the bounds are a judgment and not a guess (2026-09-01, the design-audit scan
 *  against the live dev stack): Home at 1280x800 (381 walked) censused 16 shadow glows and nothing else;
 *  `--goto config:appearance --viewport 1280x2200` (1319 walked — the heaviest surface in the product)
 *  censused 44 shadow glows, 15 radial washes, 1 accent border, 0 patterns, 0 motion statics. Every family
 *  sits 4x-200x under its bound, so this refusal is a tripwire rather than a tax every run pays. */
export function censusCapGap(samples: RawSamples): EvidenceGap | null {
  // Walked through the CLOSED family tuple rather than the object's own keys: the message order is then
  // the contract's, not a serialization accident, and the tuple gains the reader that makes it
  // enforcement instead of a list (constitution §2.3 — a prose-only boundary is a wish).
  const truncated = CENSUS_CAP_FAMILIES.flatMap((family) => {
    const row = samples.censusCaps[family];
    return row === undefined || row.dropped === 0 ? [] : [`${family}: ${String(row.dropped)} past a bound of ${String(row.cap)}`];
  });
  if (truncated.length === 0) {
    return null;
  }
  return {
    evidence: "the capped censuses' completeness",
    detail: `${truncated.join("; ")} — the in-page census counted more carriers than it could carry out, so every rule over those families judged a representative sample and this run has NO VERDICT for them. Narrow the surface (a smaller viewport, a --goto onto one pane) or raise the family's bound in ops/walker/census-*.ts`,
  };
}

/** THE INSTRUMENT-ORIGIN PAGE ERROR (#1317 item 1). `session.pageErrors` carries two KINDS
 *  (`_shared/browser-contract.ts` `BrowserPageError`): `runtime` — an uncaught exception the APP threw,
 *  which `checkScriptErrors` files as a `script-error` P0 — and `instrument`, which is this harness
 *  announcing that ITS OWN setup failed (`_shared/browser-capture.ts` pushes
 *  `instrumentPageError("browser diagnostic setup failed: …")` from a wire-up promise with no awaiter).
 *
 *  Before this arm the two were flattened to text by `pageErrorText` and handed to `checkScriptErrors`
 *  together, so a broken CDP diagnostic wire-up was filed as a P0 DEFECT OF THE APP and exited 1 — the
 *  instrument blaming the product for its own failure, which is the exact polarity the exit-code
 *  contract exists to prevent (0 clean · 1 violations · 2 the run is NOT a verdict). Typing the channel
 *  (Codex, 2026-09-04) made the two distinguishable; this is the ui-audit consumer that reads the kind.
 *  Exit 2, never a finding. */
export function instrumentPageErrorGap(messages: readonly string[]): EvidenceGap | null {
  if (messages.length === 0) {
    return null;
  }
  return {
    evidence: "the browser capture harness",
    detail: `${messages.join("; ")} — the instrument's own wiring failed on this page, so the console/diagnostic evidence behind every quality verdict is incomplete and this run has NO VERDICT. This is a defect of the probe, never of the surface: it is deliberately NOT filed as a script-error finding`,
  };
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

/** THE PAGE-LEVEL NAV GAP (#1081). An HTTP error or a dead response is a fact about the ORIGIN, and it used
 *  to be reported as a violation (exit 1) with the whole report printed under it — census 0, an empty
 *  findings table, `population-verdict=complete`, a surface-state declaration reading `unmounted`. None of
 *  that was measured: `ops/drive.ts` returns `samples: null` on a nav error, so every table below it is the
 *  shape of a verdict wrapped around nothing. The FACT survives — it is what this gap's detail states — but
 *  the run is NO VERDICT, which is the same call `ops/matrix.ts` already makes at matrix discovery. */
export function navErrorGap(navError: string): EvidenceGap {
  return {
    evidence: "the navigation",
    detail: `${navError} — the page never loaded, so nothing was censused and every table this run would print describes no observation. The HTTP failure is real and is the finding for a human; the audit has no verdict about the surface behind it`,
  };
}

/** THE ACTIONS GAP (#1081). The argv-ordered queue is how a run REACHES its subject, so a failed action means
 *  the walk censused a different surface than the one that was asked for — `ops/drive.ts` already prints the
 *  failing action and its reason. Reporting findings from the surface it happened to be standing on is worse
 *  than reporting nothing: they are true of a page nobody asked about, filed under the name of one nobody
 *  saw. */
export function actionsFailedGap(actionsFailed: number, actionCount: number): EvidenceGap {
  return {
    evidence: "the reveal queue",
    detail: `${actionsFailed} of ${actionCount} action(s) did not land (each printed above with its reason) — the walk therefore censused whatever surface the chain stalled on, not the one this run names, so its findings and populations are a verdict about the wrong page`,
  };
}

/** THE FAILURE-SURFACE GAP (#1081) — the arm that made this file's own opening paragraph literally true.
 *
 *  MEASURED 2026-09-01 through the real CLI against the dev stack (the retired `pnpm design-audit`, now
 *  `pnpm snap /__no-such-route__ --design-audit`): the run
 *  printed all 48 POPULATION rows, filed `landmark-missing` P2 against the router's not-found boundary and
 *  exited 0 — "a swallowed error boundary … audits as the cleanest page in the product", six lines up.
 *  Nothing above catches it and nothing above can: the route RESOLVED (so `data-app-ready` went up and
 *  `readinessGap` passes), the census was 11 rather than 0 (`censusGap` passes) and one control was reached
 *  (`reachGap` passes). A not-found boundary is not a fraction of a surface — it is the app saying there is
 *  no surface — so the discriminator is the app's own declare (`data-app-failure`, packages/client/src/lib/
 *  app-failure-surface.tsx), never a node count and never a sniff of the rendered copy. */
export function failureSurfaceGap(url: string, kind: string): EvidenceGap {
  return {
    evidence: "the audited surface",
    detail: `${url} rendered the app's ${JSON.stringify(kind)} failure surface (it declares itself with data-app-failure) — an error boundary is not a surface, so every finding, population and surface-state row this run could print would describe the app's apology instead of the page that was asked for. Audit a route that resolves, or fix what sent the app here`,
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
    detail: `${url} never published html[data-app-ready] — the app did not mount, so the walk censused the shell around it and every check family folded a near-empty list into "no findings". On an isolated stage the run has ALREADY re-navigated once against the cold vite itself (#1142), so a persisting absence means the stage's app does not mount — read the stage's stack log instead of re-running; on the dev stack it means the app is broken, which is a finding for a human, not a clean audit`,
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
  if (accounting.renderedSubjects + accounting.retainedHiddenSubjects !== accounting.walked) {
    faults.push(
      `${accounting.renderedSubjects} rendered + ${accounting.retainedHiddenSubjects} retained-hidden subjects do not close the ${accounting.walked} walked identities`,
    );
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

function themePopulationFaults(render: ThemeRenderInput, renderedSubjects: number): string[] {
  const faults: string[] = [];
  const sourceTotal = render.subjectSources.default + render.subjectSources.seed + render.subjectSources.custom + render.subjectSources.unknown;
  const polarityTotal = render.subjectPolarities.light + render.subjectPolarities.dark + render.subjectPolarities.mixed + render.subjectPolarities.unknown;
  if (sourceTotal !== renderedSubjects) {
    faults.push(`${sourceTotal}/${renderedSubjects} rendered subjects have a theme source class`);
  }
  if (polarityTotal !== renderedSubjects || render.subjectPolarities.unknown > 0 || render.subjectPolarities.mixed > 0) {
    faults.push(
      `${polarityTotal}/${renderedSubjects} rendered subjects have a polarity class (${render.subjectPolarities.light} light, ${render.subjectPolarities.dark} dark, ${render.subjectPolarities.mixed} mixed, ${render.subjectPolarities.unknown} unknown)`,
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
  renderedSubjects: number,
): EvidenceGap | null {
  if (request === null) {
    return null;
  }
  const resolution = shim.themeResolution;
  const faults = themeResolutionFaults(request, shim);
  if (render === null) {
    faults.push("the judged walk returned no rendered theme evidence");
  } else {
    faults.push(...themePopulationFaults(render, renderedSubjects));
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
