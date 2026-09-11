// THE IN-PAGE CAPTURE (#1095) — the dev bug button's data half: read every `__orb` census + the browser's own
// facts, slice them to the owner's window through the shared `@orb/kit/evidence-window` engine, and POST the
// bundle to `/api/_debug/bug-report`.
//
// Split from the component (`features/app-shell/components/bug-report-button.tsx`) so the reads are testable and
// the component stays a form. Split from `bug-report-bundle.ts` so THAT stays DOM-free and node-unit-driveable:
// this module is the only one that touches `globalThis`.
//
// THE BRIDGE MAY BE ABSENT AND THAT IS A REPORTABLE FACT, NOT A CRASH. `window.__orb` is installed only under
// `IS_DEV` (agent-bridge.ts early-returns otherwise), and this button is dev-gated the same way — but a CT runs
// in a PRODUCTION vite build where the bridge does not exist, and a bundle that threw there would be untestable.
// A missing bridge yields `bridge: false` and zero-entry sources with a reason, which is the honest shape.
//
// COPY BEFORE YOU SERIALIZE — `__orb.flags()` and `motion().shifts` return the LIVE arrays that
// `__orb.resetEvidence()` mutates in place (motion-audit calls it). Every source goes through `sliceByWindow`/
// `wholeSource`, both of which copy. Do not "optimize" a raw reference into the bundle.
//
// THIS CAPTURE NEVER RESETS ANYTHING. The flag ring and the motion checkpoint belong to whatever measurement is
// running; a capture that cleared them would silently void a live motion-audit window.

import type { EvidenceSlice } from "@orb/kit/evidence-window";
import { resolveEvidenceWindow, sliceByWindow, wholeSource } from "@orb/kit/evidence-window";
import { coarsePointerNow, prefersReducedMotionNow } from "@orb/ui/lib";
import { readAgentDebugHandle } from "../../../lib/agent-bridge.ts";
import { APPEARANCE_CARRIER_OBSERVABLES, THEME_CARRIER_OBSERVABLES } from "../../../lib/appearance-carrier-manifest.ts";
import type { BugReportClientBundle, BugReportEnvironment, BugReportRoute } from "../../../lib/bug-report-bundle.ts";
import { bugReportRouteFrom, buildBugReportClientBundle, FLAGS_UNFILTERABLE_REASON, RENDERS_UNFILTERABLE_REASON } from "../../../lib/bug-report-bundle.ts";
import { consoleErrorRing } from "../../../lib/console-error-ring.ts";

/** The route the debug capture POSTs to — the same same-origin, gate-behind-`/api/_debug` idiom
 *  `agent-plugin-bridge.ts` uses for its own debug-route read. */
const BUG_REPORT_ROUTE = "/api/_debug/bug-report";

/** Ring capacities quoted into the bundle's receipts so a reader knows each source's honest reach without
 *  opening the client source. They are the caps declared at each ring's own home. */
const CAPS = { flags: 128, motionShifts: 32, motionLoafs: 64, busEvents: 64 } as const;

const NO_BRIDGE_REASON = "window.__orb was not installed — this page is not a dev build, so no in-page census exists";

/** What the capture needs from the caller: the note, the ask, and the clock. Everything else it reads. */
export interface BugReportCaptureInput {
  readonly note: string;
  /** The owner's "~N minutes ago", `null` for "everything the rings still hold". */
  readonly windowMinutes: number | null;
  /** Wall-clock epoch ms of the click. Optional: the capture reads its own clock (`captureClockMs`) when
   *  the caller has no reason to pin one; a spec passes it to make the window arithmetic deterministic. */
  readonly now?: number;
}

/** Where the report was taken from — the URL as a fact, the shell as the answer (see `BugReportRoute`).
 *
 *  This function is the DOM READ only. The reduction that drops the query string and fragment lives in the
 *  DOM-free sibling (`bug-report-bundle.ts::bugReportRouteFrom`, #1535) so a node unit lane can hand it an
 *  OAuth-callback URL and watch the code not come out; hand it `globalThis.location` whole and let the
 *  reducer decide what survives. */
function readRoute(shell: unknown): BugReportRoute {
  return bugReportRouteFrom({
    location: globalThis.location,
    section: document.querySelector('[aria-current="page"]')?.getAttribute("aria-label") ?? null,
    shell,
  });
}

