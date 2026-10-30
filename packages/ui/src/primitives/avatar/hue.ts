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
// deltas are RELATIVE (a mix share, `calc(c * k)`) and a bucket is never pinned to an absolute
// lightness, so no palette can be pushed out of its own contrast pairing. The window's shape — and why
// it moves away from the ink rather than always down — is on `AVATAR_HUE_STEPS` below.

const AVATAR_HUES = ["1", "2", "3", "4", "5"] as const;
export type AvatarFallbackHue = (typeof AVATAR_HUES)[number];
const HUE_BUCKETS = AVATAR_HUES.length;
const DJB2_SEED = 5381;
const DJB2_MULT = 33;
// Reduce mod (2^31 - 1) so the running hash stays a bounded, exact integer (no float-precision drift).
const HASH_MOD = 2_147_483_647;

/** The five in-band steps: a share of the theme's primary replaced by the extreme opposite the ink, and a chroma
 *  multiplier.
 *
 *  THE WINDOW MOVES AWAY FROM THE INK, never in a fixed direction. `--color-primary-foreground` is the ink on every
 *  bucket and its polarity flips per palette. A fixed darkening cost contrast whenever the ink was dark (a mid
 *  primary measured 3.5:1 under it), and a fixed lightening cost it when the ink was light (a +0.06 step measured
 *  3.78:1). Mixing toward black under a light ink and toward white under a dark one can only raise the pair's
 *  contrast, so every bucket keeps at least the primary↔ink contrast the ThemeScope clamp already sweeps, which also
 *  keeps an IMPORTED owner theme safe by construction. The shares are sized to the old 0.085 lightness window on a
 *  light-ink palette; on a dark-ink palette the same shares lighten, a slightly narrower window.
 *
 *  DIFFERENTIATION ALSO RIDES CHROMA (0.5× … 1.1×), alternating rich/washed down the ramp so two neighbouring
 *  buckets never differ on one axis alone — five shades separated by lightness only, inside a window this narrow,
 *  are not tellable apart at 32px. Bucket 5 is the primary itself, so the commonest fallback is exactly the
 *  theme's accent.
 */
const AVATAR_HUE_STEPS: Readonly<Record<AvatarFallbackHue, { readonly share: number; readonly c: number }>> = {
  "1": { share: 14, c: 1.1 },
  "2": { share: 11, c: 0.5 },
  "3": { share: 7, c: 0.95 },
  "4": { share: 3.5, c: 0.62 },
  "5": { share: 0, c: 1.0 },
};

const FULL_SHARE = 100;

// The lightness extreme opposite the ink: white under a dark ink, black under a light one.
const OPPOSITE_OF_INK = "oklch(from var(--color-primary-foreground) clamp(0, calc((0.5 - l) * 1000), 1) 0 0)";

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
  const mixed = `color-mix(in oklab, var(--color-primary) ${FULL_SHARE - step.share}%, ${OPPOSITE_OF_INK} ${step.share}%)`;
  return `oklch(from ${mixed} l calc(c * ${step.c}) h)`;
}
