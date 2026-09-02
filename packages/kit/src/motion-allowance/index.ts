// THE RATIFIED-MOTION ALLOWANCE — the ONE home of "which non-compositor animation is sanctioned", shared
// by the two instruments that judge the same population from opposite sides of the cake (#1069, minted
// with #953's Base UI height allowance):
//   · PUSH — `packages/client/src/lib/motion-flaggers.ts`'s `[anim]` channel, which prints a console
//     verdict at `animationstart`/`transitionstart`.
//   · PULL — `tooling/src/motion-audit/lib/animations.ts`, whose dirty-animation budget gates an exit code.
// It lives in `kit` for the `dead-css` reason (that module's header states the same rule): both consumers
// must reach it, `client` and `tooling` cannot import each other, and the decision is PURE — a function of
// facts already captured, no DOM, no I/O, no domain. Two copies of this table is how the two instruments
// came to disagree about ratified behaviour in the first place: the audit sanctioned the accordion /
// collapsible height lifecycle (motion guide §4.2 item 3) while the console kept convicting it.
//
// IT SANCTIONS A LIFECYCLE, NOT A PROPERTY. `height` alone is never enough: the animation must be a Base
// UI CSS transition whose bound launch state is exactly one of the two `data-starting-style` /
// `data-ending-style` phases, and whose claimed phase matches that state. An application-authored height
// animation, or a Base UI claim whose lifecycle evidence contradicts it, stays dirty.

/** The property set a library-owned lifecycle animation may carry — Base UI's measured panel height. */
export const SANCTIONED_LIBRARY_PROPERTIES = ["height"] as const;
/** The only animation owner an allowance can be claimed for. */
export const SANCTIONED_ANIMATION_OWNER = "base-ui";
/** The only mechanism the allowance covers: a CSS transition attached to the library's lifecycle states. */
export const SANCTIONED_ANIMATION_MECHANISM = "css-transition";

/** The launch facts an allowance decision reads.
 *
 *  DELIBERATELY WIDER than either caller's own record type: `owner`/`mechanism`/`phase` are `string` here
 *  so this module does NOT re-spell the animation-vocabulary unions that
 *  `packages/client/src/lib/motion-animation-record.ts` (the producer, all fields required) and
 *  `tooling/src/motion-audit/contract/types.ts` (the wire read, older bundles tolerated) each own for
 *  their own tier. Both are structurally assignable to this shape, and the values this file cares about
 *  are the three constants above, which it compares against rather than re-declares. */
export interface SanctionableAnimation {
  /** Best-effort surface/component label of the animated target — carried for the gap sentence. */
  readonly target: string;
  readonly properties: readonly string[];
  readonly compositorClean: boolean;
  readonly lifecycleState?: {
    readonly startingStyle: boolean;
    readonly endingStyle: boolean;
    readonly observedAt?: string;
  } | null;
  readonly attribution?: {
    readonly owner: string;
    readonly mechanism: string;
    readonly phase?: string;
  };
}

/** The lifecycle phase the bound launch state proves, or `null` when it proves neither (absent evidence,
 *  or both/neither flag set — a state that cannot name one phase cannot back a phase claim). */
function expectedBaseUiPhase(animation: SanctionableAnimation): "starting-style" | "ending-style" | null {
  const state = animation.lifecycleState;
  if (state === undefined || state === null || state.startingStyle === state.endingStyle) {
    return null;
  }
  return state.startingStyle ? "starting-style" : "ending-style";
}

/** The contradiction between a `base-ui` attribution CLAIM and the lifecycle state actually bound at
 *  launch, as a sentence — `null` when the claim holds. Only the claim is judged: a non-Base-UI animation
 *  has nothing to contradict. Returned as text rather than a verdict object so the pull side can wrap it
 *  in its own `EvidenceGap` and the push side can print it, without either shape leaking into `kit`. */
export function baseUiAttributionMismatch(animation: SanctionableAnimation): string | null {
  if (animation.attribution?.owner !== SANCTIONED_ANIMATION_OWNER) {
    return null;
  }
  const expectedPhase = expectedBaseUiPhase(animation);
  if (animation.attribution.mechanism === SANCTIONED_ANIMATION_MECHANISM && expectedPhase !== null && animation.attribution.phase === expectedPhase) {
    return null;
  }
  const state = animation.lifecycleState;
  const stateText =
    state === undefined || state === null
      ? "starting=absent ending=absent observedAt=absent"
      : `starting=${String(state.startingStyle)} ending=${String(state.endingStyle)} observedAt=${state.observedAt ?? "absent"}`;
  return `${animation.target} claimed owner=${SANCTIONED_ANIMATION_OWNER} mechanism=${animation.attribution.mechanism} phase=${animation.attribution.phase ?? "absent"}, but bound launch state was ${stateText}; a library-owned allowance requires one exact transition-run lifecycle state and its matching CSS-transition phase`;
}

/** true ⇒ this dirty animation is the owner-accepted Base UI lifecycle one (#953) and leaves the budget.
 *  A compositor-clean animation is never "sanctioned" — it was never accused. */
export function isSanctionedLibraryAnimation(animation: SanctionableAnimation): boolean {
  return (
    !animation.compositorClean &&
    animation.attribution?.owner === SANCTIONED_ANIMATION_OWNER &&
    baseUiAttributionMismatch(animation) === null &&
    animation.properties.length === SANCTIONED_LIBRARY_PROPERTIES.length &&
    animation.properties.every((property, index) => property === SANCTIONED_LIBRARY_PROPERTIES[index])
  );
}
