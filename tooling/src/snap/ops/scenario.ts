// --scenario: sequential checkpoints in ONE shared browser lifetime, each with its own evidence window.
import type { Page } from "@playwright/test";
import { artifactFilePath, artifactKey } from "../../_shared/artifact-naming.ts";
import { artifactDir } from "../../_shared/artifact-out.ts";
import { evidenceWindowId } from "../../_shared/artifact-scope.ts";
import { print } from "../../_shared/artifacts.ts";
import type { CapturedRequest } from "../../_shared/browser-capture.ts";
import { browserEvidenceRetention } from "../../_shared/browser-capture.ts";
import type { ProbeSession } from "../../_shared/browser-contract.ts";
import { summarizeOrbConsoleCompleteness } from "../../_shared/browser-diagnostics.ts";
import { reassertOwnerDevice } from "../../_shared/browser-emulation-guard.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { printVerdictReceipt } from "../../_shared/evidence.ts";
import { EXIT } from "../../_shared/exit-contract.ts";
import type { ArmRunContext } from "../contract/arms.ts";
import type { SnapDetailedResult } from "../contract/run.ts";
import type { ScenarioSpec } from "../contract/scenario.ts";
import type { Args, CaptureOutcome, SessionCounts, ShotPlan } from "../contract/types.ts";
import type { SnapFailureSummary } from "../contract/verdict.ts";
import { HTTP_URL_RE, shouldProduceShot } from "../lib/out-names.ts";
import { ratePostureResultPairs, sampleSnapRatePosture } from "../lib/rate-posture.ts";
import { checkpointCssFailed, scenarioValue } from "../lib/scenario-values.ts";
import { capturePageCssEvidence } from "./arms/cascade.ts";
import type { RunArms } from "./arms/registry.ts";
import { beginRunArms, disabledRunArmFailures, pageArmExit, pageArmFailures } from "./arms/registry.ts";
import { capture } from "./capture.ts";
import { snapDestination } from "./guards.ts";
import { appliedAcrossContexts, writeManifestIfRequested } from "./manifest.ts";
import { consoleFailureCounts, fileOriginNoiseCount, partitionFailedRequests, verdictConsoleErrors } from "./noise.ts";
import { consoleForEvidence, pageErrorsForEvidence, printCaptureLog, printCheckpointScope, printPageReport, sessionForEvidence } from "./report.ts";
import { registerSnapDiagnosticCompleteness, registerSnapResultPairs } from "./run-bundle.ts";
import { registerScenarioFacts, scenarioFilmstripFrameCount, scenarioFilmstripPairs } from "./scenario-facts.ts";
import type { ScenarioHost } from "./scenario-host.ts";
import { finishScenarioSession, scenarioFailure, scenarioSession } from "./scenario-host.ts";
import { parseScenarioSpec as parsePreparedScenarioSpec, prepareScenarioOutcome, scenarioErrors } from "./scenario-prepare.ts";
import { cascadeRuntimeFor, readSnapEnvironmentEvidence, snapEnvironmentMismatchCount } from "./session.ts";
import { themeStampExit } from "./theme-stamp.ts";
import { hasSnapFailure } from "./verdict.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");
export function parseScenarioSpec(source: string, fallbackName: string): ScenarioSpec {
  return parsePreparedScenarioSpec(source, fallbackName);
}

interface ScenarioSummaryInput {
  readonly opts: Args;
  readonly outcomes: readonly CaptureOutcome[];
  readonly session: ProbeSession;
  readonly failedRequests: readonly CapturedRequest[];
  readonly plan: ShotPlan;
  readonly runArms: readonly RunArms[];
}

