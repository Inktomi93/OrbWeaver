// Navigate + reveal: goto → data-app-ready wait (graceful on non-app pages) → the argv-ordered action
// queue → the in-page fact walk. A scan of the WRONG surface is worse than no scan, so a failed
// action reddens the run and is never silent.
import { errorMessage } from "@orb/kit/error-message";
import { print } from "@orb/tooling/_shared/artifacts";
import type { launchProbeSession } from "@orb/tooling/_shared/browser";
import { settle } from "@orb/tooling/_shared/browser";
import { runNav } from "@orb/tooling/_shared/nav";
import { resolveFileInputLocator, resolveUploadPaths } from "@orb/tooling/_shared/upload";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { RawSamples } from "../contract/samples.ts";
import type { Args, AuditAction, CaptureOutcome } from "../contract/types.ts";
import {
  CENSUS_OBSERVE_CEILING_MS,
  CENSUS_OBSERVE_MIN_MS,
  CENSUS_SETTLE_POLL_MS,
  CLICK_TIMEOUT_MS,
  NAV_TIMEOUT_MS,
  WAIT_SELECTOR_TIMEOUT_MS,
} from "../lib/budgets.ts";
import { SAMPLE_COLLECTION_PREFIX } from "../lib/evidence.ts";
import { COLLECT_SAMPLES_JS } from "./walker.ts";

refuseDirectInvocation(import.meta.url, "pnpm design-audit");

type AuditPage = Awaited<ReturnType<typeof launchProbeSession>>["page"];

/** `--upload`'s own body (#651): boundary-check the paths (no browser needed for that half), wait for the
 *  selector ATTACHED (every real upload input in this app sits under decorative chrome on purpose — see
 *  `_shared/upload.ts`), drill to the real `<input type="file">`, attach. Split out of `driveAction` so
 *  its cognitive complexity stays in budget. */
async function driveUpload(page: AuditPage, action: Extract<AuditAction, { kind: "upload" }>): Promise<void> {
  const resolved = resolveUploadPaths(action.paths);
  if (!resolved.ok) {
    throw new Error(resolved.reason);
  }
  const loc = page.locator(action.selector).first();
  await loc.waitFor({ state: "attached", timeout: CLICK_TIMEOUT_MS });
  const target = await resolveFileInputLocator(loc);
  await target.setInputFiles([...resolved.paths]);
}

/** What a failed action names, for the printed line. */
function actionLabel(action: AuditAction): string {
  if (action.kind === "click") {
    return `click ${action.selector}`;
  }
  if (action.kind === "upload") {
    return `upload ${action.selector}`;
  }
  return `${action.method} ${action.target}`;
}

/** One action + its settle. Returns 1 on failure (printed, and the audit's verdict reddens) — a scan of
 *  the WRONG surface is worse than no scan, so an action that didn't land is never silent. The nav arm is
 *  the shared bridge vocabulary (_shared/nav.ts), identical to snap's and the two motion probes'. */
async function driveAction(page: AuditPage, action: AuditAction, waitMs: number): Promise<number> {
  // @orb-gate-ignore caught-failure-ownership(empty:e): printed as ACTION FAILED and returned as 1 — the JSDoc above states an action that didn't land is never silent and reddens the audit's verdict through this return value. Ends if the returned count stops being summed into the verdict.
  try {
    if (action.kind === "click") {
      const loc = page.locator(action.selector).first();
      await loc.waitFor({ state: "visible", timeout: CLICK_TIMEOUT_MS });
      await loc.click({ timeout: CLICK_TIMEOUT_MS });
    } else if (action.kind === "upload") {
      await driveUpload(page, action);
    } else {
      const result = await runNav(page, action.method, action.target);
      if (!result.ok) {
        print(`NAV FAILED    ${action.method} ${action.target}: ${result.reason}`);
        return 1;
      }
    }
  } catch (e) {
    print(`ACTION FAILED ${actionLabel(action)}: ${errorMessage(e)}`);
    return 1;
  }
  await settle(page, waitMs);
  return 0;
}

