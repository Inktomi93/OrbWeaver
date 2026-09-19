// The page DRIVE: navigation + app-readiness (the dataless tripwire, #145), the argv-ordered action
// queue (navs + steps + mid-chain evals — the interleave IS the contract, 2026-08-15/16), and the
// trailing-eval split that keeps a trailing `--eval` a settled-surface observer.
import { errorMessage } from "@orb/kit/error-message";
import type { NavResultShape } from "@orb/tooling/_shared/page-validate";
import { navResultShape } from "@orb/tooling/_shared/page-validate";
import type { Page } from "@playwright/test";
import { print } from "../../_shared/artifacts.ts";
import { settle } from "../../_shared/browser.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { buildNavScript } from "../../_shared/nav.ts";
import type { FileActionReceipt } from "../../_shared/upload.ts";
import { driveFileDrop, driveFileUpload, fileActionReceiptLine } from "../../_shared/upload.ts";
import type { ArmActionContext, ArmActionDisposition, ArmTapeContext } from "../contract/arms.ts";
import type { Args, DriveFailure, EvalOutcome, NavAction, SnapAction, Step } from "../contract/types.ts";
import { HOVER_REVEAL_MS, MOUNT_SETTLE_MS, NETWORKIDLE_TIMEOUT_MS, STEP_SETTLE_MS, STEP_TIMEOUT_MS, WAIT_SELECTOR_TIMEOUT_MS } from "../lib/budgets.ts";
import { CHURN_LINE, isContextChurn } from "../lib/eval-text.ts";
import { markStageBootDead } from "../lib/stage-run-binding.ts";
import { driveBudgets } from "../lib/throttle.ts";
import { captureEvals } from "./arms/eval.ts";
import { navDriveFailure, stepDriveFailure, stepLabel, waitDriveFailure } from "./drive-failure-naming.ts";
import { MS_PER_SECOND } from "./flags-support.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

/** Did the app reach a SETTLED state? `settled` = the flag went up on a real query-cache idle; `degraded` =
 *  app-ready-signal's ceiling handed the flag over with reads still running; `dataless` = the flag says settled
 *  but the app never reached its data layer at all; `absent` = it never went up. */
const APP_READINESS = ["settled", "degraded", "dataless", "absent"] as const;
type AppReadiness = (typeof APP_READINESS)[number];
const WHEEL_BURST_SETTLE_MS = 30;

/** THE DATALESS TRIPWIRE (issue #145). `data-app-ready` claims a settle from an IDLE query cache, and an
 *  idle cache also describes an app that never got as far as its first read — which is exactly what a stage
 *  stuck on the router's pending component looks like. That shape screenshotted the boot glyph and reported
 *  a clean wait for as long as `snap --isolated` has existed. An EMPTY cache (not idle — empty: zero query
 *  entries ever created) is the signal, and it is never legitimate here: every route this app serves mounts
 *  `useAuthConfig` (`data/auth-config.ts`), so a settled app has read something. `__orb` is dev-only — a
 *  build without the bridge answers `null` and we make no claim rather than a false one. */
async function everReadAnything(page: Page): Promise<boolean | null> {
  // @orb-waive caught-failure-ownership(page.evaluate): probe-whose-failure-is-its-return-value — a build without the __orb bridge, or a probe that throws, returns null and the caller "makes no claim rather than a false one" (doc comment above). Ends if a caller starts trusting null as a positive settle.
  const count = await page.evaluate("window.__orb ? window.__orb.queries().length : null").catch(() => null);
  return typeof count === "number" ? count > 0 : null;
}

async function appReadiness(page: Page, timeoutMs: number): Promise<AppReadiness> {
  const flag = page.locator("html[data-app-ready]");
  // @orb-waive caught-failure-ownership(waitFor): failure IS the return value — converts to attached=false, which becomes the "absent" readiness arm fed into UNSETTLED_REASON and reported as navError below. Ends if that reporting chain is removed.
  const attached = await flag
    .waitFor({ state: "attached", timeout: timeoutMs })
    .then(() => true)
    .catch(() => false);
  if (!attached) {
    return "absent";
  }
  if ((await flag.getAttribute("data-app-ready")) === "degraded") {
    return "degraded";
  }
  return (await everReadAnything(page)) === false ? "dataless" : "settled";
}

