// Motion/animation introspection, read via window.__orb.motion()/.animations(). Two observers feed a
// bounded ring: long-animation-frame (blockingDuration, styleAndLayoutStart, attributed scripts) and
// layout-shift (accumulated CLS + worst single shift + the attributed shift ring). animations()
// classifies each active animation compositor-clean (transform/translate/scale/rotate/opacity/filter)
// or not.
//
// Dev-only by construction: installed from agent-bridge.ts, which early-returns when !IS_DEV. Never
// re-export from the lib barrel.
//
// ── THE CLS FLAGGER (push, not just pull) ────────────────────────────────────────────────────────────
// The layout-shift observer also CONSOLE-WARNS each actionable shift over the noise floor, naming the
// element that moved and how far, plus the running totals. Virtual-list row reconciliation remains in the
// metric/ring but is tagged instead of warned: absolute rows changing measured coordinates is the list
// doing its job, not a stable surface losing its place. Rationale: a snapshot nobody calls is a metric nobody
// reads, and real CLS regressions are otherwise found by feel. This is the same posture as
// long-task-tracer.ts — one dev-gated observer, one console surface.
//
// The rest of the flagger pack ([anim] · [css] · [drop] · [space]) lives in `motion-flaggers.ts` —
// those flaggers need no LoAF/CLS ring. Animation property and active-record ownership live in
// `motion-animation-record.ts`; the surface label stays here because layout shifts and animation records
// share it. `[frame]`/`[input]`/`[reflow]` EMIT
// from `long-task-tracer.ts`, but the FRAMES they judge come from the one observer installed here
// (`subscribeLongAnimationFrames`). One emitter per signal (Constitution.md §3); one OBSERVER per entry type is
// the same rule one level down — until P7 this file and the tracer each ran their own.
//
// TWO TOTALS, AND THIS IS THE POINT. The Layout Instability spec zeroes `hadRecentInput` shifts
// (anything within 500ms of real input) so the metric reports only surprise. That exclusion HIDES the
// most expensive layout defect this shell has had. Measured 2026-08-09 on the docked LIST panel toggle:
// `.shell-main` moved 272px across 7 entries at ~20ms cadence — 0.207 of instability, i.e. a full
// relayout every frame for the whole 220ms transition — and EVERY entry carried `hadRecentInput: true`.
// `__orb.motion().cls` read 0.0177 and the former motion CLI passed its CLS budget while the shell was
// visibly thrashing (the cause: an animated `grid-template-columns`, guide §3.7). `activeAnimations()`
// could not see it either — it samples at the END of the audit window, by which time a 220ms transition
// is over. So: `cls` stays the spec metric (no consumer's meaning changes), `observedCls` counts every
// shift, and an input-adjacent shift is TAGGED in the log line rather than dropped.
//
// …AND THE OBSERVED TOTAL CARRIES THE SAME THREE-WAY SPLIT (#1071, 2026-09-01). `observedCls` alone is
// not a gateable number: `virtualizedClsTotal` below accrues only inside the `!hadRecentInput` branch, so
// the observed total folds virtual-row reconciliation back in — and a click that opens a chat settles the
// message list INSIDE its own 500ms input window. Gating an interaction on raw `observedCls` would trade
// #1071's false PASS for a false FAIL nothing an app fix could move, which is exactly what #109 removed
// from the budget. Deriving it from the `shifts` ring instead is not an option either: `SHIFT_RING_CAP`
// truncates silently, and an under-count is lenient — the same lie in the other direction. So every shift
// also lands in `observedVirtualizedClsTotal`, and `observedNonVirtualizedCls` is what motion-audit's
// INTERACTION cells budget on. The three original fields keep their exact meanings.
//
// THE THIRD SPLIT — THE BUDGET GATES ON `nonVirtualizedCls` (issue #109, 2026-08-16). Virtual-row
// reconciliation was already CLASSIFIED here (`virtualized`) and warn-suppressed, but still folded into
// `cls`, which is the number `motion-audit`'s budget failed on. Measured by lane ae-shell-motion on a
// no-probe home→chat journey: ~0.26 of the remaining CLS was the message list settling on mount, so
// "journey under 0.1" was unreachable by ANY app fix short of replacing the virtualizer — a budget that
// cannot be met is not a target. So `virtualizedCls` is accumulated separately and `nonVirtualizedCls`
// (= `cls` − `virtualizedCls`) is what the budget and the over-budget log style judge. Nothing is hidden:
// all three ride the snapshot and motion-audit prints them labeled.
//
// SEALED SELECT ENTRANCE CALIBRATION (#374). Clean-host production/CT controls showed Base UI Select's
// normal anchored entrance/positioning work on first AND repeat opens, while non-Select portals and a
// one-state React portal stay ordinary. select-entrance-evidence.ts correlates only trusted opening
// intent to the trigger's ARIA-related Positioner, bounded by the popup's real opacity/scale transition.
// The raw LoAF ring stays intact; motion-audit alone decides which confirmed intervals are budget inputs.