/** The cheapest possible population reading — one integer, no walk. Deliberately `*` rather than the
 *  census families: it is a denominator for them, so it must not share their filters (a shell that renders
 *  no text at all still has elements). */
async function elementCount(page: AuditPage): Promise<number> {
  return await page.evaluate("document.getElementsByTagName('*').length");
}

/** Watch the element count after the walk and report the largest population seen (#808).
 *
 *  This is the measurement `data-app-ready` cannot make: the readiness flag is ONE-SHOT and fires at boot
 *  (agent-bridge.ts installAppReadySignal), so on a surface reached by a post-boot nav or an `--actions`
 *  click it is already up while that surface's reads are still in flight — the exact state in which the
 *  walk censuses a shell and the report prints it clean.
 *
 *  The window is a FLOOR, not a stop-at-first-quiet: a shell is perfectly stable while its reads are in
 *  flight, so "two equal readings" would certify precisely the state being hunted. Past the floor the
 *  watch ends as soon as the count holds, and a count still moving at the ceiling is reported as NOT
 *  stabilized — its figure is then a lower bound, never silently believed. */
async function observeSettled(page: AuditPage): Promise<{ count: number; stabilized: boolean }> {
  const started = Date.now();
  let latest = await elementCount(page);
  let peak = latest;
  let held = false;
  while (Date.now() - started < CENSUS_OBSERVE_CEILING_MS) {
    await settle(page, CENSUS_SETTLE_POLL_MS);
    const current = await elementCount(page);
    held = current === latest;
    latest = current;
    peak = Math.max(peak, current);
    if (held && Date.now() - started >= CENSUS_OBSERVE_MIN_MS) {
      break;
    }
  }
  return { count: peak, stabilized: held };
}

export async function navigateAndReveal(page: AuditPage, opts: Args, url: string): Promise<CaptureOutcome> {
  const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
  let navError: string | null = null;
  if (!resp) {
    navError = "no response";
  } else if (!resp.ok()) {
    navError = `HTTP ${resp.status()}`;
  }
  // Graceful for a `file://` fixture (which never runs the app) — but the OUTCOME is now reported, because
  // on an app origin a missing readiness signal means the walk is about to census a shell (lib/evidence.ts
  // `readinessGap`, #678).
  // @orb-gate-ignore caught-failure-ownership(promise:waitFor): the comment above states the outcome IS reported — appReady:false feeds lib/evidence.ts's readinessGap check (#678), so a missing readiness signal is surfaced as a verdict input, not swallowed. Ends if appReady stops being read downstream.
  const appReady = await page
    .locator("html[data-app-ready]")
    .waitFor({ state: "attached", timeout: WAIT_SELECTOR_TIMEOUT_MS })
    .then(() => true)
    .catch(() => false);

  let actionsFailed = 0;
  for (const action of opts.actions) {
    actionsFailed += await driveAction(page, action, opts.waitMs);
  }
  await settle(page, opts.waitMs);

  if (navError !== null) {
    return { navError, actionsFailed, appReady, samples: null, population: null };
  }
  try {
    // The population readings BRACKET the walk (#808): `before` and `after` bound what the walk could
    // possibly have censused, and the settle watch below says what the surface finally holds.
    const before = await elementCount(page);
    const samples = (await page.evaluate(COLLECT_SAMPLES_JS)) as RawSamples;
    const after = await elementCount(page);
    const settledPopulation = await observeSettled(page);
    return {
      navError,
      actionsFailed,
      appReady,
      samples,
      population: { duringWalk: Math.max(before, after), settled: settledPopulation.count, stabilized: settledPopulation.stabilized },
    };
  } catch (e) {
    // The prefix is load-bearing: ops/run.ts reads it to tell an INSTRUMENT failure (the walk threw)
    // apart from a page-level nav error, which is a real defect of the page (#409).
    return { navError: `${SAMPLE_COLLECTION_PREFIX}: ${errorMessage(e)}`, actionsFailed, appReady, samples: null, population: null };
  }
}