/** Why a non-settled readiness voids the capture — one line per arm, mapped exhaustively so a new arm
 *  cannot be added without its reason. NONE of them tells a STAGE reader to re-run: on `--isolated` the
 *  warm-up navigation has already been paid inside this run (`readinessWithColdStageWarmup`), so reaching
 *  any of these lines there means the SECOND, warm navigation failed too. */
const UNSETTLED_REASON: Record<Exclude<AppReadiness, "settled">, string> = {
  absent:
    "app never signalled data-app-ready — the capture is MID-HYDRATION, not the settled app. On `--isolated` the cold-stage warm-up navigation has ALREADY been retried inside this run (#1142), so reaching this line there means the stage's app does not mount at all: read the stage's stack log (preserved into this run's slot) rather than re-running. Elsewhere (the dev stack, `--base`) this is the app itself failing to mount.",
  degraded:
    "data-app-ready came up DEGRADED — reads were still in flight at the client's own readiness ceiling, so the capture is mid-hydration, not the settled app. On `--isolated` the warm-up navigation has ALREADY been retried inside this run (#1837), so reaching this line there is a stage whose SECOND, warm navigation still could not settle: read the stage's stack log (preserved into this run's slot) rather than re-running.",
  dataless:
    "data-app-ready came up settled but the query cache is EMPTY — the app never reached its data layer, so this capture is a boot placeholder (the router's pending glyph), not the app. On `--isolated` the warm-up navigation has ALREADY been retried inside this run (#1837), so reaching this line there is a stage whose SECOND, warm navigation still served the placeholder: read the stage's stack log (preserved into this run's slot) rather than re-running.",
};

/** THE COLD-STAGE WARM-UP IS OURS TO PAY, NOT THE READER'S (#1142). A freshly created `--isolated` stage is
 *  a vite that has never transformed this route: the FIRST navigation drives the on-demand build and the app
 *  does not mount inside the readiness ceiling, so the run refused and told the reader to "re-run against the
 *  now-warm stage". Reproduced at FOUR shas: that re-run refused the SAME way and only the THIRD invocation
 *  measured — the message under-instructed by a whole run, which is the lying-instrument-message class.
 *
 *  The fix makes the promise TRUE rather than re-wording it: the warm-up navigation happens HERE, once,
 *  inside the run that provoked it, and ONLY for a stage. A dev-stack or `--base` origin that never mounts is
 *  a real app defect and still refuses on the first pass — retrying there would convert a finding into a
 *  slower finding. Bounded by the same two ceilings, so the worst case for a genuinely dead stage app is one
 *  extra nav+readiness ceiling paid once, instead of a third full CLI invocation paid by the caller.
 *
 *  AND IT COVERS EVERY NON-SETTLED ARM, NOT JUST `absent` (#1837). Scoping the retry to `absent` left the
 *  arm a cold stage ACTUALLY produces uncovered, so every isolated boot at today's tip refused: measured on a
 *  QUIET box (load 3.8/24, budget-factor 1.00) at d5adb9103, `snap / --isolated` came back
 *  `nav=ERROR / degraded`, and its HAR is 1375 entries of which ~1370 are vite source-module transforms
 *  served one at a time over 28.7 s — with exactly ONE api call in the whole trace (`/api/auth/me`, 19 ms,
 *  200), zero page errors and zero failed requests. A fresh stage worktree has an empty React-Compiler
 *  transform cache (packages/client/vite.config.ts #593), so it pays the cold pass e2e's globalSetup exists
 *  to absorb; the app is never waiting on a read. The CLIENT's own readiness ceiling is a hard 20 s that
 *  stamps `data-app-ready="degraded"` ONE-SHOT (packages/client/src/lib/app-ready-signal.ts), which is well
 *  inside snap's 60 s STAGE_READY budget — so on a cold stage the wait ALWAYS returns early carrying
 *  `degraded` and the 60 s budget is structurally unreachable. A fresh document gets a fresh one-shot signal,
 *  which is why the re-navigation settles: the same stage, re-run warm, came back `nav=OK` in 8 s. */
