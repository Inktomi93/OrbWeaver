// Active-animation bridge records. Base UI owns the `data-starting-style` / `data-ending-style`
// lifecycle; the app owns the transition properties it attaches to those states. Motion-audit needs
// both facts: a dirty property alone cannot distinguish the owner-accepted stock height lifecycle from
// an application-authored layout animation, while a state attribute alone must not exempt every popup,
// drawer, or toast property. Keep the raw browser facts here; tooling owns the narrow verdict policy.

import { surfaceLabelOf } from "./motion-stats.ts";

const ANIMATION_OWNERS = ["base-ui", "application", "unattributed"] as const;
type AnimationOwner = (typeof ANIMATION_OWNERS)[number];
const ANIMATION_MECHANISMS = ["css-transition", "css-animation", "web-animation", "unknown"] as const;
type AnimationMechanism = (typeof ANIMATION_MECHANISMS)[number];
const ANIMATION_PHASES = ["starting-style", "ending-style"] as const;
type AnimationPhase = (typeof ANIMATION_PHASES)[number];
const LIFECYCLE_OBSERVATION_SOURCES = ["transition-run"] as const;
type LifecycleObservationSource = (typeof LIFECYCLE_OBSERVATION_SOURCES)[number];

interface AnimationLifecycleState {
  readonly startingStyle: boolean;
  readonly endingStyle: boolean;
  readonly observedAt: LifecycleObservationSource;
}

interface AnimationAttribution {
  readonly owner: AnimationOwner;
  readonly mechanism: AnimationMechanism;
  readonly phase?: AnimationPhase;
}

export interface AnimationRecord {
  readonly id?: string;
  /** Best-effort surface/component label of the animated target. */
  readonly target: string;
  /** The animated property set (from the keyframes). */
  readonly properties: readonly string[];
  /** true when every animated property stays on the compositor. */
  readonly compositorClean: boolean;
  /** The live Base UI lifecycle state on the target at the exact animation sample. */
  readonly targetState: {
    readonly startingStyle: boolean;
    readonly endingStyle: boolean;
  };
  /** State bound to this exact animation at launch; null means no Base UI lifecycle was observed. */
  readonly lifecycleState: AnimationLifecycleState | null;
  /** Owner and mechanism derived from browser constructors plus exact launch provenance. */
  readonly attribution: AnimationAttribution;
}

// translate/scale/rotate are CSS Transforms L2 individual properties that Tailwind v4 compiles its
// scale-*/translate-* utilities to, and composite exactly like transform.
export const COMPOSITOR_SAFE_PROPS: ReadonlySet<string> = new Set(["transform", "opacity", "filter", "translate", "scale", "rotate"]);

// getKeyframes() injects computedOffset on every frame in addition to the authoring fields, so it must
// be dropped too or every animation reads as dirty.
const FRAME_CONTROL_KEYS = new Set(["offset", "computedOffset", "easing", "composite"]);
const STARTING_STYLE_ATTRIBUTE = "data-starting-style";
const ENDING_STYLE_ATTRIBUTE = "data-ending-style";

type PendingLifecycleState = Omit<AnimationLifecycleState, "observedAt">;
const pendingLifecycleByTarget = new WeakMap<Element, PendingLifecycleState>();
const lifecycleByAnimation = new WeakMap<Animation, AnimationLifecycleState>();
let lifecycleRecorderInstalled = false;

/** The animated CSS-property set, shared with the animation-start flagger. */
export function animatedProperties(effect: Animation["effect"]): string[] {
  const properties = new Set<string>();
  if (!(effect instanceof KeyframeEffect)) {
    return [];
  }
  for (const frame of effect.getKeyframes()) {
    for (const key of Object.keys(frame)) {
      if (!FRAME_CONTROL_KEYS.has(key)) {
        properties.add(key);
      }
    }
  }
  return [...properties];
}

function animationTarget(effect: Animation["effect"]): Element | null {
  if (!(effect instanceof KeyframeEffect)) {
    return null;
  }
  return effect.target instanceof Element ? effect.target : null;
}

function targetState(target: Element | null): AnimationRecord["targetState"] {
  return {
    startingStyle: target?.hasAttribute("data-starting-style") ?? false,
    endingStyle: target?.hasAttribute("data-ending-style") ?? false,
  };
}

function isCssTransition(animation: Animation): animation is CSSTransition {
  return typeof CSSTransition !== "undefined" && animation instanceof CSSTransition;
}

