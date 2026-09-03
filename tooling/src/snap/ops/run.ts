// The single-run pass: launch, drive+capture every page, the watch series, report, baseline/diff,
// the manifest, and the RESULT line. One browser run, many pieces of evidence.
import type { Page } from "@playwright/test";
import { artifactFile } from "../../_shared/artifact-out.ts";
import { artifactKey } from "../../_shared/artifacts.ts";
import { closeProbeSessionAfterError } from "../../_shared/browser.ts";
import type { ProbeSession } from "../../_shared/browser-contract.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { printVerdict } from "../../_shared/evidence.ts";
import { loadResultPairs } from "../../_shared/load-budget.ts";
import type { AppearanceInvariantResult } from "../contract/appearance-invariants.ts";
import type { ArmPairInput, ArmRunContext } from "../contract/arms.ts";
import type { EvidenceWindow, SessionRunHooks, SessionRunTarget, SnapDetailedPlan, SnapDetailedResult } from "../contract/run.ts";
import type { Args, CaptureOutcome, ReportCtx, ShotPlan } from "../contract/types.ts";
import { pageOut, shouldProduceShot } from "../lib/out-names.ts";
import { throttleResultValue } from "../lib/throttle.ts";
import { captureAppearanceInvariantRows } from "./appearance-invariant-runtime.ts";
import { evaluateAppearanceInvariantCell } from "./appearance-invariants.ts";
import { armPairLedger, beginRunArms, pageArmFailures } from "./arms/registry.ts";
import { capturePages } from "./capture.ts";
import { runBaselineOrDiff } from "./diff.ts";
import { snapDestination } from "./guards.ts";
import { appliedAcrossContexts, writeManifestIfRequested } from "./manifest.ts";
import { isSandboxTraceNoise, partitionFailedRequests } from "./noise.ts";
import {
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
        consoleEnd: session.consoleMessages.length,
        pageErrorStart: window.pageErrorStart,
        pageErrorEnd: session.pageErrors.length,
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
    const outcomes = await capturePages(session, opts, plan, target.navigate);
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
    };
    await arms.measure(armCtx);
    const appearance = await captureAppearanceResults(session, opts, detailedPlan);
    const evidenceSession = sessionForEvidence(session, outcomes);
    // --watch: a timed series on PAGE 0 after everything settled (a streaming turn reflow, transient states).
    const watchTicks = opts.watchMs > 0 ? await runWatchSeries(session.pages[0] as Page, opts, pageOut(out, 0, totalPages)) : [];
    extendEvidenceThroughWatch(outcomes, session);
    const { failed, viteChurn } = partitionFailedRequests(session.requests.values());
    // What every arm computes its totals over: the per-page outcomes plus the run's artifact naming (the
    // pixel arm's `out=`/`crop=` read it).
    const pairInput: ArmPairInput = { opts, outcomes, ctx: { ...plan, out: pageOut(out, 0, totalPages), failed, totalPages } };
    for (const outcome of outcomes) {
      const ctx: ReportCtx = { ...plan, out: pageOut(out, outcome.pageIndex, totalPages), failed, totalPages };
      printPageReport(sessionForEvidence(session, [outcome]), outcome, opts, ctx);
    }
    printWatchBlock(watchTicks);
    printCheckpointScope(session, evidenceSession);
    printCaptureLog(evidenceSession, failed, viteChurn);
    await arms.report(armCtx);
    printCropNote(opts, { ...plan, failed, totalPages });
    printProbeMotionWarning(opts);
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
    const manifestPath = await writeManifestIfRequested(opts, name, {
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
      ...(opts.checkpoint
        ? {
            evidence: {
              scope: "checkpoint" as const,
              console: evidenceSession.consoleMessages,
              pageErrors: evidenceSession.pageErrors,
            },
          }
        : {}),
      pageErrors: session.pageErrors,
      failedRequests: failed,
      ...(viteChurn.length === 0 ? {} : { viteDepChurn: viteChurn }),
      appearance,
      captures: outcomes,
      ...(watchTicks.length === 0 ? {} : { watch: { totalMs: opts.watchMs, intervalMs: opts.watchEveryMs, ticks: watchTicks } }),
    });
    // THE RESULT LINE. Every arm-owned field comes from the arm that measured it (contract/arms.ts) — the
    // ledger hands each one back at the position it has always printed in, because the line's field order
    // is a contract with every script and agent that greps it. `ledger.rest()` at the tail is where a NEW
    // arm's pairs land with no edit here, and a claim for a pair its arm did not produce THROWS rather
    // than quietly dropping a field.
    const ledger = armPairLedger(pairInput, arms.pairs());
    const code = printVerdict("snap", {
      verdict: red ? 1 : 0,
      denominators: { pages: { value: totalPages, refuseWhen: "zero" }, ...arms.denominators() },
      pairs: [
        ...ledger.some("shot", "out"),
        ["pages", totalPages],
        ["watch", watchTicks.length],
        ["watch-fails", watchFailures],
        ...ledger.arm("aria"),
        ...ledger.arm("map"),
        ...ledger.arm("eval"),
        ...ledger.arm("contrast"),
        ...ledger.arm("assert"),
        ["css-fails", failureSummary.css],
        ...ledger.some("dead-css", "deadcss-fails", "emptycss-fails"),
        ["environment-fails", failureSummary.environment],
        ["appearance-fails", failureSummary.appearance],
        ["console-errors", failureSummary.consoleErrors],
        ["sandbox-trace-noise", session.consoleMessages.filter(isSandboxTraceNoise).length],
        ["console-warnings", evidenceSession.consoleMessages.filter((entry) => entry.type === "warning").length],
        [
          "boot-console-warnings",
          session.consoleMessages.filter((entry) => entry.type === "warning").length -
            evidenceSession.consoleMessages.filter((entry) => entry.type === "warning").length,
        ],
        ["trace", artifacts.traces[0] ?? "none"],
        ["har", artifacts.hars[0] ?? "none"],
        ["json", manifestPath ?? "none"],
        ...ledger.some("shot", "crop"),
        ["scale", scaleResultValue(opts, browserEnvironment)],
        ["motion", motionResultValue(opts)],
        ["throttle", throttleResultValue(opts.cpuThrottle, opts.network)],
        ["nav", navResultVerdict(totals.navigation, totals.navActions)],
        ["nav-actions-failed", totals.navActions],
        ["steps-failed", totals.steps],
        ["page-errors", evidenceSession.pageErrors.length],
        ["failed-req", failed.length],
        ["vite-dep-churn", viteChurn.length],
        ...ledger.some("dead-css", "deadcss", "emptycss"),
        ...ledger.arm("lighthouse"),
        ...ledger.arm("requests"),
        // Every arm the spine above did not name — a NEW arm's members land here, in ARMS order, without
        // an edit to this file. That is the phase's actual claim (design §6).
        ...ledger.rest(),
        ...diffPairs,
        ...loadResultPairs(),
      ],
    });
    return {
      // TWO ways this run can turn out not to be a verdict about the app at all (the zero-hygiene law,
      // _shared/evidence.ts): a REFUSED Lighthouse audit, and a requested THEME whose stamp never landed
      // (#1227). Either exits 2 regardless of what else the run found.
      code: arms.exit(themeStampExit(outcomes, code)),
      receipt: {
        failures: failureSummary,
        captures: outcomes,
        browser: browserEnvironment,
        settings: session.contexts.map((context) => context.settingsEvidence),
        appearance,
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
  const session = await launchSnapSession(opts, key, {
    pages: opts.pages,
    requireCascadeRuntime: hasAppearanceInvariantPlan(detailedPlan),
  });
  try {
    return await runOnSession(
      session,
      opts,
      { url, name, out, key, produceShot, navigate: true },
      {
        window: null,
        finish: async (red) => await finishSession(session, red, key, opts.failureEvidence),
        ...(detailedPlan === undefined ? {} : { detailedPlan }),
      },
    );
  } catch (error) {
    return await closeProbeSessionAfterError(session, error);
  }
}

export async function snap(opts: Args): Promise<number> {
  return (await runSnapDetailed(opts)).code;
}
