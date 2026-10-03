// The DOM half of the production "Report a bug": the browser facts and the error ring, read at the moment the
// user prepares a report. Everything it reads is a device fact or already reduced at record time; the pure
// assembly and every reduction it relies on live in `lib/bug-report-public.ts` and `lib/safe-error-ring.ts`.

import { coarsePointerNow, prefersReducedMotionNow } from "@orb/ui/lib";
import type { BugReportServerFacts, PublicBrowserFacts, SafeErrorRingRead } from "#lib";
import { safeErrorRing } from "#lib";

/** One prepared report's frozen reads. The user's words and the "when" answer stay live in the form. */
export interface PreparedBugReport {
  readonly capturedAt: number;
  readonly server: BugReportServerFacts;
  readonly browser: PublicBrowserFacts;
  readonly pathname: string;
  readonly browserErrors: SafeErrorRingRead;
}

function readBrowserFacts(): PublicBrowserFacts {
  return {
    userAgent: navigator.userAgent,
    viewport: { width: globalThis.innerWidth, height: globalThis.innerHeight },
    devicePixelRatio: globalThis.devicePixelRatio,
    maxTouchPoints: navigator.maxTouchPoints,
    pointerCoarse: coarsePointerNow(),
    prefersReducedMotion: prefersReducedMotionNow(),
  };
}

/** Read everything a report needs from the page, plus the server facts the caller loaded. The capture
 *  instant is the house wall-clock spelling, the clock the error ring stamps itself with. */
export function preparePublicBugReport(server: BugReportServerFacts): PreparedBugReport {
  return {
    capturedAt: Math.round(performance.timeOrigin + performance.now()),
    server,
    browser: readBrowserFacts(),
    pathname: globalThis.location.pathname,
    browserErrors: safeErrorRing(),
  };
}
