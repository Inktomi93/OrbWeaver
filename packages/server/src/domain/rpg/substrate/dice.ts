// domain/rpg/substrate/dice — the rpg dice policy over the shared `@orb/kit/dice` notation: the `roll_dice` tool and
// the member `rollDice` verb judge rolls against RPG_DICE_BOUNDS and draw from the injected server CSPRNG only.
// The bounds narrow the kit table because every rpg roll returns each die face into a tool result or a stamp.

import type { DiceBounds, DiceNotation, DiceRoll } from "@orb/kit/dice";
import { diceNotationInBounds, parseDiceNotation, rollDiceNotation } from "@orb/kit/dice";

/** Each die face rides out in the roll, so the count stays a table roll rather than a ten-thousand-entry
 *  array, and faces and modifier stay at a size a game die and bonus actually take. */
const RPG_DICE_BOUNDS = { maxDice: 100, maxFaces: 1000, maxModifier: 1000 } as const satisfies DiceBounds;

/** Whether a parsed notation sits inside the rpg dice policy. */
export function rpgDiceInBounds(notation: DiceNotation): boolean {
  return diceNotationInBounds(notation, RPG_DICE_BOUNDS);
}

/** Roll `notation` via `randomInt` (a uniform int in `[0, max)`), or `null` when it does not parse or leaves
 *  the policy bounds; the tool maps that to an errors-as-data denial. */
export function rollNotation(notation: string, randomInt: (max: number) => number): DiceRoll | null {
  const parsed = parseDiceNotation(notation);
  return parsed === null || !rpgDiceInBounds(parsed) ? null : rollDiceNotation(parsed, randomInt);
}
