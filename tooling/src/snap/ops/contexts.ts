// --contexts N / --as: N ISOLATED, differently-authenticated browser contexts against the multi-user
// FIXTURE stack (never the shared single-user dev pair) — host-vs-member truth in one run.

import type { Page } from "@playwright/test";
import { artifactFile, artifactKey, print, printResult, routeSlug } from "../../_shared/artifacts.ts";
import type { ProbeSession } from "../../_shared/browser.ts";
import { buildUrl } from "../../_shared/browser.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { FixtureTarget } from "../contract/fixture.ts";
import type { Args, CaptureOutcome, ReportCtx, ShotPlan } from "../contract/types.ts";
import { contextOut, shouldProduceShot } from "../lib/out-names.ts";
import { capture } from "./capture.ts";
import { defaultFixtureUsers, fixtureRefusalLine, fixtureStatus, loginFixtureUser, resolveFixtureUsers } from "./fixture.ts";
import { appliedAcrossContexts, writeManifestIfRequested } from "./manifest.ts";
import { partitionFailedRequests } from "./noise.ts";
import {
  consoleForEvidence,
  cropOutcome,
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
import { finishSession, launchSnapSession } from "./session.ts";
import { buildFailureSummary, evidenceFailureCounts, hasSnapFailure, mapOutputSummary, outcomeTotals } from "./verdict.ts";

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

// One context's report section + its running request/error totals — factored out of snapContexts to
// keep that function's cognitive complexity under the gate. A single params object dodges the
// too-many-positional-params rule while keeping every field self-documenting at the call site.
function reportOneContext(args: ContextReportArgs, i: number): { readonly failedReq: number; readonly pageErrors: number; readonly viteChurn: number } {
  const { opts, session, outcomes, users, plan, out, totalContexts } = args;
  const ctxSession = session.contexts[i] as (typeof session.contexts)[number];
  const outcome = outcomes[i] as CaptureOutcome;
  const evidenceSession = sessionForEvidence(ctxSession, [outcome]);
  const { failed, viteChurn } = partitionFailedRequests(ctxSession.requests.values());
  const ctx: ReportCtx = { ...plan, out: contextOut(out, i, totalContexts), failed, totalPages: totalContexts, label: "CONTEXT" };
  print(`\nuser         ${users[i]?.handle} (context ${i})`);
  printPageReport(evidenceSession, outcome, opts, ctx);
  printCheckpointScope(ctxSession, evidenceSession);
  printCaptureLog(evidenceSession, failed, viteChurn);
  printCropNote(opts, ctx);
  printProbeMotionWarning(opts);
  return { failedReq: failed.length, pageErrors: evidenceSession.pageErrors.length, viteChurn: viteChurn.length };
}

async function captureContexts(session: ProbeSession, opts: Args, plan: ShotPlan, totalContexts: number): Promise<CaptureOutcome[]> {
  const outcomes: CaptureOutcome[] = [];
  for (let index = 0; index < totalContexts; index += 1) {
    const page = session.contexts[index]?.pages[0] as Page;
    outcomes.push(
      await capture(
        page,
        opts,
        { ...plan, pageIndex: index, totalPages: totalContexts, unit: "u" },
        session.contexts[index] as (typeof session.contexts)[number],
      ),
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

  const session = await launchSnapSession(opts, key, {
    contexts: totalContexts,
    contextCookies: cookies,
    cookieDomain: new URL(opts.base).hostname,
  });

  const plan: ShotPlan = { url, out, produceShot };
  const outcomes = await captureContexts(session, opts, plan, totalContexts);
  const reportArgs: ContextReportArgs = { opts, session, outcomes, users, plan, out, totalContexts };
  const reportTotals = reportContexts(reportArgs);
  const totals = outcomeTotals(outcomes);
  const evidenceFailures = evidenceFailureCounts(outcomes);
  const allConsole = session.contexts.flatMap((context) => context.consoleMessages);
  const allEvidenceConsole = session.contexts.flatMap((context, index) => consoleForEvidence(context.consoleMessages, [outcomes[index] as CaptureOutcome]));
  const allPageErrors = session.contexts.flatMap((context) => context.pageErrors);
  const allEvidencePageErrors = session.contexts.flatMap((context, index) => pageErrorsForEvidence(context.pageErrors, [outcomes[index] as CaptureOutcome]));
  const failureSummary = buildFailureSummary({
    outcomes,
    pageErrors: reportTotals.pageErrors,
    failedRequests: reportTotals.failedRequests,
    consoleMessages: allEvidenceConsole,
    strictConsole: opts.strictConsole,
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
    console: allConsole,
    pageErrors: allPageErrors,
    ...(opts.checkpoint ? { evidence: { scope: "checkpoint" as const, console: allEvidenceConsole, pageErrors: allEvidencePageErrors } } : {}),
    failedRequests: session.contexts.flatMap((context) => partitionFailedRequests(context.requests.values()).failed),
    ...(reportTotals.viteChurn === 0
      ? {}
      : { viteDepChurn: session.contexts.flatMap((context) => partitionFailedRequests(context.requests.values()).viteChurn) }),
    captures: outcomes,
  });
  const mapSummary = mapOutputSummary(opts.map, outcomes);
  printResult("snap", [
    ["out", produceShot ? contextOut(out, 0, totalContexts) : "(none)"],
    ["contexts", totalContexts],
    ["users", users.map((u) => u.handle).join(",")],
    ["aria", totals.ariaSeen ? "yes" : "no"],
    ["aria-fails", evidenceFailures.aria],
    ["map", mapSummary.count],
    ["map-dom-fallbacks", mapSummary.domFallbacks],
    ["map-fails", evidenceFailures.map],
    ["evals", totals.evals],
    ["eval-fails", evidenceFailures.eval],
    ["contrast-fails", totals.contrast],
    ["assertion-fails", totals.assertions],
    ["console-errors", failureSummary.consoleErrors],
    ["console-warnings", allEvidenceConsole.filter((entry) => entry.type === "warning").length],
    [
      "boot-console-warnings",
      allConsole.filter((entry) => entry.type === "warning").length - allEvidenceConsole.filter((entry) => entry.type === "warning").length,
    ],
    ["trace", artifacts.traces[0] ?? "none"],
    ["har", artifacts.hars[0] ?? "none"],
    ["json", manifestPath ?? "none"],
    ["crop", cropOutcome(opts, { ...plan, out: contextOut(out, 0, totalContexts), failed: [], totalPages: totalContexts }) ?? "none"],
    ["motion", motionResultValue(opts)],
    ["nav", navResultVerdict(totals.navigation, totals.navActions)],
    ["nav-actions-failed", totals.navActions],
    ["steps-failed", totals.steps],
    ["page-errors", reportTotals.pageErrors],
    ["failed-req", reportTotals.failedRequests],
    ["vite-dep-churn", reportTotals.viteChurn],
    ["deadcss", totals.deadCss],
    ["emptycss", totals.emptyCss],
  ]);
  return red ? 1 : 0;
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
