// A recipe axis owns a class only when the element's own component writes it: every axis of that component's `tv()` table is searched,
// so a new axis needs no edit here, and the merger decides what counts as one utility family.
import ts from "typescript";
import { sameFamily } from "./class-conflict.ts";
import { baseOf } from "./classes.ts";
import type { ClassPlace, ElementRef, Judgement } from "./hand-model.ts";
import type { Elem } from "./source.ts";
import { attrString } from "./source.ts";
import type { ComponentRecipe, ComponentTables } from "./variant-tables.ts";
import type { Arm, ArmClasses } from "./variants.ts";

interface DeclaredAxis {
  /** `component.axis`, the component in kebab case: `row.justify`. */
  readonly label: string;
  readonly component: string;
  readonly arms: ArmClasses;
}

const ELEMENT_ONLY_ATTRIBUTES: ReadonlySet<string> = new Set(["className", "key", "ref", "children"]);
const MIN_FAMILY_CHOICES = 2;
const ROOT_SLOT = "root";
const MIN_STEP = /^@cq-(\d+):$/u;
const MIN_PART_WORN = 2;
const MECHANISM_DOORS = 4;
/** A zero step is structure, not a design number: the restricted-classes rule admits it, and no arm is asked for it. */
export const ZERO_STEP = /-0$/u;

/** The name a component takes in an owner label. */
export const kebab = (name: string): string => name.replaceAll(/([a-z0-9])([A-Z])/gu, "$1-$2").toLowerCase();

/** The component an element renders, by the name its import exports: an aliased import still names its own table. */
const componentOf = (elem: Elem): string => elem.imported?.name ?? elem.tag;

const recipeOf = (elem: Elem | null, components: ComponentTables): ComponentRecipe | undefined =>
  elem?.kind === "ui" && elem.door !== null ? components.get(elem.door)?.get(componentOf(elem)) : undefined;

/** The value of one attribute as the rewrite sees it: its text, `true` for a bare or literal flag, or null when the syntax cannot read it. */
export function attributeValue(attribute: ts.JsxAttribute): string | null {
  if (attribute.initializer === undefined) {
    return "true";
  }
  const expression = ts.isJsxExpression(attribute.initializer) ? attribute.initializer.expression : undefined;
  if (expression?.kind === ts.SyntaxKind.TrueKeyword || expression?.kind === ts.SyntaxKind.FalseKeyword) {
    return expression.getText();
  }
  return attrString(attribute) ?? null;
}

/** The import a rewrite must prove for a primitive element, with what the class sits beside; null for any other element. */
export function elementRefOf(elem: Elem | null, place: ClassPlace): ElementRef | null {
  if (elem?.kind !== "ui" || elem.imported === null || elem.tag.includes(".")) {
    return null;
  }
  const props = [...elem.attrs].filter(([name]) => !ELEMENT_ONLY_ATTRIBUTES.has(name)).map(([name, attribute]) => [name, attributeValue(attribute)] as const);
  return { source: elem.imported.source, name: elem.imported.name, carried: elem.carried, place, props: Object.fromEntries(props) };
}

const declaredAxis = (elem: Elem, axis: string, arms: ArmClasses): DeclaredAxis => {
  const component = kebab(componentOf(elem));
  return { label: `${component}.${axis}`, component, arms };
};

const armsOf = (arms: ArmClasses): readonly Arm[] => [...arms.values()];
const writesOnly = (arm: Arm, token: string): boolean => arm.tokens.length === 1 && arm.tokens[0] === token;

/**
 * The axis chooses within the class's utility family: every arm that writes anything writes that family, under a variant or not, and the
 * unconditional choices do not all agree. A class every arm repeats, such as the `relative` an art axis needs, is what the axis rides on, not what it picks.
 */
function picksFamily(arms: ArmClasses, base: string): boolean {
  const writing = armsOf(arms).filter((arm) => arm.tokens.length > 0);
  return writing.every((arm) => writesFamily(arm, base)) && new Set(writtenChoices(arms, base).flat()).size >= MIN_FAMILY_CHOICES;
}

const unconditional = (token: string): string => token.slice(baseOf(token).variants.length);
const writesFamily = (arm: Arm, base: string): boolean => arm.tokens.some((token) => sameFamily(unconditional(token), base));

const coveredBy = (from: readonly string[], onto: readonly string[]): boolean => from.every((token) => onto.some((other) => sameFamily(token, other)));

const plainArms = (arms: ArmClasses): readonly (readonly string[])[] =>
  armsOf(arms)
    .map((arm) => arm.tokens.filter((token) => baseOf(token).variants === ""))
    .filter((tokens) => tokens.length > 0);

/**
 * The writing arms are alternatives: each writes the same utility families. Arms that each compose a different set of classes are named
 * compositions, not a ramp, so a new class of the family is no arm of theirs. It decides that label alone: such an axis still picks its family.
 */
function alternatives(arms: ArmClasses): boolean {
  const plain = plainArms(arms);
  return plain.every((one) => coveredBy(one, plain[0] ?? []) && coveredBy(plain[0] ?? [], one));
}

