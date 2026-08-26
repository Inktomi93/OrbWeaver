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
import { artifactFile, print, printResult, routeSlug } from "@orb/tooling/_shared/artifacts";
import { buildUrl, launchProbeSession, withProbeSession } from "@orb/tooling/_shared/browser";
import type { EvidenceGap } from "@orb/tooling/_shared/evidence";
import { instrumentError } from "@orb/tooling/_shared/evidence";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { CensusReachInput, RawSamples } from "../contract/samples.ts";
import type { Args, BackdropRefusal } from "../contract/types.ts";
import { checkScriptErrors } from "../lib/checks-quality.ts";
import { collectFindings } from "../lib/collect.ts";
import { censusGap, censusTotal, reachGap, readinessGap, SAMPLE_COLLECTION_PREFIX, walkFailureGap } from "../lib/evidence.ts";
import { isAtOrAboveSeverity } from "../lib/severity.ts";
import { stageLabel } from "../lib/stage-request.ts";
import { navigateAndReveal } from "./drive.ts";
import { resolvePixelBackdrops } from "./pixels.ts";
import { countBySeverity, navVerdict, printBackdropRefusals, printCensusReach, printFindingsTable } from "./report.ts";

refuseDirectInvocation(import.meta.url, "pnpm design-audit");

/** ZERO HYGIENE, every arm, in one place (#409 + #653 + #678). Returns the gap that makes this run an
 *  INSTRUMENT failure rather than a verdict, or null when the walk is entitled to be believed:
 *   • `readinessGap` — on an app origin, the app never published `data-app-ready`: the walk censused the
 *     SHELL, which is a small NON-ZERO count the two arms below are structurally blind to;
 *   • `censusGap` — the walk censused nothing at all (blank mount / error boundary / wrong route);
 *   • `reachGap`  — it censused plenty of text but reached NOT ONE offered control, so the tap-target,
 *     action-door and silhouette families each folded an empty list into "no findings".
 *  Only for a page that LOADED — a nav error is reported as itself. */
function evidenceGapOf(census: number, samples: RawSamples | null, url: string, appReady: boolean): EvidenceGap | null {
  // READINESS FIRST (#678): a shell censuses a small-but-nonzero node count, so this arm has to be judged
  // BEFORE the two count-based ones — they cannot see it, and the run would otherwise print a clean verdict
  // over a page whose app never mounted.
  const readiness = readinessGap(url, appReady);
  if (readiness !== null) {
    return readiness;
  }
  if (census === 0) {
    return censusGap(url);
  }
  return samples === null ? null : reachGap(samples);
}

/** The reach rows of the RESULT line. `-1` is the absent-counters arm (a pinned pre-#653 sample set) —
 *  a refusal to state, never a zero that reads as "nothing was skipped". */
function reachRows(reach: CensusReachInput | undefined): [string, number | string][] {
  if (reach === undefined) {
    return [
      ["reached", -1],
      ["skipped-offviewport", -1],
      ["reveal-budget", "unreported"],
    ];
  }
  return [
    ["reached", reach.onScreen + reach.revealed],
    ["skipped-offviewport", reach.skippedOffViewport],
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
    const { navError, actionsFailed, appReady, samples } = await navigateAndReveal(session.page, opts, url);
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
    const gap = navError === null ? evidenceGapOf(census, pixels.samples, url, appReady) : null;
    if (gap !== null) {
      print(`URL          ${url}`);
      return instrumentError(gap);
    }

    // Uncaught page exceptions are findings in their own right (script-error, P0) — the probe
    // session's pageerror capture is wired from nav start (_shared/browser.ts wirePage).
    const findings = pixels.samples === null ? [] : collectFindings(pixels.samples);
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
    printBackdropRefusals(pixels.refusals);
    printFindingsTable(findings);

    printResult("design-audit", [
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
      // The DENOMINATOR (#409): how many nodes the walk censused. `findings=0` means nothing only when
      // this is non-zero, and a reader of the machine line is entitled to see it.
      ["census", census],
      // The REACH denominator (#653) rides the machine line beside `census=` for the same reason: the
      // tap-target / action-door / silhouette families are viewport-bound, so `p1=0` means nothing until
      // a reader knows how many offered controls were measured and how many were skipped.
      ...reachRows(reach),
      ["px-backdrops", pixels.sampled],
      ["no-verdict", pixels.refusals.length],
      ["nav", navVerdict(navError, actionsFailed)],
      ["out", outPath],
    ]);
    return failed ? 1 : 0;
  });
}
