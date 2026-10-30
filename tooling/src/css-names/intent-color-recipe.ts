// D336: a colour recipe over an intent or tone colour is a generated tone role or an `orb.pigments` block. One reader
// finds an authored `color-mix()` or relative colour that names one, for the Stylelint and ESLint rules alike.

/** The colour functions that take a relative-colour origin (`oklch(from <origin> l c h)`). */
const RELATIVE_SPACES = ["rgb", "rgba", "hsl", "hsla", "hwb", "lab", "lch", "oklab", "oklch", "color"] as const;
const MIX = "color-mix";
// A function name, not the tail of a longer identifier (`--color-mix-x`, `my-rgb`).
const CALL = new RegExp(String.raw`(?<![\w-])(${[MIX, ...RELATIVE_SPACES].join("|")})\(`, "giu");
// A Tailwind arbitrary value spells a space as `_`, so `from_var(...)` is the same relative colour.
const RELATIVE_ORIGIN = /^[\s_]*from[\s_]/iu;

/** The argument text of the call whose `(` sits at `open`, balanced on parentheses; the rest of `css` when unclosed. */
function callArguments(css: string, open: number): string {
  let depth = 0;
  for (let index = open; index < css.length; index += 1) {
    if (css[index] === "(") {
      depth += 1;
    } else if (css[index] === ")") {
      depth -= 1;
      if (depth === 0) {
        return css.slice(open + 1, index);
      }
    }
  }
  return css.slice(open + 1);
}

/**
 * The first `color-mix()` or relative colour in `css` that names an intent colour (its base or its paired foreground)
 * or a `--color-tone-*` role, as written; `undefined` when there is none.
 *
 * @param intents - the intent colour names, each a `--color-<name>` token (the D336 tones that carry a base colour).
 */
export function intentColorRecipe(css: string, intents: readonly string[]): string | undefined {
  const target = new RegExp(String.raw`var\(\s*--color-(?:tone-[a-z0-9-]+|(?:${intents.join("|")})(?:-foreground)?)\s*[,)]`, "u");
  for (const call of css.matchAll(CALL)) {
    const name = (call[1] ?? "").toLowerCase();
    const open = call.index + call[0].length - 1;
    const args = callArguments(css, open);
    const recipe = name === MIX || RELATIVE_ORIGIN.test(args);
    if (recipe && target.test(args)) {
      return `${call[1] ?? ""}(${args})`;
    }
  }
  return undefined;
}
