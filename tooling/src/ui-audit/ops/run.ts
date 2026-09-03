// Orchestrates audit collection and reporting. Unresolved DOM backdrops take the shared pixel-sampling
// path; anything the browser cannot sample is reported as NO VERDICT rather than fabricated contrast.
import { writeFile } from "node:fs/promises";
import type { SettingsShimEvidence } from "@orb/tooling/_shared/appearance";
import { artifactFile } from "@orb/tooling/_shared/artifact-out";
import { print, routeSlug } from "@orb/tooling/_shared/artifacts";
import type { ProbeSession } from "@orb/tooling/_shared/browser";
import { attachProbeSession, buildUrl, launchProbeSession, withProbeSession } from "@orb/tooling/_shared/browser";
import { readBrowserEnvironment } from "@orb/tooling/_shared/browser-environment";
import type { EvidenceGap } from "@orb/tooling/_shared/evidence";
import { instrumentError, printEvidenceGaps, printVerdict } from "@orb/tooling/_shared/evidence";
import type { ExitCode } from "@orb/tooling/_shared/exit-contract";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { resolveSessionAttach } from "../../snap/index.ts";
import type { RawSamples } from "../contract/samples.ts";
import type { DriveStateCandidate } from "../contract/surface-state.ts";
import type { Args, BackdropRefusal, DomPopulation } from "../contract/types.ts";
import { checkScriptErrors } from "../lib/checks-quality.ts";
import { collectAudit } from "../lib/collect.ts";
import {
  actionsFailedGap,
  censusCapGap,
  censusGap,
  censusThinGap,
  censusTotal,
  failureSurfaceGap,
  navErrorGap,
  reachGap,
  readinessGap,
  SAMPLE_COLLECTION_PREFIX,
  themeProvenanceGap,
  walkFailureGap,
} from "../lib/evidence.ts";
import { populationEvidenceGap } from "../lib/population.ts";
import { reachRows, surfaceStateRows } from "../lib/result-rows.ts";
import { isAtOrAboveSeverity } from "../lib/severity.ts";
import { stageLabel } from "../lib/stage-request.ts";
import { buildSurfaceStateAccounting } from "../lib/surface-state.ts";
import { navigateAndReveal } from "./drive.ts";
import { hoverPassLabel, resolveHoverStates } from "./hover.ts";
import { appFailureSurface, shellStateSnapshot } from "./page-validate.ts";
import { resolvePixelBackdrops } from "./pixels.ts";
import {
  countBySeverity,
  navVerdict,
  printBackdropRefusals,
  printCensusReach,
  printFindingsTable,
  printObscuredScan,
  printPopulationAccounting,
  printSurfaceState,
} from "./report.ts";

refuseDirectInvocation(import.meta.url, "pnpm design-audit");

/** The app's failure-surface declare, read as a plain expression (no page function to serialize): the
 *  attribute's value, or `null` when nothing on the page declares one. */
const READ_FAILURE_SURFACE_JS = "(document.querySelector('[data-app-failure]') || { getAttribute: () => null }).getAttribute('data-app-failure')";

/** ZERO HYGIENE, every arm, in one place (#409 + #653 + #678 + #808). Returns the gap that makes this run
 *  an INSTRUMENT failure rather than a verdict, or null when the walk is entitled to be believed:
 *   • `readinessGap` — on an app origin, the app never published `data-app-ready`: the walk censused the
 *     SHELL, which is a small NON-ZERO count the arms below are structurally blind to;
 *   • `censusGap` — the walk censused nothing at all (blank mount / error boundary / wrong route);
 *   • `censusThinGap` — exact subject accounting failed: the pre-walk settle, judged identity snapshot,
 *     classified skips, or final identity set disagree (the arm the three zero-tests cannot express);
 *   • `reachGap`  — it censused plenty of text but reached NOT ONE offered control, so the tap-target,
 *     action-door and silhouette families each folded an empty list into "no findings";
 *  `censusCapGap` (#1038) is deliberately NOT in this chain: a truncated bound is a partial verdict, not
 *  an absent walk, so it rides beside `populationEvidenceGap` below — printed AFTER the population table
 *  rather than instead of it, because the numbers a reader needs to size the truncation are in that table.
 *  Only for a page that LOADED and that the app did not declare a failure surface for — the nav, action and
 *  `data-app-failure` arms are terminal in `runUiAudit` before any of this is reached (#1081). */
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

