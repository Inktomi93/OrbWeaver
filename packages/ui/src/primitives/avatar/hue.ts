// Deterministic per-entity fallback-hue derivation, exported so a feature painting fallback identity
// art OUTSIDE the sealed <Avatar> gets the SAME hue from the SAME seed. `avatar.tsx` consumes this too.

const AVATAR_HUES = ["1", "2", "3", "4", "5"] as const;
export type AvatarFallbackHue = (typeof AVATAR_HUES)[number];
const HUE_BUCKETS = AVATAR_HUES.length;
const DJB2_SEED = 5381;
const DJB2_MULT = 33;
// Reduce mod (2^31 - 1) so the running hash stays a bounded, exact integer (no float-precision drift).
const HASH_MOD = 2_147_483_647;

/** Hashes the stable seed to one of the 5 chart hues, so a given entity always resolves the same color. */
export function avatarFallbackHue(seed: string): AvatarFallbackHue {
  let h = DJB2_SEED;
  for (const ch of seed) {
    h = (h * DJB2_MULT + ch.charCodeAt(0)) % HASH_MOD;
  }
  return String((h % HUE_BUCKETS) + 1) as AvatarFallbackHue;
}

/** Resolved CSS color value for a seed's fallback hue — the same chart token the Avatar fallback slot fills with. */
export function avatarFallbackHueVar(seed: string): string {
  return `var(--color-chart-${avatarFallbackHue(seed)})`;
}