function scenarioFailureSummary(input: ScenarioSummaryInput): SnapFailureSummary {
  const { opts, outcomes, session, failedRequests } = input;
  const strictConsole = opts.strictConsole;
  // Every ARM-owned member comes from the arm that measures it (contract/arms.ts). The scenario keeps its
  // own literal because its non-arm members are scoped differently (per-checkpoint console/page-error
  // windows, no watch, no diff) — the arm halves must never be a second implementation.
  const arms = {
    ...pageArmFailures({ opts, outcomes, ctx: { ...input.plan, failed: [...failedRequests], totalPages: 1 } }),
    ...disabledRunArmFailures(opts, ["cascade", "filmstrip"]),
    ...Object.assign({}, ...input.runArms.map((runArm) => runArm.failures())),
  };
  const armCount = (field: keyof SnapFailureSummary): number => {
    const count = arms[field];
    if (count === undefined) {
      throw new Error(`INSTRUMENT ERROR: no arm produced the verdict member "${field}" (tooling/src/snap/contract/arms.ts)`);
    }
    return count;
  };
  const consoleFailures = consoleFailureCounts(consoleForEvidence(session, outcomes), strictConsole);
  return {
    navigation: outcomes.filter((outcome) => outcome.navError !== null).length,
    navActions: outcomes.reduce((count, outcome) => count + outcome.navFailures, 0),
    pageErrors: pageErrorsForEvidence(session, outcomes).length,
    failedRequests: failedRequests.length,
    steps: outcomes.reduce((count, outcome) => count + outcome.stepFailures, 0),
    contrast: armCount("contrast"),
    aria: armCount("aria"),
    map: armCount("map"),
    eval: armCount("eval"),
    watch: 0,
    diff: 0,
    assertions: armCount("assertions"),
    consoleErrors: consoleFailures.errors,
    consoleWarnings: consoleFailures.warnings,
    css: outcomes.filter((outcome) => outcome.cssEvidence?.status === "instrument-error" || (outcome.deadCssEvidence?.unreadable.length ?? 0) > 0).length,
    deadCss: armCount("deadCss"),
    emptyCss: armCount("emptyCss"),
    environment: 0,
    appearance: 0,
    lighthouse: armCount("lighthouse"),
  };
}

interface ScenarioEvidenceRange {
  readonly consoleStart: number;
  readonly consoleEnd: number;
  readonly pageErrorStart: number;
  readonly pageErrorEnd: number;
  readonly diagnosticWindow: number;
}

// Raw string, not a function: the tooling program is DOM-less and has no __orb ambient (_shared/browser.ts).
async function resetScenarioEvidence(page: Page): Promise<void> {
  await page.evaluate("window.__orb && window.__orb.resetEvidence()");
}

async function captureScenarioCheckpoints(
  session: ProbeSession,
  checkpoints: readonly Args[],
): Promise<{ outcomes: CaptureOutcome[]; plans: ShotPlan[]; evidenceRanges: ScenarioEvidenceRange[]; runArms: RunArms[] }> {
  const outcomes: CaptureOutcome[] = [];
  const plans: ShotPlan[] = [];
  const evidenceRanges: ScenarioEvidenceRange[] = [];
  const runArms: RunArms[] = [];
  const snapsDir = await artifactDir("snaps");
  let priorUrl: string | null = null;
  for (const [checkpointIndex, checkpoint] of checkpoints.entries()) {
    const arms = beginRunArms(session, checkpoint);
    const ratePosture = await arms.ratePosture();
    await arms.prepare();
    runArms.push(arms);
    session.diagnosticWindow.value += 1;
    const destination = snapDestination(checkpoint);
    // Same --out contract as the single-shot path: a checkpoint that names a PATH writes there (the
    // scenario's own checkpoint names are slugs and stay under reports/snaps/).
    const plan: ShotPlan = {
      url: destination.url,
      out: artifactFilePath(snapsDir, destination.name, ".png"),
      produceShot: shouldProduceShot(checkpoint),
    };
    plans.push(plan);
    const keepLivePage = HTTP_URL_RE.test(plan.url) && plan.url === priorUrl;
    const consoleStart = session.evidence.console.cursor();
    const pageErrorStart = session.evidence.pageErrors.cursor();
    if (keepLivePage) {
      await resetScenarioEvidence(session.page);
    }
    const outcome = await capture({
      page: session.page,
      opts: checkpoint,
      plan: { ...plan, pageIndex: 0, totalPages: 1, navigatePage: !keepLivePage },
      evidence: {
        ...session,
        settingsEvidence: session.contexts[0]?.settingsEvidence,
      },
      ratePosture,
      armEvidenceWindow: evidenceWindowId(`checkpoint:${String(checkpointIndex)}:${artifactKey(destination.name)}`),
      runArms: arms,
    });
    // The cascade arm's read, driven directly: a scenario checkpoint hosts no RUN arms (it has its own
    // per-checkpoint lifecycle), so it calls the arm's engine rather than the run-arm surface.
    if (checkpoint.cascade.length > 0) {
      outcome.cssEvidence = await capturePageCssEvidence({
        runtime: cascadeRuntimeFor(session),
        session,
        queries: checkpoint.cascade,
        pageIndex: 0,
      });
    }
    outcomes.push(outcome);
    const armCtx: ArmRunContext = {
      session,
      opts: checkpoint,
      outcomes: [outcome],
      name: artifactKey(destination.name),
      provisions: { debuggingPort: null, cascadeRuntime: cascadeRuntimeFor(session) },
      ratePosture,
    };
    await arms.measure(armCtx);
    await arms.report(armCtx);
    // A checkpoint's analyzers can take clipped screenshots too; the next checkpoint starts on the device.
    await reassertOwnerDevice(session.page, session.environmentContract.applied);
    evidenceRanges.push({
      consoleStart,
      consoleEnd: session.evidence.console.cursor(),
      pageErrorStart,
      pageErrorEnd: session.evidence.pageErrors.cursor(),
      diagnosticWindow: session.diagnosticWindow.value,
    });
    priorUrl = plan.url;
  }
  return { outcomes, plans, evidenceRanges, runArms };
}

