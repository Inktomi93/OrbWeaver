// Reach + measured-click preparation + the __orb snapshot reads. Reach actions run BEFORE the trace
// and the in-page evidence is reset after the last one — the numbers describe the interaction being
// measured, not the trip to it. All __orb evaluates are raw strings (DOM-less tsconfig — see
// _shared/browser.ts).
import { errorMessage } from "@orb/kit/error-message";
import { print } from "@orb/tooling/_shared/artifacts";
import { settle } from "@orb/tooling/_shared/browser";
import { runNav } from "@orb/tooling/_shared/nav";
import type { Page } from "@playwright/test";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { AnimationRecord, MeasuredClick, MotionFlagRecord, MotionSnapshot, ReachAction } from "../contract/types.ts";
import { REACH_SETTLE_MS, STEP_TIMEOUT_MS } from "../lib/budgets.ts";
import { animationRecords, bridgePresence, flagRecords, motionSnapshot } from "./page-validate.ts";

refuseDirectInvocation(import.meta.url, "pnpm motion-audit");

/** Is the app's in-page instrument present at all? Checked BEFORE anything is measured: without it every
 *  `__orb` read below answers null/[] and each budget arm reads that as a clean zero (#409). */
export async function hasOrbBridge(page: Page): Promise<boolean> {
  return bridgePresence(await page.evaluate("globalThis.__orb !== undefined && globalThis.__orb !== null"));
}

// #1004 — the three bridge reads are VALIDATED at the seam, not cast. Same reason the presence probe
// above exists: every one of these feeds a budget, and a budget reads missing or wrong-shaped evidence
// as a pass (`undefined > budget` is false). ops/page-validate.ts carries the full argument.
export async function readMotion(page: Page): Promise<MotionSnapshot | null> {
  return motionSnapshot(await page.evaluate("globalThis.__orb ? globalThis.__orb.motion() : null"));
}
export async function readAnimations(page: Page): Promise<readonly AnimationRecord[]> {
  return animationRecords(await page.evaluate("globalThis.__orb ? globalThis.__orb.animations() : []"));
}
/** The TRANSIENT half (#1070). `animations()` above is a SAMPLER — a 130–360ms transition launched by the
 *  measured click is finished ~2s before it runs — so the flag ring is what carries the population the
 *  dirty-animation budget was written for. Checkpoint-scoped: `resetEvidence` (already called before the
 *  measured click) clears it, so this read is exactly the measured window's raises. */
export async function readFlags(page: Page): Promise<readonly MotionFlagRecord[] | null> {
  // `null` where the MEMBER is absent, never `[]`: an unobservable population and an empty one are
  // different facts, and folding them together is how the blindness comes back (lib/evidence.ts owns
  // the consequence). Distinguished on the page side because the node side cannot tell them apart after.
  return flagRecords(await page.evaluate('globalThis.__orb && typeof globalThis.__orb.flags === "function" ? globalThis.__orb.flags() : null'));
}

/** Resolve Playwright's visibility/actionability geometry before the checkpoint. Those reads can run
 * style/layout themselves; the measured window must contain the app's response to a real input only. */
export async function prepareMeasuredClick(page: Page, selector: string | null): Promise<MeasuredClick | null> {
  if (selector === null) {
    return null;
  }
  // @orb-gate-ignore caught-failure-ownership(default:e): prepare-click failure is printed as STEP FAILED and null prevents measurement from claiming a click. Ends if null can produce a clean verdict.
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
      // @orb-gate-ignore caught-failure-ownership(empty:e): reach failure increments the authoritative failure counter and prints the selector. Ends if the final verdict stops reading failures.
      try {
        const loc = page.locator(action.selector).first();
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
  await page.evaluate(
    `(() => {
      if (typeof globalThis.__orb?.resetEvidence !== "function") throw new Error("__orb.resetEvidence is unavailable");
      return globalThis.__orb.resetEvidence();
    })()`,
  );
  return failures;
}
