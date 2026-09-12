// --contexts N / --as: N ISOLATED, differently-authenticated browser contexts against the multi-user
// FIXTURE stack (never the shared single-user dev pair) — host-vs-member truth in one run.

import { artifactKey, routeSlug } from "../../_shared/artifact-naming.ts";
import { artifactFile } from "../../_shared/artifact-out.ts";
import { aggregateScope, evidenceWindowId, factBatchId } from "../../_shared/artifact-scope.ts";
import { print } from "../../_shared/artifacts.ts";
import { buildUrl, closeProbeSessionAfterError } from "../../_shared/browser.ts";
import { browserEvidenceRetention } from "../../_shared/browser-capture.ts";
import type { ProbeSession } from "../../_shared/browser-contract.ts";
import { summarizeOrbConsoleCompleteness } from "../../_shared/browser-diagnostics.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { printVerdictReceipt } from "../../_shared/evidence.ts";
import type { ArmPairInput, ArmRunContext } from "../contract/arms.ts";
import type { FixtureTarget } from "../contract/fixture.ts";
import { snapExitCode, snapExitState } from "../contract/run-facts.ts";
import type { Args, CaptureOutcome, ReportCtx, ShotPlan } from "../contract/types.ts";
import { contextOut, shouldProduceShot } from "../lib/out-names.ts";
import type { SnapRatePosture } from "../lib/rate-posture.ts";
import { ratePostureResultPairs } from "../lib/rate-posture.ts";
import { throttleResultValue } from "../lib/throttle.ts";
import type { RunArms } from "./arms/registry.ts";
import { armPairLedger, beginRunArms, pageArmExit, pageArmFacts, pageArmFailures, writePageArmEvidence } from "./arms/registry.ts";
import { capture } from "./capture.ts";
import { defaultFixtureUsers, fixtureRefusalLine, fixtureStatus, loginFixtureUser, resolveFixtureUsers } from "./fixture.ts";
import { appliedAcrossContexts, writeManifestIfRequested } from "./manifest.ts";
import { partitionFailedRequests } from "./noise.ts";
import {
  consoleForEvidence,
  motionResultValue,
  navResultVerdict,
  pageErrorsForEvidence,
  printCaptureLog,
  printCheckpointScope,
  printCropNote,
  printPageReport,
  printProbeMotionWarning,
  sessionForEvidence,
} from "./report.ts";
import { registerSnapDiagnosticCompleteness, registerSnapFactBatch, registerSnapResultPairs } from "./run-bundle.ts";
import { finishSession, launchSnapSession, readSnapEnvironmentEvidence, snapEnvironmentMismatchCount } from "./session.ts";
import { themeStampExit } from "./theme-stamp.ts";
import { buildFailureSummary, hasSnapFailure, outcomeTotals } from "./verdict.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

interface FixtureUser {
  readonly handle: string;
  readonly password: string;
}

// Log in EACH user via the real form door (POST /api/auth/login) BEFORE any browser context opens — the
// session cookie is then seeded into its matching context (buildContext in _shared/browser.ts), so the very
// first navigation is already authenticated as that user, no in-page login-form drive needed. Returns
// null (having already printed the failing line) on the first login that doesn't mint a cookie.
async function loginAllFixtureUsers(users: readonly FixtureUser[], target: FixtureTarget): Promise<(string | null)[] | null> {
  const cookies: (string | null)[] = [];
  for (const u of users) {
    const login = await loginFixtureUser(target.serverUrl, u.handle, u.password);
    if ("error" in login) {
      print(`LOGIN FAILED  ${u.handle}: ${login.error}`);
      return null;
    }
    cookies.push(login.cookie);
  }
  return cookies;
}

interface ContextReportArgs {
  readonly opts: Args;
  readonly session: ProbeSession;
  readonly outcomes: readonly CaptureOutcome[];
  readonly users: readonly FixtureUser[];
  readonly plan: ShotPlan;
  readonly out: string;
  readonly totalContexts: number;
}

function contextAt(session: ProbeSession, index: number): ProbeSession["contexts"][number] {
  const context = session.contexts[index];
  if (context === undefined) {
    throw new Error(`INSTRUMENT ERROR: context ${String(index)} is missing from the launched session`);
  }
  return context;
}

