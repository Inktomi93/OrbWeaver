import type { ToneStamp } from "./variant-attrs.ts";

// Text colour by meaning, one map for every primitive that carries a `tone` ink axis (Text, Icon).
// `default` keeps the ink the primitive or its voice already paints. A meaning ink is the D336 `text` role of the
// tone `INK_TONE` stamps, so it follows the scope's palette and clears its floor on the page family.
export const TONE_INK = {
  default: "",
  /** The full surface ink, for a quiet voice (a gloss) that names the thing itself, or a control that must not inherit muted ink. */
  foreground: "text-foreground",
  muted: "text-muted-foreground",
  accent: "text-tone-text",
  destructive: "text-tone-text",
  success: "text-tone-text",
  warning: "text-tone-text",
  info: "text-tone-text",
  /** An achievement or reward: a quest won, a game door's crown. */
  accolade: "text-accolade",
  /** The prose inks a theme sets for a transcript: the speaker's name, quoted dialogue and narration. */
  speaker: "text-speaker",
  dialogue: "text-dialogue",
  narration: "text-narration",
  /** The theme's reading ink for running prose (`--color-prose-body`). */
  prose: "text-prose-body",
  /** The ink paired with the primary fill, for a mark drawn on that fill. */
  onPrimary: "text-primary-foreground",
} as const;

/** The D336 tone each ink stamps; an ink that reads no tone role opens no scope. */
export const INK_TONE = {
  default: null,
  foreground: null,
  muted: null,
  accent: "primary",
  destructive: "destructive",
  success: "success",
  warning: "warning",
  info: "info",
  accolade: null,
  speaker: null,
  dialogue: null,
  narration: null,
  prose: null,
  onPrimary: null,
} as const satisfies Record<keyof typeof TONE_INK, ToneStamp>;
