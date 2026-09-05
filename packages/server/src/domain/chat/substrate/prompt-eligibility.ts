// domain/chat/substrate/prompt-eligibility — the ONE predicate for "is this committed row prompt material?".
//
// A canon row is held out of a prompt by TWO independent planes, and every surface that hands canon to a
// model must apply BOTH: the host's per-row `excludedFromPrompt` hide (an operator action on one row) and the
// row's declared PURPOSE (D129 — `MESSAGE_KIND_POLICY[kind].prompt === "never"`, i.e. an OOC `comment`, is not
// prompt material at all). The two were spelled separately at each boundary, and the second half went missing
// at one of them (#1463 item 3: quiet extraction sent comment rows to the side model while the compaction
// marker excluded them) — which is exactly the drift a shared predicate makes unrepresentable. The kind half
// is READ from the policy record rather than a hardcoded kind list, so a fourth kind is a policy-row decision.
//
// THIS IS NOT THE MEMBER-STRIP. Prompt eligibility is about the MODEL's view; hidden-class SPANS inside an
// eligible row are a separate, orthogonal plane (`substrate/member-visibility.ts` for the payload strip,
// `projectBodyForSummary` for the summary-plane strip) and a caller usually needs both.

import type { MessageKind } from "@orb/contracts/chat";
import { MESSAGE_KIND_POLICY } from "@orb/contracts/chat";

/** The two fields the verdict reads — structural, so a `MessageView` (the canon-history row) and any narrower
 *  projection carrying the same two columns both satisfy it. */
interface PromptEligibilityRow {
  readonly kind: MessageKind;
  readonly excludedFromPrompt: boolean;
}

/**
 * True when this committed row may enter a prompt: the host has not hidden it AND its declared purpose is
 * prompt material. Used by every boundary that assembles canon for a model — the compaction marker's
 * summarized transcript and the quiet extractor's scene — so the two cannot disagree about what a prompt is.
 */
export function isPromptEligible(row: PromptEligibilityRow): boolean {
  return !row.excludedFromPrompt && MESSAGE_KIND_POLICY[row.kind].prompt !== "never";
}
