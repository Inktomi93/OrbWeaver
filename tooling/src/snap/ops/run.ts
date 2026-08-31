// The single-run pass: launch, drive+capture every page, the watch series, report, baseline/diff,
// the manifest, and the RESULT line. One browser run, many pieces of evidence.
import type { Page } from "@playwright/test";
import { artifactFile, artifactKey, printResult } from "../../_shared/artifacts.ts";
import { closeProbeSessionAfterError } from "../../_shared/browser.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { Args, ReportCtx, ShotPlan } from "../contract/types.ts";
import { pageOut, shouldProduceShot } from "../lib/out-names.ts";
import { throttleResultValue } from "../lib/throttle.ts";
import { capturePages } from "./capture.ts";
import { captureCssEvidence } from "./cascade.ts";
import { runBaselineOrDiff } from "./diff.ts";
import { snapDestination } from "./guards.ts";
import { appliedAcrossContexts, writeManifestIfRequested } from "./manifest.ts";
import { isSandboxTraceNoise, partitionFailedRequests } from "./noise.ts";
import {
  cropOutcome,
  extendEvidenceThroughWatch,
  motionResultValue,
  navResultVerdict,
  printCaptureLog,
  printCheckpointScope,
  printCropNote,
  printPageReport,
  printProbeMotionWarning,
  printWatchBlock,
  sessionForEvidence,
} from "./report.ts";
import { finishSession, launchSnapSession } from "./session.ts";
import { buildFailureSummary, evidenceFailureCounts, hasSnapFailure, mapOutputSummary, outcomeTotals } from "./verdict.ts";
import { runWatchSeries } from "./watch.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

export async function snap(opts: Args): Promise<number> {
  const { url, name } = snapDestination(opts);
  // `name` may be a PATH the caller chose (`--out /tmp/shot.png`): the shot lands exactly there, while the
  // kind-dir siblings (trace/HAR/baseline) key off its sanitized basename and stay under reports/.
  const out = await artifactFile("snaps", name, ".png");
  const key = artifactKey(name);
  // Whether we write a PNG. --no-shot/--text suppress it, but --baseline/--diff
  // need pixels to compare, and --shot-of is itself a shot — so those force it on.
  const produceShot = shouldProduceShot(opts);
  const totalPages = opts.pages;
  const session = await launchSnapSession(opts, key, { pages: totalPages });

  try {
    const plan: ShotPlan = { url, out, produceShot };
    const outcomes = await capturePages(session, opts, plan);
    await captureCssEvidence(session, opts, outcomes);
    const evidenceSession = sessionForEvidence(session, outcomes);
    // --watch: a timed series on PAGE 0 after everything settled (a streaming turn reflow, transient states).
    const watchTicks = opts.watchMs > 0 ? await runWatchSeries(session.pages[0] as Page, opts, pageOut(out, 0, totalPages)) : [];
    extendEvidenceThroughWatch(outcomes, session);
    const { failed, viteChurn } = partitionFailedRequests(session.requests.values());
    for (const outcome of outcomes) {
      const ctx: ReportCtx = { ...plan, out: pageOut(out, outcome.pageIndex, totalPages), failed, totalPages };
      printPageReport(sessionForEvidence(session, [outcome]), outcome, opts, ctx);
    }
    printWatchBlock(watchTicks);
    printCheckpointScope(session, evidenceSession);
    printCaptureLog(evidenceSession, failed, viteChurn);
    printCropNote(opts, { ...plan, failed, totalPages });
    printProbeMotionWarning(opts);
    // Baseline/diff compares PAGE 0's shot (the canonical surface); multi-page baselines aren't a use case yet.
    const { diffPairs, ssimFailed } = await runBaselineOrDiff(opts, pageOut(out, 0, totalPages), key);

    const totals = outcomeTotals(outcomes);
    const evidenceFailures = evidenceFailureCounts(outcomes);
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
    });
    const red = hasSnapFailure(failureSummary);
    const artifacts = await finishSession(session, red, key, opts.failureEvidence);
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
      captures: outcomes,
      ...(watchTicks.length === 0 ? {} : { watch: { totalMs: opts.watchMs, intervalMs: opts.watchEveryMs, ticks: watchTicks } }),
    });
    const mapSummary = mapOutputSummary(opts.map, outcomes);
    printResult("snap", [
      ["out", produceShot ? pageOut(out, 0, totalPages) : "(none)"],
      ["pages", totalPages],
      ["watch", watchTicks.length],
      ["watch-fails", watchFailures],
      ["aria", totals.ariaSeen ? "yes" : "no"],
      ["aria-fails", evidenceFailures.aria],
      ["map", mapSummary.count],
      ["map-dom-fallbacks", mapSummary.domFallbacks],
      ["map-fails", evidenceFailures.map],
      ["evals", totals.evals],
      ["eval-fails", evidenceFailures.eval],
      ["contrast-fails", totals.contrast],
      ["assertion-fails", totals.assertions],
      ["css-fails", failureSummary.css],
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
      ["crop", cropOutcome(opts, { ...plan, out: pageOut(out, 0, totalPages), failed, totalPages }) ?? "none"],
      ["motion", motionResultValue(opts)],
      ["throttle", throttleResultValue(opts.cpuThrottle, opts.network)],
      ["nav", navResultVerdict(totals.navigation, totals.navActions)],
      ["nav-actions-failed", totals.navActions],
      ["steps-failed", totals.steps],
      ["page-errors", evidenceSession.pageErrors.length],
      ["failed-req", failed.length],
      ["vite-dep-churn", viteChurn.length],
      ["deadcss", totals.deadCss],
      ["emptycss", totals.emptyCss],
      ...diffPairs,
    ]);
    return red ? 1 : 0;
  } catch (error) {
    return await closeProbeSessionAfterError(session, error);
  }
}