/** The attached browser and its inherited navigation base. */
interface Attached {
  readonly session: ProbeSession;
  readonly base: string;
}

/** Attach without fallback: a bare `--session` inherits its binding URL, while explicit `--base`
 *  remains a composing navigation override. */
async function launchOrAttach(opts: Args): Promise<Attached | ExitCode> {
  if (opts.session === null) {
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
    return { session, base: opts.base };
  }
  const attach = resolveSessionAttach(opts.session);
  if (!attach.ok) {
    print(attach.message);
    return EXIT.toolError;
  }
  const session = await attachProbeSession(attach.endpoint, attach.environment);
  return { session, base: opts.baseExplicit ? opts.base : attach.row.binding.url };
}

export async function runUiAudit(opts: Args): Promise<number> {
  // `--out` names an artifact BASE under reports/design-audit/ — or, when it is path-shaped, the exact
  // file to write (_shared/artifacts.ts owns that contract for every probe).
  const outPath = await artifactFile("design-audit", opts.out ?? routeSlug(opts.route), ".json");

  const attached = await launchOrAttach(opts);
  if (typeof attached === "number") {
    return attached;
  }
  const { session, base } = attached;
  const url = buildUrl(base, opts.route);

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one linear ownership closure keeps every audit verdict and early return inside the same guaranteed cleanup boundary.
  return await withProbeSession(session, async () => {
    const { navError, actionsFailed, appReady, samples, population } = await navigateAndReveal(session.page, opts, url);
    const browserEnvironment = await readBrowserEnvironment(session.page, session.environmentContract);
    if (browserEnvironment.mismatches.length > 0) {
      print(`URL          ${url}`);
      return instrumentError({ evidence: "browser environment", detail: browserEnvironment.mismatches.join("; ") });
    }
    // ZERO HYGIENE (#409), the apparatus arm: the WALK failing is an instrument failure, not a finding.
    // THE HTTP NAV ERROR USED TO STAY A VIOLATION HERE ("that one IS a fact about the page") and #1081
    // corrected the CONSEQUENCE, not the fact: it is still a fact about the page and this run still reports
    // it, but as a refusal rather than as a verdict, because `ops/drive.ts` collected no samples for it and
    // the tables printed under a nav error described nothing.
    if (navError?.startsWith(SAMPLE_COLLECTION_PREFIX) === true) {
      print(`URL          ${url}`);
      return instrumentError(walkFailureGap(navError));
    }
    // THE PRE-MEASUREMENT REFUSALS (#1081), all three terminal for one reason: past this point every table
    // this file prints is a fold over `pixels.samples`, and in each of these cases those samples describe
    // either nothing at all or a surface nobody asked for. The same call `ops/matrix.ts` already makes at
    // matrix discovery (nav / actions / readiness ⇒ INSTRUMENT ERROR), now made by the single-run path too.
    if (navError !== null) {
      print(`URL          ${url}`);
      return instrumentError(navErrorGap(navError));
    }
    if (actionsFailed > 0) {
      print(`URL          ${url}`);
      return instrumentError(actionsFailedGap(actionsFailed, opts.actions.length));
    }
    // THE FAILURE-SURFACE DECLARE: read from the page itself, before a single check family folds. The app
    // stamps `data-app-failure` on its not-found boundary and its crash fallback (packages/client/src/lib/
    // app-failure-surface.tsx) precisely so an instrument cannot mistake either for a surface — and this
    // read has to happen HERE rather than beside the shell snapshot below, which runs after the gap check
    // that would already have printed a verdict.
    const failureKind = appFailureSurface(await session.page.evaluate(READ_FAILURE_SURFACE_JS));
    if (failureKind !== null) {
      print(`URL          ${url}`);
      return instrumentError(failureSurfaceGap(url, failureKind));
    }
    // Backdrops the DOM walk could not resolve are settled from real pixels BEFORE the browser closes —
    // the sampler needs the page still on screen at the scroll position the samples were read at.
    const pixelPass = samples === null ? { samples: null, sampled: 0, refusals: [] as BackdropRefusal[] } : await resolvePixelBackdrops(session.page, samples);
    // The FORCED-STATE pass runs LAST of the in-browser passes and only on a hover-capable environment:
    // it holds `:hover` on one subject at a time over CDP, so nothing else may be sampling meanwhile.
    // It releases everything it forced and then re-reads every candidate's rest state to prove it (see
    // ops/hover.ts) — an audit whose later samples were taken through a stuck `:hover` is worse than one
    // that never asked the question.
    const hover = pixelPass.samples === null ? null : await resolveHoverStates(session.page, pixelPass.samples, browserEnvironment.actual.hover === "hover");
    const pixels = hover === null ? pixelPass : { ...pixelPass, samples: hover.samples };
    const census = samples === null ? 0 : censusTotal(samples);
    const reach = pixels.samples?.censusReach;
    // The evidence arms: a walk that saw nothing — or one that reached no offered control — folds check
    // families to zero and prints "no findings — clean". Guarded only where the page LOADED.
    const settingsEvidence = session.contexts[0]?.settingsEvidence;
    if (settingsEvidence === undefined) {
      throw new Error("design-audit browser session has no settings-evidence owner");
    }
    // Unconditional now (#1081): the page-LOADED precondition this used to test for is the terminal nav arm
    // above, so a run that reaches here has a page whose samples are entitled to be judged.
    const gap = evidenceGapOf({ url, appReady, samples: pixels.samples, population, opts, settingsEvidence });
    if (gap !== null) {
      print(`URL          ${url}`);
      return instrumentError(gap);
    }

    // THE PANEL-AXIS DECLARE (#148 item 2): what shell configuration this run actually saw, read through
    // the ONE reader `__orb.shell()` (agent-bridge.ts) already owns — never re-derived as a fresh DOM
    // query here. Unguarded, same as `readBrowserEnvironment`/`resolvePixelBackdrops`/`collectAudit`
    // above: by this point the gap check already proved the app mounted and the bridge is a dev-build
    // guarantee, so a throw here is the same "the run itself is broken" class those calls already are —
    // never a graceful per-request failure like the bridge NAV calls in `_shared/nav.ts`, which a probe
    // legitimately drives against a possibly-stale/prod surface.
    // THE DRIVE DECLARE (#1059): the regime this run measured, read off the argv-ordered action queue
    // itself — an empty queue is the REST state a visitor lands on, any action puts the surface in a
    // DRIVEN one. The two are different populations (contract/surface-state.ts states the ruling), so
    // the run declares which one it holds instead of leaving a reader to infer it from `actions=`.
    const drive: DriveStateCandidate = opts.actions.length === 0 ? "rest" : "driven";
    const shellState = shellStateSnapshot(await session.page.evaluate("window.__orb ? window.__orb.shell() : null"));
    const surfaceStateAccounting = buildSurfaceStateAccounting(shellState, drive);

    // Uncaught page exceptions are findings in their own right (script-error, P0) — the probe
    // session's pageerror capture is wired from nav start (_shared/browser.ts wirePage).
    const audit = pixels.samples === null ? null : collectAudit(pixels.samples);
    const findings = audit === null ? [] : [...audit.findings];
    const familyScans = audit === null ? null : audit.familyScans;
    const populationAccounting = audit === null ? {} : audit.populationAccounting;
    const populationGap = populationEvidenceGap(populationAccounting);
    // A CHECKER THAT BROKE IS NOT A CLEAN SURFACE (#953). The coarse-pointer arm is genuinely
    // not-applicable and stays silent; a forced-state pass that THREW is exit-2 class, and it is stated
    // as its own gap so a reader can tell "this surface has no hover layer" from "we could not ask".
    const hoverGap: EvidenceGap | null =
      hover?.outcome.kind === "broke"
        ? {
            evidence: "forced-state pass",
            detail: `${hover.outcome.reason} — the :hover census was supposed to run and BROKE, so hover-contrast has NO VERDICT on this surface`,
          }
        : null;
    // A FORCED-STATE GROUP THAT THREW IS A GAP EVEN WHEN IT WITHHELD NOTHING (#1031). A failed group's
    // MEMBERS ride `withheld.forceFailed`, which already reds the run through `populationEvidenceGap` —
    // but a glow-only group has no members, so its failure contributed a printed `HOVER REFUSED` line
    // and nothing else, and the run reported a complete verdict over a state-gated glow arm it never
    // read. The count is the whole one (`forceFailedGroups`), never the three-quote sample.
    const forceGap: EvidenceGap | null =
      hover === null || hover.forceFailedGroups === 0
        ? null
        : {
            evidence: "the forced-state pass's per-group completeness",
            detail: `${String(hover.forceFailedGroups)} state group(s) failed to force or read (${hover.forceFailures.join("; ")}) — their members' hover paint and state-gated glow were never measured, so hover-contrast and the state glow arms are partial on this surface`,
          };
    // THE CAP GAP rides here, not in `evidenceGapOf` (#1038): it is the same class as `populationGap` —
    // the walk RAN and its verdict is partial — so it must not suppress the population table a reader
    // needs in order to size what was lost.
    const capGap = pixels.samples === null ? null : censusCapGap(pixels.samples);
    const evidenceGaps = [populationGap, capGap, hoverGap, forceGap].filter((row): row is EvidenceGap => row !== null);
    findings.push(...checkScriptErrors(session.pageErrors));
    const counts = countBySeverity(findings);
    // Only the findings decide the verdict here: a nav error or a failed action means the scan happened on
    // the WRONG surface, and since #1081 that is a NO VERDICT above rather than a red run whose tables
    // describe a page nobody asked for.
    const failed = findings.some((f) => isAtOrAboveSeverity(f.severity, opts.failOn));

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
          browserEnvironment,
          actions: opts.actions,
          // Both are the terminal arms' own counters (#1081) — an artifact only exists for a run that
          // MEASURED something, so in a written report they read `0` / `null` and say so on the record.
          actionsFailed,
          failOn: opts.failOn,
          navError,
          findings,
          counts,
          pixelSampledBackdrops: pixels.sampled,
          backdropRefusals: pixels.refusals,
          censusReach: reach ?? null,
          obscuredRecentred: pixels.samples?.obscuredScan?.recentred ?? 0,
          obscuredUnaskable: pixels.samples?.obscuredScan?.subjects ?? [],
          // The forced-state pass's own receipt: what it cost, what it could not hold, and whether every
          // release verified. `null` = the pass did not run at all (ops/hover.ts). `forceFailedGroups` is the
          // COMPLETE count (#1087 F2); `forceFailures` quotes at most three of the reasons.
          hoverPass:
            hover === null
              ? null
              : {
                  outcome: hover.outcome,
                  wallMs: hover.wallMs,
                  subjectsForced: hover.subjectsForced,
                  forceFailedGroups: hover.forceFailedGroups,
                  forceFailures: hover.forceFailures,
                },
          populationAccounting,
          // THE CAP LEDGER RIDES THE ARTIFACT (#1087 F1). stdout printed the truncation and the exit code
          // carried it, but a JSON consumer saw `populationVerdict: "complete"` and no trace of the bound —
          // and for the four rung-1 WALKER-PROVEN families (lib/collect.ts's rung table) there is no
          // population row to look at either, so the artifact was the ONLY channel and it read clean over a
          // census that had dropped findings. Both halves ship: the per-family ledger and its own verdict.
          censusCaps: pixels.samples?.censusCaps ?? null,
          censusCapVerdict: capGap === null ? "complete" : { verdict: "NO VERDICT", ...capGap },
          populationVerdict: populationGap === null ? "complete" : { verdict: "NO VERDICT", ...populationGap },
          hoverVerdict: hoverGap === null ? "complete" : { verdict: "NO VERDICT", ...hoverGap },
          forceVerdict: forceGap === null ? "complete" : { verdict: "NO VERDICT", ...forceGap },
          themeEvidence: {
            request: opts.theme,
            applied: settingsEvidence.themeApplied,
            resolution: settingsEvidence.themeResolution,
            rendered: pixels.samples?.themeRender ?? null,
          },
          // The census's stability bracket (#808) — the artifact says what the RESULT line says.
          domPopulation: population,
          // THE PANEL AXIS (#148 item 2): the ONE shell configuration this run measured, plus the
          // candidates/judged/withheld/excluded census over every configuration it did not — the SAME
          // accounting law `populationAccounting` above already carries for the rule population, one
          // dimension up.
          shellState,
          surfaceStateAccounting,
          // The REGIME this run measured (#1059) — the artifact says what the RESULT line says.
          drive,
        },
        null,
        2,
      ),
    );

    print(`URL          ${url}`);
    print(`report       ${outPath}`);
    print("");
    printCensusReach(reach);
    printObscuredScan(pixels.samples?.obscuredScan);
    printSurfaceState(shellState, surfaceStateAccounting, drive);
    printPopulationAccounting(populationAccounting);
    if (evidenceGaps.length > 0) {
      printEvidenceGaps(evidenceGaps);
      print("");
    }
    printBackdropRefusals(pixels.refusals);
    for (const failure of hover?.forceFailures ?? []) {
      print(`HOVER REFUSED ${failure}`);
    }
    printFindingsTable(findings, evidenceGaps.length === 0);

    let verdict: ExitCode = EXIT.clean;
    if (evidenceGaps.length > 0) {
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
        ["device-request", browserEnvironment.requested.device ?? "desktop"],
        ["device-actual", browserEnvironment.actual.device],
        ["viewport-actual", `${browserEnvironment.actual.innerViewport.width}x${browserEnvironment.actual.innerViewport.height}`],
        ["pointer", browserEnvironment.actual.pointer],
        ["hover", browserEnvironment.actual.hover],
        ["touch", browserEnvironment.actual.hasTouch ? "yes" : "no"],
        ["environment-fails", browserEnvironment.mismatches.length],
        ...surfaceStateRows(shellState, surfaceStateAccounting, drive),
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
        ["obscured-recentred", pixels.samples?.obscuredScan?.recentred ?? -1],
        ["obscured-unaskable", pixels.samples?.obscuredScan?.unaskable ?? -1],
        // The FORCED-STATE denominator + its COST. `hover-judged=0` is only a verdict when a reader can
        // see how many texts declare hover paint at all, how many subjects were actually held in :hover,
        // and — the release proof — that every one of them read back identical afterwards.
        ["hover-pass", hoverPassLabel(hover)],
        ["hover-candidates", pixels.samples?.hoverScan?.census.candidates ?? -1],
        ["hover-rules", pixels.samples?.hoverScan?.hoverRules ?? -1],
        ["hover-judged", pixels.samples?.hoverScan?.census.judged ?? -1],
        ["hover-subjects-forced", pixels.samples?.hoverScan?.subjectsForced ?? -1],
        ["hover-not-restored", pixels.samples?.hoverScan?.notRestored ?? -1],
        ["hover-sheets-unreadable", pixels.samples?.hoverScan?.sheetsUnreadable ?? -1],
        ["hover-selectors-unparseable", pixels.samples?.hoverScan?.unparseableSelectors ?? -1],
        ["hover-ms", hover?.wallMs ?? -1],
        ["px-backdrops", pixels.sampled],
        ["no-verdict", pixels.refusals.length],
        // `nav=` stays DERIVED rather than a printed literal, and it stays on the line because a dozen
        // review receipts cite it as the environment-alive proof — but since #1081 a RESULT line can only
        // ever carry `OK`: both other verdicts return an INSTRUMENT ERROR before any of this is computed.
        ["nav", navVerdict(navError, actionsFailed)],
        ["out", outPath],
      ],
    });
  });
}
