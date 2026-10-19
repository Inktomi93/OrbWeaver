// The measured window: CDP tracing across the interaction, drop-tracking paused for the in-page
// instrument (the audit owns the ground truth here), the __orb snapshot read after.
import { errorMessage } from "@orb/kit/error-message";
import { print } from "@orb/tooling/floor/artifacts/artifacts";
import { settle } from "@orb/tooling/floor/browser/browser";
import type { ProbeSession } from "@orb/tooling/floor/browser/browser-contract";
import type { Page } from "@playwright/test";
import { refuseDirectInvocation } from "../../floor/cli/entrypoint.ts";
import type { Args, AuditData, MeasuredClick, TraceEvent } from "../contract/types.ts";
import { calibratedDroppedFramePct } from "../lib/frames.ts";
import { readAnimations, readFlags, readMotion } from "./drive.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route> --motion");

export async function runAudit(
  page: Page,
  cdp: Awaited<ReturnType<ProbeSession["context"]["newCDPSession"]>>,
  opts: Pick<Args, "selector" | "windowMs"> & {
    /** The navigation this window measures, run INSIDE the trace so the route's own fade is in it. True when it landed. */
    readonly measuredNav?: () => Promise<boolean>;
  },
  measuredClick: MeasuredClick | null,
): Promise<Omit<AuditData, "environment" | "applicationMotion">> {
  const traceEvents: TraceEvent[] = [];
  cdp.on("Tracing.dataCollected", (e: { value: TraceEvent[] }) => {
    traceEvents.push(...e.value);
  });
  await page.evaluate("globalThis.__orb?.setMotionAuditDropTrackingPaused(true)");
  let stepFailed = opts.selector !== null && measuredClick === null;
  // Set only where the native click actually dispatched — see AuditData.measuredInput (#1071).
  let measuredInput = false;
  try {
    await cdp.send("Tracing.start", {
      categories: "benchmark,blink.user_timing,disabled-by-default-devtools.timeline.frame,disabled-by-default-devtools.timeline",
      transferMode: "ReportEvents",
    });

    if (measuredClick !== null) {
      // @orb-waive caught-failure-ownership(e): a failed click prints STEP FAILED and sets stepFailed, which runAudit returns in AuditData and evaluateMotionAudit, motion-problems and the matrix verdict read. Ends if stepFailed stops being read from the returned AuditData.
      try {
        await page.mouse.click(measuredClick.x, measuredClick.y);
        measuredInput = true;
      } catch (e) {
        stepFailed = true;
        print(`STEP FAILED  click ${opts.selector ?? "(none)"}: ${errorMessage(e)}`);
      }
    }
    if (opts.measuredNav !== undefined) {
      measuredInput = await opts.measuredNav();
      stepFailed = !measuredInput;
    }
    // The observation window — entry animations / the clicked transition play out here.
    await settle(page, opts.windowMs);

    const completed = new Promise<void>((resolve) => {
      cdp.once("Tracing.tracingComplete", () => resolve());
    });
    await cdp.send("Tracing.end");
    await completed;
  } finally {
    // @orb-waive caught-failure-ownership(page.evaluate): unpausing in-page drop tracking is best-effort cleanup in a finally: the flag is a module variable that a reload resets, and a dead page fails the readMotion read after this block (the pause call above is not swallowed). Ends if the pause flag gates anything after the window on a live page.
    await page.evaluate("globalThis.__orb?.setMotionAuditDropTrackingPaused(false)").catch(() => undefined);
  }

  return {
    motion: await readMotion(page),
    animations: await readAnimations(page),
    flags: await readFlags(page),
    frames: calibratedDroppedFramePct(traceEvents),
    pageErrors: [],
    // Kept even when frames are found: an empty population is diagnosed by whether the TRACE was empty
    // too (lib/evidence.ts) — "nothing composited" and "tracing never ran" need different remedies.
    traceEventCount: traceEvents.length,
    stepFailed,
    reachFailures: 0,
    measuredInput,
  };
}