/** Every DOM-observable appearance carrier, read off the live document. DERIVED from the carrier manifest
 *  rather than hand-listed: a new appearance axis appears in a bug report the moment it is declared, which is
 *  the whole reason that manifest is the one home. `message-prop` carriers are skipped — they are per-message
 *  props, not the page-level appearance a rendered defect is a function of. */
function readAppearanceCarriers(): Readonly<Record<string, string | null>> {
  const observables = { ...APPEARANCE_CARRIER_OBSERVABLES, ...THEME_CARRIER_OBSERVABLES };
  const out: Record<string, string | null> = {};
  for (const [key, observable] of Object.entries(observables)) {
    if (!("kind" in observable) || observable.kind === "message-prop") {
      continue;
    }
    const element = document.querySelector<HTMLElement>(observable.selector);
    if (element === null) {
      out[key] = null;
      continue;
    }
    out[key] = observable.kind === "attribute" ? element.getAttribute(observable.signal) : element.style.getPropertyValue(observable.signal);
  }
  return out;
}

/** The browser facts a rendered defect is usually a function of.
 *
 *  POINTER COARSENESS IS REPORTED TWICE, HONESTLY NAMED (#1182). `maxTouchPoints` and `pointerCoarse` are
 *  different signals — a touchscreen laptop can report touch points while its active pointer is a mouse —
 *  and were conflated only while no sanctioned `(pointer: coarse)` read existed (#1095 shipped
 *  `maxTouchPoints` alone rather than mislabel it). `coarsePointerNow()` is now the ONE `@orb/ui/lib`
 *  one-home the `no-raw-matchmedia` gate allows for this query; both fields ship so a reader who sees the
 *  two disagree learns something instead of the report silently picking one. */
function readEnvironment(): BugReportEnvironment {
  return {
    userAgent: navigator.userAgent,
    viewport: { width: globalThis.innerWidth, height: globalThis.innerHeight },
    devicePixelRatio: globalThis.devicePixelRatio,
    maxTouchPoints: navigator.maxTouchPoints,
    pointerCoarse: coarsePointerNow(),
    prefersReducedMotion: prefersReducedMotionNow(),
    appearance: readAppearanceCarriers(),
  };
}

/** The capture instant, as epoch ms — the `bus-devlog.ts`/`console-error-ring.ts` spelling, deliberately not
 *  `Date.now()`. Two reasons, and the second is the load-bearing one: the injected-clock law
 *  (`no-raw-clock`) governs app LOGIC whose behaviour must be reproducible, while this is the physical instant
 *  a capture happened; and the rings this bundle compares against stamp themselves with exactly this
 *  expression, so a window built on a different clock would not mean the same thing as the entries it filters. */
function captureClockMs(): number {
  return performance.timeOrigin + performance.now();
}

function absentSource(source: string): EvidenceSlice<unknown> {
  return { entries: [], meta: { source, windowFilterable: false, reason: NO_BRIDGE_REASON, cap: null, held: 0, kept: 0, truncatedAt: null } };
}

