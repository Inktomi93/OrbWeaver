import { CAP, HIDDEN_AT, INLINE_FIELD_ROW, TONE_ARMS, TONE_OUTLINE, TONE_SOFT, TOUCH_FLOOR_AT_COARSE, tv } from "#lib";
import type { Tone } from "#tokens";

// The badge/chip/pill skin — status pills (ui-package-design §6.1). Every fill style paints the D336 roles of the tone
// the badge stamps, so any tone works with any style and one meaning paints alike on every primitive. Three styles in
// descending weight: `solid` (the filled pill), `soft` (the opaque tint, the held-back edge and the on-tint ink, the
// default status-chip look) and `outline` (no fill: the edge and the tone's text ink), for chips that must read
// quieter than the surface's primary CTA even when there are a dozen of them (UI-Density-Law §3.2 CD3).
export const badgeVariants = tv({
  base: `${INLINE_FIELD_ROW} rounded-full font-medium whitespace-nowrap select-none`,
  variants: {
    variant: {
      solid: "bg-tone-solid text-tone-foreground",
      soft: TONE_SOFT,
      outline: TONE_OUTLINE,
    },
    tone: TONE_ARMS,
    size: {
      // Title-only rows need state chrome without the vertical padding that changes their pitch.
      compact: "px-field font-sans text-label leading-label",
      sm: "px-row py-field text-label leading-label",
    },
    // A chip carrying a glyph control whose overflowing hit area a wrap gap would clip takes the touch floor on
    // its own block size at a coarse pointer, so the hit area fits inside the chip.
    touchFloor: { block: TOUCH_FLOOR_AT_COARSE.block },
    // Machine text on the chip (a macro token, a key): the mono face.
    // A chip whose own controls hold the padding and the touch box, so the chip adds neither.
    flush: { true: "gap-0 p-0" },
    cap: CAP,
    hiddenAt: HIDDEN_AT,
    // A badge that holds a sentence wraps instead of pushing its row wider; only a word wider than the room breaks, so a narrow pane at
    // enlarged text never has its longest word hold the badge past the edge.
    whitespace: { normal: "wrap-anywhere whitespace-normal" },
    face: { text: "", code: "font-mono" },
    // A chip inside a caps kicker reads as a sentence: it stands down the inherited transform and tracking together.
    sentenceCase: { true: "tracking-normal normal-case", false: "" },
  },
  defaultVariants: { tone: "neutral", variant: "soft", size: "sm", face: "text", sentenceCase: false },
});

/**
 * The filled status pill for a tone a caller computes: a colour tone fills, and the neutral tone takes its tint,
 * because the neutral solid is the page ink. One status set then reads as one weight whichever member is shown.
 */
export const STATUS_PILL_VARIANT = {
  primary: "solid",
  neutral: "soft",
  destructive: "solid",
  warning: "solid",
  success: "solid",
  info: "solid",
} as const satisfies Record<Tone, "solid" | "soft">;
