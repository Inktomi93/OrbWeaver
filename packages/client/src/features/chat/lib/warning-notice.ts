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

import type {
  AdjustedKnob,
  BannedPhraseCause,
  ChatRegexNotAppliedWarning,
  ChatSettingsAdjustedWarning,
  ChatWarning,
  PlainChatWarningCode,
} from "@orb/contracts/chat";
import { ADJUSTED_KNOB_NAMES } from "@orb/contracts/chat";
import type { NotifyNotice } from "#lib";
import { BUG_REPORT_NAME } from "#lib";
import { regexNotAppliedDescription, regexNotAppliedTitle } from "./regex-stop-copy.ts";

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
  // `noUnnecessaryConditions` (off in `tooling/src/biome-config/policy.config.ts`) "unreachable" while tsc is fine (the same family as a
  // cross-module tuple union). Handing the plain switch a plain union keeps it legible to both checkers,
  // and it is also the honest shape — one of these notices is written from a payload, the rest from a code.
  if (warning.code === "settings_adjusted") {
    return settingsAdjustedNotice(warning);
  }
  if (warning.code === "regex_not_applied_overflow") {
    return regexNotAppliedNotice([], warning.count);
  }
  return warning.code === "regex_script_not_applied"
    ? regexNotAppliedNotice([{ name: null, cause: warning.cause, pass: warning.pass }])
    : plainNotice(warning.code);
}

/** The label of the door a dropped-setting notice offers: the preset editor's Params view. */
export const OPEN_PARAMS_NAME = "Open Params";

/** The id the room's one notice for skipped regex scripts carries, so each new report updates it in place. */
const REGEX_NOT_APPLIED_NOTICE_ID = "regex-scripts-not-applied";

/** The room's one notice for every host script a server pass skipped this session, newest last. A name is the
 *  host's own library's, or `null` for an id the library no longer holds. `more` counts the scripts a turn reported
 *  past its per-turn cap, which arrive as a count with no ids. Host-only by delivery: a member never receives the
 *  event. */
export function regexNotAppliedNotice(
  skipped: readonly (Pick<ChatRegexNotAppliedWarning, "cause" | "pass"> & { readonly name: string | null })[],
  more = 0,
): NotifyNotice {
  const latest = skipped.at(-1);
  return {
    id: REGEX_NOT_APPLIED_NOTICE_ID,
    title: regexNotAppliedTitle(skipped.length + more),
    description: regexNotAppliedDescription(latest, skipped.length + more, more),
  };
}

/** A turn's drops as ONE notice (`turn-warning-cadence.ts`): a single drop keeps its own notice, and several
 *  share a title that counts them while the description lists each drop's own title. A list setting that partly
 *  rode counts apart from the settings that did not, and its line keeps how many were sent: it is not a thing the
 *  reply ran without. */
export function turnDropsNotice(warnings: readonly ChatWarning[]): NotifyNotice {
  const [only] = warnings;
  if (warnings.length === 1 && only !== undefined) {
    return warningNotice(only);
  }
  const partials = warnings.filter(isPartialDrop).length;
  const whole = warnings.length - partials;
  const without = whole === 0 ? [] : [`ran without ${countedThings(whole)} you asked for`];
  const part = partials === 0 ? [] : [whole === 0 ? `used only part of ${countedThings(partials)} you asked for` : `used only part of ${anotherOf(partials)}`];
  return {
    title: `This reply ${[...without, ...part].join(" and ")}`,
    description: warnings.map(groupLine).join(" "),
  };
}

function countedThings(count: number): string {
  return count === 1 ? "1 thing" : `${String(count)} things`;
}

function anotherOf(count: number): string {
  return count === 1 ? "another" : `${String(count)} others`;
}

/** One drop's line in a grouped description: its title, and for a partial drop how many were sent. */
function groupLine(warning: ChatWarning): string {
  const title = warningNotice(warning).title;
  const partial = warning.code === "settings_adjusted" ? partialDropOf(warning) : undefined;
  return partial === undefined ? `${title}.` : `${title}. ${sentClause(partial.sent)}`;
}

function isPartialDrop(warning: ChatWarning): boolean {
  return warning.code === "settings_adjusted" && partialDropOf(warning) !== undefined;
}