async function readinessWithColdStageWarmup(
  page: Page,
  opts: Args,
  url: string,
  budgets: { readonly nav: number; readonly ready: number },
): Promise<{ readonly readiness: AppReadiness; readonly httpError: string | null }> {
  const first = await appReadiness(page, budgets.ready);
  if (first === "settled" || !opts.isolated) {
    return { readiness: first, httpError: null };
  }
  print(`[snap-stage] the stage's first navigation came back ${first} (cold vite); re-navigating once before judging`);
  const retry = await page.goto(url, { waitUntil: "domcontentloaded", timeout: budgets.nav });
  const httpError = retry !== null && !retry.ok() ? `HTTP ${String(retry.status())}` : null;
  const readiness = await appReadiness(page, budgets.ready);
  if (readiness !== "settled") {
    // A stage whose WARM navigation still cannot settle never served an app, so it is not the warm asset
    // #324 protects — it is a corpse holding a band and a process group (`lib/stage-run-binding.ts`).
    markStageBootDead(`the stage's warm-up re-navigation came back ${readiness}`);
  }
  return { readiness, httpError };
}

export async function navigate(page: Page, opts: Args, url: string, failures?: DriveFailure[]): Promise<string | null> {
  // The ceilings are a function of the STAGE (a cold vite) AND of the declared LOAD ARM (#836) — see
  // lib/throttle.ts driveBudgets for why a throttled run cannot be held to the un-throttled budget.
  const budgets = driveBudgets({ isolated: opts.isolated, cpuRate: opts.cpuThrottle, network: opts.network });
  const navTimeout = budgets.nav;
  const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: navTimeout });
  let navError: string | null = null;
  if (!resp) {
    navError = "no response";
  } else if (!resp.ok()) {
    navError = `HTTP ${resp.status()}`;
  }
  // Default readiness gate: app-ready-signal.ts sets `data-app-ready` on <html> once the initial reads
  // settle — independent of the never-idle SSE stream. Wait for it so snaps capture the SETTLED app,
  // not mid-hydration skeletons (the "lists sit on skeletons forever" friction). Graceful: a non-app
  // page or an old build that never sets it just falls through, so this only ever adds real load-wait,
  // never a hang.
  // --file (a static mock over file://) has no app and never sets the flag — waiting would burn the full
  // timeout on EVERY mock snap, so skip it there rather than pay a guaranteed-useless wait.
  //
  // THE RESULT IS REPORTED, NOT SWALLOWED (2026-08-09). This used to `.catch(() => undefined)` the whole
  // wait, so a page that never signalled ready produced a mid-hydration capture and a clean report — the
  // instrument failing open. It now reads the flag's VALUE too: app-ready-signal hands over `degraded` when its
  // ceiling fires with reads still in flight. Either shape is a nav error on a route we are serving,
  // because the capture below is NOT of the settled app and every downstream assertion about it is void.
  if (opts.file === null) {
    const settled = await readinessWithColdStageWarmup(page, opts, url, { nav: navTimeout, ready: budgets.ready });
    if (navError === null) {
      navError = settled.httpError ?? (settled.readiness === "settled" ? null : UNSETTLED_REASON[settled.readiness]);
    }
  }
  // Even a non-OK nav may still render something worth waiting for (SPA error page).
  if (opts.waitSelector !== null) {
    // The throw still propagates (ops/capture.ts owns it as outcome.navError and screenshots wherever the
    // page got to) — but the STRUCTURED row is minted here, where the selector that never appeared is
    // still in hand, so the end card names the argv to correct instead of a `nav/wait threw:` prose blob.
    try {
      await page.locator(opts.waitSelector).first().waitFor({ state: "visible", timeout: WAIT_SELECTOR_TIMEOUT_MS });
    } catch (error) {
      failures?.push(waitDriveFailure(opts.waitSelector, errorMessage(error)));
      throw error;
    }
  }
  return navError;
}

async function runWheelStep(page: Page, step: Extract<Step, { readonly kind: "wheel" | "wheelburst" }>): Promise<void> {
  const loc = page.locator(step.selector).first();
  await loc.waitFor({ state: "visible", timeout: STEP_TIMEOUT_MS });
  await loc.hover();
  const count = step.kind === "wheelburst" ? step.count : 1;
  for (let index = 0; index < count; index += 1) {
    await page.mouse.wheel(0, step.dy);
    if (count > 1) {
      await settle(page, WHEEL_BURST_SETTLE_MS);
    }
  }
}

