// THE DESIGN-AUDIT WALK, re-hosted inside Snap (#1315). This is `ui-audit`'s `ops/run.ts` post-launch
// half and nothing else: the browser, the stage, the drive queue, the artifact slot and the RESULT line
// all belong to Snap now, and the 14k-line rule engine stays a sibling tool dir entered through its
// `index.ts` front door (the motion-audit precedent, 1208 §10.6/§12.3).
//
// WHAT SNAP OWNS THAT UI-AUDIT USED TO: navigation and readiness (Snap's four-state ladder folds
// `absent`/`degraded`/`dataless` into `navError`, so this file asks ONE question instead of two — and
// `--file` stays exempt by construction, because Snap skips the readiness wait for a file:// mock);
// the action queue; the isolated stage; the session. What UI-AUDIT still owns, unchanged, is every
// VERDICT: the walk, the pixel settle, the forced-state pass, the rule engine, the population
// accounting and the printers.
//
// THE GAP LADDER IS THE SAME LADDER, in the same order, for the same reasons (#409/#653/#678/#808/#1081):
// a run whose page never loaded, whose reveal action did not land, whose surface the app itself declares
// a failure, or whose walk censused nothing, is NOT A VERDICT — exit 2 — never a clean report over a page
// nobody asked for. The three PRE-MEASUREMENT refusals are terminal here exactly as they were terminal in
// `runUiAudit`; the partial-verdict gaps (population, cap, hover, force, instrument page error) ride
// beside the tables rather than instead of them.
import { errorMessage } from "@orb/kit/error-message";
import type { SettingsShimEvidence } from "@orb/tooling/_shared/appearance";
import type { Page } from "@playwright/test";
import type { ProbeSession } from "../../_shared/browser-contract.ts";
import { pageErrorText } from "../../_shared/browser-contract.ts";
import type { BrowserEnvironmentEvidence } from "../../_shared/browser-environment.ts";
import { readBrowserEnvironment } from "../../_shared/browser-environment.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { EvidenceGap } from "../../_shared/evidence.ts";
import type {
  BackdropRefusal,
  CensusReachInput,
  DesignAuditRuleFamily,
  DomPopulation,
  Finding,
  PopulationAccounting,
  RawSamples,
  Severity,
  ShellStateSnapshot,
  SurfaceStateAccounting,
  ThemeRenderInput,
} from "../../ui-audit/index.ts";
import {
  actionsFailedGap,
  appFailureSurface,
  buildSurfaceStateAccounting,
  COLLECT_SAMPLES_JS,
  censusCapGap,
  censusGap,
  censusThinGap,
  censusTotal,
  checkScriptErrors,
  collectAudit,
  countBySeverity,
  failureSurfaceGap,
  hoverPassLabel,
  instrumentPageErrorGap,
  navErrorGap,
  PAGE_SUBJECT_SELECTOR,
  populationEvidenceGap,
  rawSamples,
  reachGap,
  resolveHoverStates,
  resolvePixelBackdrops,
  SAMPLE_COLLECTION_PREFIX,
  shellStateSnapshot,
  themeProvenanceGap,
  walkFailureGap,
} from "../../ui-audit/index.ts";
import type { Args } from "../contract/types.ts";
import { designAuditSelectorProofCap } from "../lib/budgets.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route> --design-audit");

/** The app's failure-surface declare, read as a plain expression (no page function to serialize). */
const READ_FAILURE_SURFACE_JS = "(document.querySelector('[data-app-failure]') || { getAttribute: () => null }).getAttribute('data-app-failure')";

/** One EMITTED finding selector and how many elements it actually resolves to, proven in NODE (#1326).
 *  The walker's `describe()` climbs at most six steps and returns the path whether or not it is unique;
 *  measured 2026-09-04, two identical seven-deep subtrees produced ONE selector matching both, and the
 *  finding was unforwardable. Snap can ask Playwright, so it does — and MARKS the row rather than
 *  suppressing it: a non-unique selector is still a real defect, it is just not yet locatable. */
export interface SelectorProof {
  readonly selector: string;
  readonly matches: number;
}

interface DesignAuditHoverReceipt {
  readonly outcome: { readonly kind: string; readonly reason?: string };
  readonly wallMs: number;
  readonly subjectsForced: number;
  readonly forceFailedGroups: number;
  readonly forceFailures: readonly string[];
  readonly label: string;
}

