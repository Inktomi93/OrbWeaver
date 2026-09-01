// The audit orchestration: launch → navigate/reveal → walk → pixel-settle → classify → report.
// The browser never decides pass/fail; every verdict is lib/checks-* over plain data.
//
// CONTRAST HAS A PIXEL PATH (issue #218). A DOM ancestor walk cannot see a fixed art layer painting over
// the base it resolves — the app's wallpaper photo sits between <body>'s near-black background and every
// translucent reading plate, and trusting the walk put 28 false P1 contrast findings on one chat
// transcript (3.16:1 reported where the real composite is 4.94:1). The walker says "unresolved"
// instead of fabricating, and `resolvePixelBackdrops` (ops/pixels.ts) settles those from ONE viewport
// screenshot (perimeter-ring median, _shared/pixel-backdrop.ts — the same arithmetic snap's --contrast
// uses, one home so the two instruments cannot disagree about what is behind a glyph). What cannot be
// sampled — an off-screen box, a failed shot — is printed as NO VERDICT and judged by nothing.
import { writeFile } from "node:fs/promises";
import type { SettingsShimEvidence } from "@orb/tooling/_shared/appearance";
import { artifactFile, print, routeSlug } from "@orb/tooling/_shared/artifacts";
import { buildUrl, launchProbeSession, withProbeSession } from "@orb/tooling/_shared/browser";
import type { EvidenceGap } from "@orb/tooling/_shared/evidence";
import { instrumentError, printEvidenceGaps, printVerdict } from "@orb/tooling/_shared/evidence";
import type { ExitCode } from "@orb/tooling/_shared/exit-contract";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { CensusReachInput, RawSamples } from "../contract/samples.ts";
import type { Args, BackdropRefusal, DomPopulation } from "../contract/types.ts";
import { checkScriptErrors } from "../lib/checks-quality.ts";
import { collectAudit } from "../lib/collect.ts";
import {
  censusGap,
  censusThinGap,
  censusTotal,
  reachGap,
  readinessGap,
  SAMPLE_COLLECTION_PREFIX,
  themeProvenanceGap,
  walkFailureGap,
} from "../lib/evidence.ts";
import { populationEvidenceGap } from "../lib/population.ts";
import { isAtOrAboveSeverity } from "../lib/severity.ts";
import { stageLabel } from "../lib/stage-request.ts";
import { navigateAndReveal } from "./drive.ts";
import { resolvePixelBackdrops } from "./pixels.ts";
import {
  countBySeverity,
  navVerdict,
  printBackdropRefusals,
  printCensusReach,
  printFindingsTable,
  printObscuredScan,
  printPopulationAccounting,
} from "./report.ts";

refuseDirectInvocation(import.meta.url, "pnpm design-audit");

/** ZERO HYGIENE, every arm, in one place (#409 + #653 + #678 + #808). Returns the gap that makes this run
 *  an INSTRUMENT failure rather than a verdict, or null when the walk is entitled to be believed:
 *   • `readinessGap` — on an app origin, the app never published `data-app-ready`: the walk censused the
 *     SHELL, which is a small NON-ZERO count the arms below are structurally blind to;
 *   • `censusGap` — the walk censused nothing at all (blank mount / error boundary / wrong route);
 *   • `censusThinGap` — exact subject accounting failed: the pre-walk settle, judged identity snapshot,
 *     classified skips, or final identity set disagree (the arm the three zero-tests cannot express);
 *   • `reachGap`  — it censused plenty of text but reached NOT ONE offered control, so the tap-target,
 *     action-door and silhouette families each folded an empty list into "no findings".
 *  Only for a page that LOADED — a nav error is reported as itself. */
interface EvidenceInputs {
  readonly url: string;
  readonly appReady: boolean;
  readonly samples: RawSamples | null;
  readonly population: DomPopulation | null;
  readonly opts: Args;
  readonly settingsEvidence: SettingsShimEvidence;
}

function evidenceGapOf({ url, appReady, samples, population, opts, settingsEvidence }: EvidenceInputs): EvidenceGap | null {
  // READINESS FIRST (#678): a shell censuses a small-but-nonzero node count, so this arm has to be judged
  // BEFORE the count-based ones — they cannot see it, and the run would otherwise print a clean verdict
  // over a page whose app never mounted.
  const readiness = readinessGap(url, appReady);
  if (readiness !== null) {
    return readiness;
  }
  if (samples === null || censusTotal(samples) === 0) {
    return censusGap(url);
  }
  // THIN BEFORE REACH (#808): a walk that ran over a half-rendered surface explains a low reach too, and
  // naming the fraction is the more useful refusal.
  return (
    censusThinGap(population) ?? themeProvenanceGap(opts.theme, settingsEvidence, samples.themeRender, population?.accounting.walked ?? 0) ?? reachGap(samples)
  );
}

/** The reach rows of the RESULT line. `-1` is the absent-counters arm (a pinned pre-#653 sample set) —
 *  a refusal to state, never a zero that reads as "nothing was skipped". */
