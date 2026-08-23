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
import { buildUrl, launchProbeSession } from "@orb/tooling/_shared/browser";
import { instrumentError } from "@orb/tooling/_shared/evidence";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { Args, BackdropRefusal } from "../contract/types.ts";
import { checkScriptErrors } from "../lib/checks-quality.ts";
import { collectFindings } from "../lib/collect.ts";
import { censusGap, censusTotal, SAMPLE_COLLECTION_PREFIX, walkFailureGap } from "../lib/evidence.ts";
import { isAtOrAboveSeverity } from "../lib/severity.ts";
import { navigateAndReveal } from "./drive.ts";
import { resolvePixelBackdrops } from "./pixels.ts";
import { countBySeverity, navVerdict, printBackdropRefusals, printFindingsTable } from "./report.ts";

refuseDirectInvocation(import.meta.url, "pnpm design-audit");

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

  const { navError, actionsFailed, samples } = await navigateAndReveal(session.page, opts, url);
  // ZERO HYGIENE (#409), the apparatus arm: the WALK failing is an instrument failure, not a finding.
  // An HTTP nav error stays a violation below — that one IS a fact about the page.
  if (navError?.startsWith(SAMPLE_COLLECTION_PREFIX) === true) {
    await session.browser.close();
    print(`URL          ${url}`);
    return instrumentError(walkFailureGap(navError));
  }
  // Backdrops the DOM walk could not resolve are settled from real pixels BEFORE the browser closes —
  // the sampler needs the page still on screen at the scroll position the samples were read at.
  const pixels = samples === null ? { samples: null, sampled: 0, refusals: [] as BackdropRefusal[] } : await resolvePixelBackdrops(session.page, samples);
  await session.browser.close();
  const census = samples === null ? 0 : censusTotal(samples);
  // The evidence arm: a walk that saw nothing folds every check family to zero and prints
  // "no findings — clean". Guarded only where the page LOADED — a nav error is reported as itself.
  if (navError === null && census === 0) {
    print(`URL          ${url}`);
    return instrumentError(censusGap(url));
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
  printBackdropRefusals(pixels.refusals);
  printFindingsTable(findings);

  printResult("design-audit", [
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
    ["px-backdrops", pixels.sampled],
    ["no-verdict", pixels.refusals.length],
    ["nav", navVerdict(navError, actionsFailed)],
    ["out", outPath],
  ]);
  return failed ? 1 : 0;
}
