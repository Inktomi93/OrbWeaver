// The chat-warning notification mapper — the ONE testable home for the `ChatWarningCode` → user-facing
// copy decision (the `turnAbortNotice` precedent). A `warning` bus event is a domain HONEST-DEGRADE
// signal: the turn (or image) still produced a result, but something the user asked for was dropped
// (a non-vision model ate an image, a no-ControlNet family ignored the pose, memory failed to build).
// The doctrine forbids a silent no-op, so every warning surfaces — this maps each code to plain,
// honest copy stating WHAT was dropped and (where it matters) that the rest still went through.
//
// TITLE + DESCRIPTION, never one sentence (side-eye INFRA-WARN-DEAF P1-3). As a single string these ran
// to three wrapped lines of bold that nobody scans. The TITLE is the fact — what was dropped, readable
// in under a second; the DESCRIPTION is the why and the reassurance. `notify.warn` renders the split.
//
// COPY RULE — name things the way the UI names them. The user has never seen the words "direct", "BYOK"
// or "custom-BYO": the labels they can actually read are the connection ones in
// `features/connections/lib/connections-model.ts` ("OpenRouter", "Custom OpenAI-compatible"). A notice
// that names a concept absent from every screen cannot be acted on.
//
// One home, pure: `data/` may not import `features/`, so the bus reducer takes an injected `onWarning`
// callback and the code→copy decision is wired HERE in the feature (mirroring `onTurnAbort`). This
// mapper stays PURE COPY — the one notice that offers a next step gets its action attached by the
// caller (`chat-content.tsx`), because navigation is a feature capability and copy is not.
//
// EXHAUSTIVE by construction (§5.5): the `switch` ends in `assertNever`, so a newly-added
// `CHAT_WARNING_CODES` member fails `tsc` until it is given copy — a new degrade can never ship
// user-silent. (A snake_case-keyed `Record` would trip `useNamingConvention`; the exhaustive switch is
// the sibling `turnAbortNotice` shape and carries the same tsc guarantee.)

import type { ChatWarningCode } from "@orb/contracts/chat";
import type { NotifyNotice } from "#lib";

/** The user-visible notice for a chat `warning` code — honest, plain-language copy voiced like the
 *  other transient chat notices (`TURN_STALE_ABORT_COPY`). Total over `ChatWarningCode`: every degrade
 *  is surfaced (unlike `turnAbortNotice`, no code is silenced — a `warning` is always something the
 *  user asked for that didn't happen). */
export function warningNotice(code: ChatWarningCode): NotifyNotice {
  switch (code) {
    case "image_dropped":
      return { description: "This model can't see images, so it was left out of the turn.", title: "Your image was ignored" };
    case "tools_unsupported":
      return { description: "This model doesn't support them, so the reply came back without any tool use.", title: "Tools were turned off for this reply" };
    case "memory_build_failed":
      return { description: "Your reply is unaffected — only the long-term memory index missed this turn.", title: "Long-term memory couldn't update" };
    case "structured_output_unsupported":
      return { description: "This model doesn't support it, so the reply came back as plain text.", title: "Structured output isn't supported" };
    case "prompt_transform_skipped":
      return { description: "It errored or ran too long, so your message was sent unchanged.", title: "A prompt rule was skipped" };
    case "image_edit_dropped":
      return { description: "This model can't edit images, so the picture was generated without your reference.", title: "Your reference image was ignored" };
    case "compaction_failed":
      return { description: "Your reply is unaffected — only the running summary missed this turn.", title: "The conversation summary couldn't update" };
    case "context_trimmed_no_summary":
      return {
        description: "The conversation got too long to summarize, so the oldest messages were dropped from context to keep going.",
        title: "Older messages were dropped from context",
      };
    case "smart_arbitration_degraded":
      return {
        description: "The turn director model wasn't available, so who speaks next was picked automatically.",
        title: "Who speaks next was picked automatically",
      };
    case "guided_placed_as_injection":
      return {
        description: "This preset has no Guided instruction marker to place it in, so your steering was added as an inline instruction.",
        title: "Your steering was added inline",
      };
    case "custom_parameters_ignored":
      return {
        description: "OpenRouter ignores them. They apply only on a Custom OpenAI-compatible connection.",
        title: "Your preset's custom parameters weren't sent",
      };
    default:
      return assertNeverCode(code);
  }
}

function assertNeverCode(code: never): never {
  throw new Error(`warningNotice: unhandled ChatWarningCode ${JSON.stringify(code)}`);
}
