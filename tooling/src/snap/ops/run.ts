// The single-run pass: launch, drive+capture every page, the watch series, report, baseline/diff,
// the manifest, and the RESULT line. One browser run, many pieces of evidence.
import { artifactFile } from "../../_shared/artifact-out.ts";
import { aggregateScope, factBatchId } from "../../_shared/artifact-scope.ts";
import { artifactKey } from "../../_shared/artifacts.ts";
import { closeProbeSessionAfterError } from "../../_shared/browser.ts";
import { browserEvidenceRetention } from "../../_shared/browser-capture.ts";
import type { ProbeSession } from "../../_shared/browser-contract.ts";
import { summarizeOrbConsoleCompleteness } from "../../_shared/browser-diagnostics.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { printVerdictReceipt } from "../../_shared/evidence.ts";
import { loadSuspectSummary } from "../../_shared/load-budget.ts";
import type { AppearanceInvariantResult } from "../contract/appearance-invariants.ts";
import type { ArmPairInput, ArmRunContext } from "../contract/arms.ts";
import type { EvidenceWindow, SessionRunHooks, SessionRunTarget, SnapDetailedPlan, SnapDetailedResult } from "../contract/run.ts";
import { snapExitCode, snapExitState } from "../contract/run-facts.ts";
import type { Args, CaptureOutcome, ReportCtx, ShotPlan } from "../contract/types.ts";
import { pageOut, shouldProduceShot } from "../lib/out-names.ts";
import { ratePostureResultPairs } from "../lib/rate-posture.ts";
import { throttleResultValue } from "../lib/throttle.ts";
import { captureAppearanceInvariantRows } from "./appearance-invariant-runtime.ts";
import { evaluateAppearanceInvariantCell } from "./appearance-invariants.ts";
import { motionReceiptFor } from "./arms/motion.ts";
import { armPairLedger, beginRunArms, pageArmExit, pageArmFacts, pageArmFailures, writePageArmEvidence } from "./arms/registry.ts";
import { capturePages } from "./capture.ts";
import { runBaselineOrDiff } from "./diff.ts";
import { watchIntervalMs } from "./flags-support.ts";
import { snapDestination } from "./guards.ts";
import { appliedAcrossContexts, writeCoreCaptureEvidence, writeManifestIfRequested } from "./manifest.ts";
import { fileOriginNoiseCount, isSandboxTraceNoise, partitionFailedRequests } from "./noise.ts";
import {
  deviceResultValue,
  extendEvidenceThroughWatch,
  motionResultValue,
  navResultVerdict,
  printCaptureLog,
  printCheckpointScope,
  printCropNote,
  printPageReport,
  printProbeMotionWarning,
  printWatchBlock,
  scaleResultValue,
  sessionForEvidence,
} from "./report.ts";
import { printArmSummaries } from "./report-summary-blocks.ts";
import { registerSnapDiagnosticCompleteness, registerSnapFactBatch, registerSnapResultPairs, writeSnapDiagnosticEvidence } from "./run-bundle.ts";
import { cascadeRuntimeFor, debuggingPortFor, finishSession, launchSnapSession, readSnapEnvironmentEvidence, snapEnvironmentMismatchCount } from "./session.ts";
import { themeStampExit } from "./theme-stamp.ts";
import { buildFailureSummary, hasSnapFailure, outcomeTotals } from "./verdict.ts";
import { runWatchSeries } from "./watch.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

async function captureAppearanceResults(
  session: ProbeSession,
  opts: Args,
  detailedPlan: SnapDetailedPlan | undefined,
): Promise<readonly AppearanceInvariantResult[]> {
  if (detailedPlan === undefined || detailedPlan.appearanceRows.length === 0) {
    return [];
  }
  const receipts = await captureAppearanceInvariantRows(session, opts, detailedPlan.appearanceRows);
  return receipts.map((receipt) => {
    const policy = detailedPlan.appearanceRows.find((row) => row.id === receipt.rowId);
    if (policy === undefined) {
      throw new Error(`INSTRUMENT ERROR: Appearance receipt ${receipt.rowId} has no matrix policy`);
    }
    return { receipt, evaluation: evaluateAppearanceInvariantCell(policy, receipt) };
  });
}

