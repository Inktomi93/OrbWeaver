// Tokens that name one purpose. A literal that equals one in value only is not owned by it: the census offers general tokens as owners and reports a scoped one as a candidate.
import type { ValueToken, ValueTokens } from "./tokens.ts";

// Read from the `$description` of each token in packages/ui/src/tokens/tokens.json, which holds no structured purpose field. A family row
// scopes a new step with no edit here. A test holds each row to a token the theme declares. The first matching row wins.
const SCOPED: readonly (readonly [RegExp, string])[] = [
  // `default` is the plain edge, the one general step; every other weight names what its edge marks.
  [
    /^--border-width-(?!default$)/u,
    "a named edge weight (a control root's border arithmetic, the avatar hairline, a rule that marks a state, a quoted block's spine)",
  ],
  [/^--size-/u, "a component's own dimension (icon ink, control height, avatar, switch, checkbox, slider, glyph, dot, preview, meter)"],
  [/^--width-/u, "a named surface width (dialog, sidebar, column, cell, popup, lane)"],
  [/^--height-/u, "a named surface height (scroll window, picker frame, placeholder)"],
  [/^--dimension-/u, "a shell geometry input (rail, chrome row, panel clamp, reading floor, device pixel)"],
  [/^--reading-/u, "a reading measure or bubble share"],
  [/^--blur-/u, "a glass recipe ingredient"],
  [/^--stroke-width-/u, "an icon stroke"],
  [/^--spacing-(?:glyph-gap|density-section-compact)$/u, "a pointer-conditional or density-conditional arm"],
  [/^--radius-(?:inset|bubble-.+|pill)$/u, "a sub-control mark or a named bubble corner"],
  [/^--(?:text|leading)-(?:field|field-dense|code-field|label-relaxed|micro)$/u, "a pointer-conditional form-field step or a named voice"],
  [/^--motion-(?:swap-deadline|shimmer|breathe|precip|transit|ambient)$/u, "one named animation"],
  // The whole group is opacity by meaning, never by number: a step names what its element is.
  [/^--opacity-/u, "one meaning of an element's opacity (receded, faint, disabled, dragging, loading, hover, grain)"],
  [/^--container-cq-(?:8|14|15|16|72)$/u, "an enlarged-text or single-site container step"],
  [/^--ease-spinner$/u, "the spinner stroke"],
];

/** Why a token owns one purpose only, or null for a general scale step or role. */
export const scopeOf = (name: string): string | null => SCOPED.find(([pattern]) => pattern.test(name))?.[1] ?? null;

/** The rows no token in the theme matches: a scope that outlived its token. */
export const staleScopes = (tokens: ValueTokens): readonly string[] =>
  SCOPED.filter(([pattern]) => !tokens.all.some((token) => pattern.test(token.name))).map(([pattern]) => pattern.source);

const GENERAL = new WeakMap<ValueTokens, ValueTokens>();

/** The tokens with the purpose-scoped ones removed, indexed like the input. */
export function generalTokens(tokens: ValueTokens): ValueTokens {
  const cached = GENERAL.get(tokens);
  if (cached !== undefined) {
    return cached;
  }
  const all = tokens.all.filter((token) => scopeOf(token.name) === null);
  const byValue = new Map<string, ValueToken[]>();
  for (const [key, held] of tokens.byValue) {
    const kept = held.filter((token) => scopeOf(token.name) === null);
    if (kept.length > 0) {
      byValue.set(key, kept);
    }
  }
  const general = { all, byValue };
  GENERAL.set(tokens, general);
  return general;
}
