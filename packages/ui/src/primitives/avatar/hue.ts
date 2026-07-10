// The deterministic per-entity fallback-hue derivation (D62), lifted out of `avatar.tsx` and EXPORTED so
// a feature that must paint fallback identity art OUTSIDE the sealed <Avatar> gets the SAME hue the
// Avatar's own fallback slot would, from the SAME seed — never a duplicated copy of the math (Spine §13.7
// "one home"). The one caller today: the Phase-4 immersive Echo/Whisper message-row tiles, where the
// owner ruling (2026-07-09, `FINAL-Persona-and-Immersive-Chat-Visuals.md`) makes the deterministic-hue +
// initial fallback a FIRST-CLASS avatar — the tile IS the mode's art source when a character has no
// image, so its color must match the character's chip/library-card hue exactly (same seed → same bucket
// → same chart token). `avatar.tsx` consumes `avatarFallbackHue` for its own `hue` variant, so the seal
// and the outside consumers can never drift.

// The 5 fallback hue buckets (the tuned chart-1..5 ramp) — the axis declared ONCE (Spine §7.5); the
// string keys match the `hue` variant in variants.ts (each maps to `bg-chart-N text-primary-foreground`).
const AVATAR_HUES = ["1", "2", "3", "4", "5"] as const;
export type AvatarFallbackHue = (typeof AVATAR_HUES)[number];
const HUE_BUCKETS = AVATAR_HUES.length;
const DJB2_SEED = 5381;
const DJB2_MULT = 33;
// Reduce each step mod (2^31 - 1) so the running hash stays a bounded, exact integer (no bitwise ops,
// no float-precision drift) while remaining well-mixed across the 5 buckets.
const HASH_MOD = 2_147_483_647;

/**
 * Deterministic per-entity fallback hue (D62): hash the stable seed → one of the 5 chart hues, so a
 * given character/persona ALWAYS resolves to the same fallback color everywhere it appears (the list-row
 * chip, the chat header, an immersive tile). A tiny djb2-style polynomial string hash — pure and
 * deterministic (no PRNG, no bitwise, gate-clean) — folded into the 5-bucket range. An empty seed still
 * resolves stably (bucket 1), so a fallback is never uncolored.
 */
export function avatarFallbackHue(seed: string): AvatarFallbackHue {
  let h = DJB2_SEED;
  for (const ch of seed) {
    h = (h * DJB2_MULT + ch.charCodeAt(0)) % HASH_MOD;
  }
  return String((h % HUE_BUCKETS) + 1) as AvatarFallbackHue;
}

/**
 * The resolved CSS color VALUE for a seed's fallback hue — `var(--color-chart-N)`, the SAME chart token
 * the Avatar fallback slot fills with (`bg-chart-N`, variants.ts). For a feature painting fallback
 * identity art outside the Avatar seal (the immersive Echo edge tile / Whisper band): use this as the
 * flat color field and pair the initial with `--color-primary-foreground` (AA ≥4.5:1 verified against
 * all five hues — variants.ts). Keeps the chart-token→hue mapping sealed in the ui package, so a
 * consumer never re-spells `--color-chart-*` from a raw bucket number.
 */
export function avatarFallbackHueVar(seed: string): string {
  return `var(--color-chart-${avatarFallbackHue(seed)})`;
}
