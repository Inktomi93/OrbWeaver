// Step dispatch: every non-pause step is MARKED first so its measurement window starts at dispatch;
// a failed step is counted and printed, never silent (the run reddens).
import { errorMessage } from "@orb/kit/error-message";
import { print } from "@orb/tooling/_shared/artifacts";
import type { launchProbeSession } from "@orb/tooling/_shared/browser";
import { settle } from "@orb/tooling/_shared/browser";
import { runNav } from "@orb/tooling/_shared/nav";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { MeterWindow, Step } from "../contract/types.ts";
import { DEFAULT_STEP_SETTLE_MS, STEP_TIMEOUT_MS, WHEEL_TICK_PAUSE_MS } from "../lib/budgets.ts";

refuseDirectInvocation(import.meta.url, "pnpm perf-meter");

type PageHandle = Awaited<ReturnType<typeof launchProbeSession>>["page"];

/** Tell the in-page collector which step is starting — every entry until the next mark is bucketed here. */
async function markStep(page: PageHandle, idx: number, label: string): Promise<void> {
  await page.evaluate(
    ([i, l]) => {
      (globalThis as unknown as MeterWindow).__perfMeter?.markStep(Number(i), String(l));
    },
    [String(idx), label] as const,
  );
}

/** Dispatch ONE non-pause step, marking it first so its window starts at dispatch (throws on
 *  locator/timeout failure — counted by the caller, same contract as record.ts). */
async function dispatchNavStep(page: PageHandle, idx: number, step: Extract<Step, { kind: "nav" }>): Promise<void> {
  await markStep(page, idx, `${step.method} ${step.target}`);
  const result = await runNav(page, step.method, step.target);
  if (!result.ok) {
    // Same contract as a failed locator: THROW, so the caller counts it and the run reddens. A nav that
    // did not land means every later step measured a different surface.
    throw new Error(`nav ${step.method} ${step.target} rejected: ${result.reason}`);
  }
}

async function dispatchStep(page: PageHandle, idx: number, step: Exclude<Step, { kind: "pause" }>): Promise<void> {
  if (step.kind === "nav") {
    await dispatchNavStep(page, idx, step);
    return;
  }
  if (step.kind === "wheel" || step.kind === "wheelburst") {
    const loc = page.locator(step.selector).first();
    await loc.waitFor({ state: "visible", timeout: STEP_TIMEOUT_MS });
    const n = step.kind === "wheelburst" ? step.count : 1;
    await markStep(page, idx, `${step.kind} ${step.selector} dy=${step.dy}×${n}`);
    await loc.hover();
    for (let i = 0; i < n; i += 1) {
      await page.mouse.wheel(0, step.dy);
      if (n > 1) {
        await settle(page, WHEEL_TICK_PAUSE_MS);
      }
    }
    return;
  }
  const loc = page.locator(step.selector).first();
  if (step.kind === "jsclick") {
    await loc.waitFor({ state: "attached", timeout: STEP_TIMEOUT_MS });
    await markStep(page, idx, `jsclick ${step.selector}`);
    await loc.evaluate("(el) => el.click()");
    return;
  }
  await loc.waitFor({ state: "visible", timeout: STEP_TIMEOUT_MS });
  const label = step.kind === "fill" ? `fill ${step.selector}=${step.value}` : `${step.kind} ${step.selector}`;
  await markStep(page, idx, label);
  if (step.kind === "click") {
    await loc.click({ timeout: STEP_TIMEOUT_MS });
  } else if (step.kind === "fill") {
    await loc.fill(step.value);
  } else {
    // `hover` is the only kind left (nav/pause/wheel/wheelburst/jsclick all returned above), so
    // a `step.kind === "hover"` test here would be a condition that cannot be false. The `hover`
    // arm is the one that reads no kind-specific field, which is why it is the residue.
    await loc.hover();
  }
}

/** What a step ACTS ON, for a failure line: a selector for the DOM steps, the nav target for a nav step. */
function stepSubject(step: Step): string {
  if ("selector" in step) {
    return step.selector;
  }
  return step.kind === "nav" ? step.target : "";
}

export async function runSteps(page: PageHandle, steps: readonly Step[]): Promise<number> {
  let failures = 0;
  let idx = 0;
  for (const step of steps) {
    if (step.kind === "pause") {
      await settle(page, step.ms);
      continue;
    }
    // @orb-gate-ignore caught-failure-ownership(empty:e): printed as a STEP FAILED line and counted into the failures total this function returns — its one caller (ops/run.ts) reads that count as the run's verdict, so the failure is not dropped. Ends if the returned count stops being read by the caller.
    try {
      await dispatchStep(page, idx, step);
      idx += 1;
      // Small default settle so back-to-back steps don't merge into one window.
      await settle(page, DEFAULT_STEP_SETTLE_MS);
    } catch (e) {
      failures += 1;
      idx += 1;
      // A nav step names its TARGET where the others name a selector — the failing line must say which.
      const subject = stepSubject(step);
      print(`STEP FAILED  ${step.kind} ${subject}: ${errorMessage(e)}`);
    }
  }
  return failures;
}
