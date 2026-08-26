// The page DRIVE: navigation + app-readiness (the dataless tripwire, #145), the argv-ordered action
// queue (navs + steps + mid-chain evals — the interleave IS the contract, 2026-08-15/16), and the
// trailing-eval split that keeps a trailing `--eval` a settled-surface observer.
import { errorMessage } from "@orb/kit/error-message";
import type { Page } from "@playwright/test";
import { print } from "../../_shared/artifacts.ts";
import { settle } from "../../_shared/browser.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { buildNavScript } from "../../_shared/nav.ts";
import { resolveFileInputLocator, resolveUploadPaths } from "../../_shared/upload.ts";
import type { Args, EvalOutcome, NavAction, SnapAction, Step } from "../contract/types.ts";
import {
  HOVER_REVEAL_MS,
  MOUNT_SETTLE_MS,
  NAV_TIMEOUT_MS,
  NETWORKIDLE_TIMEOUT_MS,
  STAGE_NAV_TIMEOUT_MS,
  STAGE_READY_TIMEOUT_MS,
  STEP_SETTLE_MS,
  STEP_TIMEOUT_MS,
  WAIT_SELECTOR_TIMEOUT_MS,
} from "../lib/budgets.ts";
import { CHURN_LINE, isContextChurn } from "../lib/eval-text.ts";
import { captureEvals } from "./evidence.ts";
import { MS_PER_SECOND } from "./flags-support.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

/** Did the app reach a SETTLED state? `settled` = the flag went up on a real query-cache idle; `degraded` =
 *  agent-bridge's ceiling handed the flag over with reads still running; `dataless` = the flag says settled
 *  but the app never reached its data layer at all; `absent` = it never went up. */
const APP_READINESS = ["settled", "degraded", "dataless", "absent"] as const;
type AppReadiness = (typeof APP_READINESS)[number];

/** THE DATALESS TRIPWIRE (issue #145). `data-app-ready` claims a settle from an IDLE query cache, and an
 *  idle cache also describes an app that never got as far as its first read — which is exactly what a stage
 *  stuck on the router's pending component looks like. That shape screenshotted the boot glyph and reported
 *  a clean wait for as long as `snap --isolated` has existed. An EMPTY cache (not idle — empty: zero query
 *  entries ever created) is the signal, and it is never legitimate here: every route this app serves mounts
 *  `useAuthConfig` (`data/auth-config.ts`), so a settled app has read something. `__orb` is dev-only — a
 *  build without the bridge answers `null` and we make no claim rather than a false one. */
async function everReadAnything(page: Page): Promise<boolean | null> {
  const count = await page.evaluate("window.__orb ? window.__orb.queries().length : null").catch(() => null);
  return typeof count === "number" ? count > 0 : null;
}

