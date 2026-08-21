// The MOTION FLAGGER PACK (task #39) — four dev-only push channels that name a motion defect the moment
// it happens, instead of waiting for someone to run an audit and read a number. Same posture as the CLS
// flagger in `motion-stats.ts` (its header states the doctrine: a snapshot nobody calls is a metric
// nobody reads) and the same console grammar: `HH:MM:SS.mmm [tag] <what> · <offender> · <verdict> · route`.
//
//   [anim]   an animation/transition whose property set is NOT compositor-only, flagged AT START.
//            `__orb.animations()` samples `document.getAnimations()` and therefore cannot see a 130ms
//            transition that already finished — which is exactly the duration band this app animates in
//            (motion guide §2). Catching it at `animationstart`/`transitionstart` is the only reliable
//            read. Compositor-only is a CORRECTNESS constraint here, not a preference (guide §3.7).
//   [css]    a class on a live element with NO matching CSS rule anywhere — the dead-token half of
//            `pnpm snap --dead-css`, ported to a throttled MutationObserver so it fires on surfaces a
//            snap run never navigated to. A dead utility is a style that silently did not apply.
//   [drop]   a long animation frame over budget that overlaps a CSS/WAAPI animation lifetime. Scoped to
//            animation windows on purpose: a long frame during an idle page is a `[frame]` problem, but
//            a long frame mid-animation is a VISIBLE stutter, and it is the only one a user can feel.
//   [space]  a replaced element (img/video/iframe/canvas) rendering with NO reserved box — no
//            width+height attributes, no aspect-ratio, no explicit size. This is a layout shift that
//            has not happened yet; it is the cause `[cls]` reports after the fact.
//
// NOT HERE, DELIBERATELY: `[frame]` (LoAF over budget, script-attributed) and `[input]` (slow
// interaction) are OLDER than this pack and live in `long-task-tracer.ts`, which already observed both
// entry types. They were retagged into this vocabulary in place rather than re-emitted here — a second
// observer for one signal is the "two homes for one concept" AGENTS §3 merges, and it would have
// double-logged every long frame in the app.
//
// Dev-only by construction: installed from agent-bridge.ts, which early-returns when !IS_DEV. Never
// re-export from the lib barrel (that would drag it into the prod bundle).

import { logClock } from "./log-clock.ts";
import { hasVisibleDuration, installFrameDropFlagger, isExternalDevtoolsElement, resetFrameDropFlagger } from "./motion-animation-state.ts";
import { installDeadClassFlagger } from "./motion-dead-class-flagger.ts";
import { animatedProperties, COMPOSITOR_SAFE_PROPS, surfaceLabelOf } from "./motion-stats.ts";

/** The pack's budgets — ONE table, so a console verdict and the CT that asserts it can never disagree.
 *  Every number is a rendered-behaviour threshold, not a style preference; each states what it means. */
export const MOTION_BUDGETS = {
  /** A rendered frame over this DURING an animation is a visible stutter: \>3 frame intervals at 60Hz. */
  frameGapMs: 50,
  /** A frame longer than this is `[frame]`-flagged by `long-task-tracer.ts` (which owns the LoAF
   *  observer — see this file's header). Lives here so the pack has ONE budget table. */
  longFrameMs: 100,
  /** An interaction slower than this is `[input]`-flagged. The INP "good" ceiling. */
  interactionMs: 200,
  /** Never scan for dead classes more often than this — the scan walks every element, and an
   *  instrument that causes the jank it measures is worse than no instrument. */
  cssScanIntervalMs: 2000,
  /** Cap on elements inspected per `[space]` sweep, so a huge list can't turn the observer into a
   *  whole-DOM walk on every mutation. */
  spaceScanCap: 400,
} as const;

// The house console palette (identical to motion-stats.ts / long-task-tracer.ts — one dev voice).
const FLAG_STYLE = "color:#c60;font-weight:bold";
const OVER_BUDGET_STYLE = "color:#c00;font-weight:bold";
const MUTED_STYLE = "color:#888";

// A long session must not grow the ring unbounded.
const FLAG_RING_CAP = 128;

/** One raised flag, as `__orb.flags()` returns it: which channel, what happened, who did it. */
export interface MotionFlagRecord {
  /** The channel tag WITHOUT brackets — `anim` · `css` · `drop` · `space`. */
  readonly tag: string;
  /** `performance.now()` at the raise. */
  readonly at: number;
  /** The stable surface marker (or token) the flag is attributed to — the dedupe identity. */
  readonly offender: string;
  /** The human sentence the console line carried. */
  readonly detail: string;
  /** true ⇒ a declared budget in `MOTION_BUDGETS` was crossed (vs. an unconditional correctness flag). */
  readonly overBudget: boolean;
}

const flagRing: MotionFlagRecord[] = [];
/** Dedupe identity per raised flag (`tag|offender|shape`). A component that animates `height` on every
 *  keystroke would otherwise bury the console in one defect — the point is the OFFENDER LIST, not a count. */
const raised = new Set<string>();

