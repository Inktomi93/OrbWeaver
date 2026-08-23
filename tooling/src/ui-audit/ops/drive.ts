// Navigate + reveal: goto → data-app-ready wait (graceful on non-app pages) → the argv-ordered action
// queue → the in-page fact walk. A scan of the WRONG surface is worse than no scan, so a failed
// action reddens the run and is never silent.
import { errorMessage } from "@orb/kit/error-message";
import { print } from "@orb/tooling/_shared/artifacts";
import type { launchProbeSession } from "@orb/tooling/_shared/browser";
import { settle } from "@orb/tooling/_shared/browser";
import { runNav } from "@orb/tooling/_shared/nav";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { RawSamples } from "../contract/samples.ts";
import type { Args, AuditAction, CaptureOutcome } from "../contract/types.ts";
import { CLICK_TIMEOUT_MS, NAV_TIMEOUT_MS, WAIT_SELECTOR_TIMEOUT_MS } from "../lib/budgets.ts";
import { SAMPLE_COLLECTION_PREFIX } from "../lib/evidence.ts";
import { COLLECT_SAMPLES_JS } from "./walker.ts";

refuseDirectInvocation(import.meta.url, "pnpm design-audit");

type AuditPage = Awaited<ReturnType<typeof launchProbeSession>>["page"];

/** One action + its settle. Returns 1 on failure (printed, and the audit's verdict reddens) — a scan of
 *  the WRONG surface is worse than no scan, so an action that didn't land is never silent. The nav arm is
 *  the shared bridge vocabulary (_shared/nav.ts), identical to snap's and the two motion probes'. */
async function driveAction(page: AuditPage, action: AuditAction, waitMs: number): Promise<number> {
  try {
    if (action.kind === "click") {
      const loc = page.locator(action.selector).first();
      await loc.waitFor({ state: "visible", timeout: CLICK_TIMEOUT_MS });
      await loc.click({ timeout: CLICK_TIMEOUT_MS });
    } else {
      const result = await runNav(page, action.method, action.target);
      if (!result.ok) {
        print(`NAV FAILED    ${action.method} ${action.target}: ${result.reason}`);
        return 1;
      }
    }
  } catch (e) {
    print(`ACTION FAILED ${action.kind === "click" ? `click ${action.selector}` : `${action.method} ${action.target}`}: ${errorMessage(e)}`);
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
  await page
    .locator("html[data-app-ready]")
    .waitFor({ state: "attached", timeout: WAIT_SELECTOR_TIMEOUT_MS })
    .catch(() => undefined);

  let actionsFailed = 0;
  for (const action of opts.actions) {
    // biome-ignore lint/performance/noAwaitInLoops: the queue is SEQUENTIAL by contract — each action may produce the surface the next one targets (the reason it exists).
    actionsFailed += await driveAction(page, action, opts.waitMs);
  }
  await settle(page, opts.waitMs);

  if (navError !== null) {
    return { navError, actionsFailed, samples: null };
  }
  try {
    const samples = (await page.evaluate(COLLECT_SAMPLES_JS)) as RawSamples;
    return { navError, actionsFailed, samples };
  } catch (e) {
    // The prefix is load-bearing: ops/run.ts reads it to tell an INSTRUMENT failure (the walk threw)
    // apart from a page-level nav error, which is a real defect of the page (#409).
    return { navError: `${SAMPLE_COLLECTION_PREFIX}: ${errorMessage(e)}`, actionsFailed, samples: null };
  }
}
