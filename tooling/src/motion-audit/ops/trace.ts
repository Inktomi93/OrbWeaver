// The measured window: CDP tracing across the interaction, drop-tracking paused for the in-page
// instrument (the audit owns the ground truth here), the __orb snapshot read after.
import { errorMessage } from "@orb/kit/error-message";
import { print } from "@orb/tooling/_shared/artifacts";
import { settle } from "@orb/tooling/_shared/browser";
import type { ProbeSession } from "@orb/tooling/_shared/browser-contract";
import type { Page } from "@playwright/test";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { Args, AuditData, MeasuredClick, TraceEvent } from "../contract/types.ts";
import { calibratedDroppedFramePct } from "../lib/frames.ts";
import { readAnimations, readFlags, readMotion } from "./drive.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route> --motion");

export async function runAudit(
  page: Page,
  cdp: Awaited<ReturnType<ProbeSession["context"]["newCDPSession"]>>,
  opts: Pick<Args, "selector" | "windowMs">,
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
      // @orb-waive caught-failure-ownership(e): sets stepFailed, which is returned in the AuditData the caller reads as part of the verdict, and prints STEP FAILED — not dropped. Ends if stepFailed stops being read from the returned AuditData.
      try {
        await page.mouse.click(measuredClick.x, measuredClick.y);
        measuredInput = true;
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
    // @orb-waive caught-failure-ownership(page.evaluate): best-effort cleanup unpausing an in-page flag in a finally block — the page may already be closed/navigated by the time this runs, and there is nothing further downstream that could act on this failure. Ends if this flag gates behavior a later step depends on.
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
