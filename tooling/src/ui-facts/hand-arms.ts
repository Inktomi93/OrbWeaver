// A recipe axis owns a class only when the element's own component writes it: the arm is read from that component's `tv()` table, and the axis must be one the component forwards.
import { baseOf } from "./classes.ts";
import type { ElementRef, Judgement } from "./hand-model.ts";
import type { Elem } from "./source.ts";
import type { ComponentTables } from "./variant-tables.ts";
import type { ArmClasses } from "./variants.ts";

export interface DeclaredAxis {
  /** `component.axis`, the component in kebab case: `row.justify`. */
  readonly label: string;
  readonly component: string;
  readonly arms: ArmClasses;
}

const kebab = (name: string): string => name.replaceAll(/([a-z0-9])([A-Z])/gu, "$1-$2").toLowerCase();

/** The component an element renders, by the name its import exports: an aliased import still names its own table. */
const componentOf = (elem: Elem): string => elem.imported?.name ?? elem.tag;

/** The import a rewrite must prove for a primitive element; null for any other element. */
export function elementRefOf(elem: Elem | null): ElementRef | null {
  return elem?.kind === "ui" && elem.imported !== null && !elem.tag.includes(".")
    ? { source: elem.imported.source, name: elem.imported.name, carried: elem.carried }
    : null;
}

/** The first candidate axis the element's own component declares and forwards, with its arms; null when the element is not a primitive or declares none. */
export function declaredAxis(elem: Elem | null, candidates: readonly string[], components: ComponentTables): DeclaredAxis | null {
  const axes = elem?.kind === "ui" && elem.door !== null ? components.get(elem.door)?.get(componentOf(elem)) : undefined;
  const axis = candidates.find((candidate) => axes?.has(candidate) === true);
  if (elem === null || axes === undefined || axis === undefined) {
    return null;
  }
  const component = kebab(componentOf(elem));
  return { label: `${component}.${axis}`, component, arms: axes.get(axis) ?? new Map() };
}

/**
 * The verdict for a utility of an owned family on a component that declares no such axis, while another component of its door does:
 * the hit stays, with no arm to move it to. Null when the element is not a primitive or no component of its door has the axis.
 */
export function undeclaredJudgement(elem: Elem | null, token: string, axes: readonly string[], components: ComponentTables): Judgement | null {
  const door = elem?.kind === "ui" && elem.door !== null ? components.get(elem.door) : undefined;
  if (elem === null || door === undefined || ![...door.values()].some((table) => axes.some((axis) => table.has(axis)))) {
    return null;
  }
  const component = kebab(componentOf(elem));
  const own = door.get(componentOf(elem));
  return {
    verdict: "decide",
    match: null,
    owner: `no axis: ${token} on ${component}`,
    reason:
      own === undefined
        ? `${component} applies no tv() table in its own file, so no axis is read for ${token}`
        : `${component} declares no ${axes.join(" or ")} axis (its axes: ${[...own.keys()].join(", ")}), so ${token} has no arm to move to`,
    keep: null,
  };
}

/** An arm writes one unconditional class; a class under a variant, a ternary or `&&` is a conditional use. */
const conditionalMark = (token: string, guarded: boolean): string => (guarded || baseOf(token).variants !== "" ? ", conditional" : "");

/** The recipe verdict when an arm of the axis writes the class, else null. */
export function coveredJudgement(axis: DeclaredAxis, token: string, guarded: boolean): Judgement | null {
  const arm = [...axis.arms].find(([, written]) => written.includes(token))?.[0];
  return arm === undefined
    ? null
    : {
        verdict: "recipe",
        match: `${axis.label}.${arm}`,
        owner: `${axis.label}${conditionalMark(token, guarded)}`,
        reason: `arm "${arm}" of ${axis.label} writes ${token}`,
        keep: null,
      };
}

/** The verdict for a class the axis declares no arm for: a new arm when the axis writes this utility family, else no axis owns it. */
export function uncoveredJudgement(axis: DeclaredAxis, token: string, family: RegExp | null, guarded: boolean): Judgement {
  const arms = [...axis.arms.keys()].join(", ");
  const sameFamily = family !== null && [...axis.arms.values()].some((written) => written.some((armToken) => family.test(baseOf(armToken).base)));
  return sameFamily
    ? {
        verdict: "decide",
        match: null,
        owner: `new arm: ${axis.label}${conditionalMark(token, guarded)}`,
        reason: `${token} is not an arm of ${axis.label} (arms: ${arms})`,
        keep: null,
      }
    : {
        verdict: "decide",
        match: null,
        owner: `no axis: ${token} on ${axis.component}`,
        reason: `${axis.component} declares ${axis.label}, but none of its arms (${arms}) writes ${token}`,
        keep: null,
      };
}