function outcomeAt(outcomes: readonly CaptureOutcome[], index: number): CaptureOutcome {
  const outcome = outcomes[index];
  if (outcome === undefined) {
    throw new Error(`INSTRUMENT ERROR: context ${String(index)} has no capture outcome`);
  }
  return outcome;
}

// One context's report section + its running request/error totals — factored out of snapContexts to
// keep that function's cognitive complexity under the gate. A single params object dodges the
// too-many-positional-params rule while keeping every field self-documenting at the call site.
function reportOneContext(args: ContextReportArgs, i: number): { readonly failedReq: number; readonly pageErrors: number; readonly viteChurn: number } {
  const { opts, session, outcomes, users, plan, out, totalContexts } = args;
  const ctxSession = contextAt(session, i);
  const outcome = outcomeAt(outcomes, i);
  const evidenceSession = sessionForEvidence(ctxSession, [outcome]);
  const { failed, viteChurn, fileOrigin } = partitionFailedRequests(ctxSession.requests.values());
  const ctx: ReportCtx = { ...plan, out: contextOut(out, i, totalContexts), failed, totalPages: totalContexts, label: "CONTEXT" };
  print(`\nuser         ${users[i]?.handle} (context ${i})`);
  printPageReport(evidenceSession, outcome, opts, ctx);
  printCheckpointScope(ctxSession, evidenceSession);
  printCaptureLog(evidenceSession, failed, viteChurn, fileOrigin);
  printCropNote(opts, ctx);
  printProbeMotionWarning(opts);
  return { failedReq: failed.length, pageErrors: evidenceSession.pageErrors.length, viteChurn: viteChurn.length };
}

async function captureContexts(
  input: Readonly<{
    session: ProbeSession;
    opts: Args;
    plan: ShotPlan;
    totalContexts: number;
    ratePosture: SnapRatePosture;
    runArms: RunArms;
  }>,
): Promise<CaptureOutcome[]> {
  const { session, opts, plan, totalContexts, ratePosture, runArms } = input;
  const outcomes: CaptureOutcome[] = [];
  for (let index = 0; index < totalContexts; index += 1) {
    const context = contextAt(session, index);
    const page = context.pages[0];
    if (page === undefined) {
      throw new Error(`INSTRUMENT ERROR: context ${String(index)} has no page`);
    }
    outcomes.push(
      await capture({
        page,
        opts,
        plan: { ...plan, pageIndex: index, totalPages: totalContexts, unit: "u" },
        evidence: context,
        ratePosture,
        armEvidenceWindow: evidenceWindowId("action-tape-through-settle"),
        runArms,
      }),
    );
  }
  return outcomes;
}

function reportContexts(args: ContextReportArgs): { readonly failedRequests: number; readonly pageErrors: number; readonly viteChurn: number } {
  let pageErrors = 0;
  let failedRequests = 0;
  let viteChurn = 0;
  for (let index = 0; index < args.totalContexts; index += 1) {
    const totals = reportOneContext(args, index);
    failedRequests += totals.failedReq;
    pageErrors += totals.pageErrors;
    viteChurn += totals.viteChurn;
  }
  return { failedRequests, pageErrors, viteChurn };
}

interface OwnedContextsArgs {
  readonly url: string;
  readonly name: string;
  readonly out: string;
  readonly key: string;
  readonly produceShot: boolean;
  readonly totalContexts: number;
}

export async function snapContexts(opts: Args, users: readonly FixtureUser[], target: FixtureTarget): Promise<number> {
  const url = buildUrl(opts.base, opts.route);
  const name = opts.out ?? routeSlug(opts.route);
  // Same naming contract as `snap()`: a path-shaped --out routes the shot; the kind-dir siblings key off
  // its basename.
  const out = await artifactFile("snaps", name, ".png");
  const key = artifactKey(name);
  const produceShot = shouldProduceShot(opts);
  const totalContexts = users.length;

  const cookies = await loginAllFixtureUsers(users, target);
  if (cookies === null) {
    return 1;
  }

  const session = await launchSnapSession(opts, {
    contexts: totalContexts,
    contextCookies: cookies,
    cookieDomain: new URL(opts.base).hostname,
  });

  try {
    return await runOwnedContexts(session, opts, users, { url, name, out, key, produceShot, totalContexts });
  } catch (error) {
    return await closeProbeSessionAfterError(session, error);
  }
}