interface ScenarioReportArgs {
  readonly spec: ScenarioSpec;
  readonly session: ProbeSession;
  readonly checkpoints: readonly Args[];
  readonly outcomes: readonly CaptureOutcome[];
  readonly plans: readonly ShotPlan[];
  readonly evidenceRanges: readonly ScenarioEvidenceRange[];
  readonly failedRequests: CapturedRequest[];
  readonly viteChurn: readonly CapturedRequest[];
}

function scenarioCheckpointSession(session: ProbeSession, outcome: CaptureOutcome, range: ScenarioEvidenceRange): SessionCounts {
  if (outcome.evidenceRange !== null) {
    return sessionForEvidence(session, [outcome]);
  }
  const consoleMessages = session.evidence.console.read(range.consoleStart, range.consoleEnd, "browser-console-scenario-window").records;
  return {
    requests: session.requests,
    consoleMessages,
    consoleLines: consoleMessages.map((message) => message.line),
    pageErrors: session.evidence.pageErrors.read(range.pageErrorStart, range.pageErrorEnd, "browser-page-error-scenario-window").records,
    diagnostics: session.diagnostics.filter((entry) => entry.evidenceWindow === range.diagnosticWindow),
    diagnosticCompleteness: session.diagnosticCompleteness.filter((entry) => entry.evidenceWindow === range.diagnosticWindow),
    diagnosticWindow: { value: range.diagnosticWindow },
  };
}

function printScenarioReports(args: ScenarioReportArgs): void {
  const { spec, session, checkpoints, outcomes, plans, evidenceRanges, failedRequests } = args;
  for (let index = 0; index < outcomes.length; index += 1) {
    const plan = scenarioValue(plans, index, "plan");
    const range = scenarioValue(evidenceRanges, index, "evidence range");
    const outcome = scenarioValue(outcomes, index, "outcome");
    const checkpoint = scenarioValue(checkpoints, index, "parsed args");
    const checkpointSession = scenarioCheckpointSession(session, outcome, range);
    if (checkpoint.summary) {
      const failedAssertions = outcome.assertions.filter((entry) => entry.failed).length;
      const errors = verdictConsoleErrors(checkpointSession.consoleMessages);
      const warnings = checkpointSession.consoleMessages.filter((message) => message.type === "warning").length;
      const failed =
        outcome.navError !== null ||
        outcome.navFailures > 0 ||
        outcome.stepFailures > 0 ||
        checkpointCssFailed(outcome) ||
        failedAssertions > 0 ||
        errors > 0 ||
        (checkpoint.strictConsole && warnings > 0);
      print(
        `CHECKPOINT ${spec.checkpoints[index]?.name ?? index} ${failed ? "FAIL" : "PASS"} ` +
          `shot=${plan.produceShot ? plan.out : "(none)"} nav=${outcome.navFailures} steps=${outcome.stepFailures} assertions=${failedAssertions} ` +
          `console=${errors}e/${warnings}w page-errors=${checkpointSession.pageErrors.length}`,
      );
      continue;
    }
    print(`\n========== CHECKPOINT ${spec.checkpoints[index]?.name ?? index} ==========`);
    printPageReport(checkpointSession, outcome, checkpoint, { ...plan, failed: [], totalPages: 1 });
  }
  if (failedRequests.length > 0) {
    print(`\n${failedRequests.length} failed request(s) occurred across the scenario; the aggregate log follows.`);
  }
  const evidenceSession = sessionForEvidence(session, outcomes);
  printCheckpointScope(session, evidenceSession);
  printCaptureLog(evidenceSession, failedRequests, args.viteChurn);
}

