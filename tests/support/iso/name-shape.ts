// The pattern a production label function's names share, so a spec that finds a control by its shape (any row's
// actions, any member's row) builds the pattern from the function instead of typing the function's words.

// No production label spells a NUL, so a filled hole is the only place it can appear.
const HOLE = "\u0000";

/** A whole-name pattern for every output of `build`, each hole matching one or more characters. `build` receives the hole
 *  for each argument it fills, so `nameShape((hole) => rowActionsName(hole))` is `/^Actions for .+$/u`. */
export function nameShape(build: (hole: string) => string): RegExp {
  const pieces = build(HOLE).split(HOLE);
  if (pieces.length < 2) {
    throw new Error(`nameShape: the label function never spliced the hole in, so it has one output: ${pieces.join("")}`);
  }
  return new RegExp(`^${pieces.map((piece) => RegExp.escape(piece)).join(".+")}$`, "u");
}
