// domain/rpg/tools/dice — the PURE dice-notation roller for `roll_dice` (rpg-design/05 §4.5). Zero state,
// zero I/O: parse `NdM(+/-K)` (e.g. `2d6+1`, `d20`, `3d8-2`) and roll each face via the INJECTED CSPRNG
// (`ctx.randomInt` — a uniform int in `[0, max)`; the roll is server-authoritative, bake-once, a client seed
// is never honored). Returns the total + the individual faces, or `null` on unparseable notation (the handler
// maps that to an errors-as-data denial). Bounds keep a hostile notation from minting a huge roll loop.

import type { DiceRoll } from "../contract/results.ts";

/** Max dice per roll + max faces per die — a pathological `9999d9999` is rejected (bounded parse, not a loop).
 *  MAX_MODIFIER bounds the third field for a DIFFERENT reason and it was missing (#1468 item 5): the modifier
 *  runs no loop, so nothing about it was expensive — it was the only field converted with a bare `Number(…)`
 *  and never range-checked, so `1d6+<309 digits>` parsed happily to `Infinity` and rode out in `total`. A
 *  `DiceRoll` is re-validated by nothing downstream, so that non-finite number reached the tool result and any
 *  tracker write derived from it. Same order of magnitude as MAX_FACES: a modifier a thousand past the dice is
 *  already not a roll anyone is making. */
const MAX_DICE = 100;
const MAX_FACES = 1000;
const MAX_MODIFIER = 1000;

/** `NdM(+/-K)`: optional count (default 1), `d`, faces, optional signed modifier. Case-insensitive.
 *
 *  EVERY DIGIT RUN IS LENGTH-BOUNDED, so no field can reach `Number`'s overflow at all — the bounds below then
 *  decide the *policy* on a well-formed but too-large value. Belt and braces deliberately: the regex makes the
 *  non-finite case UNREPRESENTABLE (a parse-level guarantee that survives someone loosening a bound), the
 *  MAX_* checks make the refusal legible at the one place a reader looks for it. 4 digits is one past every
 *  bound above. */
const NOTATION_RE = /^(\d{0,4})d(\d{1,4})([+-]\d{1,4})?$/iu;

/** One parsed dice expression. */
interface ParsedNotation {
  readonly count: number;
  readonly faces: number;
  readonly modifier: number;
}

/** Parse `NdM(+/-K)` into its parts, or `null` if it doesn't match / is out of bounds. */
function parseNotation(notation: string): ParsedNotation | null {
  const m = NOTATION_RE.exec(notation.trim());
  if (m === null) {
    return null;
  }
  const count = m[1] === "" || m[1] === undefined ? 1 : Number(m[1]);
  const faces = Number(m[2]);
  const modifier = m[3] === undefined ? 0 : Number(m[3]);
  if (count < 1 || count > MAX_DICE || faces < 1 || faces > MAX_FACES || Math.abs(modifier) > MAX_MODIFIER) {
    return null;
  }
  return { count, faces, modifier };
}

/** Roll `notation` via `randomInt` (a uniform int in `[0, max)`). Returns `null` on unparseable notation. */
export function rollNotation(notation: string, randomInt: (max: number) => number): DiceRoll | null {
  const parsed = parseNotation(notation);
  if (parsed === null) {
    return null;
  }
  const faces: number[] = [];
  for (let i = 0; i < parsed.count; i++) {
    faces.push(randomInt(parsed.faces) + 1); // [0, faces) → [1, faces]
  }
  const total = faces.reduce((sum, f) => sum + f, 0) + parsed.modifier;
  return { faces, total };
}
