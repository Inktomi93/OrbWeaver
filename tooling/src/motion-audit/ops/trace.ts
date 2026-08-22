// The measured window: CDP tracing across the interaction, drop-tracking paused for the in-page
// instrument (the audit owns the ground truth here), the __orb snapshot read after.
import { errorMessage } from "@orb/kit/error-message";
import { print } from "@orb/tooling/_shared/artifacts";
import type { ProbeSession } from "@orb/tooling/_shared/browser";
import { settle } from "@orb/tooling/_shared/browser";
import type { Page } from "@playwright/test";
import type { Args, AuditData, MeasuredClick, TraceEvent } from "../contract/types.ts";
import { calibratedDroppedFramePct } from "../lib/frames.ts";
import { readAnimations, readMotion } from "./drive.ts";

export async function runAudit(
  page: Page,
  cdp: Awaited<ReturnType<ProbeSession["context"]["newCDPSession"]>>,
  opts: Args,
  measuredClick: MeasuredClick | null,
): Promise<AuditData> {
  const traceEvents: TraceEvent[] = [];
  cdp.on("Tracing.dataCollected", (e: { value: TraceEvent[] }) => {
    traceEvents.push(...e.value);
  });
  await page.evaluate("globalThis.__orb?.setMotionAuditDropTrackingPaused(true)");
  let stepFailed = opts.selector !== null && measuredClick === null;
  try {
    await cdp.send("Tracing.start", {
      categories: "benchmark,blink.user_timing,disabled-by-default-devtools.timeline.frame,disabled-by-default-devtools.timeline",
      transferMode: "ReportEvents",
    });

    if (measuredClick !== null) {
      try {
        await page.mouse.click(measuredClick.x, measuredClick.y);
      } catch (e) {
        stepFailed = true;
        print(`STEP FAILED  click ${opts.selector ?? "(none)"}: ${errorMessage(e)}`);
      }
    }
    // The observation window — entry animations / the clicked transition play out here.
    await settle(page, opts.windowMs);

    const completed = new Promise<void>((resolve) => {
      cdp.once("Tracing.tracingComplete", () => resolve());
    });
    await cdp.send("Tracing.end");
    await completed;
  } finally {
    await page.evaluate("globalThis.__orb?.setMotionAuditDropTrackingPaused(false)").catch(() => undefined);
  }

  return {
    motion: await readMotion(page),
    animations: await readAnimations(page),
    frames: calibratedDroppedFramePct(traceEvents),
    pageErrors: [],
    // Kept even when frames are found: an empty population is diagnosed by whether the TRACE was empty
    // too (lib/evidence.ts) — "nothing composited" and "tracing never ran" need different remedies.
    traceEventCount: traceEvents.length,
    stepFailed,
    reachFailures: 0,
  };
}