/** THE FIVE PARTIAL-VERDICT CHANNELS, EACH NAMED (#1038 · #1031 · #1087 F1 · #1317 item 1). `gaps`
 *  above is their filtered concatenation — what the printed receipt and the exit code ride — but a JSON
 *  consumer needs to know WHICH half of the run is unproven, and a flat list cannot answer that: a
 *  truncated census and a broken forced-state pass are both "NO VERDICT" and require different repairs.
 *  A `null` channel means COMPLETE. On a terminal run (`terminalGap`) every channel carries that gap:
 *  the walk never reached any of them, and "complete" over an unwalked page is the exact lie #1087 F1
 *  was minted to end. */
interface DesignAuditVerdicts {
  readonly population: EvidenceGap | null;
  readonly censusCap: EvidenceGap | null;
  readonly hover: EvidenceGap | null;
  readonly force: EvidenceGap | null;
  readonly instrumentPageError: EvidenceGap | null;
}

export interface DesignAuditMeasurement {
  readonly url: string;
  /** The environment the walk actually ran in — the pointer/hover/viewport the verdict is ABOUT. A
   *  tap-target row means nothing without it, and the session-call promise (a named session's declared
   *  viewport is what the audit measures) is asserted through exactly these pairs. */
  readonly environment: BrowserEnvironmentEvidence | null;
  /** Non-null when the run is NOT A VERDICT before any table could honestly print (#1081). */
  readonly terminalGap: EvidenceGap | null;
  readonly findings: readonly Finding[];
  readonly counts: Record<Severity, number>;
  readonly populationAccounting: PopulationAccounting;
  readonly familyScans: Readonly<Record<DesignAuditRuleFamily, number>> | null;
  readonly census: number;
  readonly reach: CensusReachInput | undefined;
  readonly samples: RawSamples | null;
  readonly pixelSampled: number;
  readonly backdropRefusals: readonly BackdropRefusal[];
  readonly hover: DesignAuditHoverReceipt | null;
  readonly shellState: ShellStateSnapshot | null;
  readonly surfaceState: SurfaceStateAccounting | null;
  readonly drive: "rest" | "driven";
  readonly population: DomPopulation | null;
  /** All FOUR halves of the theme claim, and the fourth is the load-bearing one: `rendered` is what the
   *  walk actually SAW (the root stamp, the inline carrier, the per-subject polarity census), against
   *  which the other three are only a request. A receipt carrying the request without the render is the
   *  ambiguity `themeProvenanceGap` exists to refuse. */
  readonly themeEvidence: {
    readonly request: string | null;
    readonly applied: boolean | null;
    readonly resolution: SettingsShimEvidence["themeResolution"];
    readonly rendered: ThemeRenderInput | null;
  };
  readonly navError: string | null;
  readonly actionsFailed: number;
  /** Partial-verdict gaps — the tables still print, the run still exits 2 (`_shared/evidence.ts`). */
  readonly gaps: readonly EvidenceGap[];
  readonly verdicts: DesignAuditVerdicts;
  readonly selectorProof: readonly SelectorProof[];
  /** Distinct emitted selectors the proof cap never asked about (#1538) — published, never assumed unique. */
  readonly selectorsUnproven: number;
}

interface WalkInput {
  readonly session: ProbeSession;
  readonly page: Page;
  readonly opts: Args;
  readonly navError: string | null;
  readonly actionsFailed: number;
}

function terminalMeasurement(url: string, gap: EvidenceGap, input: Pick<WalkInput, "navError" | "actionsFailed">): DesignAuditMeasurement {
  return {
    url,
    environment: null,
    terminalGap: gap,
    findings: [],
    counts: countBySeverity([]),
    populationAccounting: {},
    familyScans: null,
    census: 0,
    reach: undefined,
    samples: null,
    pixelSampled: 0,
    backdropRefusals: [],
    hover: null,
    shellState: null,
    surfaceState: null,
    drive: "rest",
    population: null,
    themeEvidence: { request: null, applied: null, resolution: null, rendered: null },
    navError: input.navError,
    actionsFailed: input.actionsFailed,
    gaps: [gap],
    verdicts: { population: gap, censusCap: gap, hover: gap, force: gap, instrumentPageError: gap },
    selectorProof: [],
    selectorsUnproven: 0,
  };
}

