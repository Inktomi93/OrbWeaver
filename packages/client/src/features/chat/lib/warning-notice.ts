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

import type { AdjustedKnob, ChatSettingsAdjustedWarning, ChatWarning, PlainChatWarningCode } from "@orb/contracts/chat";
import type { NotifyNotice } from "#lib";

/** The user-visible notice for a chat `warning` — honest, plain-language copy voiced like the
 *  other transient chat notices (`TURN_STALE_ABORT_COPY`). Total over `ChatWarningCode`: every degrade
 *  is surfaced (unlike `turnAbortNotice`, no code is silenced — a `warning` is always something the
 *  user asked for that didn't happen).
 *
 *  It takes the whole PAYLOAD rather than the code because `settings_adjusted` is one code over ten
 *  provider-degradation classes (#1440): the class, the dropped knob, and the value the provider actually
 *  used are the notice, and none of them can be recovered from the code. */
export function warningNotice(warning: ChatWarning): NotifyNotice {
  // THE CARRIER LEAVES FIRST, and the split is not stylistic: biome's type service does not narrow a
  // property read on a DISCRIMINATED UNION, so a single switch over `warning.code` has every arm flagged
  // `lint/suspicious/noUnnecessaryConditions` "unreachable" while tsc is fine (the same family as a
  // cross-module tuple union). Handing the plain switch a plain union keeps it legible to both checkers,
  // and it is also the honest shape — one of these notices is written from a payload, the rest from a code.
  return warning.code === "settings_adjusted" ? settingsAdjustedNotice(warning) : plainNotice(warning.code);
}

