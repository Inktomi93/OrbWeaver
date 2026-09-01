// Animation-owner verdict policy. The browser bridge supplies raw target state and mechanism; this file
// revalidates the only library-owned allowance before it can leave the dirty budget. Raw populations are
// never rewritten, and old bundles without attribution remain ordinary unattributed failures.

import type { EvidenceGap } from "@orb/tooling/_shared/evidence";
import type { AnimationRecord } from "../contract/types.ts";

const SANCTIONED_LIBRARY_PROPERTIES = ["height"] as const;

function expectedBaseUiPhase(animation: AnimationRecord): "starting-style" | "ending-style" | null {
  const state = animation.lifecycleState;
  if (state === undefined || state === null || state.startingStyle === state.endingStyle) {
    return null;
  }
  return state.startingStyle ? "starting-style" : "ending-style";
}

function baseUiAttributionGap(animation: AnimationRecord): EvidenceGap | null {
  if (animation.attribution?.owner !== "base-ui") {
    return null;
  }
  const expectedPhase = expectedBaseUiPhase(animation);
  if (animation.attribution.mechanism === "css-transition" && expectedPhase !== null && animation.attribution.phase === expectedPhase) {
    return null;
  }
  const state = animation.lifecycleState;
  const stateText =
    state === undefined || state === null
      ? "starting=absent ending=absent observedAt=absent"
      : `starting=${state.startingStyle} ending=${state.endingStyle} observedAt=${state.observedAt}`;
  return {
    evidence: "Base UI animation attribution",
    detail: `${animation.target} claimed owner=base-ui mechanism=${animation.attribution.mechanism} phase=${animation.attribution.phase ?? "absent"}, but bound launch state was ${stateText}; a library-owned allowance requires one exact transition-run lifecycle state and its matching CSS-transition phase`,
  };
}

export function isSanctionedLibraryAnimation(animation: AnimationRecord): boolean {
  return (
    !animation.compositorClean &&
    animation.attribution?.owner === "base-ui" &&
    baseUiAttributionGap(animation) === null &&
    animation.properties.length === SANCTIONED_LIBRARY_PROPERTIES.length &&
    animation.properties.every((property, index) => property === SANCTIONED_LIBRARY_PROPERTIES[index])
  );
}

export interface AnimationTotals {
  readonly rawDirty: number;
  readonly sanctionedLibrary: number;
  readonly budgetedDirty: number;
  readonly gaps: readonly EvidenceGap[];
}

/** Raw/classified/budgeted animation populations plus fail-loud attribution contradictions. */
export function animationTotals(animations: readonly AnimationRecord[]): AnimationTotals {
  const dirty = animations.filter((animation) => !animation.compositorClean);
  const sanctionedLibrary = dirty.filter(isSanctionedLibraryAnimation).length;
  return {
    rawDirty: dirty.length,
    sanctionedLibrary,
    budgetedDirty: dirty.length - sanctionedLibrary,
    gaps: animations.map(baseUiAttributionGap).filter((gap): gap is EvidenceGap => gap !== null),
  };
}