/** Prove every DISTINCT emitted selector in Node. Bounded: a pathological surface could emit hundreds of
 *  rows and each proof is a round trip, so the cap is declared and the remainder is reported UNPROVEN
 *  rather than silently counted as unique — an unasked question must never read like a clean answer.
 *
 *  #1538: the promise above was PROSE ONLY until now — the slice truncated and returned, nothing carried
 *  the dropped count, and above the cap the 65th selector onward read exactly like a clean sweep. The
 *  count now rides out with the proofs and is published (`selectors-unproven`, the SELECTOR line, and a
 *  problem row). It is deliberately NOT a run-level gap: #1326 ruled that selector locatability is an
 *  INSTRUMENT concern which rides as its own row rather than reddening the app's verdict, and a bound this
 *  instrument chose for itself is the same class of fact. */
async function proveSelectors(page: Page, findings: readonly Finding[]): Promise<{ readonly proofs: readonly SelectorProof[]; readonly unproven: number }> {
  // A PAGE-SUBJECT finding names the DOCUMENT, not an element (contract/findings.ts) — asking Playwright
  // to count `page` would report every stray-font run as unlocatable, which is the false positive this
  // proof exists to avoid rather than to create.
  // REPRESENTATIVES COUNT. A rung-4 rule collapses N rendered instances of one authored decision into one
  // row and lists the others under `representatives` — those are emitted selectors a reader will paste
  // exactly like the row's own, and on the #1326 twin-subtree control they are the ONLY place the second
  // instance appears. Proving the row alone would have been a proof of the easy half.
  const emitted = findings.flatMap((finding) => [finding.selector, ...(finding.representatives ?? [])]);
  const askable = [...new Set(emitted)].filter((selector) => selector !== PAGE_SUBJECT_SELECTOR);
  const distinct = askable.slice(0, designAuditSelectorProofCap());
  const proofs: SelectorProof[] = [];
  for (const selector of distinct) {
    // @orb-waive caught-failure-ownership(catch): a selector the browser refuses to parse is reported as matches=-1, which the arm prints as UNPROVEN and counts as non-unique — the failure IS the published value. Ends if -1 stops being read as "not proven".
    try {
      proofs.push({ selector, matches: await page.locator(selector).count() });
    } catch {
      proofs.push({ selector, matches: -1 });
    }
  }
  return { proofs, unproven: askable.length - distinct.length };
}

async function readSamples(page: Page): Promise<{ readonly samples: RawSamples; readonly population: DomPopulation } | { readonly walkError: string }> {
  // @orb-waive caught-failure-ownership(error): the walk throwing is an INSTRUMENT failure, returned as walkError and turned into walkFailureGap (exit 2) by the caller. Ends if walkError stops reaching the gap ladder.
  try {
    const samples = rawSamples(await page.evaluate(COLLECT_SAMPLES_JS));
    const accounting = samples.subjectAccounting;
    return {
      samples,
      population: { duringWalk: accounting.settled, settled: accounting.observed, stabilized: accounting.stabilized, accounting },
    };
  } catch (error) {
    return { walkError: `${SAMPLE_COLLECTION_PREFIX}: ${errorMessage(error)}` };
  }
}

/** THE THREE PRE-MEASUREMENT REFUSALS (#1081), in their fixed order and terminal for one reason: past
 *  this point every table the arm prints is a fold over the samples, and in each of these cases those
 *  samples describe either nothing at all or a surface nobody asked for. Split out of the walk so the
 *  ORDER is one readable sequence rather than a branch inside a long function. */
async function preMeasurementRefusal(input: WalkInput, url: string): Promise<EvidenceGap | null> {
  const { page, opts, navError, actionsFailed } = input;
  if (navError !== null) {
    return navErrorGap(navError);
  }
  if (actionsFailed > 0) {
    return actionsFailedGap(actionsFailed, opts.actions.length);
  }
  const failureKind = appFailureSurface(await page.evaluate(READ_FAILURE_SURFACE_JS));
  return failureKind === null ? null : failureSurfaceGap(url, failureKind);
}

