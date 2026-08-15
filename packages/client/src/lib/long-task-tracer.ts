// Dev-only render-jank attribution: PerformanceObservers turn Chrome's generic scheduler violations
// into console lines naming the ROUTE, the ELEMENT (slow events), and — for long frames — the SCRIPT
// that caused them. Prefers the Long Animation Frames API (LoAF, Chrome M123+) over the deprecated
// `longtask` type: LoAF reports the whole janky frame WITH per-script attribution (invoker + source),
// which `longtask` (deprecated, attribution-free, and emitting a console deprecation notice per entry)
// cannot. Falls back to `longtask` only where LoAF is unsupported. Dynamically imported behind
// import.meta.env.DEV — never re-export from the lib barrel, that would drag it into the prod bundle.
//
// THIS FILE IS THE `[frame]`/`[input]`/`[reflow]` THIRD OF THE MOTION FLAGGER PACK (task #39). It owned
// the LoAF + event-timing observers before the pack existed, so the pack's tag vocabulary and budget
// table were adopted HERE rather than a second observer being installed in `motion-flaggers.ts` — one
// signal, one emitter (AGENTS §3). The channels, and why each is its own tag:
//   [frame]   a frame over `longFrameMs`, attributed to its costliest script. WHAT blocked.
//   [reflow]  that frame ALSO ran style/layout (`styleAndLayoutStart` > 0) — a forced synchronous
//             reflow or a non-compositor animation. This is the diagnosis `[frame]` alone does not
//             give you, and it is what turns "623ms blocking" into a file to open.
//   [input]   an interaction over `interactionMs`, attributed to its target element.
// `[perf]` survives on `render-profiler.tsx` alone, where it means a slow REACT COMMIT — a different
// measurement with a different fix, which is why it kept its own tag rather than folding in here.

import { logClock } from "./log-clock.ts";
import { MOTION_BUDGETS } from "./motion-flaggers.ts";

const PERF_STYLE = "color:#c60;font-weight:bold";
const MUTED_STYLE = "color:#888";
let evidenceStartTime = 0;

/** Move the observer's checkpoint floor without reinstalling it. Buffered entries delivered after a
 * probe reset otherwise inherit the next surface's route and console range even though they began on
 * the previous surface. */
export function __resetLongTaskEvidence(): void {
  evidenceStartTime = performance.now();
}

function belongsToCurrentCheckpoint(entry: PerformanceEntry): boolean {
  return entry.startTime >= evidenceStartTime;
}

/** LoAF shapes — lib.dom predates the Long Animation Frames API, so we narrow the entry structurally. */
interface LoafScript {
  readonly duration: number;
  readonly invoker?: string;
  readonly sourceURL?: string;
  readonly sourceFunctionName?: string;
  readonly name?: string;
}
interface LoafEntry extends PerformanceEntry {
  readonly blockingDuration?: number;
  /** \>0 ⇒ style/layout ran inside this frame — the `[reflow]` tell (see the header). */
  readonly styleAndLayoutStart?: number;
  readonly scripts?: readonly LoafScript[];
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
  try {
    const { pathname } = new URL(url);
    return pathname.split("/").pop() ?? pathname;
  } catch {
    return url;
  }
}

/** The costliest script in a long frame as a compact "function · source · Nms" attribution — LoAF's payoff. */
function attributeFrame(scripts: readonly LoafScript[]): string {
  if (scripts.length === 0) {
    return "(no script attribution)";
  }
  const worst = scripts.reduce((a, b) => (b.duration > a.duration ? b : a));
  const who = worst.sourceFunctionName ?? worst.invoker ?? worst.name ?? "(anonymous)";
  const where = worst.sourceURL !== undefined && worst.sourceURL !== "" ? ` @ ${basename(worst.sourceURL)}` : "";
  return `${who}${where} ${Math.round(worst.duration)}ms`;
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

function actionableBlockingDuration(entry: LoafEntry): number | null {
  if (entry.duration < MOTION_BUDGETS.longFrameMs) {
    return null;
  }
  const blocking = Math.round(entry.blockingDuration ?? 0);
  // Headless Chrome can stretch an otherwise idle/presentation frame past 100ms while reporting zero
  // blocking work. Keep it in the pulled LoAF ring, but do not push a console accusation with nothing
  // actionable to attribute; motion-audit likewise gates on blockingDuration, not wall time.
  return blocking === 0 ? null : blocking;
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
  if (supported.includes("long-animation-frame")) {
    const loaf = new PerformanceObserver((list) => {
      for (const raw of list.getEntries().filter(belongsToCurrentCheckpoint)) {
        const entry = raw as LoafEntry;
        const blocking = actionableBlockingDuration(entry);
        if (blocking === null) {
          continue;
        }
        const who = attributeFrame(entry.scripts ?? []);
        console.warn(
          `%c${logClock()} [frame]%c long frame ${Math.round(entry.duration)}ms · blocking ${blocking}ms (budget ${MOTION_BUDGETS.longFrameMs}ms) · ${who} · route ${route()}`,
          PERF_STYLE,
          MUTED_STYLE,
        );
        // The diagnosis half: this frame also ran style/layout, so the cost is a forced reflow or a
        // non-compositor animation — not merely a long script. Same attribution, different fix.
        if ((entry.styleAndLayoutStart ?? 0) > 0) {
          console.warn(`%c${logClock()} [reflow]%c style/layout ran inside that frame · ${who} · route ${route()}`, PERF_STYLE, MUTED_STYLE);
        }
      }
    });
    // Plain cast (not `as any`, which would trip the suppression ratchet): lib.dom types the observe
    // init's `type` as string, so the LoAF entry-type string is valid — same cast the event observer uses below.
    loaf.observe({ type: "long-animation-frame", buffered: true } as PerformanceObserverInit);
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
