// A recipe axis owns a class only when one of its declared arms writes it. The arms are read from the `tv()` source, never assumed from the axis name.
import { baseOf } from "./classes.ts";
import type { Judgement } from "./hand-model.ts";
import type { Elem } from "./source.ts";
import type { ArmClasses, DeclaredVariants } from "./variants.ts";

export interface DeclaredAxis {
  /** `door.axis`. */
  readonly label: string;
  readonly door: string;
  readonly arms: ArmClasses;
}

/** The first candidate axis the element's door declares, with its arms; null when the element is not a primitive or declares none. */
export function declaredAxis(elem: Elem | null, candidates: readonly string[], declared: DeclaredVariants): DeclaredAxis | null {
  if (elem?.kind !== "ui" || elem.door === null) {
    return null;
  }
  const door = declared.carriers.get(elem.door) ?? elem.door;
  const axes = declared.axes.get(door);
  const axis = candidates.find((candidate) => axes?.has(candidate) === true);
  return axis === undefined ? null : { label: `${door}.${axis}`, door, arms: declared.arms.get(door)?.get(axis) ?? new Map() };
}

/** The recipe verdict when an arm of the axis writes the class, else null. */
export function coveredJudgement(axis: DeclaredAxis, token: string): Judgement | null {
  const arm = [...axis.arms].find(([, written]) => written.includes(token))?.[0];
  return arm === undefined
    ? null
    : { verdict: "recipe", match: `${axis.label}.${arm}`, owner: axis.label, reason: `arm "${arm}" of ${axis.label} writes ${token}`, keep: null };
}

/** The verdict for a class the axis declares no arm for: a new arm when the axis writes this utility family, else no axis owns it. */
export function uncoveredJudgement(axis: DeclaredAxis, token: string, family: RegExp | null): Judgement {
  const arms = [...axis.arms.keys()].join(", ");
  const sameFamily = family !== null && [...axis.arms.values()].some((written) => written.some((armToken) => family.test(baseOf(armToken).base)));
  // An arm writes one unconditional class; a class under a variant (a container step, a state) is a conditional arm.
  const conditional = baseOf(token).variants === "" ? "" : ", conditional";
  return sameFamily
    ? {
        verdict: "decide",
        match: null,
        owner: `new arm: ${axis.label}${conditional}`,
        reason: `${token} is not an arm of ${axis.label} (arms: ${arms})`,
        keep: null,
      }
    : {
        verdict: "decide",
        match: null,
        owner: `no axis: ${token} on ${axis.door}`,
        reason: `${axis.door} declares ${axis.label}, but none of its arms (${arms}) writes ${token}`,
        keep: null,
      };
}
