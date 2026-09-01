// --scenario: sequential checkpoints in ONE browser lifetime (shared context/shim/media), each with
// its own evidence window; session-level flags live on the outer command by refusal, not convention.
import { readFile } from "node:fs/promises";
import { basename, extname, isAbsolute, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { errorMessage } from "@orb/kit/error-message";
import type { Page } from "@playwright/test";
import { artifactDir, artifactFilePath, print, routeSlug } from "../../_shared/artifacts.ts";
import type { CapturedRequest, ProbeSession } from "../../_shared/browser.ts";
import { closeProbeSessionAfterError } from "../../_shared/browser.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { printVerdict } from "../../_shared/evidence.ts";
import { EXIT } from "../../_shared/exit-contract.ts";
import type { SnapDetailedResult } from "../contract/run.ts";
import { scenarioPresetFile } from "../contract/scenario-presets.ts";
import type { Args, CaptureOutcome, ScenarioCheckpoint, ScenarioSpec, SessionCounts, ShotPlan } from "../contract/types.ts";
import type { SnapFailureSummary } from "../contract/verdict.ts";
import { HTTP_URL_RE, shouldProduceShot } from "../lib/out-names.ts";
import { capture } from "./capture.ts";
import { captureCssEvidence } from "./cascade.ts";
import { refuseFileMode, snapDestination } from "./guards.ts";
import { appliedAcrossContexts, writeManifestIfRequested } from "./manifest.ts";
import { consoleFailureCounts, isSandboxTraceNoise, partitionFailedRequests } from "./noise.ts";
import { parseSnapArgs } from "./parse.ts";
import { consoleForEvidence, pageErrorsForEvidence, printCaptureLog, printCheckpointScope, printPageReport, sessionForEvidence } from "./report.ts";
import { finishSession, launchSnapSession, readSnapEnvironmentEvidence, snapEnvironmentMismatchCount } from "./session.ts";
import { evidenceFailureCounts, hasSnapFailure } from "./verdict.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

function stringArray(value: unknown): readonly string[] | null {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string") ? value : null;
}

function scenarioCheckpoint(value: unknown, index: number): ScenarioCheckpoint {
  if (typeof value !== "object" || value === null) {
    throw new Error(`scenario checkpoint ${index} must be an object`);
  }
  const record = value as Record<string, unknown>;
  const args = stringArray(record["args"]);
  if (typeof record["name"] !== "string" || record["name"].trim() === "" || args === null) {
    throw new Error(`scenario checkpoint ${index} requires a non-empty name and string[] args`);
  }
  return { name: record["name"], args };
}

export function parseScenarioSpec(source: string, fallbackName: string): ScenarioSpec {
  const value = JSON.parse(source) as unknown;
  if (typeof value !== "object" || value === null) {
    throw new Error("scenario root must be an object");
  }
  const record = value as Record<string, unknown>;
  const defaults = record["defaults"] === undefined ? [] : stringArray(record["defaults"]);
  if (defaults === null) {
    throw new Error("scenario defaults must be a string[]");
  }
  if (!Array.isArray(record["checkpoints"]) || record["checkpoints"].length === 0) {
    throw new Error("scenario requires at least one checkpoint");
  }
  const checkpoints = record["checkpoints"].map(scenarioCheckpoint);
  const name = typeof record["name"] === "string" && record["name"].trim() !== "" ? record["name"] : fallbackName;
  return { name: routeSlug(name), defaults, checkpoints };
}

function inheritScenarioSession(globalArgs: Args, checkpoint: Args, name: string): Args {
  return {
    ...checkpoint,
    base: globalArgs.base,
    vnc: globalArgs.vnc,
    debugToken: globalArgs.debugToken,
    failureEvidence: globalArgs.failureEvidence,
    strictConsole: globalArgs.strictConsole,
    checkpoint: globalArgs.checkpoint || checkpoint.checkpoint,
    includeHidden: globalArgs.includeHidden || checkpoint.includeHidden,
    json: globalArgs.json,
    summary: globalArgs.summary || checkpoint.summary,
    viewport: globalArgs.viewport,
    device: globalArgs.device,
    colorScheme: globalArgs.colorScheme,
    reducedMotion: globalArgs.reducedMotion,
    ...(globalArgs.browserContrast === undefined ? {} : { browserContrast: globalArgs.browserContrast }),
    ...(globalArgs.reducedTransparency === undefined ? {} : { reducedTransparency: globalArgs.reducedTransparency }),
    // The shim is installed once, on the ONE context every checkpoint shares — so it is a session-level
    // property like the media emulation, taken from the outer command (a checkpoint that sets its own is
    // refused below rather than silently applying to every checkpoint or to none).
    appearance: globalArgs.appearance,
    theme: globalArgs.theme,
    cascade: globalArgs.cascade,
    probe: globalArgs.probe,
    localStorage: [...globalArgs.localStorage, ...checkpoint.localStorage],
    out: checkpoint.out ?? name,
  };
}

function scenarioCheckpointArgs(globalArgs: Args, spec: ScenarioSpec): Args[] {
  return spec.checkpoints.map((checkpoint) => {
    const args = parseSnapArgs([...spec.defaults, ...checkpoint.args]);
    const inherited = inheritScenarioSession(globalArgs, args, `${spec.name}-${routeSlug(checkpoint.name)}`);
    inherited.errors.push(
      ...[
        [inherited.pages > 1 || inherited.contexts > 1 || inherited.as !== null, "scenario checkpoints do not support --pages/--contexts/--as"],
        [inherited.watchMs > 0 || inherited.baseline || inherited.diff, "scenario checkpoints do not support --watch/--baseline/--diff"],
        [inherited.scenario !== null || inherited.matrix, "scenario checkpoints cannot nest --scenario/--matrix"],
        [
          inherited.isolated || inherited.stageDown || inherited.stageStatus,
          "scenario checkpoint args cannot manage stages; put stage flags on the outer command",
        ],
        [
          args.appearance !== null,
          "scenario checkpoints share ONE browser context, so the appearance shim is session-level; put --appearance/--appearance-preset/--full-motion on the outer command",
        ],
        [args.theme !== null, "scenario checkpoints share ONE browser context, so the theme shim is session-level; put --theme on the outer command"],
      ]
        // Each row is [invalid, message], so the tuple element type here is `boolean | string`;
        // `=== true` reads the boolean slot exactly and never the message.
        .filter(([invalid]) => invalid === true)
        .map(([, message]) => `${checkpoint.name}: ${message}`),
    );
    return inherited;
  });
}

function scenarioErrors(checkpoints: readonly Args[]): string[] {
  const errors = checkpoints.flatMap((checkpoint) => {
    const fileRefusal = refuseFileMode(checkpoint);
    return fileRefusal === null ? checkpoint.errors : [...checkpoint.errors, fileRefusal];
  });
  const firstSeeds = JSON.stringify(checkpoints[0]?.localStorage ?? []);
  if (checkpoints.some((checkpoint) => JSON.stringify(checkpoint.localStorage) !== firstSeeds)) {
    errors.push("scenario checkpoints must use identical --ls seeds because they share one browser lifetime");
  }
  return errors;
}

interface PreparedScenario {
  readonly spec: ScenarioSpec;
  readonly checkpoints: readonly Args[];
}

async function prepareScenario(opts: Args, path: string): Promise<PreparedScenario> {
  const loaded = await loadScenario(path);
  const spec = opts.out === null ? loaded : { ...loaded, name: routeSlug(opts.out) };
  return { spec, checkpoints: scenarioCheckpointArgs(opts, spec) };
}

function resolveScenarioPath(pathArg: string): string {
  const preset = scenarioPresetFile(pathArg);
  if (preset !== null) {
    return fileURLToPath(new URL(`./scenarios/${preset}`, import.meta.url));
  }
  return isAbsolute(pathArg) ? pathArg : resolve(process.cwd(), pathArg);
}

async function loadScenario(pathArg: string): Promise<ScenarioSpec> {
  const path = resolveScenarioPath(pathArg);
  const source = await readFile(path, "utf8");
  return parseScenarioSpec(source, basename(path, extname(path)));
}

function scenarioFailureSummary(
  outcomes: readonly CaptureOutcome[],
  session: ProbeSession,
  failedRequests: readonly CapturedRequest[],
  strictConsole: boolean,
): SnapFailureSummary {
  const evidence = evidenceFailureCounts(outcomes);
  const consoleFailures = consoleFailureCounts(consoleForEvidence(session.consoleMessages, outcomes), strictConsole);
  return {
    navigation: outcomes.filter((outcome) => outcome.navError !== null).length,
    navActions: outcomes.reduce((count, outcome) => count + outcome.navFailures, 0),
    pageErrors: pageErrorsForEvidence(session.pageErrors, outcomes).length,
    failedRequests: failedRequests.length,
    steps: outcomes.reduce((count, outcome) => count + outcome.stepFailures, 0),
    contrast: outcomes.reduce((count, outcome) => count + outcome.contrastResults.filter((entry) => entry.failed).length, 0),
    aria: evidence.aria,
    map: evidence.map,
    eval: evidence.eval,
    watch: 0,
    diff: 0,
    assertions: outcomes.reduce((count, outcome) => count + outcome.assertions.filter((entry) => entry.failed).length, 0),
    consoleErrors: consoleFailures.errors,
    consoleWarnings: consoleFailures.warnings,
    css: outcomes.filter((outcome) => outcome.cssEvidence?.status === "instrument-error" || (outcome.deadCssEvidence?.unreadable.length ?? 0) > 0).length,
    deadCss: outcomes.reduce((count, outcome) => count + outcome.deadCss.length, 0),
    emptyCss: outcomes.reduce((count, outcome) => count + outcome.emptyCss.length, 0),
    environment: 0,
    appearance: 0,
  };
}

interface ScenarioEvidenceRange {
  readonly consoleStart: number;
  readonly consoleEnd: number;
  readonly pageErrorStart: number;
  readonly pageErrorEnd: number;
}

// Raw string, not a function — the tooling program is DOM-less and carries no __orb ambient (the
// browser owns both; see _shared/browser.ts's raw-string note).
async function resetScenarioEvidence(page: Page): Promise<void> {
  await page.evaluate("window.__orb && window.__orb.resetEvidence()");
}

async function captureScenarioCheckpoints(
  session: ProbeSession,
  checkpoints: readonly Args[],
): Promise<{ outcomes: CaptureOutcome[]; plans: ShotPlan[]; evidenceRanges: ScenarioEvidenceRange[] }> {
  const outcomes: CaptureOutcome[] = [];
  const plans: ShotPlan[] = [];
  const evidenceRanges: ScenarioEvidenceRange[] = [];
  const snapsDir = await artifactDir("snaps");
  let priorUrl: string | null = null;
  for (const checkpoint of checkpoints) {
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
    const consoleStart = session.consoleMessages.length;
    const pageErrorStart = session.pageErrors.length;
    if (keepLivePage) {
      await resetScenarioEvidence(session.page);
    }
    const outcome = await capture(session.page, checkpoint, { ...plan, pageIndex: 0, totalPages: 1, navigatePage: !keepLivePage }, session);
    await captureCssEvidence(session, checkpoint, [outcome]);
    outcomes.push(outcome);
    evidenceRanges.push({
      consoleStart,
      consoleEnd: session.consoleMessages.length,
      pageErrorStart,
      pageErrorEnd: session.pageErrors.length,
    });
    priorUrl = plan.url;
  }
  return { outcomes, plans, evidenceRanges };
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
  const consoleMessages = session.consoleMessages.slice(range.consoleStart, range.consoleEnd);
  return {
    requests: session.requests,
    consoleMessages,
    consoleLines: consoleMessages.map((message) => message.line),
    pageErrors: session.pageErrors.slice(range.pageErrorStart, range.pageErrorEnd),
  };
}

function checkpointCssFailed(outcome: CaptureOutcome): boolean {
  return (
    outcome.deadCss.length > 0 ||
    outcome.emptyCss.length > 0 ||
    (outcome.deadCssEvidence?.unreadable.length ?? 0) > 0 ||
    outcome.cssEvidence?.status === "instrument-error"
  );
}

function printScenarioReports(args: ScenarioReportArgs): void {
  const { spec, session, checkpoints, outcomes, plans, evidenceRanges, failedRequests } = args;
  for (let index = 0; index < outcomes.length; index += 1) {
    const plan = plans[index] as ShotPlan;
    const range = evidenceRanges[index] as ScenarioEvidenceRange;
    const outcome = outcomes[index] as CaptureOutcome;
    const checkpointSession = scenarioCheckpointSession(session, outcome, range);
    if (checkpoints[index]?.summary === true) {
      const failedAssertions = outcome.assertions.filter((entry) => entry.failed).length;
      const errors = checkpointSession.consoleMessages.filter((message) => message.type === "error" && !isSandboxTraceNoise(message)).length;
      const warnings = checkpointSession.consoleMessages.filter((message) => message.type === "warning").length;
      const failed =
        outcome.navError !== null ||
        outcome.navFailures > 0 ||
        outcome.stepFailures > 0 ||
        checkpointCssFailed(outcome) ||
        failedAssertions > 0 ||
        errors > 0 ||
        ((checkpoints[index]?.strictConsole ?? false) && warnings > 0);
      print(
        `CHECKPOINT ${spec.checkpoints[index]?.name ?? index} ${failed ? "FAIL" : "PASS"} ` +
          `shot=${plan.produceShot ? plan.out : "(none)"} nav=${outcome.navFailures} steps=${outcome.stepFailures} assertions=${failedAssertions} ` +
          `console=${errors}e/${warnings}w page-errors=${checkpointSession.pageErrors.length}`,
      );
      continue;
    }
    print(`\n========== CHECKPOINT ${spec.checkpoints[index]?.name ?? index} ==========`);
    printPageReport(checkpointSession, outcomes[index] as CaptureOutcome, checkpoints[index] as Args, { ...plan, failed: [], totalPages: 1 });
  }
  if (failedRequests.length > 0) {
    print(`\n${failedRequests.length} failed request(s) occurred across the scenario; the aggregate log follows.`);
  }
  const evidenceSession = sessionForEvidence(session, outcomes);
  printCheckpointScope(session, evidenceSession);
  printCaptureLog(evidenceSession, failedRequests, args.viteChurn);
}

export async function runScenarioDetailed(opts: Args): Promise<SnapDetailedResult> {
  const scenarioPath = opts.scenario;
  if (scenarioPath === null) {
    return { code: EXIT.misuse, receipt: null };
  }
  let prepared: PreparedScenario;
  // @orb-gate-ignore caught-failure-ownership(empty:error): printed as SCENARIO ERROR and routed through EXIT.misuse, the process's own exit code. Ends if that exit code stops being surfaced.
  try {
    prepared = await prepareScenario(opts, scenarioPath);
  } catch (error) {
    print(`SCENARIO ERROR: ${errorMessage(error)}`);
    return { code: EXIT.misuse, receipt: null };
  }
  const { spec, checkpoints } = prepared;
  const errors = scenarioErrors(checkpoints);
  if (errors.length > 0) {
    for (const error of errors) {
      print(`SCENARIO ARG ERROR: ${error}`);
    }
    return { code: EXIT.misuse, receipt: null };
  }
  const first = checkpoints[0] as Args;
  const session = await launchSnapSession(first, spec.name);
  try {
    const { outcomes, plans, evidenceRanges } = await captureScenarioCheckpoints(session, checkpoints);
    const evidenceConsole = consoleForEvidence(session.consoleMessages, outcomes);
    const evidencePageErrors = pageErrorsForEvidence(session.pageErrors, outcomes);
    const { failed: failedRequests, viteChurn } = partitionFailedRequests(session.requests.values());
    const browserEnvironment = await readSnapEnvironmentEvidence(session);
    const environmentFailures = snapEnvironmentMismatchCount(browserEnvironment);
    const failureSummary = { ...scenarioFailureSummary(outcomes, session, failedRequests, opts.strictConsole), environment: environmentFailures };
    const red = hasSnapFailure(failureSummary);
    const artifacts = await finishSession(session, red, spec.name, opts.failureEvidence);
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
      pageErrors: session.pageErrors,
      ...(opts.checkpoint ? { evidence: { scope: "checkpoint" as const, console: evidenceConsole, pageErrors: evidencePageErrors } } : {}),
      failedRequests,
      ...(viteChurn.length === 0 ? {} : { viteDepChurn: viteChurn }),
      captures: outcomes,
      scenario: {
        checkpoints: evidenceRanges.map((range, index) => ({
          name: spec.checkpoints[index]?.name ?? String(index),
          screenshot: (plans[index] as ShotPlan).produceShot ? (plans[index] as ShotPlan).out : null,
          console: session.consoleMessages.slice(range.consoleStart, range.consoleEnd),
          pageErrors: session.pageErrors.slice(range.pageErrorStart, range.pageErrorEnd),
        })),
      },
    });
    const code = printVerdict("snap-scenario", {
      verdict: red ? 1 : 0,
      denominators: { checkpoints: { value: outcomes.length, refuseWhen: "zero" } },
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
      ],
    });
    return {
      code,
      receipt: {
        failures: failureSummary,
        captures: outcomes,
        browser: browserEnvironment,
        settings: session.contexts.map((context) => context.settingsEvidence),
        appearance: [],
        scenario: {
          name: spec.name,
          declaredCheckpointNames: spec.checkpoints.map((checkpoint) => checkpoint.name),
          capturedCheckpointNames: outcomes.map((_, index) => spec.checkpoints[index]?.name ?? String(index)),
          manifestPath,
        },
      },
    };
  } catch (error) {
    return await closeProbeSessionAfterError(session, error);
  }
}

export async function snapScenario(opts: Args): Promise<number> {
  return (await runScenarioDetailed(opts)).code;
}
