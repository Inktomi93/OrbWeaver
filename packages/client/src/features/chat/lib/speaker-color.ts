// biome-ignore-all lint/suspicious/noBitwiseOperators: FNV-1a is a byte-defined hash codec — the
// `^=`/`>>>` ops ARE the algorithm (kit/roll.ts precedent: rewriting them changes every color).
//
// The per-character DEFAULT tint (#21, §12.4) — a deterministic OKLCH hash so the same speaker always
// gets the same color across renders/sessions with zero storage. This is the fallback the render layer
// reaches for BEFORE a real per-character `ThemeOverride` exists (once the theme system lands, an
// authored override layers on top via the same `<ThemeScope>` — this module never competes with it).
//
// OKLCH, not HSL: fixed lightness/chroma with only the hue varying gives roughly equal PERCEIVED
// brightness across the whole hue wheel (HSL's fixed L/S does not — e.g. HSL yellow reads far lighter
// than HSL blue at the same L). Determinism gate: FNV-1a is a pure integer hash — no `Math.random()`,
// no `Date.now()`, so the same key always paints the same color (client render-determinism, §11.5).
//
// `colorForCharacter` is intentionally generic over its string KEY, not narrowly typed to a real
// `CharacterId`: message-row.tsx calls it with the row's server-stamped `characterId` (trusted
// attribution), while message-content.tsx's per-span merged-narrator coloring calls it with the
// `<speaker>` marker's NAME text (the only signal available at that render layer — see that file's
// header comment for why that split is NOT a body-parsed-attribution violation).

import { isSafeColor } from "@orb/kit/safe-color";

/** Fixed OKLCH lightness/chroma (~72%/0.16) — tuned for legible text on both light and dark surfaces;
 *  only the hue (from the hash) varies per speaker. */
const LIGHTNESS_PERCENT = 72;
const CHROMA = 0.16;
const HUE_MODULUS = 360;

const FNV_OFFSET_BASIS = 0x81_1c_9d_c5;
const FNV_PRIME = 0x01_00_01_93;

/** The `ThemeScopeTokens` subset this module produces — a single hue applied to every per-speaker role
 *  token `@orb/ui/theme-scope` exposes (flat `speaker` + the RP prose `dialogueColor`/`narrationColor`). */
export interface SpeakerColorTokens {
  readonly speaker: string;
  readonly dialogueColor: string;
  readonly narrationColor: string;
}

/** FNV-1a, 32-bit — a pure, fast, well-distributed non-cryptographic hash (no dependency needed). */
function fnv1aHash(key: string): number {
  let hash = FNV_OFFSET_BASIS;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash >>> 0;
}

/** Deterministically map any speaker key (a `characterId` or a `<speaker>` marker's name) to an OKLCH
 *  color, then apply it to every per-speaker `ThemeScopeTokens` role. Pure — same key, same color, always. */
export function colorForCharacter(key: string): SpeakerColorTokens {
  const hue = fnv1aHash(key) % HUE_MODULUS;
  const color = `oklch(${LIGHTNESS_PERCENT}% ${CHROMA} ${hue})`;
  // Belt: the generated string must still satisfy the shared D44 color-safety predicate — a
  // regression here (e.g. a stray char) fails LOUD instead of shipping an inert/rejected token.
  if (!isSafeColor(color)) {
    throw new Error(`colorForCharacter: generated an unsafe color ${JSON.stringify(color)}`);
  }
  return { speaker: color, dialogueColor: color, narrationColor: color };
}