function hasAppearanceInvariantPlan(detailedPlan: SnapDetailedPlan | undefined): boolean {
  return detailedPlan !== undefined && detailedPlan.appearanceRows.length > 0;
}

/** A session call's evidence window: an outcome that did not ask for `--checkpoint` gets the window as its
 *  range, so the console/page-error verdicts and the report's scoping read THIS call's slice of the daemon's
 *  rings. The one-shot host passes null and stays byte-identical. */
function windowOutcomes(outcomes: readonly CaptureOutcome[], session: ProbeSession, window: EvidenceWindow | null): void {
  if (window === null) {
    return;
  }
  for (const outcome of outcomes) {
    if (outcome.evidenceRange === null) {
      outcome.evidenceRange = {
        consoleStart: window.consoleStart,
        consoleEnd: session.evidence.console.cursor(),
        pageErrorStart: window.pageErrorStart,
        pageErrorEnd: session.evidence.pageErrors.cursor(),
        diagnosticWindow: session.diagnosticWindow.value,
      };
    }
  }
}

/** THE ONE CAPTURE PASS (docs/design/1208-instrument-substrate.md §5, invariant 4 — "one implementation"):
 *  capture → css evidence → appearance → report → baseline/diff → manifest → verdict, against a session
 *  somebody else launched. `runSnapDetailed` hosts it for the one-shot path (launch + run + finish); the
 *  session daemon hosts it per call (ops/session-daemon-call.ts). The two seams that legitimately differ —
 *  the evidence window and what "finish" means — ride `hooks`; nothing else forks. */
