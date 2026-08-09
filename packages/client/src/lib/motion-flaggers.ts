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
//   [drop]   a requestAnimationFrame gap over budget WHILE an animation is running. Scoped to animation
//            windows on purpose: a long frame during an idle page is a `[frame]` problem, but a long
//            frame mid-animation is a VISIBLE stutter, and it is the only one a user can feel.
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
import { animatedProperties, COMPOSITOR_SAFE_PROPS, surfaceLabelOf } from "./motion-stats.ts";

/** The pack's budgets — ONE table, so a console verdict and the CT that asserts it can never disagree.
 *  Every number is a rendered-behaviour threshold, not a style preference; each states what it means. */
export const MOTION_BUDGETS = {
  /** A rAF gap over this DURING an animation is a visible stutter: \>3 dropped frames at 60Hz. */
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
  for (const anim of el.getAnimations()) {
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

/** Both start events, one handler. Capture phase + passive: this must never be the reason a frame is
 *  late, and animations on a portalled popup do not bubble to a listener bound late in the tree. */
function installAnimationFlagger(): void {
  const onStart = (event: Event): void => {
    const target = event.target;
    if (target instanceof Element) {
      flagDirtyAnimationsOn(target);
    }
  };
  document.addEventListener("animationstart", onStart, { capture: true, passive: true });
  document.addEventListener("transitionstart", onStart, { capture: true, passive: true });
}

// ── [drop] — rAF gaps DURING an animation ────────────────────────────────────────────────────────────

/** true while any animation is actually running (not merely attached — a finished/paused one is not a
 *  window we care about, and `getAnimations()` keeps finished CSS transitions briefly). */
function animationsRunning(): boolean {
  return document.getAnimations().some((a) => a.playState === "running");
}

/** The label set of what is animating right now — a dropped frame is only actionable if it names the
 *  motion it stuttered. */
function runningLabels(): string {
  const labels = new Set<string>();
  for (const anim of document.getAnimations()) {
    const effect = anim.effect;
    const el = effect instanceof KeyframeEffect ? effect.target : null;
    if (anim.playState === "running" && el !== null) {
      labels.add(surfaceLabelOf(el));
    }
  }
  return labels.size === 0 ? "(no animated element)" : [...labels].join(" · ");
}

let dropLoopActive = false;

/** Measure inter-frame gaps for as long as something is animating, then stop. A permanent rAF loop in a
 *  dev build is itself a battery/jank cost, so the loop's LIFETIME is the animation window. */
function runDropLoop(): void {
  if (dropLoopActive) {
    return;
  }
  dropLoopActive = true;
  let last = performance.now();
  const tick = (now: number): void => {
    const gap = now - last;
    last = now;
    if (gap > MOTION_BUDGETS.frameGapMs) {
      const who = runningLabels();
      raise({
        tag: "drop",
        key: who,
        offender: who,
        detail: `${Math.round(gap)}ms frame gap mid-animation (budget ${MOTION_BUDGETS.frameGapMs}ms)`,
        overBudget: true,
      });
    }
    if (animationsRunning()) {
      requestAnimationFrame(tick);
      return;
    }
    dropLoopActive = false;
  };
  requestAnimationFrame(tick);
}

function installFrameDropFlagger(): void {
  const onStart = (): void => runDropLoop();
  document.addEventListener("animationstart", onStart, { capture: true, passive: true });
  document.addEventListener("transitionstart", onStart, { capture: true, passive: true });
}

// ── [css] — live dead-class scan ─────────────────────────────────────────────────────────────────────

// Marker-only classes that legitimately ship no rules (kept VERBATIM from snap.ts's scan so the live
// flagger and the probe agree about what "dead" means — two definitions would produce two bug reports).
const CSS_MARKER_PREFIXES = ["group/", "peer/", "lucide", "TanStack", "tsqd-"];
const CSS_MARKER_EXACT = new Set(["group", "peer"]);
// A class selector's token, un-escaped: a literal dot then a run of escaped-char-or-ident-char.
const CLASS_TOKEN_RE = /\.((?:\\.|[A-Za-z0-9_-])+)/gu;
const CLASS_ESCAPE_RE = /\\(.)/gu;

function isMarkerClass(token: string): boolean {
  return CSS_MARKER_EXACT.has(token) || CSS_MARKER_PREFIXES.some((p) => token.startsWith(p));
}

/** Every class token any loaded stylesheet DEFINES a rule for. Walks nested rules (Tailwind v4 emits
 *  variants as nesting) and tolerates cross-origin sheets. */
function definedClassTokens(): ReadonlySet<string> {
  const defined = new Set<string>();
  const walk = (rules: CSSRuleList): void => {
    for (const rule of rules) {
      const selector = (rule as CSSStyleRule).selectorText;
      if (typeof selector === "string") {
        CLASS_TOKEN_RE.lastIndex = 0;
        let match = CLASS_TOKEN_RE.exec(selector);
        while (match !== null) {
          defined.add((match[1] ?? "").replace(CLASS_ESCAPE_RE, "$1"));
          match = CLASS_TOKEN_RE.exec(selector);
        }
      }
      // `instanceof`, not a cast + a null check: CSSStyleRule extends CSSGroupingRule in the current
      // spec, which is what makes Tailwind v4's nested variant rules (a hover utility holds an `&:hover`
      // child and no own declarations) reachable — and the type system already knows `cssRules` is
      // non-nullable on the grouping type, so a defensive check there is dead code the linter is right
      // about.
      if (rule instanceof CSSGroupingRule) {
        walk(rule.cssRules);
      }
    }
  };
  for (const sheet of document.styleSheets) {
    try {
      walk(sheet.cssRules);
    } catch {
      // Cross-origin sheet — unreadable by spec, not a finding.
    }
  }
  return defined;
}

/** One dead-class sweep: every class worn by a live element that no rule defines. Deduped by `raise`, so
 *  a token flagged on one surface stays quiet on the next. */
function scanDeadClasses(): void {
  const defined = definedClassTokens();
  for (const el of document.querySelectorAll("*")) {
    for (const token of el.classList) {
      if (!(defined.has(token) || isMarkerClass(token))) {
        raise({
          tag: "css",
          key: token,
          offender: `.${token} on ${surfaceLabelOf(el)}`,
          detail: "dead class — no rule defines it, so the style never applied",
          overBudget: false,
        });
      }
    }
  }
}

/** Throttled to `cssScanIntervalMs` and deferred to idle: the scan is a whole-DOM walk, and running it
 *  synchronously inside a MutationObserver callback would make it the jank it exists to find. */
function installDeadClassFlagger(): void {
  let lastScan = 0;
  let queued = false;
  const maybeScan = (): void => {
    if (queued || performance.now() - lastScan < MOTION_BUDGETS.cssScanIntervalMs) {
      return;
    }
    queued = true;
    const run = (): void => {
      queued = false;
      lastScan = performance.now();
      scanDeadClasses();
    };
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(run, { timeout: MOTION_BUDGETS.cssScanIntervalMs });
      return;
    }
    setTimeout(run, 0);
  };
  new MutationObserver(maybeScan).observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["class"],
  });
  maybeScan();
}

// ── [space] — unreserved replaced-element boxes ──────────────────────────────────────────────────────

const REPLACED_SELECTOR = "img, video, iframe, canvas";

/** true ⇒ the element's box is reserved before its content loads: width+height attributes, an
 *  aspect-ratio, or an explicit non-auto block size. Any ONE of those prevents the shift. */
function hasReservedBox(el: Element): boolean {
  if (el.hasAttribute("width") && el.hasAttribute("height")) {
    return true;
  }
  const style = getComputedStyle(el);
  if (style.aspectRatio !== "" && style.aspectRatio !== "auto") {
    return true;
  }
  return style.height !== "" && style.height !== "auto" && style.height !== "0px";
}

/** Sweep the live replaced elements for unreserved boxes. Capped (see `spaceScanCap`) — this rides the
 *  same throttled observer as `[css]`, and a media-heavy gallery must not turn it into a full walk. */
function scanUnreservedSpace(): void {
  const nodes = [...document.querySelectorAll(REPLACED_SELECTOR)].slice(0, MOTION_BUDGETS.spaceScanCap);
  for (const el of nodes) {
    if (hasReservedBox(el)) {
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
  installFrameDropFlagger();
  installDeadClassFlagger();
  installUnreservedSpaceFlagger();
}