export async function walkDesignAudit(input: WalkInput): Promise<DesignAuditMeasurement> {
  const { session, page, opts } = input;
  const url = page.url();
  const refusal = await preMeasurementRefusal(input, url);
  if (refusal !== null) {
    return terminalMeasurement(url, refusal, input);
  }
  const walk = await readSamples(page);
  if ("walkError" in walk) {
    return terminalMeasurement(url, walkFailureGap(walk.walkError), input);
  }
  // Backdrops the DOM walk could not resolve are settled from real pixels BEFORE anything else moves the
  // page — the sampler needs it on screen at the scroll position the samples were read at.
  const pixelPass = await resolvePixelBackdrops(page, walk.samples);
  // The FORCED-STATE pass runs LAST of the in-browser passes and only where the environment can hover: it
  // holds `:hover` on one subject at a time over CDP, releases everything, and re-reads each candidate's
  // rest state to prove the release.
  const environment = await readBrowserEnvironment(page, session.environmentContract);
  // The forced-state pass only runs where the environment can hover — a coarse-pointer arm is genuinely
  // not-applicable, which is a different fact from a pass that broke (contract/types.ts HoverPassOutcome).
  const hoverCapable = environment.actual.hover === "hover";
  const hover = await resolveHoverStates(page, pixelPass.samples, hoverCapable);
  const samples = hover.samples;
  const settingsEvidence = session.contexts[0]?.settingsEvidence;
  if (settingsEvidence === undefined) {
    throw new Error("INSTRUMENT ERROR: the design-audit arm's browser session has no settings-evidence owner");
  }
  const census = censusTotal(samples);
  if (census === 0) {
    return terminalMeasurement(url, censusGap(url), input);
  }
  // THIN BEFORE REACH (#808): a walk over a half-rendered surface explains a low reach too, and naming
  // the fraction is the more useful refusal.
  const thin =
    censusThinGap(walk.population) ??
    themeProvenanceGap(opts.theme, settingsEvidence, samples.themeRender, walk.population.accounting.renderedSubjects) ??
    reachGap(samples);
  if (thin !== null) {
    return terminalMeasurement(url, thin, input);
  }

  const drive = opts.actions.length === 0 ? "rest" : "driven";
  const shellState = shellStateSnapshot(await page.evaluate("window.__orb ? window.__orb.shell() : null"));
  const surfaceState = buildSurfaceStateAccounting(shellState, drive);
  const audit = collectAudit(samples);
  const findings: Finding[] = [...audit.findings, ...checkScriptErrors(session.pageErrors.filter((error) => error.kind === "runtime").map(pageErrorText))];
  const populationGap = populationEvidenceGap(audit.populationAccounting);
  const hoverGap: EvidenceGap | null =
    hover.outcome.kind === "broke"
      ? {
          evidence: "forced-state pass",
          detail: `${hover.outcome.reason} — the :hover census was supposed to run and BROKE, so hover-contrast has NO VERDICT on this surface`,
        }
      : null;
  const forceGap: EvidenceGap | null =
    hover.forceFailedGroups === 0
      ? null
      : {
          evidence: "the forced-state pass's per-group completeness",
          detail: `${String(hover.forceFailedGroups)} state group(s) failed to force or read (${hover.forceFailures.join("; ")}) — their members' hover paint and state-gated glow were never measured, so hover-contrast and the state glow arms are partial on this surface`,
        };
  const verdicts: DesignAuditVerdicts = {
    population: populationGap,
    censusCap: censusCapGap(samples),
    hover: hoverGap,
    force: forceGap,
    instrumentPageError: instrumentPageErrorGap(session.pageErrors.filter((error) => error.kind === "instrument").map(pageErrorText)),
  };
  const gaps = [verdicts.population, verdicts.censusCap, verdicts.hover, verdicts.force, verdicts.instrumentPageError].filter(
    (gap): gap is EvidenceGap => gap !== null,
  );
  const proven = await proveSelectors(page, findings);

  return {
    url,
    environment,
    terminalGap: null,
    findings,
    counts: countBySeverity(findings),
    populationAccounting: audit.populationAccounting,
    familyScans: audit.familyScans,
    census,
    reach: samples.censusReach,
    samples,
    pixelSampled: pixelPass.sampled,
    backdropRefusals: pixelPass.refusals,
    hover: {
      outcome: hover.outcome,
      wallMs: hover.wallMs,
      subjectsForced: hover.subjectsForced,
      forceFailedGroups: hover.forceFailedGroups,
      forceFailures: hover.forceFailures,
      label: hoverPassLabel(hover),
    },
    shellState,
    surfaceState,
    drive,
    population: walk.population,
    themeEvidence: { request: opts.theme, applied: settingsEvidence.themeApplied, resolution: settingsEvidence.themeResolution, rendered: samples.themeRender },
    navError: input.navError,
    actionsFailed: input.actionsFailed,
    gaps,
    verdicts,
    selectorProof: proven.proofs,
    selectorsUnproven: proven.unproven,
  };
}
