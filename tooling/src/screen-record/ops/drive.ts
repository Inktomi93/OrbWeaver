// Step dispatch onto the recording tape: the click MARKER (a fixed corner square that cycles color
// at the EXACT dispatch of every --click/--jsclick) is what makes click->motion latency countable
// on the rendered strip (1 tile = 120ms).
import { errorMessage } from "@orb/kit/error-message";
import { print } from "@orb/tooling/_shared/artifacts";
import { settle } from "@orb/tooling/_shared/browser";
import { budget } from "@orb/tooling/_shared/load-budget";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { Step, StepRun } from "../contract/types.ts";

refuseDirectInvocation(import.meta.url, "pnpm record");

const DEFAULT_STEP_SETTLE_MS = 600;
// A CEILING, load-scaled through the one policy (#1232): the literal is the quiet-box BASE. The settle
// above is a sleep the run always pays and is never scaled.
const STEP_TIMEOUT_BASE_MS = 5000;
const STEP_TIMEOUT_MS = budget(STEP_TIMEOUT_BASE_MS);

// Marker palette — high-contrast cycle so consecutive clicks are tellable apart.
const MARKER_COLORS = ["#ff2020", "#20ff20", "#20d0ff", "#ff20ff", "#ffd020", "#ffffff"];

// The click marker: a fixed corner square, installed pre-navigation so it exists from first
// paint. Raw string (not a function) — see _shared/browser.ts.
export const MARKER_INIT_JS = `(() => {
  const el = document.createElement("div");
  el.id = "__probe-marker";
  el.style.cssText =
    "position:fixed;top:0;left:0;width:28px;height:28px;z-index:2147483647;background:#404040;pointer-events:none";
  document.addEventListener("DOMContentLoaded", () => document.body.appendChild(el));
})();`;

/** Dispatch ONE non-pause step (throws on locator/timeout failure — counted by the caller). */
async function dispatchStep(run: StepRun, step: Exclude<Step, { kind: "pause" }>): Promise<void> {
  const { page } = run.session;
  const loc = page.locator(step.selector).first();
  if (step.kind === "jsclick") {
    await loc.waitFor({ state: "attached", timeout: STEP_TIMEOUT_MS });
  } else {
    await loc.waitFor({ state: "visible", timeout: STEP_TIMEOUT_MS });
  }
  if (step.kind === "click" || step.kind === "jsclick") {
    // Flip the marker in the same task as the dispatch — the video frame where the
    // corner changes IS the click frame.
    const color = MARKER_COLORS[run.clickIndex % MARKER_COLORS.length] as string;
    run.clickIndex += 1;
    await page.evaluate(`(() => { const m = document.getElementById("__probe-marker"); if (m) m.style.background = ${JSON.stringify(color)}; })()`);
    run.clickTimes.push({ t: Date.now() - run.t0, label: `${step.kind} ${step.selector}` });
    if (step.kind === "jsclick") {
      await loc.evaluate("(el) => el.click()");
    } else {
      await loc.click({ timeout: STEP_TIMEOUT_MS });
    }
  } else if (step.kind === "fill") {
    await loc.fill(step.value);
  } else if (step.kind === "wheel") {
    await loc.hover();
    await page.mouse.wheel(0, step.dy);
  } else {
    // `hover` is the only kind left (`pause` is Excluded from the parameter type), so a
    // `step.kind === "hover"` test here would be a condition that cannot be false. The `hover`
    // arm is the one that reads no kind-specific field, which is why it is the residue.
    await loc.hover();
  }
}

export async function runSteps(run: StepRun, steps: readonly Step[]): Promise<number> {
  let failures = 0;
  for (const step of steps) {
    if (step.kind === "pause") {
      await settle(run.session.page, step.ms);
      continue;
    }
    const label = `${step.kind} ${step.selector}${step.kind === "wheel" ? `=${step.dy}` : ""}`;
    run.stepTimeline.push({ t: Date.now() - run.t0, label });
    // @orb-gate-ignore caught-failure-ownership(empty:e): printed as a STEP FAILED line and counted into the failures total this function returns to its caller as the run's verdict. Ends if the returned count stops being read by the caller.
    try {
      await dispatchStep(run, step);
      // Small default settle so back-to-back steps don't merge on tape.
      await settle(run.session.page, DEFAULT_STEP_SETTLE_MS);
    } catch (e) {
      failures += 1;
      print(`STEP FAILED  ${label}: ${errorMessage(e)}`);
    }
  }
  return failures;
}
