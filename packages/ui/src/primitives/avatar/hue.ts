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
// WHY A SCOPED PIGMENT AND NOT FIVE ROOT TOKENS (the mechanism, so nobody "simplifies" it back). A token on
// `:root` would substitute `--color-primary` once, at the root, and ignore the app-shell's own `<ThemeScope>`.
// The five recipes are generated `avatar` pigments (D336, `orb.pigments` in tokens.json): the token build
// declares them on `[data-pigment="avatar"]`, so they resolve on the stamped element against the ThemeScope in
// effect there. A consumer painting this fill stamps {@link AVATAR_PIGMENT} on the element or an ancestor.
//
// DIFFERENTIATION IS LIGHTNESS × CHROMA, NEVER HUE (the ruling, verbatim: "vary lightness/chroma within
// the band, not hue across the wheel, so entities stay tellable-apart without leaving register"). The
// deltas are RELATIVE (a mix share, `calc(c * k)`) and a bucket is never pinned to an absolute
// lightness, so no palette can be pushed out of its own contrast pairing. The window's measured shape —
// and why it moves away from the ink rather than always down — is stated below.

import type { PigmentScope } from "#tokens";
import { PIGMENTS } from "#tokens";

const AVATAR_HUES = ["1", "2", "3", "4", "5"] as const;
export type AvatarFallbackHue = (typeof AVATAR_HUES)[number];
const HUE_BUCKETS = AVATAR_HUES.length;
const DJB2_SEED = 5381;
const DJB2_MULT = 33;
// Reduce mod (2^31 - 1) so the running hash stays a bounded, exact integer (no float-precision drift).
const HASH_MOD = 2_147_483_647;

// THE FIVE IN-BAND STEPS (their shares and chroma multipliers live in the pigment recipes): each mixes a share of the
// theme's primary toward the lightness extreme opposite `--color-primary-foreground`. THE WINDOW MOVES AWAY FROM THE
// INK, never in a fixed direction: the ink's polarity flips per palette, a fixed darkening cost contrast under a dark
// ink (a mid primary measured 3.5:1) and a fixed lightening under a light one (a +0.06 step measured 3.78:1). Moving
// away from the ink can only raise the pair's contrast, so every bucket keeps at least the primary↔ink contrast the
// ThemeScope clamp already sweeps. DIFFERENTIATION ALSO RIDES CHROMA (0.5× … 1.1×), alternating rich/washed down the
// ramp so two neighbouring buckets never differ on one axis alone. Bucket 5 is the primary itself.

/** The pigment scope a consumer of {@link avatarFallbackHueColor} stamps as `data-pigment`. */
export const AVATAR_PIGMENT = "avatar" satisfies PigmentScope;

/** Hashes the stable seed to one of the 5 in-band steps, so a given entity always resolves the same color. */
export function avatarFallbackHue(seed: string): AvatarFallbackHue {
  let h = DJB2_SEED;
  for (const ch of seed) {
    h = (h * DJB2_MULT + ch.charCodeAt(0)) % HASH_MOD;
  }
  return String((h % HUE_BUCKETS) + 1) as AvatarFallbackHue;
}

/** The CSS color for a seed's fallback step — the same value the Avatar fallback slot fills with. It reads the
 *  generated `avatar` pigment, so the element or an ancestor carries `data-pigment={AVATAR_PIGMENT}` (see the header). */
export function avatarFallbackHueColor(seed: string): string {
  return `var(${PIGMENTS[AVATAR_PIGMENT][avatarFallbackHue(seed)]})`;
}