/** One arm's families hold every other arm's, so a step that writes fewer of them (a bar's height alone beside squares) is still a step of this axis. */
function nested(arms: ArmClasses): boolean {
  const plain = plainArms(arms);
  return plain.some((widest) => plain.every((one) => coveredBy(one, widest)));
}

const VARIANT_STEP = /\d+/gu;
const variantStem = (token: string): string => baseOf(token).variants.replaceAll(VARIANT_STEP, "");

/** Every arm writes the same class under one kind of variant and the steps differ, as `stackBelow` does: that class at another step is a step of this ramp. */
function conditionalRamp(arms: ArmClasses, token: string): boolean {
  const stem = variantStem(token);
  const writing = armsOf(arms)
    .flatMap((arm) => arm.tokens)
    .filter((written) => variantStem(written) === stem && baseOf(written).base === baseOf(token).base);
  const every = armsOf(arms).filter((arm) => arm.tokens.length > 0);
  return stem !== "" && new Set(writing).size >= MIN_FAMILY_CHOICES && writing.length === every.flatMap((arm) => arm.tokens).length;
}

/** Each writing arm's classes in the family. An unconditional class only: an arm under a variant is not the axis's own choice. */
const writtenChoices = (arms: ArmClasses, base: string): readonly (readonly string[])[] =>
  armsOf(arms)
    .filter((arm) => arm.tokens.length > 0)
    .map((arm) => arm.tokens.filter((token) => baseOf(token).variants === "" && sameFamily(token, base)));

/** The element's own axis offers the family as a choice against an empty arm: `padding: { none: "p-0", tier: "" }` is a padding axis. */
function offersFamily(arms: ArmClasses, base: string): boolean {
  const written = writtenChoices(arms, base);
  return written.length === 1 && arms.size > 1 && (written[0]?.length ?? 0) > 0;
}

/** The arm lists more than one class and the element wears every one of them: the arm is what they write together. */
const wornWhole = (arm: Arm, token: string, siblings: readonly string[]): boolean =>
  arm.tokens.length > 1 && arm.tokens.includes(token) && arm.tokens.every((written) => written === token || siblings.includes(written));

/**
 * The axis of a component's recipe that owns the class: an arm writes it alone, writes it as the axis's choice in its family, or is a
 * multi-class arm whose every class the element wears (`siblings` are the classes written beside it).
 */
export function axisWriting(recipe: ComponentRecipe | undefined, token: string, siblings: readonly string[]): readonly [string, ArmClasses] | undefined {
  const axes = [...(recipe?.axes ?? [])];
  return (
    axes.find(([, arms]) => armsOf(arms).some((arm) => writesOnly(arm, token))) ??
    axes.find(([, arms]) => armsOf(arms).some((arm) => arm.tokens.includes(token)) && picksFamily(arms, token)) ??
    axes.find(([, arms]) => armsOf(arms).some((arm) => wornWhole(arm, token, siblings)))
  );
}

/** The arm of an axis that writes the class: one that writes it alone, else one the element wears whole, else the first that lists it. */
export function armWriting(arms: ArmClasses, token: string, siblings: readonly string[]): readonly [string, Arm] | undefined {
  const all = [...arms];
  return (
    all.find(([, candidate]) => writesOnly(candidate, token)) ??
    all.find(([, candidate]) => wornWhole(candidate, token, siblings)) ??
    all.find(([, candidate]) => candidate.tokens.includes(token))
  );
}

/** The axis that owns the class: an arm writes it alone, writes it as the axis's choice in its family, or is worn whole. Null when the element is not a primitive or no arm does. */
export function writingAxis(elem: Elem | null, token: string, siblings: readonly string[], components: ComponentTables): DeclaredAxis | null {
  const found = axisWriting(recipeOf(elem, components), token, siblings);
  return elem === null || found === undefined ? null : declaredAxis(elem, found[0], found[1]);
}

/** The axis whose ramp a class of this family belongs on, whether or not an arm writes the class: what the census asks a new arm of and what the lint refuses. */
export function axisChoosing(recipe: ComponentRecipe | undefined, token: string): readonly [string, ArmClasses] | undefined {
  const { base } = baseOf(token);
  return ZERO_STEP.test(base)
    ? undefined
    : [...(recipe?.axes ?? [])].find(([, arms]) => (picksFamily(arms, base) && alternatives(arms)) || conditionalRamp(arms, token));
}

const doorsWriting = (token: string, components: ComponentTables): number =>
  [...components.values()].filter((door) =>
    [...door.values()].some((recipe) => [...recipe.declared.values()].some((arms) => armsOf(arms).some((arm) => arm.tokens.includes(token)))),
  ).length;

/**
 * The arm a class is part of, when the element does not wear that arm whole. Two or more of an arm's classes worn together are that arm, whatever
 * they are. A class alone counts only when it carries the arm's meaning, and it does unless {@link MECHANISM_DOORS} or more doors write it: a class
 * that many unrelated primitives need, such as `relative` or `flex-1`, is the mechanism they ride on and names no arm. A zero step never reaches here.
 */