async function runOwnedContexts(session: ProbeSession, opts: Args, users: readonly FixtureUser[], args: OwnedContextsArgs): Promise<number> {
  const { url, name, out, key, produceShot, totalContexts } = args;
  const plan: ShotPlan = { url, out, produceShot };
  const arms = beginRunArms(session, opts);
  const ratePosture = await arms.ratePosture();
  await arms.prepare();
  const outcomes = await captureContexts({ session, opts, plan, totalContexts, ratePosture, runArms: arms });
  const armCtx: ArmRunContext = {
    session,
    opts,
    outcomes,
    name: key,
    provisions: { debuggingPort: null, cascadeRuntime: null },
    ratePosture,
  };
  await arms.measure(armCtx);
  const reportArgs: ContextReportArgs = { opts, session, outcomes, users, plan, out, totalContexts };
  const reportTotals = reportContexts(reportArgs);
  await arms.report(armCtx);
  const totals = outcomeTotals(outcomes);
  const pairInput: ArmPairInput = {
    opts,
    outcomes,
    ctx: { ...plan, out: contextOut(out, 0, totalContexts), failed: [], totalPages: totalContexts },
  };
  const ledger = armPairLedger(pairInput, arms.pairs());
  const allConsole = session.contexts.flatMap((context) => context.consoleMessages);
  const allEvidenceConsole = session.contexts.flatMap((context, index) => consoleForEvidence(context, [outcomeAt(outcomes, index)]));
  const allPageErrors = session.contexts.flatMap((context) => context.pageErrors);
  const allDiagnostics = session.contexts.flatMap((context) => context.diagnostics);
  const allEvidencePageErrors = session.contexts.flatMap((context, index) => pageErrorsForEvidence(context, [outcomeAt(outcomes, index)]));
  const browserEnvironment = await readSnapEnvironmentEvidence(session);
  const environmentFailures = snapEnvironmentMismatchCount(browserEnvironment);
  const failureSummary = buildFailureSummary({
    outcomes,
    pageErrors: reportTotals.pageErrors,
    failedRequests: reportTotals.failedRequests,
    consoleMessages: allEvidenceConsole,
    strictConsole: opts.strictConsole,
    environment: environmentFailures,
    arms: { ...pageArmFailures(pairInput), ...arms.failures() },
  });
  const red = hasSnapFailure(failureSummary);
  const retention = browserEvidenceRetention(session);
  const artifacts = await finishSession(session, red, key, opts.failureEvidence);
  // #1342: the multi-context path files its page arms' printed evidence on the same terms as the
  // single-context one — one write per RUN, over every context's outcomes.
  await writePageArmEvidence(pairInput);
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
    console: allConsole,
    diagnostics: allDiagnostics,
    diagnosticCompleteness: session.contexts.flatMap((context) => context.diagnosticCompleteness),
    pageErrors: allPageErrors,
    ...(opts.checkpoint
      ? {
          evidence: {
            scope: "checkpoint" as const,
            console: allEvidenceConsole,
            pageErrors: allEvidencePageErrors,
            diagnostics: allDiagnostics.filter((entry) => entry.evidenceWindow > 0),
            diagnosticCompleteness: session.contexts.flatMap((context) => context.diagnosticCompleteness.filter((entry) => entry.evidenceWindow > 0)),
          },
        }
      : {}),
    failedRequests: session.contexts.flatMap((context) => partitionFailedRequests(context.requests.values()).failed),
    ...(reportTotals.viteChurn === 0
      ? {}
      : { viteDepChurn: session.contexts.flatMap((context) => partitionFailedRequests(context.requests.values()).viteChurn) }),
    captures: outcomes,
  });
  const terminal = printVerdictReceipt("snap", {
    verdict: red ? 1 : 0,
    denominators: { contexts: { value: totalContexts, refuseWhen: "zero" }, ...arms.denominators() },
    pairs: [
      ...ledger.some("shot", "out"),
      ["contexts", totalContexts],
      ["users", users.map((u) => u.handle).join(",")],
      ...ledger.arm("aria"),
      ...ledger.arm("map"),
      ...ledger.arm("eval"),
      ...ledger.arm("contrast"),
      ...ledger.arm("assert"),
      ["environment-fails", failureSummary.environment],
      ...ledger.some("dead-css", "deadcss-fails", "emptycss-fails"),
      ["console-errors", failureSummary.consoleErrors],
      ["console-warnings", allEvidenceConsole.filter((entry) => entry.type === "warning").length],
      [
        "boot-console-warnings",
        allConsole.filter((entry) => entry.type === "warning").length - allEvidenceConsole.filter((entry) => entry.type === "warning").length,
      ],
      ["trace", artifacts.traces[0] ?? "none"],
      ["har", artifacts.hars[0] ?? "none"],
      ["json", manifestPath ?? "none"],
      ...ledger.some("shot", "crop"),
      ["motion-evidence", motionResultValue(opts)],
      ["throttle", throttleResultValue(opts.cpuThrottle, opts.network)],
      ["file-actions", outcomes.reduce((count, outcome) => count + outcome.fileActions.length, 0)],
      ["files-driven", outcomes.reduce((count, outcome) => count + outcome.fileActions.reduce((files, action) => files + action.files, 0), 0)],
      ["nav", navResultVerdict(totals.navigation, totals.navActions)],
      ["nav-actions-failed", totals.navActions],
      ["steps-failed", totals.steps],
      ["page-errors", reportTotals.pageErrors],
      ["failed-req", reportTotals.failedRequests],
      ["vite-dep-churn", reportTotals.viteChurn],
      ...ledger.some("dead-css", "deadcss", "emptycss"),
      // A new arm's members land here with no edit to this file (design §6).
      ...ledger.rest(),
      ...ratePostureResultPairs(ratePosture),
    ],
  });
  registerSnapDiagnosticCompleteness(summarizeOrbConsoleCompleteness(session.contexts.flatMap((context) => context.diagnosticCompleteness)));
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
        data: retention,
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
          pages: outcomes.length,
          contexts: totalContexts,
          captures: outcomes.length,
          fileActions: outcomes.reduce((count, outcome) => count + outcome.fileActions.length, 0),
          failedRequests: reportTotals.failedRequests,
          pageErrors: reportTotals.pageErrors,
          diagnostics: allDiagnostics.length,
          failures: failureSummary,
        },
      },
    ],
    arms: [...pageArmFacts(pairInput, {}), ...arms.facts({})],
  });
  registerSnapResultPairs(terminal.pairs);
  // #1227: a page whose requested THEME never stamped measured the default palette — exit 2, not a verdict.
  return finalCode;
}

export function resolveContextsMode(opts: Args, target: FixtureTarget): { readonly users: readonly FixtureUser[] } | { readonly refuse: string } | null {
  if (opts.contexts <= 1 && opts.as === null) {
    return null;
  }
  if (opts.contexts > 1 && opts.as !== null) {
    return {
      refuse: "--as is only for a single context (--contexts 1, the default) — a --contexts N>1 run already assigns N distinct handles in roster order",
    };
  }
  if (opts.pages > 1) {
    return { refuse: "--contexts + --pages together is an unexercised combination — drive one at a time" };
  }
  const status = fixtureStatus(target);
  if (!status.up) {
    return { refuse: fixtureRefusalLine(status.reason) };
  }
  const resolved = opts.as !== null ? resolveFixtureUsers([opts.as]) : defaultFixtureUsers(opts.contexts);
  if ("error" in resolved) {
    return { refuse: fixtureRefusalLine(resolved.error) };
  }
  // The SAME resolved target drives both halves — the health probe above and the browser's origin here.
  // (The old shape hard-coded them separately, so an override reached neither.)
  opts.base = target.baseUrl;
  return { users: resolved.users };
}
