// Deterministic per-entity fallback-hue derivation, exported so a feature painting fallback identity
// art OUTSIDE the sealed <Avatar> gets the SAME color from the SAME seed. `avatar.tsx` consumes this too.
//
// IN-BAND BY CONSTRUCTION (#103, owner-ruled 2026-08-16 from decision #100). The buckets used to be the
// five CATEGORICAL chart hues — purple / green / salmon / teal / olive — chosen for mutual
// distinguishability in a scatter plot and therefore, by construction, spread across the wheel and
// indifferent to the palette around them. On a phone's home screen a column of them was the loudest thing
// on the page and the only element that belonged to no theme. They now derive from the ACTIVE THEME's own
// `--color-primary`: warm ambers under Hearth, cool blues under Mocha, Light's own darker amber under
// Light — and a duplicated-or-imported owner theme (D71) lands in ITS band with no extra work, because
// the derivation never names a hue at all.
//
// WHY A RELATIVE-COLOR EXPRESSION AND NOT FIVE TOKENS (the mechanism, so nobody "simplifies" it back).
// `oklch(from var(--color-primary) …)` is substituted at COMPUTED-VALUE TIME on the element that uses it,
// so it picks up whichever `--color-primary` is in scope THERE. Five `--color-avatar-N` tokens in
// tokens.json would be substituted on `:root` instead (Tailwind's `@theme` emits there), which resolves
// the BASE palette and silently ignores the app-shell's own `<ThemeScope>` — i.e. exactly the
// custom/imported-theme case the ruling names. The theme law's derive-from-one-picked-value principle is
// the same one the ThemeScope clamp uses for the whole neutral ramp (UI-Theming-and-Content.md §12.1).
//
// DIFFERENTIATION IS LIGHTNESS × CHROMA, NEVER HUE (the ruling, verbatim: "vary lightness/chroma within
// the band, not hue across the wheel, so entities stay tellable-apart without leaving register"). The
// deltas are RELATIVE (`calc(l + Δ)`, `calc(c * k)`) and a bucket is never pinned to an absolute
// lightness, so no palette can be pushed out of its own contrast pairing. The window's measured shape —
// and why it is darken-only rather than symmetric — is on `AVATAR_HUE_STEPS` below.

const AVATAR_HUES = ["1", "2", "3", "4", "5"] as const;
export type AvatarFallbackHue = (typeof AVATAR_HUES)[number];
const HUE_BUCKETS = AVATAR_HUES.length;
const DJB2_SEED = 5381;
const DJB2_MULT = 33;
// Reduce mod (2^31 - 1) so the running hash stays a bounded, exact integer (no float-precision drift).
const HASH_MOD = 2_147_483_647;

/** The five in-band steps: a lightness offset and a chroma multiplier applied to the theme's own primary.
 *
 *  THE WINDOW IS DARKEN-ONLY (−0.085 … 0), and that is measured, not taste. `--color-primary-foreground`
 *  is the ink on every bucket, and its polarity flips per palette: on Light the ink is near-white, so
 *  LIGHTENING the fill walks it toward the text (a +0.06 step measured 3.78:1, a +0.09 step 3.45:1 — both
 *  under WCAG AA). Darkening is the one direction that is safe on a light palette and merely costs margin
 *  on a dark one (Hearth's deepest bucket measures 4.73:1). Every bucket therefore sits between the theme's
 *  primary and 0.085 below it, which is also what keeps an IMPORTED owner theme safe by construction: the
 *  ThemeScope clamp already AA-sweeps primary↔primary-foreground, and no bucket strays further than that
 *  from the pairing it guarantees. The full palette × step matrix is asserted in `tests/ui/tokens/index.test.ts`.
 *
 *  DIFFERENTIATION THEN RIDES CHROMA (0.5× … 1.1×), alternating rich/washed down the lightness ramp so two
 *  neighbouring buckets never differ on one axis alone — five shades separated by lightness only, inside a
 *  window this narrow, are not tellable apart at 32px. Bucket 5 is the primary itself, so the commonest
 *  fallback is exactly the theme's accent. */
export const AVATAR_HUE_STEPS: Readonly<Record<AvatarFallbackHue, { readonly l: number; readonly c: number }>> = {
  "1": { l: -0.085, c: 1.1 },
  "2": { l: -0.065, c: 0.5 },
  "3": { l: -0.042, c: 0.95 },
  "4": { l: -0.02, c: 0.62 },
  "5": { l: 0.0, c: 1.0 },
};

/** Hashes the stable seed to one of the 5 in-band steps, so a given entity always resolves the same color. */
export function avatarFallbackHue(seed: string): AvatarFallbackHue {
  let h = DJB2_SEED;
  for (const ch of seed) {
    h = (h * DJB2_MULT + ch.charCodeAt(0)) % HASH_MOD;
  }
  return String((h % HUE_BUCKETS) + 1) as AvatarFallbackHue;
}

/** The resolved CSS color for a seed's fallback step — the same value the Avatar fallback slot fills with.
 *  A relative-color expression, not a `var()`: see the header (it must resolve against the ThemeScope in
 *  effect at the USE site, which a `:root` token cannot do). */
export function avatarFallbackHueColor(seed: string): string {
  const step = AVATAR_HUE_STEPS[avatarFallbackHue(seed)];
  return `oklch(from var(--color-primary) calc(l + ${step.l}) calc(c * ${step.c}) h)`;
}
