// --scenario: sequential checkpoints in ONE browser lifetime (shared context/shim/media), each with
// its own evidence window; session-level flags live on the outer command by refusal, not convention.
import { readFile } from "node:fs/promises";
import { basename, extname, isAbsolute, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { errorMessage } from "@orb/kit/error-message";
import type { Page } from "@playwright/test";
import { artifactDir } from "../../_shared/artifact-out.ts";
import { artifactFilePath, print, routeSlug } from "../../_shared/artifacts.ts";
import type { CapturedRequest, ProbeSession } from "../../_shared/browser.ts";
import { closeProbeSessionAfterError } from "../../_shared/browser.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { printVerdict } from "../../_shared/evidence.ts";
import { EXIT } from "../../_shared/exit-contract.ts";
import { loadResultPairs } from "../../_shared/load-budget.ts";
import type { SnapDetailedResult } from "../contract/run.ts";
import { scenarioPresetFile } from "../contract/scenario-presets.ts";
import type { Args, CaptureOutcome, ScenarioCheckpoint, ScenarioSpec, SessionCounts, ShotPlan } from "../contract/types.ts";
import type { SnapFailureSummary } from "../contract/verdict.ts";
import { HTTP_URL_RE, shouldProduceShot } from "../lib/out-names.ts";
import { checkpointArgErrors, identicalSeedsError, inheritSessionArgs } from "../lib/session-plan.ts";
import { capturePageCssEvidence } from "./arms/cascade.ts";
import { pageArmFailures } from "./arms/registry.ts";
import { capture } from "./capture.ts";
import { refuseFileMode, snapDestination } from "./guards.ts";
import { appliedAcrossContexts, writeManifestIfRequested } from "./manifest.ts";
import { consoleFailureCounts, isSandboxTraceNoise, partitionFailedRequests } from "./noise.ts";
import { parseSnapArgs } from "./parse.ts";
import { consoleForEvidence, pageErrorsForEvidence, printCaptureLog, printCheckpointScope, printPageReport, sessionForEvidence } from "./report.ts";
import { cascadeRuntimeFor, finishSession, launchSnapSession, readSnapEnvironmentEvidence, snapEnvironmentMismatchCount } from "./session.ts";
import { themeStampExit } from "./theme-stamp.ts";
import { hasSnapFailure } from "./verdict.ts";

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

// The PARTITION (which flag is the browser lifetime's and which is the checkpoint's) and the refusal rows
// live in lib/session-plan.ts since #1231 — ONE table serves a scenario's checkpoints and a stateful
// session's calls, so the two can never disagree about what a lifetime owns.
function scenarioCheckpointArgs(globalArgs: Args, spec: ScenarioSpec): Args[] {
  return spec.checkpoints.map((checkpoint) => {
    const args = parseSnapArgs([...spec.defaults, ...checkpoint.args]);
    const inherited = inheritSessionArgs(globalArgs, args, `${spec.name}-${routeSlug(checkpoint.name)}`);
    inherited.errors.push(...checkpointArgErrors(inherited, args, checkpoint.name));
    return inherited;
  });
}

function scenarioErrors(checkpoints: readonly Args[]): string[] {
  const errors = checkpoints.flatMap((checkpoint) => {
    const fileRefusal = refuseFileMode(checkpoint);
    return fileRefusal === null ? checkpoint.errors : [...checkpoint.errors, fileRefusal];
  });
  const seeds = identicalSeedsError(checkpoints);
  if (seeds !== null) {
    errors.push(seeds);
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

interface ScenarioSummaryInput {
  readonly opts: Args;
  readonly outcomes: readonly CaptureOutcome[];
  readonly session: ProbeSession;
  readonly failedRequests: readonly CapturedRequest[];
  readonly plan: ShotPlan;
}

function scenarioFailureSummary(input: ScenarioSummaryInput): SnapFailureSummary {
  const { opts, outcomes, session, failedRequests } = input;
  const strictConsole = opts.strictConsole;
  // Every ARM-owned member comes from the arm that measures it (contract/arms.ts). The scenario keeps its
  // own literal because its non-arm members are scoped differently (per-checkpoint console/page-error
  // windows, no watch, no diff) — but the arm halves must not be a second implementation.
  const arms = pageArmFailures({ opts, outcomes, ctx: { ...input.plan, failed: [...failedRequests], totalPages: 1 } });
  const armCount = (field: keyof SnapFailureSummary): number => {
    const count = arms[field];
    if (count === undefined) {
      throw new Error(`INSTRUMENT ERROR: no arm produced the verdict member "${field}" (tooling/src/snap/contract/arms.ts)`);
    }
    return count;
  };
  const consoleFailures = consoleFailureCounts(consoleForEvidence(session.consoleMessages, outcomes), strictConsole);
  return {
    navigation: outcomes.filter((outcome) => outcome.navError !== null).length,
    navActions: outcomes.reduce((count, outcome) => count + outcome.navFailures, 0),
    pageErrors: pageErrorsForEvidence(session.pageErrors, outcomes).length,
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
    // A scenario checkpoint runs the DRIVE path, not the single-run evidence pass — the Lighthouse arm
    // never fires there (it is a RUN arm and the scenario hosts no run arms), so its member is
    // structurally zero rather than "unmeasured".
    lighthouse: 0,
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
    const outcome = await capture(
      session.page,
      checkpoint,
      { ...plan, pageIndex: 0, totalPages: 1, navigatePage: !keepLivePage },
      {
        ...session,
        settingsEvidence: session.contexts[0]?.settingsEvidence,
      },
    );
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
    const failureSummary = {
      ...scenarioFailureSummary({ opts, outcomes, session, failedRequests, plan: plans[0] ?? { url: spec.name, out: spec.name, produceShot: false } }),
      environment: environmentFailures,
    };
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
    const scenarioCode = printVerdict("snap-scenario", {
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
        ...loadResultPairs(),
      ],
    });
    return {
      // #1227: a checkpoint whose requested THEME never stamped sampled the default palette — exit 2.
      code: themeStampExit(outcomes, scenarioCode),
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