/** The recent raised flags — `window.__orb.flags()`. Bounded; deduped per offender by construction. */
export function motionFlags(): readonly MotionFlagRecord[] {
  return flagRing;
}

/** Clear the ring + the dedupe set. Reachable as `__orb.resetFlags()` because it is a REAL harness
 *  need, not only a test seam: flags dedupe per offender for the whole session, so a probe driving a
 *  multi-step flow would see step 1's offenders suppress the identical ones in step 2 and read the
 *  later steps as clean. Reset between steps and each step's flag list is its own.
 *  (`__reset<Noun>` per the test-seam convention.) */
export function __resetMotionFlags(): void {
  flagRing.length = 0;
  raised.clear();
  resetFrameDropFlagger();
}

function route(): string {
  return globalThis.location.pathname;
}

/** One raise's arguments. An options object rather than five positionals: `offender` and `key` are both
 *  strings that mean different things (what to PRINT vs what to DEDUPE ON), and a positional swap
 *  between them would silently produce a flagger that reports every occurrence forever. */
interface RaiseArgs {
  readonly tag: string;
  /** The dedupe identity within the channel — usually the offender plus the defect SHAPE. */
  readonly key: string;
  readonly offender: string;
  readonly detail: string;
  readonly overBudget: boolean;
}

/** Raise one flag: dedupe on `key`, ring it, and print the house line. */
function raise({ tag, key, offender, detail, overBudget }: RaiseArgs): void {
  const identity = `${tag}|${key}`;
  if (raised.has(identity)) {
    return;
  }
  raised.add(identity);
  flagRing.push({ tag, at: Math.round(performance.now()), offender, detail, overBudget });
  if (flagRing.length > FLAG_RING_CAP) {
    flagRing.shift();
  }
  console.warn(
    `%c${logClock()} [${tag}]%c ${detail} · ${offender}${overBudget ? " · OVER BUDGET" : ""} · route ${route()}`,
    overBudget ? OVER_BUDGET_STYLE : FLAG_STYLE,
    MUTED_STYLE,
  );
}

// ── [anim] — non-compositor at START ─────────────────────────────────────────────────────────────────

/** Classify every animation currently attached to `el` and flag the dirty ones. Runs at animation START
 *  (see the header): a 130ms transition is over before any sampler could see it. */
function flagDirtyAnimationsOn(el: Element): void {
  if (isExternalDevtoolsElement(el)) {
    return;
  }
  for (const anim of el.getAnimations()) {
    if (!hasVisibleDuration(anim)) {
      continue;
    }
    const props = animatedProperties(anim.effect);
    // A zero-property effect carries nothing to judge (a CSS animation whose keyframes the engine has
    // not resolved yet) — silence beats a false accusation.
    if (props.length === 0 || props.every((p) => COMPOSITOR_SAFE_PROPS.has(p))) {
      continue;
    }
    const dirty = props.filter((p) => !COMPOSITOR_SAFE_PROPS.has(p));
    const label = surfaceLabelOf(el);
    raise({
      tag: "anim",
      key: `${label}|${dirty.join(",")}`,
      offender: label,
      detail: `animating non-compositor ${dirty.join(", ")} (guide §3.7 — transform/opacity/filter only)`,
      overBudget: true,
    });
  }
}

// THE TWO SPELLINGS DIFFER and the dedupe key must be in `animatedProperties`'. VERIFIED live, not assumed
// (`snap --eval`, real room open): one transition reports `propertyName: "scrollbar-color"` and keyframe
// key `"scrollbarColor"`. `COMPOSITOR_SAFE_PROPS` is single words and spelling-blind; a mismatch HERE
// would silently make the fast path never hit.
const CSS_DASH_RE = /-([a-z])/gu;

/** Nothing left to learn from this transitionstart? (#219 — the cheap half of the classification, see
 *  {@link installAnimationFlagger}.) Attribute reads only: no `getAnimations`, no computed style, no flush. */
function skipTransition(el: Element, propertyName: string): boolean {
  if (COMPOSITOR_SAFE_PROPS.has(propertyName)) {
    return true;
  }
  const idl = propertyName.replace(CSS_DASH_RE, (_match, letter: string) => letter.toUpperCase());
  return raised.has(`anim|${surfaceLabelOf(el)}|${idl}`);
}

/** Both start events, one handler. Capture phase + passive: this must never be the reason a frame is
 *  late, and animations on a portalled popup do not bubble to a listener bound late in the tree.
 *
 *  THE PASSIVE LISTENER WAS NOT THE COST — `getAnimations()` WAS (#219, measured 2026-08-18): it flushes
 *  pending style + resolves the animation timeline, and the handler answered EVERY start event with one.
 *  `perf-meter / --open-chat latest --cpuprofile`, live dev stack: **534.9ms of self time inside
 *  `getAnimations`, called from here**, of 640ms blocking / 1190ms long tasks — 84% of the jank the
 *  instrument exists to report. `snap --eval` tally, same room: **1,108 transitionstart events, 1,064 of
 *  them `scrollbar-color`**, each paying a full classify before `raise` discarded it as a duplicate. (That
 *  1,064 was the reduced-motion floor's doing — fixed in #257, ZERO now; this fast path must not rely on it.)
 *  THE FIX IS THE EVENT'S OWN DATUM: a `transitionstart` NAMES its property, so both verdicts are reachable
 *  without touching the DOM — compositor-safe is never flaggable, and one ALREADY FLAGGED on this surface
 *  has nothing new to say (`raise` dedupes on `anim|<label>|<property>`). The check moves in FRONT of the
 *  expensive work; the FIRST event per surface+property still takes the full path, so console output is
 *  unchanged. `animationstart` is untouched (keyframe properties only the effect can read; census: none).
 *  Behaviour change: a compositor-safe transition on an element that ALSO has a dirty animation running no
 *  longer classifies it — the dirty one's own start event does. */
