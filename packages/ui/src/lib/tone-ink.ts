import type { Tone } from "#tokens";
import { TONES } from "#tokens";

// Text colour on the primitives that carry an ink (Text, Icon, WeaveGlyph, WebSpinner and the fill-less Button
// variants), in two maps under D336. A `tone` is colour by meaning: it paints the tone's `text` role, which resolves on
// the element's own `data-tone` stamp, so it follows the scope's palette and clears its floor on the page family. An
// `ink` is a named ink that reads no tone role. Unset, the element keeps the ink its voice or host paints.

/** The `tone` axis of a primitive whose variant paints the roles: the colour is the `data-tone` stamp alone, so the arms
 *  carry no class and exist to type and stamp the axis. */
export const TONE_ARMS = { primary: "", neutral: "", destructive: "", warning: "", success: "", info: "" } as const satisfies Record<Tone, "">;

/** True when an axis value is a D336 tone rather than a primitive's own use-specific value. */
export function isTone(value: string): value is Tone {
  return (TONES as readonly string[]).includes(value);
}

/** The tone map: every tone paints its `text` role; the stamp picks the colour. */
export const TONE_TEXT = {
  primary: "text-tone-text",
  neutral: "text-tone-text",
  destructive: "text-tone-text",
  warning: "text-tone-text",
  success: "text-tone-text",
  info: "text-tone-text",
} as const satisfies Record<Tone, string>;

/** The ink map: the named inks that are not a tone. */
export const INKS = {
  /** The receded surface ink. */
  muted: "text-muted-foreground",
  /** The full surface ink, for a quiet voice (a gloss) that names the thing itself, or a control that must not inherit muted ink. */
  foreground: "text-foreground",
  /** An achievement or reward: a quest won, a game door's crown. */
  accolade: "text-accolade",
  /** The prose inks a theme sets for a transcript: the speaker's name, quoted dialogue and narration. */
  speaker: "text-speaker",
  dialogue: "text-dialogue",
  narration: "text-narration",
  /** The theme's reading ink for running prose (`--color-prose-body`). */
  prose: "text-prose-body",
  /** The ink paired with the enclosing tone's solid fill, for a mark drawn on that fill. */
  toneForeground: "text-tone-foreground",
  /** The surrounding control's ink: the only correct ink for text inside a filled control. */
  inherit: "text-current",
} as const;

export type Ink = keyof typeof INKS;

/**
 * The colour props of an inked primitive. A non-neutral tone and an ink are exclusive: an ink would repaint the tone's
 * meaning away. `toneForeground` is the one ink that pairs with any tone, because it is that tone's own ink on its
 * solid: a mark on a tone's fill outside the fill's own scope names the tone it sits on.
 */
export type ToneInkSelection =
  | { readonly tone?: Tone | undefined; readonly ink?: never }
  | { readonly tone?: "neutral" | undefined; readonly ink?: Ink | undefined }
  | { readonly tone?: Tone | undefined; readonly ink: "toneForeground" };
