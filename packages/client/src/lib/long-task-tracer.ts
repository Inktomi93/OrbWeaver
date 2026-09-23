// Dev-only render-jank attribution: turns Chrome's generic scheduler violations into console lines
// naming the ROUTE, the ELEMENT (slow events), and — for long frames — the SCRIPT that caused them.
// Prefers the Long Animation Frames API (LoAF, Chrome M123+) over the deprecated `longtask` type: LoAF
// reports the whole janky frame WITH per-script attribution (invoker + source), which `longtask`
// (deprecated, attribution-free, and emitting a console deprecation notice per entry) cannot. Falls back
// to `longtask` only where LoAF is unsupported. Dynamically imported behind import.meta.env.DEV — never
// re-export from the lib barrel, that would drag it into the prod bundle.
//
// THIS FILE OWNS THE `[frame]`/`[input]`/`[reflow]` CHANNELS, NOT THE LoAF OBSERVER. It installs the
// event-timing observer itself; its long frames arrive from `motion-stats.ts`'s single
// `long-animation-frame` observer via `subscribeLongAnimationFrames` (P7 — this file used to install a
// second observer over the same entries). One signal, one emitter (Constitution.md §3); one entry type, one
// observer. The channels, and why each is its own tag:
//   [frame]   a frame over `longFrameMs`, attributed to its costliest script. WHAT blocked.
//   [reflow]  a SCRIPT in that frame blocked on synchronous style/layout (per-script
//             `forcedStyleAndLayoutDuration` > 0), with the cost printed. This is the diagnosis
//             `[frame]` alone does not give you, and it is what turns "623ms blocking" into a file to
//             open. It gated on `frame.styleAndLayoutStart > 0` until #432 — which is >0 on every frame
//             that renders anything, so the channel accused ordinary renders (measured 8/8 with the
//             accused script's own forced duration at 0, and it corroborated #429's mis-filing). A
//             frame-level "style/layout happened" is not a defect; a script WAITING on layout is.
//   [input]   an interaction over `interactionMs`, attributed to its target element.
// `[perf]` survives on `render-profiler.tsx` alone, where it means a slow REACT COMMIT — a different
// measurement with a different fix, which is why it kept its own tag rather than folding in here.

import { logClock } from "./log-clock.ts";
import { MOTION_BUDGETS } from "./motion-flaggers.ts";
import type { LongAnimationFrameEvidence } from "./motion-stats.ts";
import { subscribeLongAnimationFrames } from "./motion-stats.ts";

const PERF_STYLE = "color:#c60;font-weight:bold";
const MUTED_STYLE = "color:#888";
let evidenceStartTime = 0;

/** Move the observer's checkpoint floor without reinstalling it. Buffered entries delivered after a
 * probe reset otherwise inherit the next surface's route and console range even though they began on
 * the previous surface. */
export function __resetLongTaskEvidence(): void {
  evidenceStartTime = performance.now();
}

function belongsToCurrentCheckpoint(entry: { readonly startTime: number }): boolean {
  return entry.startTime >= evidenceStartTime;
}

interface EventTimingEntry extends PerformanceEntry {
  readonly name: string;
  readonly target?: Node | null;
  readonly interactionId?: number;
}

// Event Timing emits the whole DOM event family for one physical action (pointerover/enter/down,
// mouseover/down, click…). They share an interaction id and the same duration. One warning per family is
// actionable; twenty identical warnings make the console unusable. Entries without an interaction id are
// retained only for the discrete events that can independently represent user work.
const UNGROUPED_INPUT_EVENTS = new Set(["beforeinput", "change", "click", "input", "keydown", "submit", "touchend"]);
const SEEN_INTERACTION_CAP = 512;
const ACTIVATION_EVENT_PRIORITY = 3;
const EDITING_EVENT_PRIORITY = 2;
const FALLBACK_EVENT_PRIORITY = 1;

function eventPriority(name: string): number {
  if (name === "click" || name === "submit") {
    return ACTIVATION_EVENT_PRIORITY;
  }
  if (name === "keydown" || name === "input" || name === "beforeinput") {
    return EDITING_EVENT_PRIORITY;
  }
  return FALLBACK_EVENT_PRIORITY;
}

