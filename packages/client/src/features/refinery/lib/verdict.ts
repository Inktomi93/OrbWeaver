// The analyze verdict's one home: the tone and the word every surface paints for the wire enum, so the
// sessions list, the Runs ledger and the built-in verdict banner cannot disagree about one verdict.

import type { RenderHintTone } from "@orb/contracts/refinery";

/** Keyed by the wire enum's own spellings. */
export const VERDICT_TONE: Record<string, RenderHintTone> = {
  ACCEPT: "good",
  NEEDS_REFINEMENT: "warn",
  REGRESSION: "bad",
};

const VERDICT_WORD: Record<string, string> = {
  ACCEPT: "Accept",
  NEEDS_REFINEMENT: "Needs refinement",
  REGRESSION: "Regression",
};

export function verdictToneOf(verdict: string): RenderHintTone {
  return VERDICT_TONE[verdict] ?? "neutral";
}

/** The shown word; an unknown member keeps its own spelling rather than being guessed. */
export function verdictWordOf(verdict: string): string {
  return VERDICT_WORD[verdict] ?? verdict;
}