function installAnimationFlagger(): void {
  const onStart = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    if (event instanceof TransitionEvent && skipTransition(target, event.propertyName)) {
      return;
    }
    flagDirtyAnimationsOn(target);
  };
  document.addEventListener("animationstart", onStart, { capture: true, passive: true });
  document.addEventListener("transitionstart", onStart, { capture: true, passive: true });
}

// ── [drop] — long rendered frames DURING an animation ─────────────────────────────────────────────────

function installDropFlagger(): void {
  installFrameDropFlagger(MOTION_BUDGETS.frameGapMs, ({ frameMs, offender }) => {
    raise({
      tag: "drop",
      key: offender,
      offender,
      detail: `${Math.round(frameMs)}ms rendered frame mid-animation (budget ${MOTION_BUDGETS.frameGapMs}ms)`,
      overBudget: true,
    });
  });
}

// ── [space] — unreserved replaced-element boxes ──────────────────────────────────────────────────────

const REPLACED_SELECTOR = "img, video, iframe, canvas";

/** true ⇒ the element's box is reserved before its content loads: width+height attributes or an
 *  aspect-ratio. Any ONE of those prevents the shift.
 *
 *  Deliberately NOT a resolved-height check (`getComputedStyle(el).height`): the computed style
 *  reports a RESOLVED pixel value for any in-layout element regardless of whether that size came
 *  from an authored reservation or the browser's own intrinsic/replaced-element fallback sizing —
 *  so a bare `<img>` with no dims reads exactly like a properly reserved one, and the flagger never
 *  fires. The honest signal is the AUTHORED intent (attribute/style), not the box the browser
 *  already computed from it. */
function hasReservedBox(el: Element): boolean {
  if (el.getAttribute("width") !== null && el.getAttribute("height") !== null) {
    return true;
  }
  if (el instanceof HTMLElement && el.style.aspectRatio !== "" && el.style.aspectRatio !== "auto") {
    return true;
  }
  const style = getComputedStyle(el);
  return style.aspectRatio !== "" && style.aspectRatio !== "auto";
}

/** Sweep the live replaced elements for unreserved boxes. Capped (see `spaceScanCap`) — this rides the
 *  same throttled observer as `[css]`, and a media-heavy gallery must not turn it into a full walk. */
function scanUnreservedSpace(): void {
  const nodes = [...document.querySelectorAll(REPLACED_SELECTOR)].slice(0, MOTION_BUDGETS.spaceScanCap);
  for (const el of nodes) {
    if (isExternalDevtoolsElement(el) || hasReservedBox(el)) {
      continue;
    }
    const tag = el.tagName.toLowerCase();
    const label = surfaceLabelOf(el);
    raise({
      tag: "space",
      key: `${tag}|${label}`,
      offender: label,
      detail: `<${tag}> has no reserved box (no width+height, aspect-ratio or explicit height) — its load will shift the page`,
      overBudget: false,
    });
  }
}

/** Same throttle shape as the dead-class flagger, and for the same reason. Kept as its own observer
 *  rather than folded into that one: the two sweeps have different costs and will want different
 *  cadences the first time either becomes expensive. */
function installUnreservedSpaceFlagger(): void {
  let lastScan = 0;
  const maybeScan = (): void => {
    if (performance.now() - lastScan < MOTION_BUDGETS.cssScanIntervalMs) {
      return;
    }
    lastScan = performance.now();
    scanUnreservedSpace();
  };
  new MutationObserver(maybeScan).observe(document.documentElement, { subtree: true, childList: true });
  maybeScan();
}

/** Install the whole pack. Idempotence is the caller's concern (agent-bridge installs it exactly once);
 *  no-op outside a browser so a node import can never throw. */
export function installMotionFlaggers(): void {
  if (typeof document === "undefined" || typeof MutationObserver === "undefined") {
    return;
  }
  installAnimationFlagger();
  installDropFlagger();
  installDeadClassFlagger({
    scanIntervalMs: MOTION_BUDGETS.cssScanIntervalMs,
    onDeadClass: (token, element) => {
      raise({
        tag: "css",
        key: token,
        offender: `.${token} on ${surfaceLabelOf(element)}`,
        detail: "dead class — no rule defines it, so the style never applied",
        overBudget: false,
      });
    },
  });
  installUnreservedSpaceFlagger();
}