async function runLocatedStep(
  page: Page,
  step: Exclude<Step, { readonly kind: "motion-click" | "pause" | "wheel" | "wheelburst" | "keyboard" }>,
): Promise<FileActionReceipt | null> {
  const loc = page.locator(step.selector).first();
  if (step.kind === "waitfor") {
    await loc.waitFor({ state: "visible", timeout: WAIT_SELECTOR_TIMEOUT_MS });
    return null;
  }
  if (step.kind === "jsclick") {
    await loc.waitFor({ state: "attached", timeout: STEP_TIMEOUT_MS });
    await loc.evaluate((element) => {
      const click = Reflect.get(element, "click");
      if (typeof click !== "function") {
        throw new Error("target has no DOM click method");
      }
      Reflect.apply(click, element, []);
    });
    return null;
  }
  if (step.kind === "press") {
    await loc.waitFor({ state: "attached", timeout: STEP_TIMEOUT_MS });
    await loc.hover({ force: true });
    await settle(page, HOVER_REVEAL_MS);
    await loc.click({ force: true, timeout: STEP_TIMEOUT_MS });
    return null;
  }
  if (step.kind === "upload" || step.kind === "drop-files") {
    const fileReceipt =
      step.kind === "upload"
        ? await driveFileUpload(loc, step.selector, step.paths, STEP_TIMEOUT_MS)
        : await driveFileDrop(loc, step.selector, step.paths, STEP_TIMEOUT_MS);
    print(fileActionReceiptLine(fileReceipt));
    return fileReceipt;
  }
  await loc.waitFor({ state: "visible", timeout: STEP_TIMEOUT_MS });
  if (step.kind === "click") {
    await loc.click({ timeout: STEP_TIMEOUT_MS });
  } else if (step.kind === "tap") {
    // THE FINGER, NOT THE MOUSE (#2445). `locator.tap()` is `Input.dispatchTouchEvent` — touchstart/
    // touchend + the pointerType:"touch" pointer sequence — and dispatches NO mouseover/mouseenter, which
    // is exactly what makes a Base UI tooltip (`mouseOnly: true`, TooltipTrigger.js:147) stay shut under
    // it while `--click` opens one. It THROWS "The page does not support tap" without `hasTouch`, so the
    // parse-time refusal in ops/parse.ts is the operator-facing door and this is its backstop.
    await loc.tap({ timeout: STEP_TIMEOUT_MS });
  } else if (step.kind === "hover") {
    await loc.hover();
  } else if (step.kind === "key") {
    await loc.press(step.key);
  } else {
    await loc.fill(step.value);
  }
  return null;
}

// One step, one wait discipline. Throws on failure; driveStep counts + reports.
async function runStep(page: Page, step: Step): Promise<FileActionReceipt | null> {
  if (step.kind === "motion-click") {
    throw new Error("INSTRUMENT ERROR: a motion-click reached the ordinary tape dispatcher without the motion arm handling it");
  }
  if (step.kind === "pause") {
    await settle(page, step.ms);
    return null;
  }
  if (step.kind === "wheel" || step.kind === "wheelburst") {
    await runWheelStep(page, step);
    return null;
  }
  if (step.kind === "keyboard") {
    // NO locator, NO focus call: the key goes to whatever currently holds focus, which is what makes a
    // repeated `--key Tab` walk instead of re-focusing one anchor before every press.
    await page.keyboard.press(step.key);
    return null;
  }
  return await runLocatedStep(page, step);
}

// One step attempt + its settle. Returns the failure count (0 or 1) and prints its own reason —
// a failing step never aborts the run, so the caller still gets a PNG of wherever the page ended up.
interface DrivenStep {
  readonly failures: number;
  readonly fileAction: FileActionReceipt | null;
  /** Non-null on failure: the structured row the end card turns into its own FINDING (#1344). */
  readonly failure: DriveFailure | null;
}

async function driveStep(page: Page, step: Step, index: number): Promise<DrivenStep> {
  // @orb-waive caught-failure-ownership(e): printed as STEP FAILED and returned as a count the caller sums into stepFailures, the verdict the run reads. Ends if stepFailures stops being read.
  try {
    const fileAction = await runStep(page, step);
    await settle(page, STEP_SETTLE_MS);
    return { failures: 0, fileAction, failure: null };
  } catch (e) {
    const msg = errorMessage(e);
    // Dev-server churn (HMR/restart/5xx) tears down the realm mid-run — say so distinctly and give the
    // step ONE retry after a settle, rather than reporting an environmental blip as an app failure.
    if (isContextChurn(msg)) {
      print(`${CHURN_LINE} — retrying: ${stepLabel(step)}`);
      // @orb-waive caught-failure-ownership(retryErr): the retry's own failure is printed as STEP FAILED (after churn retry) and returned as the same counted failure the outer catch would have produced. Ends if that count stops being read.
      try {
        await settle(page, STEP_SETTLE_MS);
        const fileAction = await runStep(page, step);
        // The retry owes the SAME post-run settle as the normal path (#1509): returning straight from
        // here let the next tape action observe pre-settle DOM, so one churn blip silently changed what
        // every following step measured.
        await settle(page, STEP_SETTLE_MS);
        return { failures: 0, fileAction, failure: null };
      } catch (retryErr) {
        print(`STEP FAILED (after churn retry)  ${stepLabel(step)}: ${errorMessage(retryErr)}`);
        return { failures: 1, fileAction: null, failure: stepDriveFailure(index, step, `${errorMessage(retryErr)} (after a dev-server churn retry)`) };
      }
    }
    print(`STEP FAILED  ${stepLabel(step)}: ${msg}`);
    return { failures: 1, fileAction: null, failure: stepDriveFailure(index, step, msg) };
  }
}

