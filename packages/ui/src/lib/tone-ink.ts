// Text colour by meaning, one map for every primitive that carries a `tone` ink axis (Text, Icon).
// `default` keeps the ink the primitive or its voice already paints.
export const TONE_INK = {
  default: "",
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
} as const;
