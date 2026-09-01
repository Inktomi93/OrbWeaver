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
import { CLICK_TIMEOUT_MS, NAV_TIMEOUT_MS, WAIT_SELECTOR_TIMEOUT_MS } from "../lib/budgets.ts";
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
    // Settle + identity snapshot happen inside this ONE page task (#976). Two evaluates would leave a
    // same-count replacement race between "settled" and "walked".
    const samples = (await page.evaluate(COLLECT_SAMPLES_JS)) as RawSamples;
    const accounting = samples.subjectAccounting;
    return {
      navError,
      actionsFailed,
      appReady,
      samples,
      population: {
        duringWalk: accounting.settled,
        settled: accounting.observed,
        stabilized: accounting.stabilized,
        accounting,
      },
    };
  } catch (e) {
    // The prefix is load-bearing: ops/run.ts reads it to tell an INSTRUMENT failure (the walk threw)
    // apart from a page-level nav error, which is a real defect of the page (#409).
    return { navError: `${SAMPLE_COLLECTION_PREFIX}: ${errorMessage(e)}`, actionsFailed, appReady, samples: null, population: null };
  }
}
