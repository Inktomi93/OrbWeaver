// Shared animation-state reads for the motion flagger. Kept separate from the observers so the pack's
// orchestration file stays below the client source-size ceiling.

import { surfaceLabelOf } from "./motion-stats.ts";

const RUNNING_LABEL_CAP = 8;
// Both the OS and app-level reduced-motion floors collapse effects to 0.01ms. They still emit animation
// events, but no person can see them and no frame can be dropped "during" them.
const INSTANT_EFFECT_CEILING_MS = 1;
// TanStack's injected development panel owns its own CSS/motion and is not an Orbweaver surface.
const EXTERNAL_DEVTOOLS_SELECTOR = '[data-testid^="tsd-"], [aria-label="Open TanStack Devtools"]';

export function isExternalDevtoolsElement(el: Element): boolean {
  return el.closest(EXTERNAL_DEVTOOLS_SELECTOR) !== null;
}

export function hasVisibleDuration(animation: Animation): boolean {
  const duration = animation.effect?.getComputedTiming().duration;
  return typeof duration !== "number" || duration > INSTANT_EFFECT_CEILING_MS;
}

function animationTarget(animation: Animation): Element | null {
  const effect = animation.effect;
  const target = effect instanceof KeyframeEffect ? effect.target : null;
  return target instanceof Element ? target : null;
}

export function runningAnimations(): Animation[] {
  return document.getAnimations().filter((animation) => {
    const target = animationTarget(animation);
    return animation.playState === "running" && hasVisibleDuration(animation) && target !== null && !isExternalDevtoolsElement(target);
  });
}

export function runningLabels(animations: readonly Animation[]): string {
  const labels = new Set<string>();
  for (const animation of animations) {
    const target = animationTarget(animation);
    if (target !== null) {
      labels.add(surfaceLabelOf(target));
    }
  }
  const entries = [...labels];
  const visible = entries.slice(0, RUNNING_LABEL_CAP);
  const remaining = entries.length - visible.length;
  return entries.length === 0 ? "(no animated element)" : `${visible.join(" · ")}${remaining > 0 ? ` · +${remaining} more` : ""}`;
}