export function partArmJudgement(elem: Elem | null, token: string, siblings: readonly string[], components: ComponentTables): Judgement | null {
  const worn = (arm: Arm): number => arm.tokens.filter((written) => written === token || siblings.includes(written)).length;
  const rooted = [...(recipeOf(elem, components)?.axes ?? [])].flatMap(([axis, arms]) =>
    [...arms]
      .filter(([, arm]) => arm.tokens.length > 1 && arm.tokens.includes(token) && arm.slots.every((slot) => slot === ROOT_SLOT))
      .map(([name, arm]) => ({ axis, name, arm })),
  );
  const [best] = rooted.toSorted((left, right) => worn(right.arm) - worn(left.arm));
  if (elem === null || best === undefined || (worn(best.arm) < MIN_PART_WORN && doorsWriting(token, components) >= MECHANISM_DOORS)) {
    return null;
  }
  const label = `${kebab(componentOf(elem))}.${best.axis}.${best.name}`;
  return {
    verdict: "decide",
    match: null,
    owner: `part of: ${label}`,
    reason: `${token} is part of ${label}, which writes ${best.arm.tokens.join(" ")}`,
    keep: null,
  };
}

/** A class under a container step that says the same as an arm written from the other side: `flex-col @cq-32:flex-row` is `@max-cq-32:flex-col`. */
export function mirrorJudgement(elem: Elem | null, token: string, siblings: readonly string[], components: ComponentTables): Judgement | null {
  const step = MIN_STEP.exec(baseOf(token).variants)?.[1];
  const resting = step === undefined ? undefined : siblings.find((sibling) => baseOf(sibling).variants === "" && sameFamily(sibling, baseOf(token).base));
  const mirror = resting === undefined ? undefined : `@max-cq-${step}:${resting}`;
  const found =
    mirror === undefined
      ? undefined
      : [...(recipeOf(elem, components)?.axes ?? [])].find(([, arms]) => armsOf(arms).some((arm) => arm.tokens.includes(mirror)));
  if (elem === null || mirror === undefined || found === undefined) {
    return null;
  }
  const axis = declaredAxis(elem, found[0], found[1]);
  return {
    verdict: "decide",
    match: null,
    owner: `mirror of: ${axis.label}`,
    reason: `${resting} ${token} is ${mirror} written from the other side; ${axis.label} owns it`,
    keep: null,
  };
}

/** The verdict for a class of a family one of the element's axes picks within, when no arm writes the class itself; else null. */
export function newArmJudgement(elem: Elem | null, token: string, guarded: boolean, components: ComponentTables): Judgement | null {
  const recipe = recipeOf(elem, components);
  const { base } = baseOf(token);
  const axes = [...(recipe?.axes ?? [])];
  const found =
    axisChoosing(recipe, token) ?? axes.find(([, arms]) => picksFamily(arms, base) && nested(arms)) ?? axes.find(([, arms]) => offersFamily(arms, base));
  if (elem === null || found === undefined) {
    return null;
  }
  const axis = declaredAxis(elem, found[0], found[1]);
  return {
    verdict: "decide",
    match: null,
    owner: `new arm: ${axis.label}${conditionalMark(token, guarded)}`,
    reason: `${token} is not an arm of ${axis.label} (arms: ${[...axis.arms.keys()].join(", ")})`,
    keep: null,
  };
}

/**
 * The verdict for a class of a family another component of the door writes, on a component that declares no such axis: the hit stays,
 * with no arm to move it to. Null when the element is not a primitive or no component of its door writes the family.
 */
export function undeclaredJudgement(elem: Elem | null, token: string, components: ComponentTables): Judgement | null {
  const door = elem?.kind === "ui" && elem.door !== null ? components.get(elem.door) : undefined;
  const base = baseOf(token).base;
  const writer = [...(door?.values() ?? [])].flatMap((recipe) => [...recipe.axes]).find(([, arms]) => picksFamily(arms, base));
  if (elem === null || door === undefined || writer === undefined) {
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
        : `no axis of ${component} chooses ${base} as a ramp (its axes: ${[...own.axes.keys()].join(", ")}), so ${token} has no arm to move to`,
    keep: null,
  };
}

/** A class under a variant, a ternary or `&&` is a conditional use, so a new arm for it is a design call. */
const conditionalMark = (token: string, guarded: boolean): string => (guarded || baseOf(token).variants !== "" ? ", conditional" : "");

/** The recipe verdict for a class an arm of the axis writes, naming the slots when the arm is slot-keyed. */
export function coveredJudgement(axis: DeclaredAxis, token: string, guarded: boolean, siblings: readonly string[]): Judgement {
  const [arm, written] = armWriting(axis.arms, token, siblings) ?? ["", null];
  const slots = written === null || written.slots.length === 0 ? "" : ` in slots ${written.slots.join(", ")}`;
  return {
    verdict: "recipe",
    match: `${axis.label}.${arm}`,
    // An arm that writes the variant-prefixed class whole applies the same variant, so the prefix leaves the move exact; only a guard conditions it.
    owner: `${axis.label}${guarded ? ", conditional" : ""}`,
    reason: `arm "${arm}" of ${axis.label} writes ${token}${slots}`,
    keep: null,
  };
}
