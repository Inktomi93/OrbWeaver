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

/** The hash's OUTPUT is the two SPEECH inks only. Narration is deliberately absent — see
 *  {@link colorForCharacter}; the theme's `--color-narration` is what paints it. */
export interface SpeakerColorTokens {
  readonly speaker: string;
  readonly dialogueColor: string;
}

function fnv1aHash(key: string): number {
  let hash = FNV_OFFSET_BASIS;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash >>> 0;
}

/**
 * THE HASH DOES NOT COLOUR NARRATION (#212-5, side-eye C2). It used to return the identical hue for
 * `speaker`, `dialogueColor` AND `narrationColor`, and the row's ThemeScope wrote all three — so the
 * `<em>` runs that carry narration in this app's prose voice resolved to the speaker's dialogue red, and
 * the reader lost the speech-vs-emphasis distinction the app deliberately built (measured on a live row:
 * `--color-narration: oklch(72% 0.16 21)` at the row scope, identical to `--color-speaker`, against the
 * correct `oklch(0.78 0.02 70)` one level up). It contradicted our own stated law — `markdown.tsx`: "the
 * base className tints every rendered `<em>` with `--color-narration`" — and every ST reference render
 * keeps the two apart (orange speech, grey italic narration).
 *
 * Omitting the token is the whole fix: `ThemeScope` only emits the keys it is given, so the palette's own
 * `--color-narration` survives at the row. An AUTHORED `themeOverride` that names `narrationColor` is
 * untouched — a card that chose its narration ink still gets it (`characterTint`); what is gone is a
 * FABRICATED narration ink nobody chose.
 */
export function colorForCharacter(key: string): SpeakerColorTokens {
  const hue = fnv1aHash(key) % HUE_MODULUS;
  const color = `oklch(${LIGHTNESS_PERCENT}% ${CHROMA} ${hue})`;
  if (!isSafeColor(color)) {
    throw new Error(`colorForCharacter: generated an unsafe color ${JSON.stringify(color)}`);
  }
  return { speaker: color, dialogueColor: color };
}
