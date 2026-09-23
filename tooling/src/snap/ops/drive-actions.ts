// The argv-ordered action queue (navs + steps + mid-chain evals — the interleave IS the contract,
// 2026-08-15/16) and the trailing-eval split that keeps a trailing `--eval` a settled-surface observer.
// Split out of drive.ts (which owns navigation + app-readiness) to keep that file under the size cap.
import { errorMessage } from "@orb/kit/error-message";
import type { NavResultShape } from "@orb/tooling/_shared/page-validate";
import { navResultShape } from "@orb/tooling/_shared/page-validate";
import type { Page } from "@playwright/test";
import { print } from "../../_shared/artifacts.ts";
import { settle } from "../../_shared/browser.ts";
import { buildNavScript } from "../../_shared/nav.ts";
import type { FileActionReceipt } from "../../_shared/upload.ts";
import { driveFileDrop, driveFileUpload, fileActionReceiptLine } from "../../_shared/upload.ts";
import type { ArmActionContext, ArmActionDisposition, ArmTapeContext } from "../contract/arms.ts";
import type { Args, DriveFailure, EvalOutcome, NavAction, SnapAction, Step } from "../contract/types.ts";
import { HOVER_REVEAL_MS, STEP_SETTLE_MS, STEP_TIMEOUT_MS, WAIT_SELECTOR_TIMEOUT_MS } from "../lib/budgets.ts";
import { CHURN_LINE, isContextChurn } from "../lib/eval-text.ts";
import { captureEvals } from "./arms/eval.ts";
import { navDriveFailure, stepDriveFailure, stepLabel } from "./drive-failure-naming.ts";

const WHEEL_BURST_SETTLE_MS = 30;

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
