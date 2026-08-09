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
// The layout-shift observer also CONSOLE-WARNS each shift over the noise floor, naming the element that
// moved and how far, plus the running totals. Rationale: a snapshot nobody calls is a metric nobody
// reads, and CLS regressions are otherwise found by feel. This is the same posture as
// long-task-tracer.ts — one dev-gated observer, one console surface.
//
// The rest of the flagger pack ([anim] · [css] · [drop] · [space]) lives in `motion-flaggers.ts` —
// this file is at the client 450-line cap, and those flaggers need no LoAF/CLS ring. They import the
// surface-label + compositor vocabulary FROM HERE so both halves speak one language (the
// `surfaceLabelOf` note below is the same reasoning, one level up). `[frame]`/`[input]`/`[reflow]` are
// NOT here either: `long-task-tracer.ts` already owned the LoAF-over-budget and slow-interaction
// channels before this pack existed, so they were extended in place rather than re-implemented (a
// second emitter for one signal is the "two homes for one concept" the constitution merges, AGENTS §3).
//
// TWO TOTALS, AND THIS IS THE POINT. The Layout Instability spec zeroes `hadRecentInput` shifts
// (anything within 500ms of real input) so the metric reports only surprise. That exclusion HIDES the
// most expensive layout defect this shell has had. Measured 2026-08-09 on the docked LIST panel toggle:
// `.shell-main` moved 272px across 7 entries at ~20ms cadence — 0.207 of instability, i.e. a full
// relayout every frame for the whole 220ms transition — and EVERY entry carried `hadRecentInput: true`.
// `__orb.motion().cls` read 0.0177 and `pnpm motion-audit` passed its CLS budget while the shell was
// visibly thrashing (the cause: an animated `grid-template-columns`, guide §3.7). `activeAnimations()`
// could not see it either — it samples at the END of the audit window, by which time a 220ms transition
// is over. So: `cls` stays the spec metric (no consumer's meaning changes), `observedCls` counts every
// shift, and an input-adjacent shift is TAGGED in the log line rather than dropped.

import { logClock } from "./log-clock.ts";

// translate/scale/rotate are CSS Transforms L2 individual properties that Tailwind v4 compiles its
// scale-*/translate-* utilities to, and composite exactly like transform.
export const COMPOSITOR_SAFE_PROPS: ReadonlySet<string> = new Set(["transform", "opacity", "filter", "translate", "scale", "rotate"]);

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

const SHIFT_STYLE = "color:#c60;font-weight:bold";
const OVER_BUDGET_STYLE = "color:#c00;font-weight:bold";
const MUTED_STYLE = "color:#888";

interface LoafScript {
  readonly sourceURL: string;
  readonly duration: number;
}
interface LoafRecord {
  readonly startTime: number;
  readonly duration: number;
  readonly blockingDuration: number;
  /** \>0 ⇒ style/layout ran inside this frame (forced reflow / non-compositor animation) — the jank tell. */
  readonly styleAndLayoutStart: number;
  readonly scripts: readonly LoafScript[];
}
const loafRing: LoafRecord[] = [];

/** One attributed layout shift — what moved, how far, and whether the spec counts it. NOT exported (the
 *  `LoafRecord` precedent): it is reachable through `MotionSnapshot.shifts`, and a second export would be
 *  an unused public name knip reds. */
interface ShiftRecord {
  readonly startTime: number;
  readonly value: number;
  /** true ⇒ within 500ms of real input, so the CWV metric excludes it (but the relayout still happened). */
  readonly hadRecentInput: boolean;
  /** The elements whose start position moved, described + measured, worst-first as the entry reported them. */
  readonly sources: readonly string[];
}
const shiftRing: ShiftRecord[] = [];

let clsTotal = 0;
let observedClsTotal = 0;
let worstShift = 0;

export interface MotionSnapshot {
  readonly loafs: readonly LoafRecord[];
  /** The CWV metric: input-adjacent shifts excluded. Unchanged semantics — existing consumers read this. */
  readonly cls: number;
  /** EVERY shift, input-adjacent included — the number that catches an interaction-driven relayout storm. */
  readonly observedCls: number;
  readonly worstBlocking: number;
  readonly worstShift: number;
  /** The recent attributed shifts — "what moved", which no CLS number carries. */
  readonly shifts: readonly ShiftRecord[];
}

export interface AnimationRecord {
  readonly id?: string;
  /** Best-effort surface/component label of the animated target (see resolveSurfaceLabel). */
  readonly target: string;
  /** The animated property set (from the keyframes). */
  readonly properties: readonly string[];
  /** true ⇒ every animated prop is compositor-safe (transform/opacity/filter) — no per-frame layout. */
  readonly compositorClean: boolean;
}

