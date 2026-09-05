// The BUG-REPORT BUNDLE builder (#1095) — the CLIENT half of the dev top-rail bug button: the owner's note
// plus every in-page evidence source, sliced to the window they asked for and annotated with what that slice
// could and could not honestly cover.
//
// The window/honesty ENGINE is `@orb/kit/evidence-window`, shared with the server half so the two can never
// disagree about what "~5 minutes ago" covers (AGENTS §1 engine-vs-data). This module owns only the CLIENT
// data: which `__orb` read feeds which slice, and on which clock.
//
// Deliberately reader-injected and DOM-free (the `client-error-report.ts` posture): the component passes the
// reads and the clock in, so the assembly is exercised by a node unit lane instead of only through a browser.
//
// THE TWO CLOCKS. `bus().events` and the console-error ring already record wall-clock epoch ms; `motion()`'s
// records carry `performance.now()` offsets, so their `at` accessor adds `performance.timeOrigin` — passed in,
// never read here, because a clock assumption buried in a builder is one no caller can see.
//
// TWO SOURCES SHIP WHOLE AND SAY SO (owner-ruled 2026-09-02, fork 2) rather than being filtered wrongly:
//  · `flags()` — the flagger ring dedupes per offender for the WHOLE session (`motion-flaggers.ts`'s `raised`
//    Set), so a record's `at` is its FIRST raise. A defect recurring right now can carry a pre-window timestamp
//    and a filter would DROP it; hiding a live defect is the lie this button exists to end.
//  · `renders()` — aggregate counters (`render-stats.ts`), no timestamps at all.
//
// COPY BEFORE YOU SERIALIZE. `__orb.flags()` and `motion().shifts` hand back the LIVE arrays; a bundle holding
// those references would serialize whatever a later `__orb.resetEvidence()` (motion-audit runs one) left behind,
// not what it read. Every slice helper copies — do not "optimize" that away.

import type { EvidenceSlice, EvidenceSourceMeta, EvidenceWindow } from "@orb/kit/evidence-window";

/** Why `flags()` cannot answer a time question — quoted into the bundle so a cold reader needs no source dive. */
export const FLAGS_UNFILTERABLE_REASON =
  "the flagger ring dedupes per offender for the whole session, so `at` is the FIRST raise, not the occurrence — filtering would drop a defect that is still happening";

/** Why `renders()` cannot answer a time question. */
export const RENDERS_UNFILTERABLE_REASON = "the render heatmap is aggregate counters per profiled surface — it carries no timestamps at all";

/** Where the report was taken from.
 *
 *  DELIBERATELY NOT THE ROUTER'S STATE. This app has three routes (`/`, `/login`, and a `/$section` alias
 *  that redirects into `/`), so the URL says almost nothing about where the owner actually is: the SHELL
 *  does — which section is current, which panels are open, whether a room is mounted. So this carries the
 *  URL as a fact and the shell snapshot as the answer. It also keeps the capture provider-free, which is
 *  why the button's CT can mount it directly (a `useRouterState` read would need a RouterProvider that no
 *  other CT in this repo stands up). */
export interface BugReportRoute {
  /** The scheme+host the report was taken from. */
  readonly origin: string;
  /** The path, WITHOUT its query string or fragment — see {@link bugReportRouteFrom}. */
  readonly pathname: string;
  /** The shell's active section marker (`aria-current="page"`'s accessible name), as `__orb.shell()` derives it. */
  readonly section: string | null;
  /** Panel modes + whether a room is open, straight off `__orb.shell()`; `null` when no bridge is installed. */
  readonly shell: unknown;
}

/** The `Location` slice {@link bugReportRouteFrom} is handed. It NAMES the parts that get dropped on purpose:
 *  the drop has to happen somewhere a test can hand it a hostile URL, and a reducer whose input is already
 *  reduced pins nothing. */
export type BugReportLocationRead = Pick<Location, "origin" | "pathname" | "search" | "hash">;