import { logClock } from "./log-clock.ts";
import type { SelectEntranceEvidence } from "./select-entrance-evidence.ts";
import { installSelectEntranceObserver, resetSelectEntranceEvidence, selectEntranceForFrame } from "./select-entrance-evidence.ts";

// Ring cap — a long session must not grow this unbounded.
const LOAF_RING_CAP = 64;
// The shift ring is the same idea for layout instability; smaller because each record carries its sources.
const SHIFT_RING_CAP = 32;
// CLS/shift scores are reported to 4 decimals — the CWV convention.
const SHIFT_DECIMALS = 4;
// Below this a shift is measurement noise (a settled boot measures ~0.0002) — still accumulated, never logged.
const MIN_REPORTED_SHIFT = 0.002;
// The CWV "good" ceiling. Crossing it reddens the log line; it is also motion-audit's own CLS budget.
const CLS_BUDGET = 0.1;
// Matches the Layout Instability API's recent-input window. Agent navigation drives the same store
// actions as a click, but Chrome cannot infer that intent from an in-page harness call.
const AGENT_NAVIGATION_WINDOW_MS = 500;
const VIRTUAL_VIEWPORT_SELECTOR = '[data-slot="message-list-viewport"],[data-slot="virtual-list-viewport"]';

const SHIFT_STYLE = "color:#c60;font-weight:bold";
const OVER_BUDGET_STYLE = "color:#c00;font-weight:bold";
const MUTED_STYLE = "color:#888";

interface LoafScript {
  readonly sourceURL: string;
  readonly duration: number;
  readonly forcedStyleAndLayoutDuration: number;
  readonly invoker: string;
  readonly sourceFunctionName: string;
}
interface LoafRecord {
  readonly startTime: number;
  readonly duration: number;
  readonly blockingDuration: number;
  /** \>0 ⇒ style/layout ran inside this frame (forced reflow / non-compositor animation) — the jank tell. */
  readonly styleAndLayoutStart: number;
  readonly scripts: readonly LoafScript[];
  readonly selectEntrance?: SelectEntranceEvidence;
}
const loafRing: LoafRecord[] = [];

/** One long animation frame as the ONE observer publishes it: the raw entry fields, undefaulted only
 *  where lib.dom cannot type them. Subscribers apply their OWN budget and attribution — the observer
 *  makes no judgement, which is what lets `[drop]` and `[frame]` disagree about what matters. */
export interface LongAnimationFrameEvidence {
  readonly startTime: number;
  readonly duration: number;
  readonly blockingDuration: number;
  /** \>0 ⇒ style/layout ran inside this frame — `long-task-tracer.ts`'s `[reflow]` tell. */
  readonly styleAndLayoutStart: number;
  readonly scripts: readonly LoafScriptEntry[];
}
type LongAnimationFrameSubscriber = (frame: LongAnimationFrameEvidence) => void;
const longAnimationFrameSubscribers = new Set<LongAnimationFrameSubscriber>();

/** Subscribe to THE LoAF observer — this file installs the app's only `long-animation-frame`
 *  PerformanceObserver, and every other rendered-frame consumer arrives here instead of installing a
 *  second one (`motion-animation-state.ts`'s `[drop]` flagger; `long-task-tracer.ts`'s
 *  `[frame]`/`[reflow]`). Delivery is gated on THIS file's checkpoint floor (`__resetMotionStats`),
 *  which the dev bridge resets alongside every other evidence floor; a subscriber owning a narrower
 *  floor still applies its own on top. */
export function subscribeLongAnimationFrames(subscriber: LongAnimationFrameSubscriber): () => void {
  longAnimationFrameSubscribers.add(subscriber);
  return (): void => {
    longAnimationFrameSubscribers.delete(subscriber);
  };
}

function publishLongAnimationFrame(entry: LoafEntry): void {
  const frame: LongAnimationFrameEvidence = {
    startTime: entry.startTime,
    duration: entry.duration,
    blockingDuration: entry.blockingDuration ?? 0,
    styleAndLayoutStart: entry.styleAndLayoutStart ?? 0,
    scripts: entry.scripts ?? [],
  };
  for (const subscriber of longAnimationFrameSubscribers) {
    subscriber(frame);
  }
}

