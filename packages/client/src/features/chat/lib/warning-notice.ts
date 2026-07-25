// The chat-warning notification mapper — the ONE testable home for the `ChatWarningCode` → user-facing
// copy decision (the `turnAbortNotice` precedent). A `warning` bus event is a domain HONEST-DEGRADE
// signal: the turn (or image) still produced a result, but something the user asked for was dropped
// (a non-vision model ate an image, a no-ControlNet family ignored the pose, memory failed to build).
// The doctrine forbids a silent no-op, so every warning surfaces — this maps each code to plain,
// honest copy stating WHAT was dropped and (where it matters) that the rest still went through.
//
// One home, pure: `data/` may not import `features/`, so the bus reducer takes an injected `onWarning`
// callback and the code→copy decision is wired HERE in the feature (mirroring `onTurnAbort`). The CT
// QueryClient has no MutationCache seam so toast copy is unobservable in a CT (ct-queryclient
// precedent) — this mapper is unit-tested instead, and the reducer stays a one-liner over it.
//
// EXHAUSTIVE by construction (§5.5): the `switch` ends in `assertNever`, so a newly-added
// `CHAT_WARNING_CODES` member fails `tsc` until it is given copy — a new degrade can never ship
// user-silent. (A snake_case-keyed `Record` would trip `useNamingConvention`; the exhaustive switch is
// the sibling `turnAbortNotice` shape and carries the same tsc guarantee.)

import type { ChatWarningCode } from "@orb/contracts/chat";

/** The user-visible notice for a chat `warning` code — honest, plain-language copy voiced like the
 *  other transient chat notices (`TURN_STALE_ABORT_COPY`). Total over `ChatWarningCode`: every degrade
 *  is surfaced (unlike `turnAbortNotice`, no code is silenced — a `warning` is always something the
 *  user asked for that didn't happen). */
export function warningNotice(code: ChatWarningCode): string {
  switch (code) {
    case "image_dropped":
      return "The image you attached was ignored — this model can't see images.";
    case "tools_unsupported":
      return "Tools were turned off for this reply — the model doesn't support them.";
    case "memory_build_failed":
      return "Long-term memory couldn't update this turn — your reply is unaffected.";
    case "structured_output_unsupported":
      return "Structured output isn't supported by this model — the reply came back as plain text.";
    case "prompt_transform_skipped":
      return "A prompt rule was skipped — it errored or ran too long, so your message was sent unchanged.";
    case "image_edit_dropped":
      return "The image was generated without your reference — this model can't edit images.";
    case "compaction_failed":
      return "The conversation summary couldn't update this turn — your reply is unaffected.";
    case "context_trimmed_no_summary":
      return "The conversation got too long to summarize — the oldest messages were dropped from context to keep going.";
    case "smart_arbitration_degraded":
      return "The turn director model wasn't available — who speaks next was picked automatically instead.";
    case "guided_placed_as_injection":
      return "Your steering was added as an inline instruction — this preset has no Guided instruction marker to place it in.";
    default:
      return assertNeverCode(code);
  }
}

function assertNeverCode(code: never): never {
  throw new Error(`warningNotice: unhandled ChatWarningCode ${JSON.stringify(code)}`);
}
