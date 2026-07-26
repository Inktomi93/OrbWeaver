// domain/rpg/tools/dice — the PURE dice-notation roller for `roll_dice` (rpg-design/05 §4.5). Zero state,
// zero I/O: parse `NdM(+/-K)` (e.g. `2d6+1`, `d20`, `3d8-2`) and roll each face via the INJECTED CSPRNG
// (`ctx.randomInt` — a uniform int in `[0, max)`; the roll is server-authoritative, bake-once, a client seed
// is never honored). Returns the total + the individual faces, or `null` on unparseable notation (the handler
// maps that to an errors-as-data denial). Bounds keep a hostile notation from minting a huge roll loop.

/** Max dice per roll + max faces per die — a pathological `9999d9999` is rejected (bounded parse, not a loop). */
const MAX_DICE = 100;
const MAX_FACES = 1000;

/** `NdM(+/-K)`: optional count (default 1), `d`, faces, optional signed modifier. Case-insensitive. */
const NOTATION_RE = /^(\d*)d(\d+)([+-]\d+)?$/iu;

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
  if (count < 1 || count > MAX_DICE || faces < 1 || faces > MAX_FACES) {
    return null;
  }
  return { count, faces, modifier };
}

/** The result of a roll — the per-die faces (before the modifier) + the summed total (with it). */
export interface DiceRoll {
  readonly faces: readonly number[];
  readonly total: number;
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
