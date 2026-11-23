import type { Tone } from "@orb/ui/tokens";

/** The tones a computed status chip takes: settled success, an open question, nothing to report, or a failure. A slice of the `@orb/ui` tone axis. */
export type StatusTone = Extract<Tone, "success" | "warning" | "neutral" | "destructive">;
