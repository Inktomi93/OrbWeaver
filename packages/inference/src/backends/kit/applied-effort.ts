// The APPLIED-effort read (inference audit B1): each hosted wire reads the effort word back off the OPTIONS it
// built — the anthropic `providerOptions.anthropic.effort` / `thinking.type`, the openai-compatible V4
// `reasoning`, the openrouter `providerOptions.openrouter.reasoning.effort` — and narrows it onto the preset's
// 7-member tuple (the `reasoning_effort` column's CHECK). Reading the built options rather than recomputing from
// the funnel's knobs is what keeps "what we spelled" and "what we recorded" one fact; a word the tuple does not
// know (or no word at all) is `null` — unrecorded, never guessed.

import type { EffortLevel } from "@orb/contracts/preset";
import { EFFORT_LEVELS } from "@orb/contracts/preset";

function isEffortLevel(value: string): value is EffortLevel {
  return (EFFORT_LEVELS as readonly string[]).includes(value);
}

/** A wire value → our effort word, or `null` when it is not a string in the tuple. */
export function effortWordOf(value: unknown): EffortLevel | null {
  return typeof value === "string" && isEffortLevel(value) ? value : null;
}
