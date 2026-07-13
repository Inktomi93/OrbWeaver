// biome-ignore-all lint/suspicious/noBitwiseOperators: FNV-1a is a byte-defined hash codec — the
// `^=`/`>>>` ops ARE the algorithm.

// The per-character default tint — a deterministic OKLCH hash so the same speaker always gets the same
// color with zero storage, the fallback before a real per-character ThemeOverride exists. OKLCH (not
// HSL) with only hue varying gives roughly equal perceived brightness across the whole hue wheel.
// colorForCharacter is generic over its string key, not narrowly typed to CharacterId, since
// message-content.tsx's merged-narrator coloring calls it with a <speaker> marker's name text instead.

import { isSafeColor } from "@orb/kit/safe-color";

const LIGHTNESS_PERCENT = 72;
const CHROMA = 0.16;
const HUE_MODULUS = 360;

const FNV_OFFSET_BASIS = 0x81_1c_9d_c5;
const FNV_PRIME = 0x01_00_01_93;

export interface SpeakerColorTokens {
  readonly speaker: string;
  readonly dialogueColor: string;
  readonly narrationColor: string;
}

function fnv1aHash(key: string): number {
  let hash = FNV_OFFSET_BASIS;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash >>> 0;
}

export function colorForCharacter(key: string): SpeakerColorTokens {
  const hue = fnv1aHash(key) % HUE_MODULUS;
  const color = `oklch(${LIGHTNESS_PERCENT}% ${CHROMA} ${hue})`;
  if (!isSafeColor(color)) {
    throw new Error(`colorForCharacter: generated an unsafe color ${JSON.stringify(color)}`);
  }
  return { speaker: color, dialogueColor: color, narrationColor: color };
}
