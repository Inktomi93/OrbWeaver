// The motion arm's measured window: a click on `selector`, a `--goto` run inside the trace, or neither.
import type { Page } from "@playwright/test";
import { print } from "../../../floor/artifacts/artifacts.ts";
import type { ProbeSession } from "../../../floor/browser/browser-contract.ts";
import { refuseDirectInvocation } from "../../../floor/cli/entrypoint.ts";
import { runNav } from "../../../floor/instrument/nav.ts";
import type { AuditData } from "../../../motion-audit/index.ts";
import { runAudit } from "../../../motion-audit/index.ts";
import type { CrossfadeEvidence } from "../../contract/motion.ts";
import { installCrossfadeSampler, readCrossfadeSamples } from "../../lib/vt-crossfade.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route> --motion-goto <target>");

type MeasuredClick = Parameters<typeof runAudit>[3];

export interface MotionWindow {
  readonly selector: string | null;
  readonly goto: string | null;
  readonly windowMs: number;
}

async function navigateInsideWindow(page: Page, target: string): Promise<boolean> {
  const outcome = await runNav(page, "goto", target);
  if (!outcome.ok) {
    print(`NAV FAILED  --motion-goto ${target}: ${outcome.reason}`);
  }
  return outcome.ok;
}

export type MotionWindowResult = Omit<AuditData, "environment" | "applicationMotion"> & { readonly crossfade: CrossfadeEvidence };

/** Open the trace and run the window's input inside it: the `--motion-goto` target is navigated while the
 *  trace records, so a route or section fade is in the window. The crossfade sampler covers the same window. */
export async function runMotionWindow(
  page: Page,
  cdp: Awaited<ReturnType<ProbeSession["context"]["newCDPSession"]>>,
  window: MotionWindow,
  measuredClick: MeasuredClick,
): Promise<MotionWindowResult> {
  const { selector, goto, windowMs } = window;
  await installCrossfadeSampler(page);
  let crossfade: CrossfadeEvidence | null = null;
  try {
    const audit = await runAudit(
      page,
      cdp,
      { selector, windowMs, ...(goto === null ? {} : { measuredNav: (): Promise<boolean> => navigateInsideWindow(page, goto) }) },
      measuredClick,
    );
    crossfade = await readCrossfadeSamples(page);
    return { ...audit, crossfade };
  } finally {
    // A window that threw still hands the page its own startViewTransition back.
    if (crossfade === null) {
      await readCrossfadeSamples(page);
    }
  }
}
