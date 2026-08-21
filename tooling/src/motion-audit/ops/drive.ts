// Reach + measured-click preparation + the __orb snapshot reads. Reach actions run BEFORE the trace
// and the in-page evidence is reset after the last one — the numbers describe the interaction being
// measured, not the trip to it. All __orb evaluates are raw strings (DOM-less tsconfig — see
// _shared/browser.ts).
import { errorMessage } from "@orb/kit/error-message";
import { print } from "@orb/tooling/_shared/artifacts";
import { settle } from "@orb/tooling/_shared/browser";
import { runNav } from "@orb/tooling/_shared/nav";
import type { Page } from "@playwright/test";
import type { AnimationRecord, MeasuredClick, MotionSnapshot, ReachAction } from "../contract/types.ts";
import { REACH_SETTLE_MS, STEP_TIMEOUT_MS } from "../lib/budgets.ts";

export async function readMotion(page: Page): Promise<MotionSnapshot | null> {
  return (await page.evaluate("globalThis.__orb ? globalThis.__orb.motion() : null")) as MotionSnapshot | null;
}
export async function readAnimations(page: Page): Promise<readonly AnimationRecord[]> {
  return (await page.evaluate("globalThis.__orb ? globalThis.__orb.animations() : []")) as readonly AnimationRecord[];
}

/** Resolve Playwright's visibility/actionability geometry before the checkpoint. Those reads can run
 * style/layout themselves; the measured window must contain the app's response to a real input only. */
export async function prepareMeasuredClick(page: Page, selector: string | null): Promise<MeasuredClick | null> {
  if (selector === null) {
    return null;
  }
  try {
    const loc = page.locator(selector).first();
    await loc.waitFor({ state: "visible", timeout: STEP_TIMEOUT_MS });
    await loc.scrollIntoViewIfNeeded({ timeout: STEP_TIMEOUT_MS });
    const box = await loc.boundingBox({ timeout: STEP_TIMEOUT_MS });
    if (box === null) {
      throw new Error("visible target has no bounding box");
    }
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  } catch (e) {
    print(`STEP FAILED  prepare click ${selector}: ${errorMessage(e)}`);
    return null;
  }
}

/** Drive the reach queue in argv order, then clear the in-page evidence so the trace window that follows
 *  carries only the measured interaction's motion. Returns the failure count (each one printed). */
export async function driveReach(page: Page, reach: readonly ReachAction[]): Promise<number> {
  if (reach.length === 0) {
    return 0;
  }
  let failures = 0;
  for (const action of reach) {
    if (action.kind === "click") {
      try {
        const loc = page.locator(action.selector).first();
        // biome-ignore lint/performance/noAwaitInLoops: the reach queue is SEQUENTIAL by contract — each action may produce the surface the next one targets.
        await loc.waitFor({ state: "visible", timeout: STEP_TIMEOUT_MS });
        await loc.click({ timeout: STEP_TIMEOUT_MS });
      } catch (e) {
        failures += 1;
        print(`REACH FAILED click ${action.selector}: ${errorMessage(e)}`);
      }
    } else {
      const result = await runNav(page, action.method, action.target);
      if (!result.ok) {
        failures += 1;
        print(`REACH FAILED ${action.method} ${action.target}: ${result.reason}`);
      }
    }
    await settle(page, REACH_SETTLE_MS);
  }
  // The trip to the surface is not the thing being measured (entry animations, the room's own mount
  // reflow). Cleared only when a reach ran, so a bare `motion-audit /` still audits app entry.
  await page.evaluate("globalThis.__orb?.resetEvidence()").catch(() => undefined);
  return failures;
}
