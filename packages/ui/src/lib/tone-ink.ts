// Text colour by meaning, one map for every primitive that carries a `tone` ink axis (Text, Icon).
// `default` keeps the ink the primitive or its voice already paints.
export const TONE_INK = {
  default: "",
  /** The full surface ink, for a quiet voice (a gloss) that names the thing itself, or a control that must not inherit muted ink. */
  foreground: "text-foreground",
  muted: "text-muted-foreground",
  accent: "text-primary",
  destructive: "text-destructive",
  success: "text-success",
  warning: "text-warning",
  info: "text-info",
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