async function appReadiness(page: Page, timeoutMs: number): Promise<AppReadiness> {
  const flag = page.locator("html[data-app-ready]");
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
 *  cannot be added without its reason. */
const UNSETTLED_REASON: Record<Exclude<AppReadiness, "settled">, string> = {
  absent:
    "app never signalled data-app-ready — the capture is MID-HYDRATION, not the settled app (a cold stage's first navigation is the usual cause; re-run against the now-warm stage)",
  degraded: "data-app-ready came up DEGRADED — reads were still in flight at the readiness ceiling, so the capture is mid-hydration, not the settled app",
  dataless:
    "data-app-ready came up settled but the query cache is EMPTY — the app never reached its data layer, so this capture is a boot placeholder (the router's pending glyph), not the app. On `--isolated` the usual cause is the stage's vite still serving `/`'s lazy component chunk; check the stage's stack log and re-run against the now-warm stage.",
};

export async function navigate(page: Page, opts: Args, url: string): Promise<string | null> {
  const navTimeout = opts.isolated ? STAGE_NAV_TIMEOUT_MS : NAV_TIMEOUT_MS;
  const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: navTimeout });
  let navError: string | null = null;
  if (!resp) {
    navError = "no response";
  } else if (!resp.ok()) {
    navError = `HTTP ${resp.status()}`;
  }
  // Default readiness gate: agent-bridge.ts sets `data-app-ready` on <html> once the initial reads
  // settle — independent of the never-idle SSE stream. Wait for it so snaps capture the SETTLED app,
  // not mid-hydration skeletons (the "lists sit on skeletons forever" friction). Graceful: a non-app
  // page or an old build that never sets it just falls through, so this only ever adds real load-wait,
  // never a hang.
  // --file (a static mock over file://) has no app and never sets the flag — waiting would burn the full
  // timeout on EVERY mock snap, so skip it there rather than pay a guaranteed-useless wait.
  //
  // THE RESULT IS REPORTED, NOT SWALLOWED (2026-08-09). This used to `.catch(() => undefined)` the whole
  // wait, so a page that never signalled ready produced a mid-hydration capture and a clean report — the
  // instrument failing open. It now reads the flag's VALUE too: agent-bridge hands over `degraded` when its
  // ceiling fires with reads still in flight. Either shape is a nav error on a route we are serving,
  // because the capture below is NOT of the settled app and every downstream assertion about it is void.
  if (opts.file === null) {
    const readiness = await appReadiness(page, opts.isolated ? STAGE_READY_TIMEOUT_MS : WAIT_SELECTOR_TIMEOUT_MS);
    if (readiness !== "settled" && navError === null) {
      navError = UNSETTLED_REASON[readiness];
    }
  }
  // Even a non-OK nav may still render something worth waiting for (SPA error page).
  if (opts.waitSelector !== null) {
    await page.locator(opts.waitSelector).first().waitFor({ state: "visible", timeout: WAIT_SELECTOR_TIMEOUT_MS });
  }
  return navError;
}

// One step, one wait discipline. Throws on failure; driveStep counts + reports.
async function runStep(page: Page, step: Step): Promise<void> {
  if (step.kind === "keyboard") {
    // NO locator, NO focus call: the key goes to whatever currently holds focus, which is the whole
    // point — `--key Tab --key Tab` walks two stops instead of pressing Tab twice from the same anchor.
    await page.keyboard.press(step.key);
    return;
  }
  const loc = page.locator(step.selector).first();
  if (step.kind === "waitfor") {
    await loc.waitFor({ state: "visible", timeout: WAIT_SELECTOR_TIMEOUT_MS });
    return;
  }
  if (step.kind === "jsclick") {
    await loc.waitFor({ state: "attached", timeout: STEP_TIMEOUT_MS });
    // No HTMLElement cast: the root tsconfig that checks scripts/ is DOM-less.
    await loc.evaluate((el) => (el as unknown as { click: () => void }).click());
    return;
  }
  if (step.kind === "press") {
    await loc.waitFor({ state: "attached", timeout: STEP_TIMEOUT_MS });
    await loc.hover({ force: true });
    await settle(page, HOVER_REVEAL_MS);
    await loc.click({ force: true, timeout: STEP_TIMEOUT_MS });
    return;
  }
  if (step.kind === "upload") {
    // The path boundary/existence check runs FIRST and needs no browser at all — a bad path is refused
    // on its own terms rather than surfacing as a confusing selector-timeout on an unrelated page.
    const resolved = resolveUploadPaths(step.paths);
    if (!resolved.ok) {
      throw new Error(resolved.reason);
    }
    // ATTACHED not VISIBLE (same reasoning as jsclick/press): every real upload input in this app is
    // covered by non-interactive decorative chrome on purpose (ops/upload.ts), so it is routinely
    // invisible to Playwright's actionability check while still being the correct, focusable control.
    await loc.waitFor({ state: "attached", timeout: STEP_TIMEOUT_MS });
    const target = await resolveFileInputLocator(loc);
    await target.setInputFiles([...resolved.paths]);
    return;
  }
  await loc.waitFor({ state: "visible", timeout: STEP_TIMEOUT_MS });
  if (step.kind === "click") {
    await loc.click({ timeout: STEP_TIMEOUT_MS });
  } else if (step.kind === "hover") {
    await loc.hover();
  } else if (step.kind === "key") {
    await loc.press(step.key);
  } else {
    await loc.fill(step.value);
  }
}

