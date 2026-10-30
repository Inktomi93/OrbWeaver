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