function collectInteractionEntry(entry: EventTimingEntry, grouped: Map<number, EventTimingEntry>, ungrouped: EventTimingEntry[], seen: Set<number>): void {
  const interactionId = entry.interactionId ?? 0;
  if (interactionId <= 0) {
    if (UNGROUPED_INPUT_EVENTS.has(entry.name)) {
      ungrouped.push(entry);
    }
    return;
  }
  if (!seen.has(interactionId)) {
    const prior = grouped.get(interactionId);
    if (prior === undefined || eventPriority(entry.name) > eventPriority(prior.name)) {
      grouped.set(interactionId, entry);
    }
  }
}

function selectInteractionEntries(entries: readonly PerformanceEntry[], seen: Set<number>): EventTimingEntry[] {
  const grouped = new Map<number, EventTimingEntry>();
  const ungrouped: EventTimingEntry[] = [];
  for (const raw of entries) {
    if (raw.duration >= MOTION_BUDGETS.interactionMs) {
      collectInteractionEntry(raw as EventTimingEntry, grouped, ungrouped, seen);
    }
  }
  if (seen.size + grouped.size > SEEN_INTERACTION_CAP) {
    seen.clear();
  }
  for (const interactionId of grouped.keys()) {
    seen.add(interactionId);
  }
  return [...grouped.values(), ...ungrouped];
}

/** Basename of a source URL — the full dev URL (vite hashes, absolute paths) is noise in a log line. */
function basename(url: string): string {
  // @orb-waive caught-failure-ownership(catch): a non-URL string degrades to the raw url as the log-line label — cosmetic formatting only. Ends if the caller needs a validated URL rather than a display label.
  try {
    const { pathname } = new URL(url);
    return pathname.split("/").pop() ?? pathname;
  } catch {
    return url;
  }
}

type LoafScript = LongAnimationFrameEvidence["scripts"][number];

/** One script as a compact "function · source · Nms" line — the shared attribution vocabulary of both
 *  frame channels, so `[frame]` and `[reflow]` can never describe the same script two ways. */
function describeScript(script: LoafScript, ms: number): string {
  const who = script.sourceFunctionName ?? script.invoker ?? script.name ?? "(anonymous)";
  const where = script.sourceURL !== undefined && script.sourceURL !== "" ? ` @ ${basename(script.sourceURL)}` : "";
  return `${who}${where} ${Math.round(ms)}ms`;
}

/** The costliest script in a long frame as a compact "function · source · Nms" attribution — LoAF's payoff. */
function attributeFrame(scripts: LongAnimationFrameEvidence["scripts"]): string {
  if (scripts.length === 0) {
    return "(no script attribution)";
  }
  const worst = scripts.reduce((a, b) => (b.duration > a.duration ? b : a));
  return describeScript(worst, worst.duration);
}

function forcedMs(script: LoafScript): number {
  return script.forcedStyleAndLayoutDuration ?? 0;
}

/** The frame's total forced synchronous layout, and the script that paid most of it — `null` when no
 *  script blocked on layout at all, which is the ordinary case and must stay silent (#432). The blame
 *  goes to the FORCING script, not the frame's longest one: they are routinely different, and a reflow
 *  line naming a script that forced nothing sends the reader to the wrong file. */
function attributeForcedLayout(scripts: LongAnimationFrameEvidence["scripts"]): { readonly total: number; readonly who: string } | null {
  const total = scripts.reduce((sum, script) => sum + forcedMs(script), 0);
  if (Math.round(total) === 0) {
    return null;
  }
  const worst = scripts.reduce((a, b) => (forcedMs(b) > forcedMs(a) ? b : a));
  return { total, who: describeScript(worst, forcedMs(worst)) };
}

/** Compact CSS-selector-ish description of an event target for the log line. */
function describeTarget(target: Node | null): string {
  if (target === null || !(target instanceof Element)) {
    return "(detached)";
  }
  const tag = target.tagName.toLowerCase();
  const testId = target.getAttribute("data-testid");
  if (testId !== null) {
    return `<${tag} data-testid="${testId}">`;
  }
  const id = target.id;
  if (id !== "") {
    return `<${tag} id="${id}">`;
  }
  const cls = target.classList.item(0);
  return cls !== null ? `<${tag} class="${cls}…">` : `<${tag}>`;
}

function route(): string {
  return globalThis.location.pathname + globalThis.location.search;
}