/** The outcomes whose notice is fully determined by the code — every `PLAIN_CHAT_WARNING_CODES` member. */
function plainNotice(code: PlainChatWarningCode): NotifyNotice {
  switch (code) {
    case "image_dropped":
      return { description: "This model can't see images, so it was left out of the turn.", title: "Your image was ignored" };
    case "video_dropped":
      return { description: "This model can't watch videos, so it was left out of the turn.", title: "Your video was ignored" };
    case "tools_unsupported":
      return { description: "This model doesn't support them, so the reply came back without any tool use.", title: "Tools were turned off for this reply" };
    case "memory_build_failed":
      return { description: "Your reply is unaffected. Only the long-term memory index missed this turn.", title: "Long-term memory couldn't update" };
    case "memory_rerank_unavailable":
      return { description: "Using vector recall for this turn instead. Your reply will continue.", title: "Memory reranking was unavailable" };
    // Names the REPAIR, not the internals: "index" and "vector space" are words no screen shows, and the two
    // causes (mid-move, or no embedder bound) both end at the same place — Connections.
    case "retrieval_index_unavailable":
      return {
        description: "Your reply went through without recalled memory or attached documents. Check your embedding connection in Connections.",
        title: "Your library couldn't be searched",
      };
    case "prompt_transform_skipped":
      return { description: "It errored or ran too long, so your message was sent unchanged.", title: "A prompt rule was skipped" };
    case "image_edit_dropped":
      return { description: "This model can't edit images, so the picture was generated without your reference.", title: "Your reference image was ignored" };
    case "image_count_dropped":
      return { description: "This connection makes one image per request, so only one was made.", title: "Fewer images were made than asked for" };
    case "image_size_dropped":
      return { description: "This connection chooses its own image size, so the requested size wasn't used.", title: "The image size was ignored" };
    case "compaction_failed":
      return { description: "Your reply is unaffected. Only the running summary missed this turn.", title: "The conversation summary couldn't update" };
    case "context_tokenizer_trimmed":
      return { title: "Older messages were left out", description: "The connection counted the prompt text. Only the newest history that fits was sent." };
    case "context_tokenizer_unavailable":
      return { title: "Prompt size was estimated", description: "The connection could not count prompt text, so this turn used the usual estimate." };
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
    case "own_server_features_ignored":
      return {
        description:
          "This connection is a paid service, so the sampler and banned-phrase options meant for your own server weren't sent. Turn them off in the connection's settings.",
        title: "Your own-server options weren't used",
      };
    case "smart_arbitration_degraded":
      return {
        description: "Natural picked who speaks next. Characters you name clearly still answer without it.",
        title: "Smart couldn't use your Utility model",
      };
    case "speaker_rerank_unavailable":
      return {
        description: "Characters you name still answer, in the order you name them. Anyone else is picked by Natural until a Rerank model is available.",
        title: "No Rerank model to pick who speaks next",
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
    // The one notice about the MODEL's own choice rather than a setting. No reason is quoted: the provider's
    // own words are unstable prose and never reach the client (see the code's comment in the bus tuple).
    case "provider_refused":
      return {
        description: "Its safety filter stopped this one. Editing the last message or swiping again usually gets past it.",
        title: "The provider declined to write this reply",
      };
    // The refusal's other ending: a reply did come, from a model the user did not choose.
    case "provider_refused_fallback":
      return {
        description: "The chosen model declined, so the provider answered with its fallback model. Swipe to ask the chosen model again.",
        title: "A fallback model wrote this reply",
      };
    case "model_downgraded":
      return {
        description: "The provider answered with a different model than the one this connection names. Check the connection's model.",
        title: "A different model wrote this reply",
      };
    // Says that nothing ran, so the reader knows the reply is safe to keep, and names the one thing that helps.
    case "tool_permission_denied":
      return {
        description: `The model asked to use a tool this chat never offered. It was blocked, so nothing ran. If this keeps happening, use ${BUG_REPORT_NAME}.`,
        title: "A tool request was blocked",
      };
    // The model DID draw something and we couldn't keep it. Says so plainly and offers the one thing that
    // actually helps — the words are still there, and another swipe re-draws.
    case "reply_image_failed":
      return {
        description: "The words came through, but the picture didn't save. Swiping again usually redraws it.",
        title: "A picture in this reply couldn't be saved",
      };
    // Says where globals do work, so the reader knows the card is not broken.
    case "global_variables_held":
      return {
        description: "This reply's prompt reads or sets global variables, which only run in a room no one else has ever joined.",
        title: "Global variables were skipped in this shared room",
      };
    case "global_variable_dropped":
      return {
        description:
          "A card or preset tried to save a global variable that was too large, or more variables than the limit allows. The reply and the other variables were saved.",
        title: "A global variable wasn't saved",
      };
    // Host-only by delivery: the reply stands, and members stop reading at the broken tag until the host mends it.
    case "hidden_tag_broken":
      return {
        description: "Members see this reply only up to a hidden tag the model wrote badly. Fix the tag or swipe to show them the rest.",
        title: "Part of this reply is hidden from members",
      };
    default:
      return assertNeverCode(code);
  }
}

interface PartialDrop {
  readonly knob: AdjustedKnob;
  readonly dropped: number;
  readonly sent: number;
}

/** A list setting that partly rode: which one, how many entries did not, and how many did. */
function partialDropOf(warning: ChatSettingsAdjustedWarning): PartialDrop | undefined {
  const { knob, droppedCount, sentCount } = warning;
  return warning.adjustment === "sampling_knob_dropped" && knob !== undefined && droppedCount !== undefined && sentCount !== undefined
    ? { knob, dropped: droppedCount, sent: sentCount }
    : undefined;
}

function sentClause(sent: number): string {
  return sent === 1 ? "The other one was sent." : `The other ${String(sent)} were sent.`;
}

// A list setting the server took in part: how many entries did not ride, why, and that the rest did. The phrases
// themselves never reach the bus, so the reason is a closed cause and the way out is a place, not a phrase.
function partialDropNotice({ knob, dropped, sent }: PartialDrop, cause: BannedPhraseCause | undefined): NotifyNotice {
  const droppedClause = dropped === 1 ? "1 wasn't" : `${String(dropped)} weren't`;
  const one = dropped === 1;
  const cannot =
    cause === "tokenizer"
      ? `This server's tokenizer couldn't check ${one ? "that one" : "those"}.`
      : `This server can't ban ${one ? "that one" : "those"} mid-sentence the way ${one ? "it was" : "they were"} written.`;
  const way =
    cause === "tokenizer" ? "Check this connection's tokenize endpoint." : `Reword ${one ? "it" : "them"}, or put an antislop proxy in front of this server.`;
  return {
    description: `${cannot} ${sentClause(sent)} ${way}`,
    title: `${ADJUSTED_KNOB_NAMES[knob].label}: ${droppedClause} used for this reply`,
  };
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
    case "cache_control_adjusted":
      return {
        title: "Cache controls changed for this reply",
        description: "This connection couldn't apply all your requested cache controls. Check its cache settings; provider-managed caching may still run.",
      };
    case "sampling_knob_dropped":
      return knobDroppedNotice(warning);
    case "sampling_knob_conflict": {
      const knob = warning.knob;
      return {
        description: "This model rejects that setting together with another one you set, so the other one was kept.",
        // The knob-less title must differ from `sampling_knob_dropped`'s (the distinct-title pin forbids the
        // collapse, and "wasn't used" hides that the cause was a CONFLICT the user can resolve).
        title: knob === undefined ? "Two generation settings conflicted" : `${ADJUSTED_KNOB_NAMES[knob].label} conflicted with another setting`,
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
        // The model reasons whether or not it shows its thinking, so the notice never claims that reasoning appeared.
        description:
          warning.appliedEffort === undefined
            ? "Reasoning can't be switched off on this model, so your setting to turn it off wasn't used. Whether you see its thinking is up to the model."
            : `Reasoning can't be switched off on this model, so the effort was raised to ${warning.appliedEffort} for this reply.`,
        title: "This model always reasons",
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
        description: "You gave the model text to continue, which it can't do while reasoning, so it continued your text instead.",
        title: "Reasoning was skipped for this reply",
      };
    case "prefill_reasoning_dropped":
      return {
        description: "The thinking you wrote can ride only a reply you left half-finished for the model, and this turn had none, so it was not sent.",
        title: "Your written thinking wasn't used",
      };
    case "prefill_suppressed_by_tools":
      return {
        description:
          "This turn also runs a tool, and a reply the model continues can't stop and call one at the same time. Your half-written reply was sent as a normal message.",
        title: "Your half-written reply wasn't continued",
      };
    case "tool_choice_downgraded":
      return {
        description: "This model can't be made to call a tool, so the tools were offered and it chose whether to use one.",
        title: "A required tool call became optional",
      };
    case "carry_reasoning_downgraded":
      return {
        description:
          "This model's earlier thinking stays valid only while the conversation before it is unchanged, and this connection can't protect a reply from an earlier edit. So the model kept its thinking only within this reply's tool calls.",
        title: "Reasoning carry was limited to this reply",
      };
    // NOT a "wasn't used" sentence: the setting DID apply, with the provider's own value in place of the one
    // this model spells differently. Naming the knob when it is known keeps the notice actionable.
    case "provider_compatibility_mode":
      return {
        description:
          warning.knob === undefined
            ? "This model spells one of your settings differently, so the provider used its own value for this reply."
            : `This model spells ${ADJUSTED_KNOB_NAMES[warning.knob].label} differently, so the provider used its own value for this reply.`,
        title: "The provider adjusted a setting for this model",
      };
    default:
      return assertNeverAdjustment(kind);
  }
}

function knobDroppedNotice(warning: ChatSettingsAdjustedWarning): NotifyNotice {
  // NO FALLBACK LABEL: `knob` is absent only if a producer ever raises this class without saying which
  // setting it dropped, and naming an arbitrary knob there would be a lie about the user's own settings.
  const knob = warning.knob;
  // A partial drop: the rest of the list DID ride, so the notice must not read as the setting having failed.
  const partial = partialDropOf(warning);
  if (partial !== undefined) {
    return partialDropNotice(partial, warning.cause);
  }
  return {
    description: samplingDropDescription(knob, warning.cause),
    title:
      knob === undefined
        ? "A generation setting wasn't used for this reply"
        : `${ADJUSTED_KNOB_NAMES[knob].label} ${ADJUSTED_KNOB_NAMES[knob].plural ? "weren't" : "wasn't"} used for this reply`,
  };
}

/** WHY a knob didn't reach the model. Three honest answers, not one: the eleven sampling knobs are
 *  capability-gated, the thinking budget is a reasoning-MODE mismatch (there IS somewhere else to set it),
 *  and an unknown quality level is a stored value this app no longer recognises — not the model's doing at
 *  all. Flattening them to one line would put a false reason on two of the thirteen.
 *
 *  Every member is listed rather than grouped under a `default`, so a new `ADJUSTED_KNOBS` member has to be
 *  classified into one of the three answers instead of silently inheriting the capability one. */
function samplingDropDescription(knob: AdjustedKnob | undefined, cause: BannedPhraseCause | undefined): string {
  switch (knob) {
    case "thinkingBudgetTokens":
      return "This model reasons by effort level and has no thinking-budget setting. Set the effort dial instead.";
    case "quality":
      return "That quality level isn't one this app knows, so your own settings were used instead.";
    case "replyMedia":
      return "This model writes text only, so it couldn't add pictures to its reply.";
    case "carryReasoning":
      // Two causes, one honest sentence: the model refuses replayed thinking, or thinking was off this turn.
      // Naming which would take a second structured field on the warning; "it wasn't used" is true of both.
      return "This reply didn't get the model's earlier thinking back. Either the model won't take it, or thinking was off.";
    case "parallelToolCalls":
      return "This connection's runtime has no parallel tool call setting, so it decided on its own how to call tools.";
    case "bannedStrings":
      return bannedPhrasesDropDescription(cause);
    case "slopList":
    case "slopStrength":
      return "Only an antislop proxy takes this, and this connection doesn't use one, so nothing was sent.";
    case "temperature":
    case "topP":
    case "topK":
    case "frequencyPenalty":
    case "presencePenalty":
    case "repetitionPenalty":
    case "minP":
    case "topA":
    case "repetitionPenaltyRange":
    case "typicalP":
    case "topNSigma":
    case "xtcProbability":
    case "xtcThreshold":
    case "dryMultiplier":
    case "dryBase":
    case "dryAllowedLength":
    case "dryPenaltyLastN":
    case "mirostatMode":
    case "mirostatTau":
    case "mirostatEta":
    case "dynatempRange":
    case "dynatempExponent":
    case "smoothingFactor":
    case "smoothingCurve":
    case "adaptiveTarget":
    case "adaptiveDecay":
    case "minKeep":
    case "banEos":
    case "seed":
    case "logitBias":
    case "stop":
    case "drySequenceBreakers":
    case "samplerOrder":
    // An unnamed drop reads the same way: the model didn't take the setting. It is the TITLE that must not
    // invent a name, and it doesn't.
    case undefined:
      return "This model doesn't offer this setting, so the reply used the model's own value.";
    default:
      return assertNeverKnob(knob);
  }
}

/** Every banned phrase went unsent: the server's own rule, its tokenizer, or a connection that states no phrase ban. */
function bannedPhrasesDropDescription(cause: BannedPhraseCause | undefined): string {
  switch (cause) {
    case "sequence":
      return "This server can't ban phrases mid-sentence the way you wrote them, so none were sent. Reword them, or put an antislop proxy in front of this server.";
    case "tokenizer":
      return "This server's tokenizer couldn't check the phrases, so none were sent. Check this connection's tokenize endpoint.";
    case undefined:
      return "This connection doesn't take banned phrases, so none were sent.";
    default:
      return assertNeverCause(cause);
  }
}

function assertNeverCause(cause: never): never {
  throw new Error(`warningNotice: unhandled BannedPhraseCause ${JSON.stringify(cause)}`);
}

function assertNeverKnob(knob: never): never {
  throw new Error(`warningNotice: unhandled AdjustedKnob ${JSON.stringify(knob)}`);
}

function assertNeverCode(code: never): never {
  throw new Error(`warningNotice: unhandled PlainChatWarningCode ${JSON.stringify(code)}`);
}

function assertNeverAdjustment(kind: never): never {
  throw new Error(`warningNotice: unhandled ProviderAdjustmentKind ${JSON.stringify(kind)}`);
}
