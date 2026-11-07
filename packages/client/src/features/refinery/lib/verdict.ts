// The refinery's status words: the tone and the word every surface paints for a verdict, a session status or an
// applied field, so the sessions list, the Runs ledger and the built-in verdict banner cannot disagree about one member.

import type { AppliedFieldKind, RefinerySessionStatus, RefineryVerdict, RenderHintTone } from "@orb/contracts/refinery";

export const VERDICT_TONE: Record<RefineryVerdict, RenderHintTone> = {
  ACCEPT: "good",
  NEEDS_REFINEMENT: "warn",
  REGRESSION: "bad",
};

const VERDICT_WORD: Record<RefineryVerdict, string> = {
  ACCEPT: "Accept",
  NEEDS_REFINEMENT: "Needs refinement",
  REGRESSION: "Regression",
};

export function verdictToneOf(verdict: RefineryVerdict): RenderHintTone {
  return VERDICT_TONE[verdict];
}

export function verdictWordOf(verdict: RefineryVerdict): string {
  return VERDICT_WORD[verdict];
}

/** The session's status chip; `accent` marks the session in progress. */
export const SESSION_STATUS_CHIP: Record<RefinerySessionStatus, { readonly tone: "accent" | "neutral"; readonly word: string }> = {
  active: { tone: "accent", word: "Active" },
  completed: { tone: "neutral", word: "Completed" },
  abandoned: { tone: "neutral", word: "Abandoned" },
};

export const APPLIED_KIND_WORD: Record<AppliedFieldKind, string> = {
  replaced: "Replaced",
  cleared: "Cleared",
  added: "Added",
};