// One nav action + its settle. Returns the failure count (0 or 1); each failure prints + reddens exit.
async function driveNav(page: Page, action: NavAction, index: number): Promise<DriveFailure | null> {
  // Every nav action needs the app hydrated AND the bridge installed — wait on both, gracefully bounded.
  // @orb-waive caught-failure-ownership(waitFor): gracefully bounded per the comment above — a stuck/absent flag falls through, and any real problem still surfaces via the nav evaluate() below, caught by the try beneath. Ends if that fallthrough evaluate stops being what catches real failures.
  await page
    .locator("html[data-app-ready]")
    .waitFor({ state: "attached", timeout: WAIT_SELECTOR_TIMEOUT_MS })
    .catch(() => undefined);
  let result: NavResultShape;
  // @orb-waive caught-failure-ownership(e): printed as NAV FAILED and returned as a count the caller sums into navFailures, the verdict the run reads. Ends if navFailures stops being read.
  try {
    // @orb-waive caught-failure-ownership(page.evaluate): a fire-and-forget readiness ping whose result is discarded — the very next line's evaluate() runs regardless and its failure IS caught by this try, reported as NAV FAILED. Ends if the next evaluate stops being what reports real failures.
    await page.evaluate("window.__orb && window.__orb.ready").catch(() => undefined);
    // #1004 — ONE nav-result predicate for all four call sites (_shared/page-validate.ts); this file
    // used to declare its own copy of the shape and assert it.
    result = navResultShape(await page.evaluate(buildNavScript(action.kind, action.target)), `nav ${action.kind} ${action.target}`);
  } catch (e) {
    print(`NAV FAILED  ${action.kind} ${action.target}: ${errorMessage(e)}`);
    return navDriveFailure(index, action, errorMessage(e));
  }
  if (!result.ok) {
    print(`NAV FAILED  ${action.kind} ${action.target}: ${result.reason ?? "rejected"}`);
    return navDriveFailure(index, action, result.reason ?? "rejected");
  }
  // Let the store write + view transition settle before the next action / the shot.
  await settle(page, STEP_SETTLE_MS);
  return null;
}

/** Nav and step failures are counted SEPARATELY (they surface as distinct RESULT fields and distinct
 *  manifest counters) even though the three arms run from one queue. `evalResults` carries the outcomes
 *  of the INTERLEAVED evals in argv order; trailing evals are appended by the capture phase. */
interface DriveFailures {
  navFailures: number;
  stepFailures: number;
  evalResults: EvalOutcome[];
  fileActions: FileActionReceipt[];
  /** One row per failed nav/step, in queue order (#1344). */
  driveFailures: DriveFailure[];
}

// THE drive loop: one page's queued actions — bridge navs and interaction steps alike — in TRUE argv
// order. Interleaving is the contract, not an implementation detail: a flat command line reads as
// ordered, so `--goto modal:newChat --click <create> --context-tab rpg.game --click <row>` must open the
// modal, click create, THEN ask the resulting room for its tab. The old class-grouped shape ran both navs
// first, so the context-tab hit the landing page and the last click timed out against a room that did not
// exist yet (2026-08-15). Failures never abort — the capture below still reports where the page ended up.
interface DriveActionLifecycle {
  readonly beforeAction: (ctx: ArmActionContext) => Promise<ArmActionDisposition>;
  readonly afterAction: (ctx: ArmActionContext & { readonly failed: boolean; readonly handled: boolean }) => Promise<void>;
  readonly afterActions: (ctx: ArmTapeContext) => Promise<void>;
}