/** Assemble the client bundle from whatever the page can actually see. */
export function captureBugReportBundle(input: BugReportCaptureInput): BugReportClientBundle {
  const window = resolveEvidenceWindow(input.now ?? captureClockMs(), input.windowMinutes);
  const orb = readAgentDebugHandle();
  const consoleErrors = consoleErrorRing();
  const slices: Record<string, EvidenceSlice<unknown>> = {
    consoleErrors: sliceByWindow({
      source: "consoleErrors()",
      entries: consoleErrors.records,
      at: (record) => record.at,
      window,
      cap: consoleErrors.cap,
      dropped: consoleErrors.dropped,
    }),
  };
  if (orb === undefined) {
    for (const source of ["queries()", "bus().events", "motion().shifts", "motion().loafs", "flags()", "renders()"]) {
      slices[source] = absentSource(source);
    }
    return buildBugReportClientBundle({
      note: input.note,
      window,
      route: readRoute(null),
      environment: readEnvironment(),
      slices,
      checkpointTotals: { bridge: false },
    });
  }
  const motion = orb.motion();
  // The MOTION records carry `performance.now()` OFFSETS; every other source here is already wall-clock. The
  // conversion is explicit at the call site (the engine refuses to guess a clock) — `timeOrigin` is the epoch
  // instant this document's `performance.now()` counts from.
  const toEpoch = (startTime: number): number => performance.timeOrigin + startTime;
  slices["queries()"] = sliceByWindow({
    // The query CENSUS — keys, status and timestamps, never cached VALUES (agent-bridge.ts's `queries` maps
    // exactly those five fields). That is why no per-field scrub is needed on this source: there is no payload
    // in it to leak. `updatedAt` is epoch ms, so it is genuinely window-filterable.
    source: "queries()",
    entries: orb.queries(),
    at: (query) => query.updatedAt,
    window,
    cap: null,
  });
  slices["bus().events"] = sliceByWindow({ source: "bus().events", entries: orb.bus().events, at: (event) => event.at, window, cap: CAPS.busEvents });
  slices["motion().shifts"] = sliceByWindow({
    source: "motion().shifts",
    entries: motion.shifts,
    at: (shift) => toEpoch(shift.startTime),
    window,
    cap: CAPS.motionShifts,
  });
  slices["motion().loafs"] = sliceByWindow({
    source: "motion().loafs",
    entries: motion.loafs,
    at: (loaf) => toEpoch(loaf.startTime),
    window,
    cap: CAPS.motionLoafs,
  });
  slices["flags()"] = wholeSource({ source: "flags()", entries: orb.flags(), reason: FLAGS_UNFILTERABLE_REASON, cap: CAPS.flags });
  slices["renders()"] = wholeSource({ source: "renders()", entries: orb.renders(), reason: RENDERS_UNFILTERABLE_REASON, cap: null });
  return buildBugReportClientBundle({
    note: input.note,
    window,
    route: readRoute(orb.shell()),
    environment: readEnvironment(),
    slices,
    // The CLS scalars are checkpoint totals over the whole session so far — they answer no time question at all,
    // so they ride here rather than pretending to be windowed evidence.
    checkpointTotals: {
      bridge: true,
      cls: motion.cls,
      observedCls: motion.observedCls,
      nonVirtualizedCls: motion.nonVirtualizedCls,
      worstShift: motion.worstShift,
      worstBlocking: motion.worstBlocking,
      perf: orb.perf(),
    },
  });
}

/** What the server answered. A refusal is DATA, never a throw: this runs from a submit handler and the surface
 *  shows the reason. */
export type BugReportSubmission = { readonly ok: true; readonly id: string; readonly json: string } | { readonly ok: false; readonly reason: string };

/** The gate's own words for WHICH arm refused (`foundation/observability/debug/routes.ts` — it names the
 *  admin-session arm and the token arm separately). Read from the body because "an admin session or
 *  x-debug-token" told the owner nothing actionable while the SESSION arm was the one refusing (#1193). A
 *  non-gate failure (a proxy 502, an HTML error page) has no such body — then the status alone is the honest
 *  answer, and inventing a cause for it would be worse than saying less. */
async function refusalReason(response: Response): Promise<string | null> {
  // @orb-waive caught-failure-ownership(catch): the FAILURE is already owned and surfaced — the caller returns `{ok:false}` and the button's status line renders `HTTP <status> from <route>` either way. This try only asks whether the body ADDS a named arm; a non-JSON error page (proxy 502, HTML) is the expected miss, and `null` means "say only what is true". Ends if a refusal body ever becomes required rather than additive.
  try {
    const body = (await response.json()) as { reason?: unknown; error?: unknown };
    // `reason` names the ARM; `error` is the gate's older one-word shape — take whichever the server sent.
    const named = [body.reason, body.error].find((value): value is string => typeof value === "string" && value.length > 0);
    return named ?? null;
  } catch {
    return null;
  }
}

/** POST one captured report. Same-origin, credentialed — the `/api/_debug` gate admits an admin/owner
 *  session (on the dev box this button lives on, that IS the loopback owner fallback) or `x-debug-token`,
 *  exactly as `readAutomationFires` documents for the read side. */
export async function submitBugReport(bundle: BugReportClientBundle): Promise<BugReportSubmission> {
  const response = await fetch(BUG_REPORT_ROUTE, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ note: bundle.note, windowMinutes: bundle.window.requestedMinutes, client: bundle }),
  });
  if (!response.ok) {
    const named = await refusalReason(response);
    const because = named === null ? "" : ` — ${named}`;
    return { ok: false, reason: `HTTP ${response.status} from ${BUG_REPORT_ROUTE}${because}` };
  }
  const body = (await response.json()) as { id?: unknown; written?: { json?: unknown } };
  const id = typeof body.id === "string" ? body.id : "";
  const json = typeof body.written?.json === "string" ? body.written.json : "";
  return id === "" ? { ok: false, reason: "the server accepted the report but named no id" } : { ok: true, id, json };
}
