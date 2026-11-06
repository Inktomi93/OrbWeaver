// Whether moving one class off `className` onto a recipe prop renders the same; the rule and its proof are on `moveRefusal`.
import { conflicts, survives } from "./class-conflict.ts";
import type { ElementRef } from "./hand-model.ts";
import type { ComponentRecipe } from "./variant-tables.ts";
import type { Arm, ArmClasses } from "./variants.ts";

const ROOT_SLOT = "root";

interface Move {
  readonly token: string;
  readonly axis: string;
  readonly arm: string;
}

const tokensOf = (arms: ArmClasses): readonly string[] => [...arms.values()].flatMap((arm) => arm.tokens);

/** The classes one later axis can write on this element: the arm a literal prop names, every arm for any other value, else its default. */
function writtenBy(axis: string, arms: ArmClasses, element: ElementRef, recipe: ComponentRecipe): readonly string[] {
  const written = element.props[axis];
  if (written === undefined) {
    return arms.get(recipe.defaults.get(axis) ?? "")?.tokens ?? [];
  }
  return written === null ? tokensOf(arms) : (arms.get(written)?.tokens ?? tokensOf(arms));
}

/** Every class that renders after the axis's slot, by the words that name it in a refusal. */
function laterClasses(axis: string, element: ElementRef, recipe: ComponentRecipe): readonly (readonly [string, readonly string[]])[] {
  const order = [...recipe.declared.keys()];
  const later = [...recipe.declared].slice(order.indexOf(axis) + 1);
  return [
    ["the class string", element.place.peers],
    ["the door", recipe.doorClasses.get(axis) ?? []],
    ["a compound variant", recipe.compounds.flatMap((compound) => compound.tokens)],
    ...later.map(([name, arms]) => [`the ${name} axis`, writtenBy(name, arms, element, recipe)] as const),
  ];
}

function armRefusal({ token, axis, arm }: Move, written: Arm, recipe: ComponentRecipe): string | null {
  if (written.slots.some((slot) => slot !== ROOT_SLOT)) {
    return `arm "${arm}" writes slots ${written.slots.join(", ")}; a class writes the element alone`;
  }
  if (recipe.sideReads.has(axis)) {
    return `the door reads ${axis} beyond the recipe, so the prop does more than write ${token}`;
  }
  if (recipe.compoundsUnread || recipe.compounds.some((compound) => compound.reads.includes(axis))) {
    return `a compound variant reacts to ${axis} or could not be read`;
  }
  const defaultArm = recipe.defaults.get(axis);
  const lost = defaultArm === arm ? [] : (recipe.declared.get(axis)?.get(defaultArm ?? "")?.tokens ?? []).filter((held) => survives(held, token));
  return lost.length === 0 ? null : `default arm "${defaultArm}" writes ${lost.join(" ")}, which the class leaves in place and the prop would drop`;
}

function orderRefusal({ token, axis }: Move, element: ElementRef, recipe: ComponentRecipe): string | null {
  if (element.place.opaqueBefore) {
    return `an expression before ${token} can carry a class that would land after the prop`;
  }
  const unread = [...recipe.declared.keys()]
    .slice([...recipe.declared.keys()].indexOf(axis) + 1)
    .find((name) => recipe.unread.has(name) && name in element.props);
  if (unread !== undefined) {
    return `the element writes ${unread}, an axis whose arms could not be fully read`;
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
  if (!recipe.classNameApplied) {
    return "the door does not hand className to the call that applies its recipe";
  }
  return armRefusal(move, written, recipe) ?? orderRefusal(move, element, recipe);
}
