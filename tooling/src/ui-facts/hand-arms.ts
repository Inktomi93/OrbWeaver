// A recipe axis owns a class only when the element's own component writes it: every axis of that component's `tv()` table is searched,
// so a new axis needs no edit here, and the merger decides what counts as one utility family.
import ts from "typescript";
import { sameFamily } from "./class-conflict.ts";
import { baseOf } from "./classes.ts";
import type { ClassPlace, ElementRef, Judgement } from "./hand-model.ts";
import { keepJudgement } from "./hand-model.ts";
import { plainLayout } from "./plain-layout.ts";
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
// Padding on one inline edge: a box's axis, so on a primitive that is no box it has no owner and stays a row.
const ONE_SIDED_INLINE = /^p[se]-/u;
/** A zero step is structure, not a design number: the restricted-classes rule admits it, and no arm is asked for it. */
const ZERO_STEP = /-0$/u;

/** The name a component takes in an owner label. */
export const kebab = (name: string): string => name.replaceAll(/([a-z0-9])([A-Z])/gu, "$1-$2").toLowerCase();

/** The `@orb/ui` component a class is written on: what the census and the lint both judge a class against. */
export interface Wearer {
  readonly door: string;
  readonly component: string;
}

/** One class as an element writes it. */
export interface WrittenClass {
  readonly token: string;
  /** A ternary or `&&` guards it. */
  readonly guarded: boolean;
  /** Every other class the same root writes. */
  readonly siblings: readonly string[];
}

/** The primitive an element renders, by the name its import exports: an aliased import still names its own table. Null for any other element. */
export const wearerOf = (elem: Elem | null): Wearer | null =>
  elem?.kind === "ui" && elem.door !== null ? { door: elem.door, component: elem.imported?.name ?? elem.tag } : null;

const recipeOf = (wearer: Wearer | null, components: ComponentTables): ComponentRecipe | undefined =>
  wearer === null ? undefined : components.get(wearer.door)?.get(wearer.component);

/** A slot-keyed arm lands on a part inside the component, so a className on the root never competes with it. */
export const onRoot = (arm: Arm): boolean => arm.slots.length === 0 || arm.slots.includes(ROOT_SLOT);

/** The axes that can write the element itself: the only ones a class on its root competes with. */
const rootAxes = (recipe: ComponentRecipe | undefined): readonly (readonly [string, ArmClasses])[] =>
  [...(recipe?.axes ?? [])].filter(([, arms]) => armsOf(arms).some(onRoot));

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

const declaredAxis = (wearer: Wearer, axis: string, arms: ArmClasses): DeclaredAxis => {
  const component = kebab(wearer.component);
  return { label: `${component}.${axis}`, component, arms };
};

const armsOf = (arms: ArmClasses): readonly Arm[] => [...arms.values()];
const writesOnly = (arm: Arm, token: string): boolean => arm.tokens.length === 1 && arm.tokens[0] === token;

/**
 * The axis chooses within the class's utility family: every arm that writes anything writes that family, and the unconditional choices do not all
 * agree. A steps ramp writes its one class only under a variant and chooses it too, so that class written plain, or under any other variant, is its
 * step. A class every arm repeats is what the axis rides on, not what it picks.
 */
function picksFamily(arms: ArmClasses, base: string): boolean {
  const writing = familyArmsOf(arms).filter((arm) => arm.tokens.length > 0);
  return (
    writing.every((arm) => writesFamily(arm, base)) && (stepsRamp(arms)?.base === base || new Set(writtenChoices(arms, base).flat()).size >= MIN_FAMILY_CHOICES)
  );
}

const unconditional = (token: string): string => token.slice(baseOf(token).variants.length);

/** The two logical edges that spell one physical axis: `-ms-*` with `-me-*` is `-mx-*`, and `ps-*` with `pe-*` is `px-*`. */
const EDGE_PAIRS = [
  { axis: "mx", edges: ["ms", "me"] },
  { axis: "px", edges: ["ps", "pe"] },
] as const;

const edgeOf = (token: string): string => baseOf(token).base.split("-")[0] ?? "";

