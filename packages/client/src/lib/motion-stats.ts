// Motion/animation introspection, read via window.__orb.motion()/.animations(). Two observers feed a
// bounded ring: long-animation-frame (blockingDuration, styleAndLayoutStart, attributed scripts) and
// layout-shift (accumulated CLS + worst single shift). animations() classifies each active animation
// compositor-clean (transform/translate/scale/rotate/opacity/filter) or not.
//
// Dev-only by construction: installed from agent-bridge.ts, which early-returns when !IS_DEV. Never
// re-export from the lib barrel.

// translate/scale/rotate are CSS Transforms L2 individual properties that Tailwind v4 compiles its
// scale-*/translate-* utilities to, and composite exactly like transform.
const COMPOSITOR_SAFE_PROPS = new Set([
  "transform",
  "opacity",
  "filter",
  "translate",
  "scale",
  "rotate",
]);

// Ring cap — a long session must not grow this unbounded.
const LOAF_RING_CAP = 64;
// CLS/shift scores are reported to 4 decimals — the CWV convention.
const SHIFT_DECIMALS = 4;

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

let clsTotal = 0;
let worstShift = 0;

export interface MotionSnapshot {
  readonly loafs: readonly LoafRecord[];
  readonly cls: number;
  readonly worstBlocking: number;
  readonly worstShift: number;
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
        // CWV definition: shifts within 500ms of user input are excluded (an expected reflow, not jank).
        if (e.hadRecentInput) {
          continue;
        }
        clsTotal += e.value;
        worstShift = Math.max(worstShift, e.value);
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
    worstBlocking: loafRing.reduce((a, l) => Math.max(a, l.blockingDuration), 0),
    worstShift: Number(worstShift.toFixed(SHIFT_DECIMALS)),
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

function resolveSurfaceLabel(target: Animation["effect"]): string {
  // Only KeyframeEffect carries a DOM target.
  const el = target instanceof KeyframeEffect ? target.target : null;
  if (!(el instanceof Element)) {
    return "(no-element)";
  }
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

// getKeyframes() injects computedOffset on every frame in addition to the authoring fields, so it must
// be dropped too or every animation reads as "dirty".
const FRAME_CONTROL_KEYS = new Set(["offset", "computedOffset", "easing", "composite"]);

/** The animated CSS-property set (union across keyframes, minus the frame-control fields). */
function animatedProperties(effect: Animation["effect"]): string[] {
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
      compositorClean:
        properties.length > 0 && properties.every((p) => COMPOSITOR_SAFE_PROPS.has(p)),
    };
    return anim.id === "" ? record : { ...record, id: anim.id };
  });
}