/** The twelve degrades whose notice is fully determined by the code. */
function plainNotice(code: PlainChatWarningCode): NotifyNotice {
  switch (code) {
    case "image_dropped":
      return { description: "This model can't see images, so it was left out of the turn.", title: "Your image was ignored" };
    case "video_dropped":
      return { description: "This model can't watch videos, so it was left out of the turn.", title: "Your video was ignored" };
    case "tools_unsupported":
      return { description: "This model doesn't support them, so the reply came back without any tool use.", title: "Tools were turned off for this reply" };
    case "memory_build_failed":
      return { description: "Your reply is unaffected — only the long-term memory index missed this turn.", title: "Long-term memory couldn't update" };
    case "memory_rerank_unavailable":
      return { description: "Using vector recall for this turn instead. Your reply will continue.", title: "Memory reranking was unavailable" };
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
    case "background_task_degraded":
      return {
        description: "Your connection doesn't allow background work, so summaries, captions and memory skipped this turn. Your reply is unaffected.",
        title: "Background tasks were skipped",
      };
    case "smart_arbitration_degraded":
      return {
        description: "The turn-arbiter model wasn't available, so who speaks next was picked automatically.",
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

/** The ten provider-degradation classes, each in the user's own words. The turn STILL RAN — every notice
 *  says what the provider did instead, because "we ignored your setting" without the substitute reads as a
 *  fault rather than a degrade.
 *
 *  Exhaustive by `assertNever` like its parent: a new `PROVIDER_ADJUSTMENT_KINDS` member fails `tsc` here
 *  until it is given copy, which is the whole point of surfacing the classes as data rather than as prose. */
function settingsAdjustedNotice(warning: ChatSettingsAdjustedWarning): NotifyNotice {
  const kind = warning.adjustment;
  switch (kind) {
    case "sampling_knob_dropped": {
      // NO FALLBACK LABEL: `knob` is absent only if a producer ever raises this class without saying which
      // setting it dropped, and naming an arbitrary knob there would be a lie about the user's own settings.
      const knob = warning.knob;
      return {
        description: samplingDropDescription(knob),
        title: knob === undefined ? "A generation setting wasn't used for this reply" : `${KNOB_LABELS[knob]} wasn't used for this reply`,
      };
    }
    case "sampling_knob_conflict": {
      const knob = warning.knob;
      return {
        description: "This model rejects that setting together with another one you set, so the other one was kept.",
        // The knob-less title must differ from `sampling_knob_dropped`'s (the distinct-title pin forbids the
        // collapse, and "wasn't used" hides that the cause was a CONFLICT the user can resolve).
        title: knob === undefined ? "Two generation settings conflicted" : `${KNOB_LABELS[knob]} conflicted with another setting`,
      };
    }
    case "effort_dropped":
      return {
        description: "This model doesn't offer the effort level you picked, so it reasoned at its own.",
        title: "Your reasoning effort wasn't used",
      };
    case "adaptive_budget_dropped":
      return { description: "This model decides its own thinking budget.", title: "Your thinking budget wasn't used" };
    case "display_dropped":
      return { description: "This model can't show its reasoning that way.", title: "Your reasoning display setting wasn't used" };
    case "verbosity_dropped":
      return {
        description: "This model doesn't offer a verbosity level, so its replies run at their usual length.",
        title: "Your verbosity setting wasn't used",
      };
    case "dynamic_context_demoted":
      return {
        description: "This model can't take updates mid-conversation, so they were folded into the system prompt instead.",
        title: "Per-turn context moved into the system prompt",
      };
    case "reasoning_mandatory_clamp":
      return {
        description:
          warning.appliedEffort === undefined
            ? "This model always reasons, so reasoning was turned on for this reply."
            : `This model always reasons, so the effort was raised to ${warning.appliedEffort} for this reply.`,
        title: "Reasoning was turned on for this reply",
      };
    case "reasoning_budget_clamped":
      return {
        description:
          warning.appliedBudget === undefined
            ? "A budget that large leaves the reply itself no room, so it was reduced for this turn."
            : `A budget that large leaves the reply itself no room, so this turn reasoned with ${warning.appliedBudget} tokens.`,
        title: "Your thinking budget was reduced",
      };
    case "tool_result_error_dropped":
      return {
        description: "This connection can't mark a tool result as failed, so the model may read it as one that worked.",
        title: "A failed tool result was sent as an ordinary one",
      };
    case "reasoning_dropped_for_prefill":
      return {
        description: "You gave the model text to continue, which it can't do while reasoning — so it continued your text instead.",
        title: "Reasoning was skipped for this reply",
      };
    // NOT a "wasn't used" sentence: the setting DID apply, with the provider's own value in place of the one
    // this model spells differently. Naming the knob when it is known keeps the notice actionable.
    case "provider_compatibility_mode":
      return {
        description:
          warning.knob === undefined
            ? "This model spells one of your settings differently, so the provider used its own value for this reply."
            : `This model spells ${KNOB_LABELS[warning.knob]} differently, so the provider used its own value for this reply.`,
        title: "The provider adjusted a setting for this model",
      };
    default:
      return assertNeverAdjustment(kind);
  }
}

/** WHY a knob didn't reach the model. Three honest answers, not one: the eleven sampling knobs are
 *  capability-gated, the thinking budget is a reasoning-MODE mismatch (there IS somewhere else to set it),
 *  and an unknown quality level is a stored value this app no longer recognises — not the model's doing at
 *  all. Flattening them to one line would put a false reason on two of the thirteen.
 *
 *  Every member is listed rather than grouped under a `default`, so a new `ADJUSTED_KNOBS` member has to be
 *  classified into one of the three answers instead of silently inheriting the capability one. */
function samplingDropDescription(knob: AdjustedKnob | undefined): string {
  switch (knob) {
    case "thinkingBudgetTokens":
      return "This model reasons by effort level and has no thinking-budget setting — set the effort dial instead.";
    case "quality":
      return "That quality level isn't one this app knows, so your own settings were used instead.";
    case "replyMedia":
      return "This model writes text only, so it couldn't add pictures to its reply.";
    case "temperature":
    case "topP":
    case "topK":
    case "frequencyPenalty":
    case "presencePenalty":
    case "repetitionPenalty":
    case "minP":
    case "topA":
    case "seed":
    case "logitBias":
    case "stop":
    // An unnamed drop reads the same way: the model didn't take the setting. It is the TITLE that must not
    // invent a name, and it doesn't.
    case undefined:
      return "This model doesn't offer this setting, so the reply used the model's own value.";
    default:
      return assertNeverKnob(knob);
  }
}

function assertNeverKnob(knob: never): never {
  throw new Error(`warningNotice: unhandled AdjustedKnob ${JSON.stringify(knob)}`);
}

/** The knob names as the user meets them — the same words the preset deck prints
 *  (`features/preset/lib/capability-panel-model.ts` + `components/params-deck.tsx`). Spelled here rather than
 *  imported because a client feature may not import another feature's internals at runtime; the mapped
 *  `Record` is the exhaustiveness enforcer (a new `ADJUSTED_KNOBS` member fails `tsc` here). */
const KNOB_LABELS: Record<AdjustedKnob, string> = {
  frequencyPenalty: "Frequency penalty",
  logitBias: "Logit bias",
  minP: "Min-P",
  presencePenalty: "Presence penalty",
  quality: "Quality",
  repetitionPenalty: "Repetition penalty",
  replyMedia: "Reply pictures",
  seed: "Seed",
  stop: "Stop sequences",
  temperature: "Temperature",
  thinkingBudgetTokens: "Thinking budget",
  topA: "Top-A",
  topK: "Top-K",
  topP: "Top-P",
};

function assertNeverCode(code: never): never {
  throw new Error(`warningNotice: unhandled PlainChatWarningCode ${JSON.stringify(code)}`);
}

function assertNeverAdjustment(kind: never): never {
  throw new Error(`warningNotice: unhandled ProviderAdjustmentKind ${JSON.stringify(kind)}`);
}