/**
 * An arm that writes both edges of an axis on its own chooses in that axis's family, as a message card's `reach` writes its own insets: the pair stands for
 * one class of the physical family. Applied to family questions only; an exact class match reads the arm as written.
 */
function foldEdgePairs(arm: Arm): Arm {
  let tokens = arm.tokens;
  for (const { axis, edges } of EDGE_PAIRS) {
    const plain = tokens.filter((token) => baseOf(token).variants === "" && edges.some((edge) => edge === edgeOf(token)));
    if (edges.every((edge) => plain.some((token) => edgeOf(token) === edge))) {
      tokens = [...tokens.filter((token) => !plain.includes(token)), `${axis}-(--edge-pair)`];
    }
  }
  return tokens === arm.tokens ? arm : { ...arm, tokens };
}

const familyArmsOf = (arms: ArmClasses): readonly Arm[] => armsOf(arms).map(foldEdgePairs);

const writesFamily = (arm: Arm, base: string): boolean => arm.tokens.some((token) => sameFamily(unconditional(token), base));

const coveredBy = (from: readonly string[], onto: readonly string[]): boolean => from.every((token) => onto.some((other) => sameFamily(token, other)));

const plainArms = (arms: ArmClasses): readonly (readonly string[])[] =>
  familyArmsOf(arms)
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

/** An axis whose every arm writes one class, under one kind of variant at different steps or with no variant at all, as `stackBelow` and `reverse` do. */
function stepsRamp(arms: ArmClasses): { readonly stem: string; readonly base: string } | undefined {
  const written = armsOf(arms).flatMap((arm) => arm.tokens);
  const stepped = written.filter((token) => variantStem(token) !== "");
  const [first] = stepped;
  if (first === undefined) {
    return undefined;
  }
  const stem = variantStem(first);
  const { base } = baseOf(first);
  const sameClass = written.every((token) => baseOf(token).base === base) && stepped.every((token) => variantStem(token) === stem);
  return sameClass && new Set(stepped).size >= MIN_FAMILY_CHOICES ? { stem, base } : undefined;
}

/** Each writing arm's classes in the family. An unconditional class only: an arm under a variant is not the axis's own choice. */
const writtenChoices = (arms: ArmClasses, base: string): readonly (readonly string[])[] =>
  familyArmsOf(arms)
    .filter((arm) => arm.tokens.length > 0)
    .map((arm) => arm.tokens.filter((token) => baseOf(token).variants === "" && sameFamily(token, base)));

/**
 * The element's own axis offers the family as a choice against an empty arm: `padding: { none: "p-0", tier: "" }` is a padding axis. The one
 * arm that writes anything writes only that family; an arm of several families (`invisible absolute pointer-events-none`) is a composition.
 */
function offersFamily(arms: ArmClasses, base: string): boolean {
  const written = writtenChoices(arms, base);
  const writing = familyArmsOf(arms).filter((arm) => arm.tokens.length > 0);
  return (
    written.length === 1 &&
    arms.size > 1 &&
    (written[0]?.length ?? 0) > 0 &&
    writing.every((arm) => arm.tokens.every((token) => sameFamily(unconditional(token), base)))
  );
}

/** The arm lists more than one class and the element wears every one of them: the arm is what they write together. */
const wornWhole = (arm: Arm, token: string, siblings: readonly string[]): boolean =>
  arm.tokens.length > 1 && arm.tokens.includes(token) && arm.tokens.every((written) => written === token || siblings.includes(written));

/**
 * The axis of a component's recipe that owns the class: an arm writes it alone, is a multi-class arm whose every class the element wears
 * (`siblings` are the classes written beside it), or writes it as the axis's choice in its family. The arm worn whole is the more
 * specific claim, so it outranks a family choice on another axis. A composition that merely lists the class (`artPane` lists a fraction width) never
 * owns it while a ramp of the family exists: the class is a new arm of that ramp.
 */