/** One attributed layout shift — what moved, how far, and whether the spec counts it. NOT exported (the
 *  `LoafRecord` precedent): it is reachable through `MotionSnapshot.shifts`, and a second export would be
 *  an unused public name knip reds. */
interface ShiftRecord {
  readonly startTime: number;
  readonly value: number;
  /** true ⇒ within 500ms of real input, so the CWV metric excludes it (but the relayout still happened). */
  readonly hadRecentInput: boolean;
  /** true ⇒ caused inside the dev bridge's user-equivalent navigation window. Still measured, not warned. */
  readonly agentNavigation: boolean;
  /** true ⇒ every attributed source is an absolute row inside a known virtualizer viewport. */
  readonly virtualized: boolean;
  /** The elements whose start position moved, described + measured, worst-first as the entry reported them. */
  readonly sources: readonly string[];
}
const shiftRing: ShiftRecord[] = [];

let clsTotal = 0;
let observedClsTotal = 0;
/** The share of `clsTotal` the instrument classified as virtual-row reconciliation — subtracted out to
 *  form the budgeted total (see the header's third-split note). */
let virtualizedClsTotal = 0;
/** The same classification over EVERY shift, input-adjacent included — the observed total's virtual-row
 *  share, so an interaction budget can subtract it (see the header's observed-split note, #1071). */
let observedVirtualizedClsTotal = 0;
let worstShift = 0;
let evidenceStartTime = 0;
let agentNavigationUntil = 0;

function entriesInCurrentCheckpoint(entries: readonly PerformanceEntry[]): readonly PerformanceEntry[] {
  return entries.filter((entry) => entry.startTime >= evidenceStartTime);
}

export interface MotionSnapshot {
  readonly loafs: readonly LoafRecord[];
  /** The CWV metric: input-adjacent shifts excluded. Unchanged semantics — existing consumers read this. */
  readonly cls: number;
  /** EVERY shift, input-adjacent included — the number that catches an interaction-driven relayout storm. */
  readonly observedCls: number;
  /** The share of `cls` this instrument classified as virtual-row reconciliation — printed, never gated. */
  readonly virtualizedCls: number;
  /** `cls` − `virtualizedCls`: THE BUDGETED TOTAL (issue #109). The only CLS number an app fix can move. */
  readonly nonVirtualizedCls: number;
  /** The virtual-row share of `observedCls` — the #109 classification over the input-adjacent shifts too. */
  readonly observedVirtualizedCls: number;
  /** `observedCls` − `observedVirtualizedCls`: THE INTERACTION BUDGET TOTAL (#1071). What an app fix can
   *  move out of a relayout storm the CWV metric excludes because it followed a real input. */
  readonly observedNonVirtualizedCls: number;
  readonly worstBlocking: number;
  readonly worstShift: number;
  /** The recent attributed shifts — "what moved", which no CLS number carries. */
  readonly shifts: readonly ShiftRecord[];
}

// LoAF/layout-shift PerformanceEntry fields aren't all in lib.dom yet; narrow them structurally rather
// than depend on a newer @types/web.
interface LoafScriptEntry {
  readonly name?: string;
  readonly sourceURL?: string;
  readonly forcedStyleAndLayoutDuration?: number;
  readonly invoker?: string;
  readonly sourceFunctionName?: string;
  readonly duration: number;
}
interface LoafEntry extends PerformanceEntry {
  readonly blockingDuration?: number;
  readonly styleAndLayoutStart?: number;
  readonly scripts?: readonly LoafScriptEntry[];
}
interface LayoutShiftEntry extends PerformanceEntry {
  readonly value: number;
  readonly hadRecentInput: boolean;
  readonly sources?: readonly { readonly node: Node | null; readonly previousRect: DOMRectReadOnly; readonly currentRect: DOMRectReadOnly }[];
}

/** "What moved, and how far" for one shift source — the surface label plus the start-corner delta. The
 *  delta is what turns a score into an actionable line ("`.shell-main` moved 272px,0px"). */
function describeShiftSource(node: Node | null, previousRect: DOMRectReadOnly, currentRect: DOMRectReadOnly): string {
  if (!(node instanceof Element)) {
    return "(detached)";
  }
  const dx = Math.round(currentRect.x - previousRect.x);
  const dy = Math.round(currentRect.y - previousRect.y);
  return `${surfaceLabelOf(node)} moved ${dx}px,${dy}px`;
}