function actionableBlockingDuration(frame: LongAnimationFrameEvidence): number | null {
  if (frame.duration < MOTION_BUDGETS.longFrameMs) {
    return null;
  }
  const blocking = Math.round(frame.blockingDuration);
  // Headless Chrome can stretch an otherwise idle/presentation frame past 100ms while reporting zero
  // blocking work. Keep it in the pulled LoAF ring, but do not push a console accusation with nothing
  // actionable to attribute; motion-audit likewise gates on blockingDuration, not wall time.
  return blocking === 0 ? null : blocking;
}

/** The `[frame]` + `[reflow]` console pair for ONE published long animation frame. Applies this file's
 *  own checkpoint floor on top of the publisher's — the two floors move together through the dev
 *  bridge's `resetEvidence`, and a buffered entry from before a probe's checkpoint is not this
 *  surface's evidence. */
function reportLongFrame(frame: LongAnimationFrameEvidence): void {
  if (!belongsToCurrentCheckpoint(frame)) {
    return;
  }
  const blocking = actionableBlockingDuration(frame);
  if (blocking === null) {
    return;
  }
  const who = attributeFrame(frame.scripts);
  console.warn(
    `%c${logClock()} [frame]%c long frame ${Math.round(frame.duration)}ms · blocking ${blocking}ms (budget ${MOTION_BUDGETS.longFrameMs}ms) · ${who} · route ${route()}`,
    PERF_STYLE,
    MUTED_STYLE,
  );
  // The diagnosis half: a script in this frame BLOCKED on synchronous style/layout, so the fix is the
  // layout read, not the script's own work. Different attribution (the forcing script), different fix.
  const forced = attributeForcedLayout(frame.scripts);
  if (forced !== null) {
    console.warn(
      `%c${logClock()} [reflow]%c forced synchronous style/layout ${Math.round(forced.total)}ms inside that frame · ${forced.who} · route ${route()}`,
      PERF_STYLE,
      MUTED_STYLE,
    );
  }
}

/** Install the jank observers (idempotence is the caller's concern — main.tsx runs it exactly once). */
export function installLongTaskTracer(): void {
  if (typeof PerformanceObserver === "undefined") {
    return;
  }
  const supported = PerformanceObserver.supportedEntryTypes;

  // Prefer LoAF (attributed, not deprecated) — fall back to the coarse `longtask` type only where
  // LoAF is unavailable (Chrome < M123, Firefox, Safari). Never observe both: `longtask` emits a
  // per-entry "Deprecated API for given entry type" console notice, so we avoid it entirely on Chrome.
  //
  // The LoAF arm SUBSCRIBES rather than observing: `motion-stats.ts` installs the app's one
  // `long-animation-frame` PerformanceObserver and publishes each entry (P7 — this file used to install
  // a second observer over the identical entries). The channels, the budget, the checkpoint floor and
  // every console line below are unchanged; only the frame SOURCE moved.
  if (supported.includes("long-animation-frame")) {
    subscribeLongAnimationFrames(reportLongFrame);
  } else if (supported.includes("longtask")) {
    const lt = new PerformanceObserver((list) => {
      for (const entry of list.getEntries().filter(belongsToCurrentCheckpoint)) {
        if (entry.duration < MOTION_BUDGETS.longFrameMs) {
          continue;
        }
        console.warn(`%c${logClock()} [frame]%c long task ${Math.round(entry.duration)}ms · route ${route()}`, PERF_STYLE, MUTED_STYLE);
      }
    });
    lt.observe({ type: "longtask", buffered: true });
  }

  if (supported.includes("event")) {
    const seenInteractions = new Set<number>();
    const ev = new PerformanceObserver((list) => {
      const currentEntries = list.getEntries().filter(belongsToCurrentCheckpoint);
      for (const timing of selectInteractionEntries(currentEntries, seenInteractions)) {
        console.warn(
          `%c${logClock()} [input]%c slow ${timing.name} ${Math.round(timing.duration)}ms (budget ${MOTION_BUDGETS.interactionMs}ms) · ${describeTarget(
            timing.target ?? null,
          )} · route ${route()}`,
          PERF_STYLE,
          MUTED_STYLE,
        );
      }
    });
    // Cast: lib.dom's PerformanceObserverInit hasn't picked up the Event Timing API's durationThreshold field.
    ev.observe({
      type: "event",
      buffered: true,
      durationThreshold: MOTION_BUDGETS.interactionMs,
    } as PerformanceObserverInit);
  }
}