export function axisWriting(recipe: ComponentRecipe | undefined, token: string, siblings: readonly string[]): readonly [string, ArmClasses] | undefined {
  const axes = [...(recipe?.axes ?? [])];
  const ramp = axisChoosing(recipe, token);
  return (
    axes.find(([, arms]) => armsOf(arms).some((arm) => writesOnly(arm, token))) ??
    axes.find(([, arms]) => armsOf(arms).some((arm) => wornWhole(arm, token, siblings))) ??
    axes.find(([, arms]) => armsOf(arms).some((arm) => arm.tokens.includes(token)) && picksFamily(arms, token) && (ramp === undefined || alternatives(arms)))
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
export function writingAxis(wearer: Wearer | null, token: string, siblings: readonly string[], components: ComponentTables): DeclaredAxis | null {
  const found = axisWriting(recipeOf(wearer, components), token, siblings);
  return wearer === null || found === undefined ? null : declaredAxis(wearer, found[0], found[1]);
}

/** The axis whose ramp a class of this family belongs on, whether or not an arm writes the class: what the census asks a new arm of and what the lint refuses. */
export function axisChoosing(recipe: ComponentRecipe | undefined, token: string): readonly [string, ArmClasses] | undefined {
  const { base } = baseOf(token);
  return ZERO_STEP.test(base) ? undefined : rootAxes(recipe).find(([, arms]) => picksFamily(arms, base) && alternatives(arms));
}

/** The class tells this arm from its siblings: an arm beside it does not write it, or the arm stands alone against the prop's absence. */
const tellsArmsApart = (arms: ArmClasses, token: string): boolean => {
  const writing = armsOf(arms).filter((arm) => arm.tokens.length > 0);
  return writing.length === 1 || writing.some((arm) => !arm.tokens.includes(token));
};

/** A class every arm of an axis writes beside others: alone it says the axis is wanted and names no arm of it, as `sticky` does for `pinned`. */
function ridesJudgement(wearer: Wearer | null, token: string, components: ComponentTables): Judgement | null {
  const found = rootAxes(recipeOf(wearer, components)).find(([, arms]) => {
    const writing = armsOf(arms).filter((arm) => arm.tokens.length > 0);
    return writing.length > 1 && writing.every((arm) => arm.tokens.length > 1 && arm.tokens.includes(token));
  });
  if (wearer === null || found === undefined) {
    return null;
  }
  const axis = declaredAxis(wearer, found[0], found[1]);
  return {
    verdict: "decide",
    match: null,
    owner: `rides on: ${axis.label}`,
    reason: `${token} is what ${axis.label} rides on, so it names no arm; the element wants an arm of ${axis.label} (arms: ${[...axis.arms.keys()].join(", ")})`,
    keep: null,
  };
}

/**
 * The arm a class is part of, when the element does not wear that arm whole: the arm writes it beside other classes on the element itself, and
 * the class tells that arm from its siblings. A zero step never reaches here.
 */
function partArmJudgement(wearer: Wearer | null, token: string, siblings: readonly string[], components: ComponentTables): Judgement | null {
  const worn = (arm: Arm): number => arm.tokens.filter((written) => written === token || siblings.includes(written)).length;
  const rooted = rootAxes(recipeOf(wearer, components))
    .filter(([, arms]) => tellsArmsApart(arms, token))
    .flatMap(([axis, arms]) =>
      [...arms].filter(([, arm]) => arm.tokens.length > 1 && arm.tokens.includes(token) && onRoot(arm)).map(([name, arm]) => ({ axis, name, arm })),
    );
  const [best] = rooted.toSorted((left, right) => worn(right.arm) - worn(left.arm));
  if (wearer === null || best === undefined) {
    return null;
  }
  const label = `${kebab(wearer.component)}.${best.axis}.${best.name}`;
  return {
    verdict: "decide",
    match: null,
    owner: `part of: ${label}`,
    reason: `${token} is part of ${label}, which writes ${best.arm.tokens.join(" ")}`,
    keep: null,
  };
}

/** A class under a container step that says the same as an arm written from the other side: `flex-col @cq-32:flex-row` is `@max-cq-32:flex-col`. */
function mirrorJudgement(wearer: Wearer | null, token: string, siblings: readonly string[], components: ComponentTables): Judgement | null {
  const step = MIN_STEP.exec(baseOf(token).variants)?.[1];
  const resting = step === undefined ? undefined : siblings.find((sibling) => baseOf(sibling).variants === "" && sameFamily(sibling, baseOf(token).base));
  const mirror = resting === undefined ? undefined : `@max-cq-${step}:${resting}`;
  const found =
    mirror === undefined ? undefined : rootAxes(recipeOf(wearer, components)).find(([, arms]) => armsOf(arms).some((arm) => arm.tokens.includes(mirror)));
  if (wearer === null || mirror === undefined || found === undefined) {
    return null;
  }
  const axis = declaredAxis(wearer, found[0], found[1]);
  return {
    verdict: "decide",
    match: null,
    owner: `mirror of: ${axis.label}`,
    reason: `${resting} ${token} is ${mirror} written from the other side; ${axis.label} owns it`,
    keep: null,
  };
}

/** The verdict for a class of a family one of the element's axes picks within, when no arm writes the class itself; else null. */
function newArmJudgement(wearer: Wearer | null, token: string, guarded: boolean, components: ComponentTables): Judgement | null {
  const recipe = recipeOf(wearer, components);
  const { base } = baseOf(token);
  const axes = rootAxes(recipe);
  const found =
    axisChoosing(recipe, token) ?? axes.find(([, arms]) => picksFamily(arms, base) && nested(arms)) ?? axes.find(([, arms]) => offersFamily(arms, base));
  if (wearer === null || found === undefined) {
    return null;
  }
  const axis = declaredAxis(wearer, found[0], found[1]);
  return {
    verdict: "decide",
    match: null,
    owner: `new arm: ${axis.label}${conditionalMark(token, guarded)}`,
    reason: `${token} is not an arm of ${axis.label} (arms: ${[...axis.arms.keys()].join(", ")})`,
    keep: null,
  };
}

/** The class is of the family a steps ramp writes under its variant. */
function rampFamily(arms: ArmClasses, base: string): boolean {
  const ramp = stepsRamp(arms);
  return ramp !== undefined && sameFamily(base, ramp.base);
}

/**
 * A class of the family a steps ramp writes, at another value, plain or under a variant (`flex-col-reverse` beside `stackBelow`'s `@max-cq-32:flex-col`).
 * It is no step of that ramp, whose meaning is the one class, so it asks for an axis of its own.
 */
function besideJudgement(wearer: Wearer | null, token: string, components: ComponentTables): Judgement | null {
  const { base } = baseOf(token);
  const found = rootAxes(recipeOf(wearer, components)).find(([, arms]) => rampFamily(arms, base));
  if (wearer === null || found === undefined) {
    return null;
  }
  const axis = declaredAxis(wearer, found[0], found[1]);
  return {
    verdict: "decide",
    match: null,
    owner: `new axis beside: ${axis.label}`,
    reason: `${token} is ${base}, a different value of the family ${axis.label} writes, so no step of it`,
    keep: null,
  };
}

/** What the component's own base writes that the class evicts: the class changes what the primitive is. */
const baseEvicted = (recipe: ComponentRecipe | undefined, base: string): string | undefined =>
  recipe?.base.find((written) => written !== base && sameFamily(written, base));

/** A class that evicts the component's base and that a sibling of its door is built on: `grid` on a Stack is a Grid, so that sibling is the element. */
function siblingBaseJudgement(wearer: Wearer | null, token: string, components: ComponentTables): Judgement | null {
  const { base } = baseOf(token);
  const held = baseEvicted(recipeOf(wearer, components), base);
  const door = wearer === null ? undefined : components.get(wearer.door);
  const sibling = held === undefined ? undefined : [...(door ?? [])].find(([, recipe]) => recipe.base.includes(base));
  if (wearer === null || sibling === undefined) {
    return null;
  }
  const component = kebab(wearer.component);
  return {
    verdict: "decide",
    match: null,
    owner: `another primitive: ${token} on ${component} is ${kebab(sibling[0])}`,
    reason: `${token} overrides the ${held ?? ""} that ${component} is built on, and ${sibling[0]} is built on ${base}: that element is a ${sibling[0]}`,
    keep: null,
  };
}

const CONTAINING_BLOCK = "relative";

/** A side inset on a primitive whose door writes none: the box around it owns the inset. */
function sideInsetJudgement(wearer: Wearer | null, token: string): Judgement | null {
  if (wearer === null || !ONE_SIDED_INLINE.test(baseOf(token).base)) {
    return null;
  }
  const component = kebab(wearer.component);
  return {
    verdict: "decide",
    match: null,
    owner: `no axis: ${token} on ${component}`,
    reason: `${component} is no layout box, so ${token} has no arm to move to; a box around it owns the inset`,
    keep: null,
  };
}

const noAxis = (wearer: Wearer, token: string, own: ComponentRecipe | undefined): Judgement => {
  const component = kebab(wearer.component);
  return {
    verdict: "decide",
    match: null,
    owner: `no axis: ${token} on ${component}`,
    reason:
      own === undefined
        ? `${component} applies no tv() table in its own file, so no axis is read for ${token}`
        : `no axis of ${component} chooses ${baseOf(token).base} as a ramp (its axes: ${[...own.axes.keys()].join(", ")}), so ${token} has no arm to move to`,
    keep: null,
  };
};

const doorPicks = (door: ReadonlyMap<string, ComponentRecipe> | undefined, base: string): boolean =>
  [...(door?.values() ?? [])].some((recipe) => rootAxes(recipe).some(([, arms]) => picksFamily(arms, base) || rampFamily(arms, base)));

/** The verdict for a class of a family a sibling in the element's own door chooses, on a component that declares no such axis: the sibling is the home. */
function ownDoorJudgement(wearer: Wearer | null, token: string, components: ComponentTables): Judgement | null {
  const door = wearer === null ? undefined : components.get(wearer.door);
  return wearer !== null && doorPicks(door, baseOf(token).base) ? noAxis(wearer, token, door?.get(wearer.component)) : null;
}

/**
 * The verdict for every class a door's table can name an owner for: what the lint refuses and the census reports. A class no arm writes is a new arm,
 * the mirror of one, beside a ramp, part of an arm, against the base, its door's sibling's, or another door's. Null for a mechanism the plain-layout
 * rule admits, or when no table chooses its family.
 */
export function ownerRow(wearer: Wearer | null, { token, guarded, siblings }: WrittenClass, components: ComponentTables): Judgement | null {
  if (ZERO_STEP.test(baseOf(token).base)) {
    return null;
  }
  const chosen =
    mirrorJudgement(wearer, token, siblings, components) ?? newArmJudgement(wearer, token, guarded, components) ?? besideJudgement(wearer, token, components);
  if (chosen !== null) {
    return chosen;
  }
  if (baseOf(token).base === CONTAINING_BLOCK) {
    return keepJudgement("containing-block", token);
  }
  return plainLayout(token)
    ? null
    : (partArmJudgement(wearer, token, siblings, components) ??
        ridesJudgement(wearer, token, components) ??
        siblingBaseJudgement(wearer, token, components) ??
        sideInsetJudgement(wearer, token) ??
        ownDoorJudgement(wearer, token, components) ??
        homelessRow(wearer, token, components));
}

/**
 * The verdict for a class the tables show has no home here: it fights the component's base, or only another door's axes choose its family. The primitive
 * wants an axis for it, or the caller wants a box around it.
 */
function homelessRow(wearer: Wearer | null, token: string, components: ComponentTables): Judgement | null {
  const { base } = baseOf(token);
  if (wearer === null || ZERO_STEP.test(base)) {
    return null;
  }
  const held = baseEvicted(recipeOf(wearer, components), base);
  const component = kebab(wearer.component);
  if (held !== undefined) {
    return {
      verdict: "decide",
      match: null,
      owner: `against base: ${component} writes ${held}`,
      reason: `${token} overrides the ${held} that ${component} is built on; ${component} wants an axis for it`,
      keep: null,
    };
  }
  return [...components.values()].some((door) => doorPicks(door, base)) ? noAxis(wearer, token, recipeOf(wearer, components)) : null;
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
