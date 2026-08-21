// Shared animation-lifetime accounting for the motion flagger. Kept separate from the observers so the
// pack's orchestration file stays below the client source-size ceiling. CSS events and the dev-only
// Element.animate boundary record lifetimes; the ONE existing LoAF observer supplies rendered frames.
// There is no global animation-tree read and no self-sustaining rAF loop to create the LoAFs we audit.

import type { LongAnimationFrameEvidence } from "./motion-stats.ts";
import { subscribeLongAnimationFrames, surfaceLabelOf } from "./motion-stats.ts";

const RUNNING_LABEL_CAP = 8;
// Both the OS and app-level reduced-motion floors collapse ANIMATIONS to 0.01ms (transitions they
// remove outright, #257). A 0.01ms animation still emits its events, but no person can see it and no
// frame can be dropped "during" it.
const INSTANT_EFFECT_CEILING_MS = 1;
const ENDED_LIFETIME_CAP = 128;
// TanStack's injected development panel owns its own CSS/motion and is not an Orbweaver surface.
const EXTERNAL_DEVTOOLS_SELECTOR = '[data-testid^="tsd-"], [aria-label="Open TanStack Devtools"]';

export function isExternalDevtoolsElement(el: Element): boolean {
  return el.closest(EXTERNAL_DEVTOOLS_SELECTOR) !== null;
}

export function hasVisibleDuration(animation: Animation): boolean {
  const duration = animation.effect?.getComputedTiming().duration;
  return typeof duration !== "number" || duration > INSTANT_EFFECT_CEILING_MS;
}

function runningLabels(elements: readonly Element[]): string {
  const labels = new Set<string>();
  for (const element of elements) {
    labels.add(surfaceLabelOf(element));
  }
  const entries = [...labels];
  const visible = entries.slice(0, RUNNING_LABEL_CAP);
  const remaining = entries.length - visible.length;
  return entries.length === 0 ? "(no animated element)" : `${visible.join(" · ")}${remaining > 0 ? ` · +${remaining} more` : ""}`;
}

const liveTargetCounts = new Map<Element, number>();
const liveTargetStarts = new Map<Element, number>();
const endedLifetimes: Array<{ readonly target: Element; readonly startTime: number; readonly endTime: number }> = [];
let elementAnimateWrapped = false;
let frameDropTrackingPaused = false;

export interface DroppedAnimationFrame {
  readonly frameMs: number;
  readonly offender: string;
}

/** Clear both the evidence window and the motion lifetime that could feed it. */
export function resetFrameDropFlagger(): void {
  liveTargetCounts.clear();
  liveTargetStarts.clear();
  endedLifetimes.length = 0;
}

/** Suspend only the duplicate in-page `[drop]` rail while motion-audit's CDP trace owns the same
 * rendered-frame verdict. Pausing clears prior lifetimes; future CSS/WAAPI starts are tracked again
 * after resume. Other motion observers and flagger channels are untouched. */
export function setFrameDropTrackingPaused(paused: boolean): void {
  frameDropTrackingPaused = paused;
  if (paused) {
    resetFrameDropFlagger();
  }
}

function registerTarget(target: Element): void {
  if (!liveTargetCounts.has(target)) {
    liveTargetStarts.set(target, performance.now());
  }
  liveTargetCounts.set(target, (liveTargetCounts.get(target) ?? 0) + 1);
}

function retireTarget(target: Element): void {
  const count = liveTargetCounts.get(target);
  if (count === undefined) {
    return;
  }
  const remaining = count - 1;
  if (remaining > 0) {
    liveTargetCounts.set(target, remaining);
    return;
  }
  liveTargetCounts.delete(target);
  const startTime = liveTargetStarts.get(target);
  liveTargetStarts.delete(target);
  if (startTime !== undefined) {
    endedLifetimes.push({ target, startTime, endTime: performance.now() });
    if (endedLifetimes.length > ENDED_LIFETIME_CAP) {
      endedLifetimes.shift();
    }
  }
}

function targetsOverlapping(frame: LongAnimationFrameEvidence): Element[] {
  const frameEnd = frame.startTime + frame.duration;
  const targets = new Set<Element>();
  for (const [target, startTime] of liveTargetStarts) {
    if (target.isConnected && startTime <= frameEnd) {
      targets.add(target);
    }
  }
  for (let index = endedLifetimes.length - 1; index >= 0; index -= 1) {
    const lifetime = endedLifetimes[index];
    if (lifetime === undefined) {
      continue;
    }
    if (lifetime.endTime < frame.startTime) {
      endedLifetimes.splice(index, 1);
    } else if (lifetime.target.isConnected && lifetime.startTime <= frameEnd) {
      targets.add(lifetime.target);
    }
  }
  return [...targets];
}

/** `Element.animate()` is the one shipped motion path that emits no CSS start/end events (dnd-kit's
 * sortable drop settle). Register its returned Animation once at the platform boundary; never poll the
 * document animation tree. */
function installElementAnimateFlagger(): void {
  if (elementAnimateWrapped) {
    return;
  }
  elementAnimateWrapped = true;
  const nativeAnimate = Element.prototype.animate;
  Element.prototype.animate = function (
    this: Element,
    keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
    options?: number | KeyframeAnimationOptions,
  ): Animation {
    const animation = Reflect.apply(nativeAnimate, this, options === undefined ? [keyframes] : [keyframes, options]) as Animation;
    if (frameDropTrackingPaused || isExternalDevtoolsElement(this) || !hasVisibleDuration(animation)) {
      return animation;
    }
    registerTarget(this);
    let active = true;
    const retire = (): void => {
      if (!active) {
        return;
      }
      active = false;
      retireTarget(this);
    };
    animation.addEventListener("finish", retire, { once: true });
    animation.addEventListener("cancel", retire, { once: true });
    return animation;
  } as typeof Element.prototype.animate;
}

/** Install start/end accounting once. Counts preserve overlapping transition properties on one node. */
export function installFrameDropFlagger(budgetMs: number, onDrop: (frame: DroppedAnimationFrame) => void): void {
  installElementAnimateFlagger();
  subscribeLongAnimationFrames((frame) => {
    if (frameDropTrackingPaused || frame.duration <= budgetMs) {
      return;
    }
    const targets = targetsOverlapping(frame);
    if (targets.length > 0) {
      onDrop({ frameMs: frame.duration, offender: runningLabels(targets) });
    }
  });
  const onStart = (event: Event): void => {
    if (frameDropTrackingPaused) {
      return;
    }
    const target = event.target;
    if (!(target instanceof Element) || isExternalDevtoolsElement(target)) {
      return;
    }
    registerTarget(target);
  };
  const onStop = (event: Event): void => {
    if (frameDropTrackingPaused) {
      return;
    }
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    retireTarget(target);
  };
  for (const type of ["animationstart", "transitionstart"]) {
    document.addEventListener(type, onStart, { capture: true, passive: true });
  }
  for (const type of ["animationend", "animationcancel", "transitionend", "transitioncancel"]) {
    document.addEventListener(type, onStop, { capture: true, passive: true });
  }
}