// What a step failure names: every arm but the bare-key one is addressed by a selector.
function stepLabel(step: Step): string {
  return step.kind === "keyboard" ? `keyboard ${step.key}` : `${step.kind} ${step.selector}`;
}

// One step attempt + its settle. Returns the failure count (0 or 1) and prints its own reason —
// a failing step never aborts the run, so the caller still gets a PNG of wherever the page ended up.
async function driveStep(page: Page, step: Step): Promise<number> {
  try {
    await runStep(page, step);
    await settle(page, STEP_SETTLE_MS);
    return 0;
  } catch (e) {
    const msg = errorMessage(e);
    // Dev-server churn (HMR/restart/5xx) tears down the realm mid-run — say so distinctly and give the
    // step ONE retry after a settle, rather than reporting an environmental blip as an app failure.
    if (isContextChurn(msg)) {
      print(`${CHURN_LINE} — retrying: ${stepLabel(step)}`);
      try {
        await settle(page, STEP_SETTLE_MS);
        await runStep(page, step);
        return 0;
      } catch (retryErr) {
        print(`STEP FAILED (after churn retry)  ${stepLabel(step)}: ${errorMessage(retryErr)}`);
        return 1;
      }
    }
    print(`STEP FAILED  ${stepLabel(step)}: ${msg}`);
    return 1;
  }
}

interface NavResultShape {
  ok: boolean;
  reason?: string;
}

// One nav action + its settle. Returns the failure count (0 or 1); each failure prints + reddens exit.
async function driveNav(page: Page, action: NavAction): Promise<number> {
  // Every nav action needs the app hydrated AND the bridge installed — wait on both, gracefully bounded.
  await page
    .locator("html[data-app-ready]")
    .waitFor({ state: "attached", timeout: WAIT_SELECTOR_TIMEOUT_MS })
    .catch(() => undefined);
  let result: NavResultShape;
  try {
    await page.evaluate("window.__orb && window.__orb.ready").catch(() => undefined);
    result = (await page.evaluate(buildNavScript(action.kind, action.target))) as NavResultShape;
  } catch (e) {
    print(`NAV FAILED  ${action.kind} ${action.target}: ${errorMessage(e)}`);
    return 1;
  }
  if (!result.ok) {
    print(`NAV FAILED  ${action.kind} ${action.target}: ${result.reason ?? "rejected"}`);
    return 1;
  }
  // Let the store write + view transition settle before the next action / the shot.
  await settle(page, STEP_SETTLE_MS);
  return 0;
}

/** Nav and step failures are counted SEPARATELY (they surface as distinct RESULT fields and distinct
 *  manifest counters) even though the three arms run from one queue. `evalResults` carries the outcomes
 *  of the INTERLEAVED evals in argv order; trailing evals are appended by the capture phase. */
interface DriveFailures {
  navFailures: number;
  stepFailures: number;
  evalResults: EvalOutcome[];
}

// THE drive loop: one page's queued actions — bridge navs and interaction steps alike — in TRUE argv
// order. Interleaving is the contract, not an implementation detail: a flat command line reads as
// ordered, so `--goto modal:newChat --click <create> --context-tab rpg.game --click <row>` must open the
// modal, click create, THEN ask the resulting room for its tab. The old class-grouped shape ran both navs
// first, so the context-tab hit the landing page and the last click timed out against a room that did not
// exist yet (2026-08-15). Failures never abort — the capture below still reports where the page ended up.
export async function driveActions(page: Page, actions: readonly SnapAction[]): Promise<DriveFailures> {
  const failures: DriveFailures = { navFailures: 0, stepFailures: 0, evalResults: [] };
  for (const entry of actions) {
    if (entry.type === "nav") {
      failures.navFailures += await driveNav(page, entry.action);
    } else if (entry.type === "eval") {
      failures.evalResults.push(...(await captureEvals(page, [entry.action.expr])));
    } else {
      failures.stepFailures += await driveStep(page, entry.action);
    }
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