function sourcesAreVirtualized(sources: LayoutShiftEntry["sources"]): boolean {
  return (
    sources !== undefined &&
    sources.length > 0 &&
    sources.every((source) => source.node instanceof Element && source.node.closest(VIRTUAL_VIEWPORT_SELECTOR) !== null)
  );
}

/** The console half of the flagger: one line per shift over the noise floor. Input-adjacent shifts are
 *  TAGGED, not dropped — see the header's two-totals note (the exclusion is what hid the shell defect). */
function warnShift(record: ShiftRecord): void {
  if (record.value < MIN_REPORTED_SHIFT || record.agentNavigation || record.virtualized) {
    return;
  }
  // The budget is the NON-virtualized total (issue #109) — virtual-row settling is not an app defect,
  // so it must not be what turns this line red.
  const overBudget = clsTotal - virtualizedClsTotal > CLS_BUDGET;
  const tag = record.hadRecentInput ? "input-adjacent (excluded from CLS)" : "unexpected";
  const who = record.sources.length === 0 ? "(no source attribution)" : record.sources.join(" · ");
  console.warn(
    `%c${logClock()} [cls]%c shift ${record.value.toFixed(SHIFT_DECIMALS)} ${tag} · ${who} · CLS ${clsTotal.toFixed(SHIFT_DECIMALS)} (virtualized ${virtualizedClsTotal.toFixed(
      SHIFT_DECIMALS,
    )})${overBudget ? " OVER BUDGET" : ""} · observed ${observedClsTotal.toFixed(SHIFT_DECIMALS)} · route ${globalThis.location.pathname}`,
    overBudget ? OVER_BUDGET_STYLE : SHIFT_STYLE,
    MUTED_STYLE,
  );
}

/** Fold ONE layout-shift entry into the three totals + the attributed ring, then flag it. Extracted from
 *  the observer callback so the three-way CLS split stays legible (and inside the complexity cap). */
function accumulateShift(e: LayoutShiftEntry): void {
  observedClsTotal += e.value;
  const virtualized = sourcesAreVirtualized(e.sources);
  if (virtualized) {
    observedVirtualizedClsTotal += e.value;
  }
  // CWV definition: shifts within 500ms of user input are excluded from the METRIC (an expected reflow,
  // not surprise) — but they are still recorded and still logged, see the header.
  if (!e.hadRecentInput) {
    clsTotal += e.value;
    // Split out, never dropped: the budget judges what an app fix could actually move (issue #109).
    if (virtualized) {
      virtualizedClsTotal += e.value;
    }
    worstShift = Math.max(worstShift, e.value);
  }
  const record: ShiftRecord = {
    startTime: Math.round(e.startTime),
    value: e.value,
    hadRecentInput: e.hadRecentInput,
    agentNavigation: !e.hadRecentInput && e.startTime <= agentNavigationUntil,
    virtualized,
    sources: (e.sources ?? []).map((s) => describeShiftSource(s.node, s.previousRect, s.currentRect)),
  };
  shiftRing.push(record);
  if (shiftRing.length > SHIFT_RING_CAP) {
    shiftRing.shift();
  }
  warnShift(record);
}

/** Install both observers into their rings. Idempotence is the caller's concern (installed once). No-op
 *  when PerformanceObserver / the entry types are unsupported — the accessors then just read empty. */
export function installMotionObservers(): void {
  if (typeof PerformanceObserver === "undefined") {
    return;
  }
  const supported = PerformanceObserver.supportedEntryTypes;
  installSelectEntranceObserver();

  if (supported.includes("long-animation-frame")) {
    const loaf = new PerformanceObserver((list) => {
      for (const raw of entriesInCurrentCheckpoint(list.getEntries())) {
        const e = raw as LoafEntry;
        publishLongAnimationFrame(e);
        const selectEntrance = selectEntranceForFrame(e);
        loafRing.push({
          startTime: Math.round(e.startTime),
          duration: Math.round(e.duration),
          blockingDuration: Math.round(e.blockingDuration ?? 0),
          styleAndLayoutStart: Math.round(e.styleAndLayoutStart ?? 0),
          scripts: (e.scripts ?? []).map((s) => ({
            sourceURL: s.sourceURL ?? s.name ?? "(inline)",
            duration: Math.round(s.duration),
            forcedStyleAndLayoutDuration: Math.round(s.forcedStyleAndLayoutDuration ?? 0),
            invoker: s.invoker ?? "",
            sourceFunctionName: s.sourceFunctionName ?? "",
          })),
          ...(selectEntrance === undefined ? {} : { selectEntrance }),
        });
        if (loafRing.length > LOAF_RING_CAP) {
          loafRing.shift();
        }
      }
    });
    // biome-ignore lint/suspicious/noExplicitAny: PerformanceObserverInit in lib.dom predates the LoAF entry type; the string is a valid Chrome M123+ observe target.
    loaf.observe({ type: "long-animation-frame", buffered: true } as any);
  }

  if (supported.includes("layout-shift")) {
    const ls = new PerformanceObserver((list) => {
      for (const raw of entriesInCurrentCheckpoint(list.getEntries())) {
        accumulateShift(raw as LayoutShiftEntry);
      }
    });
    ls.observe({ type: "layout-shift", buffered: true });
  }
}

