// kit/dice — the one dice-notation parser and bound table, `NdM(+/-K)`, shared by the `{{roll}}` macro and the
// rpg dice policy. A caller may pass narrower bounds; `diceNotationInBounds` never lets one widen past DICE_BOUNDS.

/** One `NdM(+/-K)` expression's fields, each finite by construction. */
export interface DiceNotation {
  readonly count: number;
  readonly faces: number;
  readonly modifier: number;
}

/** The inclusive maxima a roll is judged against; dice and faces also have a floor of one. */
export interface DiceBounds {
  readonly maxDice: number;
  readonly maxFaces: number;
  readonly maxModifier: number;
}

/** One roll: each die's face before the modifier, and the total with it. */
export interface DiceRoll {
  readonly rolls: readonly number[];
  readonly total: number;
}

/** The widest roll any caller accepts. Dice and faces bound the draw loop a hostile card or tool argument can
 *  start; the modifier runs no loop, but an unbounded one would carry a non-finite total out of a roll. */
export const DICE_BOUNDS = { maxDice: 10_000, maxFaces: 10_000, maxModifier: 10_000 } as const satisfies DiceBounds;

// Every digit run is capped at the widest bound's width, so no field can parse to `Infinity`; the bounds then
// judge a well-formed value that is still too large.
const FIELD_DIGITS = String(Math.max(DICE_BOUNDS.maxDice, DICE_BOUNDS.maxFaces, DICE_BOUNDS.maxModifier)).length;
const NOTATION_RE = new RegExp(`^(\\d{0,${FIELD_DIGITS}})d(\\d{1,${FIELD_DIGITS}})([+-]\\d{1,${FIELD_DIGITS}})?$`, "iu");

/** Match `NdM(+/-K)` (count defaults to 1; case-insensitive; surrounding whitespace ignored) into its fields, or
 *  `null` when the shape does not match. No bound is judged here. */
export function parseDiceNotation(notation: string): DiceNotation | null {
  const match = NOTATION_RE.exec(notation.trim());
  if (match === null) {
    return null;
  }
  const [, count = "", faces = "", modifier] = match;
  return { count: count === "" ? 1 : Number(count), faces: Number(faces), modifier: modifier === undefined ? 0 : Number(modifier) };
}

/** Whether `notation` sits inside `bounds`, each clamped to {@link DICE_BOUNDS} so a policy can only narrow. */
export function diceNotationInBounds({ count, faces, modifier }: DiceNotation, bounds: DiceBounds = DICE_BOUNDS): boolean {
  return (
    count >= 1 &&
    count <= Math.min(bounds.maxDice, DICE_BOUNDS.maxDice) &&
    faces >= 1 &&
    faces <= Math.min(bounds.maxFaces, DICE_BOUNDS.maxFaces) &&
    Math.abs(modifier) <= Math.min(bounds.maxModifier, DICE_BOUNDS.maxModifier)
  );
}

/** Roll an in-bounds `notation`, one `randomInt(faces)` draw per die.
 *  @param randomInt - a uniform integer in `[0, max)`. */
export function rollDiceNotation({ count, faces, modifier }: DiceNotation, randomInt: (max: number) => number): DiceRoll {
  const rolls: number[] = [];
  for (let i = 0; i < count; i += 1) {
    rolls.push(randomInt(faces) + 1);
  }
  return { rolls, total: rolls.reduce((sum, face) => sum + face, 0) + modifier };
}