function reachRows(reach: CensusReachInput | undefined): [string, number | string][] {
  if (reach === undefined) {
    return [
      ["reached", -1],
      ["skipped-offviewport", -1],
      ["no-probe-frame", -1],
      ["reveal-budget", "unreported"],
    ];
  }
  return [
    ["reached", reach.onScreen + reach.revealed],
    ["skipped-offviewport", reach.skippedOffViewport],
    // #797: measured-but-unframed is its OWN number. Folding it into `reached` would say a control was
    // judged when its target size was refused, which is the shape of every false clean this file guards.
    ["no-probe-frame", reach.frameTruncated],
    ["reveal-budget", reach.budgetExhausted ? "EXHAUSTED" : "ok"],
  ];
}

export async function runUiAudit(opts: Args): Promise<number> {
  const url = buildUrl(opts.base, opts.route);
  // `--out` names an artifact BASE under reports/design-audit/ — or, when it is path-shaped, the exact
  // file to write (_shared/artifacts.ts owns that contract for every probe).
  const outPath = await artifactFile("design-audit", opts.out ?? routeSlug(opts.route), ".json");

  const session = await launchProbeSession({
    headless: true,
    viewport: opts.viewport,
    device: opts.device,
    colorScheme: null,
    reducedMotion: false,
    appearance: opts.appearance,
    theme: opts.theme,
    localStorage: [],
  });

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one linear ownership closure keeps every audit verdict and early return inside the same guaranteed cleanup boundary.
  return await withProbeSession(session, async () => {
    const { navError, actionsFailed, appReady, samples, population } = await navigateAndReveal(session.page, opts, url);
    // ZERO HYGIENE (#409), the apparatus arm: the WALK failing is an instrument failure, not a finding.
    // An HTTP nav error stays a violation below — that one IS a fact about the page.
    if (navError?.startsWith(SAMPLE_COLLECTION_PREFIX) === true) {
      print(`URL          ${url}`);
      return instrumentError(walkFailureGap(navError));
    }
    // Backdrops the DOM walk could not resolve are settled from real pixels BEFORE the browser closes —
    // the sampler needs the page still on screen at the scroll position the samples were read at.
    const pixels = samples === null ? { samples: null, sampled: 0, refusals: [] as BackdropRefusal[] } : await resolvePixelBackdrops(session.page, samples);
    const census = samples === null ? 0 : censusTotal(samples);
    const reach = pixels.samples?.censusReach;
    // The evidence arms: a walk that saw nothing — or one that reached no offered control — folds check
    // families to zero and prints "no findings — clean". Guarded only where the page LOADED.
    const settingsEvidence = session.contexts[0]?.settingsEvidence;
    if (settingsEvidence === undefined) {
      throw new Error("design-audit browser session has no settings-evidence owner");
    }
    const gap = navError === null ? evidenceGapOf({ url, appReady, samples: pixels.samples, population, opts, settingsEvidence }) : null;
    if (gap !== null) {
      print(`URL          ${url}`);
      return instrumentError(gap);
    }

    // Uncaught page exceptions are findings in their own right (script-error, P0) — the probe
    // session's pageerror capture is wired from nav start (_shared/browser.ts wirePage).
    const audit = pixels.samples === null ? null : collectAudit(pixels.samples);
    const findings = audit === null ? [] : [...audit.findings];
    const familyScans = audit === null ? null : audit.familyScans;
    const populationAccounting = audit === null ? {} : audit.populationAccounting;
    const populationGap = populationEvidenceGap(populationAccounting);
    findings.push(...checkScriptErrors(session.pageErrors));
    const counts = countBySeverity(findings);
    // An action that failed means the scan happened on the WRONG surface — that is a red run, not a clean
    // one, for exactly the reason the strict CLI exists.
    const failed = navError !== null || actionsFailed > 0 || findings.some((f) => isAtOrAboveSeverity(f.severity, opts.failOn));

    await writeFile(
      outPath,
      JSON.stringify(
        {
          route: opts.route,
          url,
          // WHICH TREE this run measured (#678): the stage's short sha, or `live` for whatever --base served.
          // A rendered receipt that cannot say which commit it audited is the ambiguity the stage mode exists
          // to end — so it rides both the machine line and the artifact.
          stage: stageLabel(opts.stageShortSha),
          viewport: opts.viewport,
          device: opts.device,
          actions: opts.actions,
          actionsFailed,
          failOn: opts.failOn,
          navError,
          findings,
          counts,
          pixelSampledBackdrops: pixels.sampled,
          backdropRefusals: pixels.refusals,
          censusReach: reach ?? null,
          populationAccounting,
          populationVerdict: populationGap === null ? "complete" : { verdict: "NO VERDICT", ...populationGap },
          themeEvidence: {
            request: opts.theme,
            applied: settingsEvidence.themeApplied,
            resolution: settingsEvidence.themeResolution,
            rendered: pixels.samples?.themeRender ?? null,
          },
          // The census's stability bracket (#808) — the artifact says what the RESULT line says.
          domPopulation: population,
        },
        null,
        2,
      ),
    );

    print(`URL          ${url}`);
    if (navError !== null) {
      print(`NAV ERROR    ${navError} — no samples collected`);
    }
    print(`report       ${outPath}`);
    print("");
    printCensusReach(reach);
    printObscuredScan(pixels.samples?.obscuredScan);
    printPopulationAccounting(populationAccounting);
    if (populationGap !== null) {
      printEvidenceGaps([populationGap]);
      print("");
    }
    printBackdropRefusals(pixels.refusals);
    printFindingsTable(findings, populationGap === null);

    let verdict: ExitCode = EXIT.clean;
    if (populationGap !== null) {
      verdict = EXIT.toolError;
    } else if (failed) {
      verdict = EXIT.violations;
    }
    return printVerdict("design-audit", {
      verdict,
      denominators: {
        census: { value: census, refuseWhen: "zero" },
        ...Object.fromEntries(Object.entries(familyScans ?? {}).map(([family, value]) => [`scanned-${family}`, { value, refuseWhen: "zero" as const }])),
      },
      pairs: [
        ["stage", stageLabel(opts.stageShortSha)],
        ["findings", findings.length],
        ["p0", counts.P0],
        ["p1", counts.P1],
        ["p2", counts.P2],
        ["p3", counts.P3],
        ["fail-on", opts.failOn],
        ["actions", opts.actions.length],
        ["actions-failed", actionsFailed],
        ["pointer", opts.device === null ? "fine" : "coarse"],
        ["population-verdict", populationGap === null ? "complete" : "NO-VERDICT"],
        ["tap-candidates", populationAccounting["tap-target"]?.candidates ?? -1],
        ["tap-judged", populationAccounting["tap-target"]?.judged ?? -1],
        ["tap-affected", populationAccounting["tap-target"]?.affected ?? -1],
        ["tap-populations", populationAccounting["tap-target"]?.populations ?? -1],
        ["tap-representatives", populationAccounting["tap-target"]?.emitted ?? -1],
        ["tap-collapsed-same-owner", populationAccounting["tap-target"]?.collapsed["sameOwner"] ?? -1],
        ["tap-withheld-cap", populationAccounting["tap-target"]?.withheld["cap"] ?? -1],
        // The DENOMINATOR (#409): how many nodes the walk censused. `findings=0` means nothing only when
        // this is non-zero, and a reader of the machine line is entitled to see it.
        ["census", census],
        // The exact subject-accounting denominator (#976): the old 1.5x tolerance let 285/381 print clean.
        // Existing dom-walk/dom-settled labels stay stable; the new terms show how the equality closed.
        ["dom-walk", population?.duringWalk ?? -1],
        ["dom-settled", population === null ? -1 : `${population.settled}${population.stabilized ? "" : "+"}`],
        ["dom-judged", population?.accounting.walked ?? -1],
        ["dom-skip-head", population?.accounting.skipped.documentHead ?? -1],
        ["dom-skip-dev", population?.accounting.skipped.devChrome ?? -1],
        ["dom-inaccessible", population?.accounting.inaccessible ?? -1],
        ["dom-added", population?.accounting.added ?? -1],
        ["dom-detached", population?.accounting.detached ?? -1],
        ["dom-mutations", population?.accounting.walkMutations ?? -1],
        ["dom-settle-mutations", population?.accounting.settleMutations ?? -1],
        ["theme-request", opts.theme ?? "account"],
        ["theme-id", settingsEvidence.themeResolution?.id ?? (opts.theme === null ? "account" : "none")],
        ["theme-source", settingsEvidence.themeResolution?.source ?? (opts.theme === null ? "account" : "unresolved")],
        ["theme-root", pixels.samples?.themeRender.rootDataTheme ?? "default"],
        ["theme-light", pixels.samples?.themeRender.subjectPolarities.light ?? -1],
        ["theme-dark", pixels.samples?.themeRender.subjectPolarities.dark ?? -1],
        ["theme-polarity-unknown", pixels.samples?.themeRender.subjectPolarities.unknown ?? -1],
        // The REACH denominator (#653) rides the machine line beside `census=` for the same reason: the
        // tap-target / action-door / silhouette families are viewport-bound, so `p1=0` means nothing until
        // a reader knows how many offered controls were measured and how many were skipped.
        ...reachRows(reach),
        // The OBSCURED denominator (#816) beside the others: `obscured=0` is only a verdict when a reader
        // can see how many elements were asked whether they still own their own centre.
        ["obscured-scanned", pixels.samples?.obscuredScan?.candidates ?? -1],
        ["obscured-unaskable", pixels.samples?.obscuredScan?.unaskable ?? -1],
        ["px-backdrops", pixels.sampled],
        ["no-verdict", pixels.refusals.length],
        ["nav", navVerdict(navError, actionsFailed)],
        ["out", outPath],
      ],
    });
  });
}