function isCssAnimation(animation: Animation): animation is CSSAnimation {
  return typeof CSSAnimation !== "undefined" && animation instanceof CSSAnimation;
}

function attribution(animation: Animation, lifecycleState: AnimationLifecycleState | null, target: Element | null): AnimationAttribution {
  if (isCssTransition(animation) && lifecycleState !== null && lifecycleState.startingStyle !== lifecycleState.endingStyle) {
    return {
      owner: "base-ui",
      mechanism: "css-transition",
      phase: lifecycleState.startingStyle ? "starting-style" : "ending-style",
    };
  }
  if (isCssTransition(animation)) {
    return { owner: "application", mechanism: "css-transition" };
  }
  if (isCssAnimation(animation)) {
    return { owner: "application", mechanism: "css-animation" };
  }
  return target === null ? { owner: "unattributed", mechanism: "unknown" } : { owner: "unattributed", mechanism: "web-animation" };
}

function observeLifecycleMutation(record: MutationRecord): void {
  if (!(record.target instanceof Element)) {
    return;
  }
  const previous = pendingLifecycleByTarget.get(record.target) ?? { startingStyle: false, endingStyle: false };
  if (record.attributeName === STARTING_STYLE_ATTRIBUTE && record.oldValue !== null && !record.target.hasAttribute(STARTING_STYLE_ATTRIBUTE)) {
    pendingLifecycleByTarget.set(record.target, { ...previous, startingStyle: true });
  }
  if (record.attributeName === ENDING_STYLE_ATTRIBUTE && record.oldValue === null && record.target.hasAttribute(ENDING_STYLE_ATTRIBUTE)) {
    pendingLifecycleByTarget.set(record.target, { ...previous, endingStyle: true });
  }
}

function bindLifecycleToRunningTransitions(event: TransitionEvent): void {
  if (!(event.target instanceof Element)) {
    return;
  }
  const pending = pendingLifecycleByTarget.get(event.target);
  if (pending === undefined) {
    return;
  }
  const lifecycleState: AnimationLifecycleState = { ...pending, observedAt: "transition-run" };
  for (const animation of event.target.getAnimations()) {
    if (isCssTransition(animation) && animation.transitionProperty === event.propertyName) {
      lifecycleByAnimation.set(animation, lifecycleState);
    }
  }
  // The observation belongs to this exact property launch. Binding every running transition on the node
  // would let an older application transition inherit the Base UI state that launched its sibling.
  pendingLifecycleByTarget.delete(event.target);
}

/** Install the dev-only launch recorder before an audited interaction. Idempotent for bridge/CT installs. */
export function installAnimationLifecycleRecorder(): void {
  if (lifecycleRecorderInstalled) {
    return;
  }
  lifecycleRecorderInstalled = true;
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      observeLifecycleMutation(record);
    }
  });
  observer.observe(document, {
    subtree: true,
    attributes: true,
    attributeOldValue: true,
    attributeFilter: [STARTING_STYLE_ATTRIBUTE, ENDING_STYLE_ATTRIBUTE],
  });
  document.addEventListener("transitionrun", bindLifecycleToRunningTransitions, true);
}

/** ONE animation's record — the raw browser facts, no verdict. Exported because the `[anim]` flagger
 *  attaches it at RAISE time (`motion-flaggers.ts`): `getAnimations()` is a SAMPLER, so a 130–360ms house
 *  transition is finished long before any end-of-window read, and a launch-time record is the only way a
 *  consumer can apply the same owner/lifecycle policy to a transition that already ended. Same builder as
 *  `activeAnimations` on purpose — two builders would drift into two attribution vocabularies, and the
 *  whole point is that tooling judges both populations with ONE unchanged policy. */
export function animationRecordOf(animation: Animation): AnimationRecord {
  const target = animationTarget(animation.effect);
  const lifecycleState = lifecycleByAnimation.get(animation) ?? null;
  const properties = animatedProperties(animation.effect);
  const record: AnimationRecord = {
    target: target === null ? "(no-element)" : surfaceLabelOf(target),
    properties,
    compositorClean: properties.length > 0 && properties.every((property) => COMPOSITOR_SAFE_PROPS.has(property)),
    targetState: targetState(target),
    lifecycleState,
    attribution: attribution(animation, lifecycleState, target),
  };
  return animation.id === "" ? record : { ...record, id: animation.id };
}

/** The currently active animations with owner, mechanism, lifecycle state, and compositor facts. */
export function activeAnimations(): readonly AnimationRecord[] {
  return document.getAnimations().map(animationRecordOf);
}
