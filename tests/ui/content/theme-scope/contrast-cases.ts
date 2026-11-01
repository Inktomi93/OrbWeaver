import { hueDistance } from "@orb/kit/safe-color";
import type { Oklch } from "@orb/kit/theme-derivation";
import { TONE_HUE_ADJACENT_DEGREES, TONE_TINT_SEPARATION } from "@orb/kit/theme-derivation";

export const BASES = [
  { name: "dark", background: "oklch(0.158 0.006 60)" },
  { name: "light", background: "oklch(0.98 0.004 75)" },
  { name: "historical pivot 0.62", background: "oklch(0.62 0.01 60)" },
  { name: "historical pivot 0.6201", background: "oklch(0.6201 0.01 60)" },
  { name: "dark polarity boundary", background: "oklch(0.55 0.01 60)" },
  { name: "light polarity boundary", background: "oklch(0.57 0.01 60)" },
  { name: "mid grey", background: "oklch(0.5 0 0)" },
  { name: "pale paper", background: "oklch(0.93 0.02 90)" },
  { name: "grey 0.6", background: "oklch(0.6 0 0)" },
  { name: "dark arm that still fits", background: "oklch(0.43 0 0)" },
] as const;

/** The tinted dialogue a speaker's scope picks: the chroma the review measured on a mid-grey bubble. */
export const SPEAKER_DIALOGUE = "oklch(0.86 0.16 85)";

/** A theme's narration pick and a card's assistant bubble fill: the pair the review measured at 4.01:1. */
export const INHERITED_INK_CASE = { narrationColor: "oklch(0.67 0.03 260)", aiBubble: "oklch(0.34 0.06 35)" } as const;

/** The palettes a card's bubble-only override lands on: both polarities of seed and custom. */
export const PICKED_BUBBLE_PALETTES = [
  { name: "light seed", theme: "light" },
  { name: "pale paper", background: "oklch(0.93 0.02 90)" },
  { name: "hearth seed" },
  { name: "custom dark", background: "oklch(0.2 0.02 250)" },
] as const;

/** Bubble fills on each side of the crossover and near it. */
export const PICKED_BUBBLE_FILLS = [
  { name: "dark", aiBubble: "oklch(0.34 0.06 35)" },
  { name: "light", aiBubble: "oklch(0.92 0.03 90)" },
  { name: "mid", aiBubble: "oklch(0.6 0.04 30)" },
] as const;

/** A card with no prose picks, and one whose picks suit the page rather than the bubble. */
export const PICKED_BUBBLE_INKS = [
  { name: "alone", inks: {} },
  { name: "with card inks", inks: { dialogueColor: "oklch(0.4 0.1 240)", narrationColor: "oklch(0.86 0.1 85)" } },
] as const;

/** A neutral mid-grey, where a fixed-colour edge has the least room on either side. */
export const MID_GREY = "oklch(0.6 0 0)";

/**
 * Whether a painted colour keeps the tone hue `hue`: nearer it than any adjacent tone could sit, at a chroma at least
 * the tint separation off the grey axis. The unit suite judges the solved pixels with it and the CT the framebuffer.
 */
export function keepsHue(painted: Oklch, hue: number): boolean {
  return painted.c >= TONE_TINT_SEPARATION && hueDistance(painted.h, hue) < TONE_HUE_ADJACENT_DEGREES / 2;
}