function registerScenarioCompleteness(host: ScenarioHost | null, session: ProbeSession): void {
  if (host === null) {
    registerSnapDiagnosticCompleteness(summarizeOrbConsoleCompleteness(session.diagnosticCompleteness));
  }
}

function reportScenarioArgumentErrors(checkpoints: readonly Args[]): boolean {
  const errors = scenarioErrors(checkpoints);
  for (const error of errors) {
    print(`SCENARIO ARG ERROR: ${error}`);
  }
  return errors.length > 0;
}

export async function runScenarioDetailed(opts: Args, host: ScenarioHost | null = null): Promise<SnapDetailedResult> {
  const scenarioPath = opts.scenario;
  if (scenarioPath === null) {
    return { code: EXIT.misuse, receipt: null };
  }
  const preparation = await prepareScenarioOutcome(opts, scenarioPath);
  if (preparation.status === "failed") {
    print(`SCENARIO ERROR: ${preparation.error}`);
    return { code: EXIT.misuse, receipt: null };
  }
  const prepared = preparation.value;
  const { spec, checkpoints } = prepared;
  if (reportScenarioArgumentErrors(checkpoints)) {
    return { code: EXIT.misuse, receipt: null };
  }
  const first = scenarioValue(checkpoints, 0, "first parsed args");
  const session = await scenarioSession(first, host);
  try {
    const ratePosture = await sampleSnapRatePosture(session.browser);
    const { outcomes, plans, evidenceRanges, runArms } = await captureScenarioCheckpoints(session, checkpoints);
    const reportPlan = plans[0] ?? { url: spec.name, out: spec.name, produceShot: false };
    const evidenceConsole = consoleForEvidence(session, outcomes);
    const evidencePageErrors = pageErrorsForEvidence(session, outcomes);
    const { failed: failedRequests, viteChurn, fileOrigin } = partitionFailedRequests(session.requests.values());
    const browserEnvironment = await readSnapEnvironmentEvidence(session);
    const environmentFailures = snapEnvironmentMismatchCount(browserEnvironment);
    const failureSummary = {
      ...scenarioFailureSummary({ opts, outcomes, session, failedRequests, plan: reportPlan, runArms }),
      environment: environmentFailures,
    };
    const red = hasSnapFailure(failureSummary);
    const retention = browserEvidenceRetention(session);
    const artifacts = await finishScenarioSession(session, host, { red, name: spec.name, enabled: opts.failureEvidence });
    printScenarioReports({ spec, session, checkpoints, outcomes, plans, evidenceRanges, failedRequests, viteChurn });
    const manifestPath = await writeManifestIfRequested(opts, spec.name, {
      status: red ? "fail" : "pass",
      target: { url: scenarioPath, name: spec.name },
      environment: {
        viewport: first.viewport,
        device: first.device,
        colorScheme: first.colorScheme,
        reducedMotion: first.reducedMotion || first.probe,
        appearance: first.appearance,
        appearanceApplied: appliedAcrossContexts(
          first.appearance !== null,
          session.contexts.map((context) => context.settingsEvidence.appearanceApplied),
        ),
        theme: first.theme,
        themeApplied: appliedAcrossContexts(
          first.theme !== null,
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
      pageErrors: session.pageErrors,
      ...(opts.checkpoint
        ? {
            evidence: {
              scope: "checkpoint" as const,
              console: evidenceConsole,
              pageErrors: evidencePageErrors,
              diagnostics: session.diagnostics.filter((entry) => entry.evidenceWindow > 0),
              diagnosticCompleteness: session.diagnosticCompleteness.filter((entry) => entry.evidenceWindow > 0),
            },
          }
        : {}),
      failedRequests,
      ...(viteChurn.length === 0 ? {} : { viteDepChurn: viteChurn }),
      captures: outcomes,
      scenario: {
        checkpoints: evidenceRanges.map((range, index) => ({
          name: spec.checkpoints[index]?.name ?? String(index),
          screenshot: scenarioValue(plans, index, "manifest plan").produceShot ? scenarioValue(plans, index, "manifest plan").out : null,
          console: session.evidence.console.read(range.consoleStart, range.consoleEnd, "browser-console-scenario-manifest").records,
          pageErrors: session.evidence.pageErrors.read(range.pageErrorStart, range.pageErrorEnd, "browser-page-error-scenario-manifest").records,
          diagnostics: session.diagnostics.filter((entry) => entry.evidenceWindow === range.diagnosticWindow),
          diagnosticCompleteness: session.diagnosticCompleteness.filter((entry) => entry.evidenceWindow === range.diagnosticWindow),
        })),
      },
    });
    const terminal = printVerdictReceipt("snap-scenario", {
      verdict: red ? 1 : 0,
      denominators: {
        checkpoints: { value: outcomes.length, refuseWhen: "zero" },
        ...(checkpoints.some((checkpoint) => checkpoint.filmstrip)
          ? {
              "filmstrip-frames": {
                value: scenarioFilmstripFrameCount(runArms),
                refuseWhen: "zero" as const,
              },
            }
          : {}),
      },
      pairs: [
        ["name", spec.name],
        ["checkpoints", outcomes.length],
        ["assertion-fails", failureSummary.assertions],
        ["deadcss-fails", failureSummary.deadCss],
        ["emptycss-fails", failureSummary.emptyCss],
        ["environment-fails", failureSummary.environment],
        ["console-errors", failureSummary.consoleErrors],
        ["console-warnings", evidenceConsole.filter((entry) => entry.type === "warning").length],
        [
          "boot-console-warnings",
          session.consoleMessages.filter((entry) => entry.type === "warning").length - evidenceConsole.filter((entry) => entry.type === "warning").length,
        ],
        ["trace", artifacts.traces[0] ?? "none"],
        ["har", artifacts.hars[0] ?? "none"],
        ["json", manifestPath ?? "none"],
        ["vite-dep-churn", viteChurn.length],
        ["file-origin-noise", fileOriginNoiseCount(session.consoleMessages, fileOrigin)],
        ...scenarioFilmstripPairs(runArms, checkpoints),
        ...ratePostureResultPairs(ratePosture),
      ],
    });
    const pageCode = pageArmExit(
      { opts, outcomes, ctx: { ...reportPlan, failed: [...failedRequests], totalPages: 1 } },
      themeStampExit(outcomes, terminal.exit),
    );
    const finalCode = runArms.reduce((code, arms) => arms.exit(code), pageCode);
    await registerScenarioFacts({
      opts,
      spec,
      checkpoints,
      session,
      ratePosture,
      outcomes,
      plans,
      reportPlan,
      failedRequests,
      pageErrors: evidencePageErrors,
      failures: failureSummary,
      retention,
      finalCode,
      runArms,
    });
    registerSnapResultPairs(terminal.pairs);
    const result: SnapDetailedResult = {
      // #1227: a checkpoint whose requested THEME never stamped sampled the default palette — exit 2.
      code: finalCode,
      receipt: {
        failures: failureSummary,
        captures: outcomes,
        browser: browserEnvironment,
        settings: session.contexts.map((context) => context.settingsEvidence),
        appearance: [],
        diagnosticCompleteness: session.diagnosticCompleteness,
        motion: null,
        scenario: {
          name: spec.name,
          declaredCheckpointNames: spec.checkpoints.map((checkpoint) => checkpoint.name),
          capturedCheckpointNames: outcomes.map((_, index) => spec.checkpoints[index]?.name ?? String(index)),
          manifestPath,
        },
      },
    };
    registerScenarioCompleteness(host, session);
    return result;
  } catch (error) {
    return await scenarioFailure(session, host, error);
  }
}

export async function snapScenario(opts: Args): Promise<number> {
  return (await runScenarioDetailed(opts)).code;
}
