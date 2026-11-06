// Tokens that name one purpose. A literal that equals one in value only is not owned by it: the census offers general tokens as owners and reports a scoped one as a candidate.
import type { ValueToken, ValueTokens } from "./tokens.ts";

// Read from the `$description` of each token in packages/ui/src/tokens/tokens.json. The first matching row wins.
const SCOPED: readonly (readonly [RegExp, string])[] = [
  [/^--border-width-control$/u, "a control root's border arithmetic (the Switch track)"],
  [/^--border-width-hairline$/u, "the avatar hairline over a background image"],
  [/^--border-width-accent$/u, "the accent edge (active rail marker, docked band binding, active tab indicator)"],
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
  [/^--opacity-receded$/u, "a receded element"],
  [/^--container-cq-(?:8|14|15|16|72)$/u, "an enlarged-text or single-site container step"],
  [/^--ease-spinner$/u, "the spinner stroke"],
];

/** Why a token owns one purpose only, or null for a general scale step or role. */
export const scopeOf = (name: string): string | null => SCOPED.find(([pattern]) => pattern.test(name))?.[1] ?? null;

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