export async function runOnSession(session: ProbeSession, opts: Args, target: SessionRunTarget, hooks: SessionRunHooks): Promise<SnapDetailedResult> {
  const { url, name, out, key, produceShot } = target;
  const { detailedPlan } = hooks;
  const totalPages = opts.pages;
  {
    // BEFORE anything navigates — a request log wired after `page.goto` silently starts mid-stream (#1199).
    // Bound HERE rather than in `runSnapDetailed` (where the pre-split code had it) so a session call gets
    // the arms on exactly the same terms as a one-shot: one implementation, two hosts.
    const arms = beginRunArms(session, opts);
    const plan: ShotPlan = { url, out, produceShot };
    const ratePosture = await arms.ratePosture();
    await arms.prepare();
    const outcomes = await capturePages({ session, opts, plan, navigatePage: target.navigate, runArms: arms });
    windowOutcomes(outcomes, session, hooks.window);
    // The RUN arms measure on the SETTLED pages, after the drive queue and every settled-surface capture:
    // the cascade read wants the whole browser's SDK runtime, and the Lighthouse audit's subject IS that
    // settled page (ops/arms/lighthouse.ts). A refusal is not a finding — it exits 2 through `arms.exit`.
    const armCtx: ArmRunContext = {
      session,
      opts,
      outcomes,
      name: key,
      provisions: { debuggingPort: await debuggingPortFor(session), cascadeRuntime: cascadeRuntimeFor(session) },
      ratePosture,
    };
    await arms.measure(armCtx);
    const appearance = await captureAppearanceResults(session, opts, detailedPlan);
    const evidenceSession = sessionForEvidence(session, outcomes);
    await writeSnapDiagnosticEvidence(key, evidenceSession.diagnostics);
    // --watch: a timed series on PAGE 0 after everything settled (a streaming turn reflow, transient states).
    const firstPage = session.pages[0];
    if (firstPage === undefined) {
      throw new Error("INSTRUMENT ERROR: launched Snap session has no first page");
    }
    const watchTicks = opts.watchMs > 0 ? await runWatchSeries(firstPage, opts, pageOut(out, 0, totalPages)) : [];
    extendEvidenceThroughWatch(outcomes, session);
    const { failed, viteChurn, fileOrigin } = partitionFailedRequests(session.requests.values());
    // What every arm computes its totals over: the per-page outcomes plus the run's artifact naming (the
    // pixel arm's `out=`/`crop=` read it).
    const pairInput: ArmPairInput = { opts, outcomes, ctx: { ...plan, out: pageOut(out, 0, totalPages), failed, totalPages } };
    for (const outcome of outcomes) {
      const ctx: ReportCtx = { ...plan, out: pageOut(out, outcome.pageIndex, totalPages), failed, totalPages };
      printPageReport(sessionForEvidence(session, [outcome]), outcome, opts, ctx);
    }
    printWatchBlock(watchTicks);
    printCheckpointScope(session, evidenceSession);
    printCaptureLog(evidenceSession, failed, viteChurn, fileOrigin);
    await arms.report(armCtx);
    printCropNote(opts, { ...plan, failed, totalPages });
    printProbeMotionWarning(opts);
    // The end card opens with one derived line per arm that actually measured something (#1345), so the
    // answer to "what did the arm I asked for find" precedes the 40-token RESULT line rather than hiding
    // inside it.
    printArmSummaries(outcomes);
    // Baseline/diff compares PAGE 0's shot (the canonical surface); multi-page baselines aren't a use case yet.
    const { diffPairs, ssimFailed } = await runBaselineOrDiff(opts, pageOut(out, 0, totalPages), key);

    const totals = outcomeTotals(outcomes);
    const browserEnvironment = await readSnapEnvironmentEvidence(session);
    const environmentFailures = snapEnvironmentMismatchCount(browserEnvironment);
    const watchFailures =
      watchTicks.filter((tick) => tick.shotError !== null).length +
      watchTicks.reduce((count, tick) => count + tick.evals.filter((entry) => entry.failed).length, 0);
    // Exit non-zero if anything observably went wrong, so `snap` is CI-usable.
    const failureSummary = buildFailureSummary({
      outcomes,
      pageErrors: evidenceSession.pageErrors.length,
      failedRequests: failed.length,
      consoleMessages: evidenceSession.consoleMessages,
      strictConsole: opts.strictConsole,
      watch: watchFailures,
      diff: Number(ssimFailed),
      environment: environmentFailures,
      appearance: appearance.filter((result) => result.evaluation.status !== "ok").length,
      arms: { ...pageArmFailures(pairInput), ...arms.failures() },
    });
    const red = hasSnapFailure(failureSummary);
    const artifacts = await hooks.finish(red);
    const manifestInput = {
      status: red ? "fail" : "pass",
      target: { url, name },
      environment: {
        viewport: opts.viewport,
        device: opts.device,
        colorScheme: opts.colorScheme,
        reducedMotion: opts.reducedMotion || opts.probe,
        appearance: opts.appearance,
        appearanceApplied: appliedAcrossContexts(
          opts.appearance !== null,
          session.contexts.map((context) => context.settingsEvidence.appearanceApplied),
        ),
        theme: opts.theme,
        themeApplied: appliedAcrossContexts(
          opts.theme !== null,
          session.contexts.map((context) => context.settingsEvidence.themeApplied),
        ),
        browser: browserEnvironment,
        settings: session.contexts.map((context) => context.settingsEvidence),
      },
      failures: failureSummary,
      traces: artifacts.traces,
      hars: artifacts.hars,
      console: session.consoleMessages,
      diagnostics: session.diagnostics,
      diagnosticCompleteness: session.diagnosticCompleteness,
      ...(opts.checkpoint
        ? {
            evidence: {
              scope: "checkpoint" as const,
              console: evidenceSession.consoleMessages,
              pageErrors: evidenceSession.pageErrors,
              diagnostics: evidenceSession.diagnostics,
              diagnosticCompleteness: evidenceSession.diagnosticCompleteness,
            },
          }
        : {}),
      pageErrors: session.pageErrors,
      failedRequests: failed,
      ...(viteChurn.length === 0 ? {} : { viteDepChurn: viteChurn }),
      appearance,
      captures: outcomes,
      // The RESOLVED interval, never the raw sentinel: the artifact states what the series actually ran at.
      ...(watchTicks.length === 0 ? {} : { watch: { totalMs: opts.watchMs, intervalMs: watchIntervalMs(opts), ticks: watchTicks } }),
    } as const;
    // The retention batch rides in (#1507): the core-capture populations REPORT what the bounded rings did
    // rather than asserting a clean zero over them. Sampled here, where the capture is settled — the same
    // question the run's `snap-browser-retention-v1` fact asks a few lines below.
    await writeCoreCaptureEvidence(manifestInput, browserEvidenceRetention(session));
    // #1342: every page arm files what it PRINTED, before the facts are registered — the run index binds
    // each artifact to its producer arm's fact, so `EVIDENCE <run.json>` names a slot a second reader can
    // actually open.
    await writePageArmEvidence(pairInput);
    const manifestPath = await writeManifestIfRequested(opts, name, manifestInput);
    // THE RESULT LINE. Every arm-owned field comes from the arm that measured it (contract/arms.ts) — the
    // ledger hands each one back at the position it has always printed in, because the line's field order
    // is a contract with every script and agent that greps it. `ledger.rest()` at the tail is where a NEW
    // arm's pairs land with no edit here, and a claim for a pair its arm did not produce THROWS rather
    // than quietly dropping a field.
    const ledger = armPairLedger(pairInput, arms.pairs());
    const resultPairs = [
      ...ledger.some("shot", "out"),
      ["pages", totalPages] as const,
      ["watch", watchTicks.length] as const,
      ["watch-fails", watchFailures] as const,
      ...ledger.arm("aria"),
      ...ledger.arm("map"),
      ...ledger.arm("eval"),
      ...ledger.arm("contrast"),
      ...ledger.arm("assert"),
      ["css-fails", failureSummary.css] as const,
      ...ledger.some("dead-css", "deadcss-fails", "emptycss-fails"),
      ["environment-fails", failureSummary.environment] as const,
      ["appearance-fails", failureSummary.appearance] as const,
      ["console-errors", failureSummary.consoleErrors] as const,
      ["sandbox-trace-noise", session.consoleMessages.filter(isSandboxTraceNoise).length] as const,
      // #1315: the file:// unique-origin note a CDP attach provokes — counted, printed, never judged.
      ["file-origin-noise", fileOriginNoiseCount(session.consoleMessages, fileOrigin)] as const,
      ["console-warnings", evidenceSession.consoleMessages.filter((entry) => entry.type === "warning").length] as const,
      [
        "boot-console-warnings",
        session.consoleMessages.filter((entry) => entry.type === "warning").length -
          evidenceSession.consoleMessages.filter((entry) => entry.type === "warning").length,
      ] as const,
      ["trace", artifacts.traces[0] ?? "none"] as const,
      ["har", artifacts.hars[0] ?? "none"] as const,
      ["json", manifestPath ?? "none"] as const,
      ...ledger.some("shot", "crop"),
      ["scale", scaleResultValue(opts, browserEnvironment)] as const,
      ["device", deviceResultValue(browserEnvironment)] as const,
      ["motion-evidence", motionResultValue(opts)] as const,
      ["throttle", throttleResultValue(opts.cpuThrottle, opts.network)] as const,
      ["file-actions", outcomes.reduce((count, outcome) => count + outcome.fileActions.length, 0)] as const,
      ["files-driven", outcomes.reduce((count, outcome) => count + outcome.fileActions.reduce((files, action) => files + action.files, 0), 0)] as const,
      ["nav", navResultVerdict(totals.navigation, totals.navActions)] as const,
      ["nav-actions-failed", totals.navActions] as const,
      ["steps-failed", totals.steps] as const,
      ["page-errors", evidenceSession.pageErrors.length] as const,
      ["failed-req", failed.length] as const,
      ["vite-dep-churn", viteChurn.length] as const,
      ...ledger.some("dead-css", "deadcss", "emptycss"),
      ...ledger.arm("lighthouse"),
      ...ledger.arm("requests"),
      ...ledger.rest(),
      ...diffPairs,
      ...ratePostureResultPairs(ratePosture),
    ];
    // ONE LINE ANSWERS "was anything measured under load, and how loaded was it?" (#1616 done-criterion 1).
    // The arms already publish their own member (`motion=LOAD-SUSPECT`, `app-snapshot=load-suspect`,
    // `perf=load-suspect`), so the aggregate is DERIVED from the pairs rather than plumbed a second time —
    // a second accumulator is how a summary and its own arms come to disagree. It rides beside the
    // `load=`/`budget-factor=` pair the rate posture already prints.
    resultPairs.push(...loadSuspectSummary(resultPairs));
    const terminal = printVerdictReceipt("snap", {
      verdict: red ? 1 : 0,
      denominators: { pages: { value: totalPages, refuseWhen: "zero" }, ...arms.denominators() },
      pairs: resultPairs,
    });
    const finalCode = arms.exit(pageArmExit(pairInput, themeStampExit(outcomes, terminal.exit)));
    const scope = aggregateScope();
    registerSnapFactBatch({
      id: factBatchId(key),
      core: [
        {
          kind: "core",
          schema: "snap-rate-posture-v1",
          source: "browser-system-info+host-load",
          lifetime: "one Snap run/cell",
          scope,
          artifacts: [],
          data: ratePosture,
        },
        {
          kind: "core",
          schema: "snap-browser-retention-v1",
          source: "bounded-browser-evidence-rings",
          lifetime: "one Snap run/cell",
          scope,
          artifacts: [],
          data: browserEvidenceRetention(session),
        },
        {
          kind: "core",
          schema: "snap-core-run-v1",
          source: "snap-run-owner",
          lifetime: "one Snap run/cell",
          scope,
          artifacts: [],
          data: {
            exit: snapExitCode(finalCode),
            state: snapExitState(finalCode),
            pages: opts.pages,
            contexts: session.contexts.length,
            captures: outcomes.length,
            fileActions: outcomes.reduce((count, outcome) => count + outcome.fileActions.length, 0),
            failedRequests: failed.length,
            pageErrors: evidenceSession.pageErrors.length,
            diagnostics: evidenceSession.diagnostics.length,
            failures: failureSummary,
          },
        },
      ],
      arms: [...pageArmFacts(pairInput, {}), ...arms.facts({})],
    });
    registerSnapResultPairs(terminal.pairs);
    return {
      // TWO ways this run can turn out not to be a verdict about the app at all (the zero-hygiene law,
      // _shared/evidence.ts): a REFUSED Lighthouse audit, and a requested THEME whose stamp never landed
      // (#1227). Either exits 2 regardless of what else the run found.
      code: finalCode,
      receipt: {
        failures: failureSummary,
        captures: outcomes,
        browser: browserEnvironment,
        settings: session.contexts.map((context) => context.settingsEvidence),
        appearance,
        diagnosticCompleteness: session.diagnosticCompleteness,
        motion: motionReceiptFor(session),
        scenario: null,
      },
    };
  }
}