/**
 * Reduce a live `Location` to the route facts a report may carry: ORIGIN + PATH, never the query string or
 * the fragment.
 *
 * SECURITY (#1535, the #1473 class): a bug-report artifact is a durable file an owner attaches to an issue or
 * hands to an agent, and the only scrub the server applies to it is BY VALUE over env-derived secret literals
 * (`foundation/observability/debug/bug-report.ts::secretLiterals`) — which cannot see a credential that rode
 * in on a URL. A report taken on an OAuth callback (`?code=…&state=…`), an invite-accept route, or any
 * future token-in-query link would have written that credential into the artifact verbatim, and the capture
 * shipped `href` (the WHOLE url) as well as `search` and `hash`. #1473 already made this exact reduction for
 * the client-error TELEMETRY line (`foundation/observability/client-error.ts::pathOnly`); the artifact is the
 * same class and was missed.
 *
 * WHICH ROUTE threw is the diagnostic value; what a route puts in its query is not — and here even less than
 * in the telemetry case, because {@link BugReportRoute} deliberately answers "where is the owner" from the
 * SHELL rather than the URL (see above). The reduction costs this bundle nothing it was using.
 *
 * The dropped fields are gone from the TYPE, not merely unset here: there is no longer a field on
 * `BugReportRoute` for a query to ride in, so a future caller cannot reintroduce one without saying so.
 */
export function bugReportRouteFrom(args: {
  readonly location: BugReportLocationRead;
  readonly section: string | null;
  readonly shell: unknown;
}): BugReportRoute {
  return { origin: args.location.origin, pathname: args.location.pathname, section: args.section, shell: args.shell };
}

/** The browser facts a rendered defect is usually a function of. */
export interface BugReportEnvironment {
  readonly userAgent: string;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly devicePixelRatio: number;
  /** `navigator.maxTouchPoints` — see `readEnvironment`'s header for why this, and not a `(pointer: coarse)`
   *  media query: the media-query one-home rule has no coarse-pointer member yet. `> 0` ⇒ a touch device. */
  readonly maxTouchPoints: number;
  readonly prefersReducedMotion: boolean;
  /** The resolved appearance carriers ON `<html>` — theme/density/font-scale as they actually painted, which
   *  is the only appearance read that cannot disagree with the pixels the owner is reporting. */
  readonly appearance: Readonly<Record<string, string | null>>;
}

/** Everything the page contributes to one report. The server adds its own half and the build identity. */
export interface BugReportClientBundle {
  readonly note: string;
  readonly window: EvidenceWindow;
  readonly route: BugReportRoute;
  readonly environment: BugReportEnvironment;
  /** Per-source honesty receipts, one row per contributed source — read these before the data. */
  readonly sources: readonly EvidenceSourceMeta[];
  readonly evidence: Readonly<Record<string, readonly unknown[]>>;
  /** Checkpoint totals that carry no window semantics at all (the CLS scalars) — labelled, never filtered. */
  readonly checkpointTotals: Readonly<Record<string, unknown>>;
}

/** Assemble the client half. `slices` is an ordered map of evidence name → slice, so the receipts and the data
 *  can never drift: both are derived from the same entries here, in one pass. */
export function buildBugReportClientBundle(args: {
  readonly note: string;
  readonly window: EvidenceWindow;
  readonly route: BugReportRoute;
  readonly environment: BugReportEnvironment;
  readonly slices: Readonly<Record<string, EvidenceSlice<unknown>>>;
  readonly checkpointTotals: Readonly<Record<string, unknown>>;
}): BugReportClientBundle {
  const named = Object.entries(args.slices);
  return {
    note: args.note,
    window: args.window,
    route: args.route,
    environment: args.environment,
    sources: named.map(([, slice]) => slice.meta),
    evidence: Object.fromEntries(named.map(([name, slice]) => [name, slice.entries])),
    checkpointTotals: args.checkpointTotals,
  };
}