/** The recent LoAF ring + accumulated CLS/worst-blocking/worst-shift — `window.__orb.motion()`. */
export function motionSnapshot(): MotionSnapshot {
  return {
    loafs: loafRing,
    cls: Number(clsTotal.toFixed(SHIFT_DECIMALS)),
    observedCls: Number(observedClsTotal.toFixed(SHIFT_DECIMALS)),
    virtualizedCls: Number(virtualizedClsTotal.toFixed(SHIFT_DECIMALS)),
    nonVirtualizedCls: Number((clsTotal - virtualizedClsTotal).toFixed(SHIFT_DECIMALS)),
    observedVirtualizedCls: Number(observedVirtualizedClsTotal.toFixed(SHIFT_DECIMALS)),
    observedNonVirtualizedCls: Number((observedClsTotal - observedVirtualizedClsTotal).toFixed(SHIFT_DECIMALS)),
    worstBlocking: loafRing.reduce((a, l) => Math.max(a, l.blockingDuration), 0),
    worstShift: Number(worstShift.toFixed(SHIFT_DECIMALS)),
    shifts: shiftRing,
  };
}

/** Clear the evidence accumulated by the motion observers without reinstalling them. A driven probe calls
 *  this immediately before each checkpoint so one surface cannot inherit another surface's LoAF/CLS debt. */
export function __resetMotionStats(): void {
  evidenceStartTime = performance.now();
  loafRing.length = 0;
  resetSelectEntranceEvidence();
  shiftRing.length = 0;
  clsTotal = 0;
  observedClsTotal = 0;
  virtualizedClsTotal = 0;
  observedVirtualizedClsTotal = 0;
  worstShift = 0;
  agentNavigationUntil = 0;
}

/** Mark the same 500ms expected-layout window a physical click receives. The shifts remain in both
 *  totals and the attributed ring; only the false "unexpected" console accusation is suppressed. */
export function markAgentNavigation(): void {
  agentNavigationUntil = performance.now() + AGENT_NAVIGATION_WINDOW_MS;
}

// Attributes an animated Element to the nearest stable surface marker — testid > slot > aria-label >
// role > landmark tag — walking up the ancestor chain.
const LANDMARK_TAGS = new Set(["MAIN", "NAV", "ASIDE", "HEADER", "FOOTER", "DIALOG", "SECTION"]);
const SURFACE_WALK_MAX = 8;

/** The stable surface marker on one node (null ⇒ walk to the parent). Priority: testid \> slot \> label \>
 *  role \> landmark tag. */
function nodeSurfaceMarker(node: Element): string | null {
  const tag = node.tagName.toLowerCase();
  const testId = node.getAttribute("data-testid");
  if (testId !== null) {
    return `[data-testid=${testId}]`;
  }
  const slot = node.getAttribute("data-slot");
  if (slot !== null) {
    return `[data-slot=${slot}]`;
  }
  const label = node.getAttribute("aria-label");
  if (label !== null) {
    return `${tag}[aria-label=${label}]`;
  }
  const role = node.getAttribute("role");
  if (role !== null) {
    return `[role=${role}]`;
  }
  return LANDMARK_TAGS.has(node.tagName) ? `<${tag}>` : null;
}

/** The nearest stable surface marker at or above `el`. Shared by the animation classifier, the shift
 *  flagger, and the whole `motion-flaggers.ts` half: they all answer "which surface is this?", and two
 *  walks would drift into two vocabularies (which is also why it is exported rather than copied). */
export function surfaceLabelOf(el: Element): string {
  let node: Element | null = el;
  for (let i = 0; node !== null && i < SURFACE_WALK_MAX; i += 1) {
    const marker = nodeSurfaceMarker(node);
    if (marker !== null) {
      return marker;
    }
    node = node.parentElement;
  }
  // No stable marker on the chain — fall back to the leaf's own tag + first class.
  const cls = el.classList.item(0);
  return cls === null ? `<${el.tagName.toLowerCase()}>` : `<${el.tagName.toLowerCase()} .${cls}>`;
}
