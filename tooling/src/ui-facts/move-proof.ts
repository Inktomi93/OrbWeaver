// Whether moving one class off `className` onto a recipe prop renders the same; the rule and its proof are on `moveRefusal`.
import { conflicts, survives } from "./class-conflict.ts";
import type { ElementRef } from "./hand-model.ts";
import type { ComponentRecipe } from "./variant-tables.ts";
import type { Arm, ArmClasses } from "./variants.ts";

const ROOT_SLOT = "root";
const FALSE_ARM = "false";

interface Move {
  readonly token: string;
  readonly axis: string;
  readonly arm: string;
}

/** The arm an axis takes with no prop: its default, and `tailwind-variants` falls back to a `false` arm for an undefined prop. */
const restingArm = (axis: string, arms: ArmClasses, recipe: ComponentRecipe): string | undefined =>
  recipe.defaults.get(axis) ?? (arms.has(FALSE_ARM) ? FALSE_ARM : undefined);

/** The arms one later axis can take on this element: the door's own choice, a literal prop's arm, every arm for any other value, else its resting arm. */
function armsTaken(axis: string, arms: ArmClasses, element: ElementRef, recipe: ComponentRecipe): readonly Arm[] {
  const every = [...arms.values()];
  const choice = recipe.chosen.get(axis);
  const named = choice === undefined ? element.props[axis] : choice;
  if (named === undefined) {
    return [arms.get(restingArm(axis, arms, recipe) ?? "")].flatMap((resting) => resting ?? []);
  }
  const arm = named === null ? undefined : arms.get(named);
  return arm === undefined ? every : [arm];
}

const laterAxes = (axis: string, recipe: ComponentRecipe): readonly (readonly [string, ArmClasses])[] =>
  [...recipe.declared].slice([...recipe.declared.keys()].indexOf(axis) + 1);

/** Every class that renders after the axis's slot, by the words that name it in a refusal. */
function laterClasses(axis: string, element: ElementRef, recipe: ComponentRecipe): readonly (readonly [string, readonly string[]])[] {
  return [
    ["the class string", element.place.peers],
    ["the door", recipe.doorClasses.get(axis) ?? []],
    ["a compound variant", recipe.compounds.flatMap((compound) => compound.tokens)],
    ...laterAxes(axis, recipe).map(([name, arms]) => [`the ${name} axis`, armsTaken(name, arms, element, recipe).flatMap((arm) => arm.tokens)] as const),
  ];
}

function armRefusal({ token, axis, arm }: Move, written: Arm, recipe: ComponentRecipe): string | null {
  if (written.unread) {
    return `arm "${arm}" holds a name the reader cannot resolve, so it can write more than ${token}`;
  }
  if (written.slots.some((slot) => slot !== ROOT_SLOT)) {
    return `arm "${arm}" writes slots ${written.slots.join(", ")}; a class writes the element alone`;
  }
  if (recipe.sideReads.has(axis)) {
    return `the door reads ${axis} beyond the recipe, so the prop does more than write ${token}`;
  }
  if (recipe.compoundsUnread || recipe.compounds.some((compound) => compound.reads.includes(axis))) {
    return `a compound variant reacts to ${axis} or could not be read`;
  }
  const arms = recipe.declared.get(axis);
  const defaultArm = arms === undefined ? undefined : restingArm(axis, arms, recipe);
  const lost = defaultArm === arm ? [] : (arms?.get(defaultArm ?? "")?.tokens ?? []).filter((held) => survives(held, token));
  return lost.length === 0 ? null : `default arm "${defaultArm}" writes ${lost.join(" ")}, which the class leaves in place and the prop would drop`;
}

export function orderRefusal({ token, axis }: Move, element: ElementRef, recipe: ComponentRecipe): string | null {
  if (element.place.opaque !== null) {
    return `the class expression reads ${element.place.opaque}, which the reader cannot open`;
  }
  const later = laterAxes(axis, recipe);
  const unread = later.find(
    ([name, arms]) => (recipe.unread.has(name) && name in element.props) || armsTaken(name, arms, element, recipe).some((arm) => arm.unread),
  );
  if (unread !== undefined) {
    return `the element writes ${unread[0]}, an axis whose arms could not be fully read`;
  }
  for (const [where, classes] of laterClasses(axis, element, recipe)) {
    const rival = classes.find((written) => written !== token && conflicts(written, token));
    if (rival !== undefined) {
      return `${rival} from ${where} renders after the ${axis} slot and conflicts with ${token}`;
    }
  }
  return null;
}

/**
 * Why the move cannot be proved to render the same, or null when it is proved.
 *
 * @remarks
 * The merge order is table base, arms in declared axis order, compound classes, then `className`, and it is last-wins over the classes
 * that survive. Say T moves from the end to the slot of axis X. If T conflicts with nothing that renders after X's slot, T survives in
 * both positions, the later classes keep their fate because T touches none of them, and the earlier classes face the same survivors plus
 * T. The class set is unchanged, and class order does not reach the cascade. So a move is proved when no later class conflicts with T, and
 * the arm does exactly what the class did: one class, on the element, with no default arm, compound or attribute riding along.
 */
export function moveRefusal(move: Move, element: ElementRef, recipe: ComponentRecipe): string | null {
  const written = recipe.axes.get(move.axis)?.get(move.arm);
  if (written === undefined) {
    return `no arm ${move.arm} of ${move.axis} is read`;
  }
  const door = recipe.doorRefusals.get(move.axis) ?? (recipe.chosen.get(move.axis) === null ? `the door computes a default for ${move.axis}` : undefined);
  if (door !== undefined) {
    return door;
  }
  return armRefusal(move, written, recipe) ?? orderRefusal(move, element, recipe);
}