// LoAF/layout-shift PerformanceEntry fields aren't all in lib.dom yet; narrow them structurally rather
// than depend on a newer @types/web.
interface LoafScriptEntry {
  readonly name?: string;
  readonly sourceURL?: string;
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

/** The console half of the flagger: one line per shift over the noise floor. Input-adjacent shifts are
 *  TAGGED, not dropped — see the header's two-totals note (the exclusion is what hid the shell defect). */
function warnShift(record: ShiftRecord): void {
  if (record.value < MIN_REPORTED_SHIFT) {
    return;
  }
  const overBudget = clsTotal > CLS_BUDGET;
  const tag = record.hadRecentInput ? "input-adjacent (excluded from CLS)" : "unexpected";
  const who = record.sources.length === 0 ? "(no source attribution)" : record.sources.join(" · ");
  console.warn(
    `%c${logClock()} [cls]%c shift ${record.value.toFixed(SHIFT_DECIMALS)} ${tag} · ${who} · CLS ${clsTotal.toFixed(SHIFT_DECIMALS)}${
      overBudget ? " OVER BUDGET" : ""
    } · observed ${observedClsTotal.toFixed(SHIFT_DECIMALS)} · route ${globalThis.location.pathname}`,
    overBudget ? OVER_BUDGET_STYLE : SHIFT_STYLE,
    MUTED_STYLE,
  );
}

/** Install both observers into their rings. Idempotence is the caller's concern (installed once). No-op
 *  when PerformanceObserver / the entry types are unsupported — the accessors then just read empty. */
export function installMotionObservers(): void {
  if (typeof PerformanceObserver === "undefined") {
    return;
  }
  const supported = PerformanceObserver.supportedEntryTypes;

  if (supported.includes("long-animation-frame")) {
    const loaf = new PerformanceObserver((list) => {
      for (const raw of list.getEntries()) {
        const e = raw as LoafEntry;
        loafRing.push({
          startTime: Math.round(e.startTime),
          duration: Math.round(e.duration),
          blockingDuration: Math.round(e.blockingDuration ?? 0),
          styleAndLayoutStart: Math.round(e.styleAndLayoutStart ?? 0),
          scripts: (e.scripts ?? []).map((s) => ({
            sourceURL: s.sourceURL ?? s.name ?? "(inline)",
            duration: Math.round(s.duration),
          })),
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
      for (const raw of list.getEntries()) {
        const e = raw as LayoutShiftEntry;
        observedClsTotal += e.value;
        // CWV definition: shifts within 500ms of user input are excluded from the METRIC (an expected
        // reflow, not surprise) — but they are still recorded and still logged, see the header.
        if (!e.hadRecentInput) {
          clsTotal += e.value;
          worstShift = Math.max(worstShift, e.value);
        }
        const record: ShiftRecord = {
          startTime: Math.round(e.startTime),
          value: e.value,
          hadRecentInput: e.hadRecentInput,
          sources: (e.sources ?? []).map((s) => describeShiftSource(s.node, s.previousRect, s.currentRect)),
        };
        shiftRing.push(record);
        if (shiftRing.length > SHIFT_RING_CAP) {
          shiftRing.shift();
        }
        warnShift(record);
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
    worstBlocking: loafRing.reduce((a, l) => Math.max(a, l.blockingDuration), 0),
    worstShift: Number(worstShift.toFixed(SHIFT_DECIMALS)),
    shifts: shiftRing,
  };
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

function resolveSurfaceLabel(target: Animation["effect"]): string {
  // Only KeyframeEffect carries a DOM target.
  const el = target instanceof KeyframeEffect ? target.target : null;
  return el instanceof Element ? surfaceLabelOf(el) : "(no-element)";
}

// getKeyframes() injects computedOffset on every frame in addition to the authoring fields, so it must
// be dropped too or every animation reads as "dirty".
const FRAME_CONTROL_KEYS = new Set(["offset", "computedOffset", "easing", "composite"]);

/** The animated CSS-property set (union across keyframes, minus the frame-control fields). Exported for
 *  `motion-flaggers.ts`'s `[anim]` channel, which classifies at animation START rather than by sampling. */
export function animatedProperties(effect: Animation["effect"]): string[] {
  const props = new Set<string>();
  if (!(effect instanceof KeyframeEffect)) {
    return [];
  }
  for (const frame of effect.getKeyframes()) {
    for (const key of Object.keys(frame)) {
      if (!FRAME_CONTROL_KEYS.has(key)) {
        props.add(key);
      }
    }
  }
  return [...props];
}

/** The currently-active animations, each classified compositor-clean or not — `window.__orb.animations()`. */
export function activeAnimations(): readonly AnimationRecord[] {
  return document.getAnimations().map((anim): AnimationRecord => {
    const properties = animatedProperties(anim.effect);
    const record: AnimationRecord = {
      target: resolveSurfaceLabel(anim.effect),
      properties,
      compositorClean: properties.length > 0 && properties.every((p) => COMPOSITOR_SAFE_PROPS.has(p)),
    };
    return anim.id === "" ? record : { ...record, id: anim.id };
  });
}
