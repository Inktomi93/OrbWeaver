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

const FILL_NEAR_BLACK = "oklch(0.34 0.06 35)";
const FILL_NEAR_WHITE = "oklch(0.92 0.03 90)";

/** The palettes a room pick lands on, each with the fill across the crossover from its page and the fill on its side. */
export const PICKED_ROOM_PALETTES = [
  { name: "light seed", theme: "light", dark: FILL_NEAR_BLACK, light: FILL_NEAR_WHITE },
  { name: "pale paper", background: "oklch(0.93 0.02 90)", dark: FILL_NEAR_BLACK, light: FILL_NEAR_WHITE },
  { name: "hearth seed", dark: FILL_NEAR_WHITE, light: FILL_NEAR_BLACK },
  { name: "custom dark", background: "oklch(0.2 0.02 250)", dark: FILL_NEAR_WHITE, light: FILL_NEAR_BLACK },
] as const;

/** Carried backgrounds in both polarities, each with a fill on either side of the crossover. */
export const CARRIED_BUBBLE_PALETTES = [
  { name: "light", background: "oklch(0.98 0.004 75)", fills: [FILL_NEAR_BLACK, FILL_NEAR_WHITE] },
  { name: "pale", background: "oklch(0.93 0.02 90)", fills: [FILL_NEAR_BLACK, FILL_NEAR_WHITE] },
  { name: "hearth", background: "oklch(0.158 0.006 60)", fills: [FILL_NEAR_BLACK, FILL_NEAR_WHITE] },
  { name: "custom dark", background: "oklch(0.2 0.02 250)", fills: [FILL_NEAR_BLACK, FILL_NEAR_WHITE] },
] as const;

/** A card's picks on each polarity of fill, over a seed and with a carried background across the crossover from the fill. */
export const BOX_ELEMENT_CASES = [
  { name: "dark fill over the light seed", theme: "light", card: { aiBubble: { bg: FILL_NEAR_BLACK } }, carried: undefined },
  { name: "light fill over the hearth seed", theme: undefined, card: { aiBubble: { bg: FILL_NEAR_WHITE } }, carried: undefined },
  { name: "dark fill on a carried light background", theme: undefined, card: { aiBubble: { bg: FILL_NEAR_BLACK } }, carried: "oklch(0.98 0.004 75)" },
  { name: "light fill on a carried dark background", theme: undefined, card: { aiBubble: { bg: FILL_NEAR_WHITE } }, carried: "oklch(0.2 0.02 250)" },
] as const;

interface RoomFills {
  readonly opposed: string;
  readonly matched: string;
}

interface RoomPicks {
  readonly aiBubble?: { readonly bg: string };
  readonly userBubble?: { readonly bg: string };
}

/** Each way a pick reaches a room: a skin with no box, a pick for the other role, opposed picks, and a translucent fill. */
export const PICKED_ROOM_CASES = [
  { name: "flat", level: "room", boxed: false, readingInk: false, picks: ({ opposed }: RoomFills): RoomPicks => ({ aiBubble: { bg: opposed } }) },
  { name: "document", level: "room", boxed: false, readingInk: true, picks: ({ opposed }: RoomFills): RoomPicks => ({ aiBubble: { bg: opposed } }) },
  { name: "user bubble pick", level: "row", boxed: true, readingInk: false, picks: ({ opposed }: RoomFills): RoomPicks => ({ userBubble: { bg: opposed } }) },
  {
    name: "two opposed picks",
    level: "room",
    boxed: true,
    readingInk: false,
    picks: ({ opposed, matched }: RoomFills): RoomPicks => ({ aiBubble: { bg: opposed }, userBubble: { bg: matched } }),
  },
  { name: "room level pick", level: "room", boxed: true, readingInk: false, picks: ({ opposed }: RoomFills): RoomPicks => ({ aiBubble: { bg: opposed } }) },
  {
    name: "translucent fill",
    level: "row",
    boxed: true,
    readingInk: false,
    picks: ({ opposed }: RoomFills): RoomPicks => ({ aiBubble: { bg: opposed.replace(")", " / 0.6)") } }),
  },
] as const;

/** A light-polarity page near the crossover, whose nearest clearing edge would otherwise sit on top of the near-white text field fill. */
export const LIGHT_MID_TONE = "oklch(0.6599 0.14 30)";

/** An accent that clears the card as authored, so the focus ring is not pulled down to the 3:1 floor the edge also holds. */
export const STRONG_ACCENT = "oklch(0.2 0.1 260)";

/** A typed fractional page whose card lands a hair across the crossover from it. */
export const TYPED_CROSSOVER = "oklch(0.5606 0.12 240)";

/**
 * Whether a painted colour keeps the tone hue `hue`: nearer it than any adjacent tone could sit, at a chroma at least
 * the tint separation off the grey axis. The unit suite judges the solved pixels with it and the CT the framebuffer.
 */
export function keepsHue(painted: Oklch, hue: number): boolean {
  return painted.c >= TONE_TINT_SEPARATION && hueDistance(painted.h, hue) < TONE_HUE_ADJACENT_DEGREES / 2;
}

/** The tones whose marks carry meaning on their own: each one's zone meter fill and status Card edge are judged at 3:1. */
export const TONE_MARK_ACCENTS = ["info", "warning"] as const;

/** The selected-row story's title: test-authored row text, read by the story and the case that judges its contrast. */
export const SELECTED_ROW_TITLE = "Connections";