interface DriveActionsInput {
  readonly page: Page;
  readonly actions: readonly SnapAction[];
  readonly opts?: Args;
  readonly pageIndex?: number;
  readonly lifecycle?: DriveActionLifecycle;
}

function applyHandledDisposition(failures: DriveFailures, entry: SnapAction, disposition: ArmActionDisposition): boolean {
  if (entry.type === "nav") {
    failures.navFailures += disposition.failures;
  } else {
    failures.stepFailures += disposition.failures;
  }
  return disposition.failures > 0;
}

async function dispatchOrdinaryAction(page: Page, entry: SnapAction, failures: DriveFailures, index: number): Promise<boolean> {
  if (entry.type === "nav") {
    const failure = await driveNav(page, entry.action, index);
    if (failure !== null) {
      failures.navFailures += 1;
      failures.driveFailures.push(failure);
    }
    return failure !== null;
  }
  if (entry.type === "eval") {
    const results = await captureEvals(page, [entry.action.expr]);
    failures.evalResults.push(...results);
    return results.some((result) => result.failed);
  }
  const driven = await driveStep(page, entry.action, index);
  failures.stepFailures += driven.failures;
  if (driven.failure !== null) {
    failures.driveFailures.push(driven.failure);
  }
  if (driven.fileAction !== null) {
    failures.fileActions.push(driven.fileAction);
  }
  return driven.failures > 0;
}

export async function driveActions(input: DriveActionsInput): Promise<DriveFailures> {
  const { page, actions, opts, lifecycle } = input;
  const pageIndex = input.pageIndex ?? 0;
  const failures: DriveFailures = { navFailures: 0, stepFailures: 0, evalResults: [], fileActions: [], driveFailures: [] };
  for (const [actionIndex, entry] of actions.entries()) {
    const ctx =
      opts === undefined
        ? null
        : { page, opts, pageIndex, actionIndex, action: entry, navFailuresBefore: failures.navFailures, stepFailuresBefore: failures.stepFailures };
    const disposition = ctx === null || lifecycle === undefined ? { handled: false, failures: 0 } : await lifecycle.beforeAction(ctx);
    const failed = disposition.handled
      ? applyHandledDisposition(failures, entry, disposition)
      : await dispatchOrdinaryAction(page, entry, failures, actionIndex);
    if (ctx !== null && lifecycle !== undefined) {
      await lifecycle.afterAction({ ...ctx, failed, handled: disposition.handled });
    }
  }
  if (opts !== undefined && lifecycle !== undefined) {
    await lifecycle.afterActions({ page, opts, pageIndex });
  }
  return failures;
}

/** Split a page's queue at the LAST drive action (step or nav). Everything before it — evals included —
 *  runs in argv position inside `driveActions`; the evals AFTER it are trailing observers of the settled
 *  surface and run in the capture phase. A queue with no steps/navs at all is entirely trailing, so the
 *  plain `snap / --eval x` path is byte-identical to what it always was.
 *  Exported for the CLI suite: the split IS the interleave contract. */
export function splitTrailingEvals(actions: readonly SnapAction[]): { drive: SnapAction[]; trailingEvals: string[] } {
  let lastDrive = -1;
  for (const [index, entry] of actions.entries()) {
    if (entry.type !== "eval") {
      lastDrive = index;
    }
  }
  return {
    drive: actions.slice(0, lastDrive + 1),
    trailingEvals: actions.slice(lastDrive + 1).map((entry) => (entry.type === "eval" ? entry.action.expr : "")),
  };
}

export async function settlePage(page: Page, opts: Args): Promise<void> {
  if (opts.idle) {
    // Wait for the network to go quiet (bounded) — a real settle for routes whose
    // content lands via deferred queries, instead of guessing a timeout.
    // @orb-waive caught-failure-ownership(page.waitForLoadState): bounded best-effort settle — a chatty stream must never block the shot, per the trailing comment. Ends if the timeout bound is removed.
    // biome-ignore lint/nursery/noPlaywrightNetworkidle: explicit opt-in (--idle) with a hard bound — settling on network-quiet IS the flag's contract.
    await page.waitForLoadState("networkidle", { timeout: NETWORKIDLE_TIMEOUT_MS }).catch(() => {
      /* bounded — a chatty stream must never block the shot */
    });
  }
  if (opts.sseSeconds > 0) {
    await settle(page, opts.sseSeconds * MS_PER_SECOND);
  } else if (!opts.idle) {
    await settle(page, MOUNT_SETTLE_MS);
  }
}