/** The one-shot host: launch, run the one capture pass, finish (close) — every path closes the browser. */
export async function runSnapDetailed(opts: Args, detailedPlan?: SnapDetailedPlan): Promise<SnapDetailedResult> {
  const { url, name } = snapDestination(opts);
  // `name` may be a PATH the caller chose (`--out /tmp/shot.png`): the shot lands exactly there, while the
  // kind-dir siblings (trace/HAR/baseline) key off its sanitized basename and stay under reports/.
  const out = await artifactFile("snaps", name, ".png");
  const key = artifactKey(name);
  // Whether we write a PNG. --no-shot/--text suppress it, but --baseline/--diff
  // need pixels to compare, and --shot-of is itself a shot — so those force it on.
  const produceShot = shouldProduceShot(opts);
  const session = await launchSnapSession(opts, {
    pages: opts.pages,
    requireCascadeRuntime: hasAppearanceInvariantPlan(detailedPlan),
  });
  try {
    const result = await runOnSession(
      session,
      opts,
      { url, name, out, key, produceShot, navigate: true },
      {
        window: null,
        finish: async (red) => await finishSession(session, red, key, opts.failureEvidence),
        ...(detailedPlan === undefined ? {} : { detailedPlan }),
      },
    );
    if (result.receipt !== null) {
      registerSnapDiagnosticCompleteness(summarizeOrbConsoleCompleteness(result.receipt.diagnosticCompleteness));
    }
    return result;
  } catch (error) {
    return await closeProbeSessionAfterError(session, error);
  }
}

export async function snap(opts: Args): Promise<number> {
  return (await runSnapDetailed(opts)).code;
}
