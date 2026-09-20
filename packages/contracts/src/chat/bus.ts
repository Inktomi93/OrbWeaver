// @orb/contracts/chat/bus — the chat stream delta + the room-public `ChatBusEvent` union, the provider-send
// content-part shape (D45), the domain warning-code taxonomy (D41), the turn-origin/initiator vocabulary,
// and the D50 synchronous PromptTransform seam.
//
// LAWS honored here:
//   • Turn identity (D19): no bus event carries a caller id — turn attribution rides the turn path
//     (`triggeredBy`/`runAsUserId`), never the public bus.
//   • Bus-payload allowlist (Part III inv §11): every `ChatBusEvent` member is a closed object literal of
//     branded ids, enum literals, plain scalars, and `MessageView` — credentials/secrets/baseUrls are
//     TYPE-LEVEL UNREPRESENTABLE (no member declares a field to carry one).

import type { CharacterId, ChatId, MessageId, MessageVariantId, PersonaId, WorldEntryId } from "@orb/kit/ids";
import type { JsonValue } from "@orb/kit/json";
import type { ChatApi, EffortLevel, ProviderId } from "#inference";
import type { WiBusEvent } from "#world-info";
import type { MessageView } from "./messages.ts";
import type { ReactionEmoji } from "./reactions.ts";

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE CHAT STREAM DELTA + THE CHAT BUS UNION
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

/** A stream delta wrapped inside a `ChatBusEvent` of `type: "delta"`.
 *
 *  THIS TYPE IS ALSO THE PROVIDER-LEVEL CHUNK (`infra/providers/contract/events` re-exports it; every backend
 *  runner constructs one). It therefore carries only what a backend can truthfully know — chat id, channel,
 *  text. The D16 classification anchor (`messages.seq`) is NOT here and must never be: a provider has no
 *  concept of a canon slot, so a `seq` on this type could only be fabricated. The anchor rides the BUS member
 *  instead (`ChatBusEvent`'s `delta` arm → `slotSeq`), stamped by the ONE domain emit site that knows it. */
export type ChatDeltaEvent = { chatId: ChatId; kind: "text"; text: string } | { chatId: ChatId; kind: "reasoning"; text: string };

/** One part of a history turn's content on the PROVIDER-SEND path (D45). A turn is ALWAYS a content-part
 *  array; a text-only turn is a one-element `[{ type:"text" }]` (no `if(hasImage)` branch — the no-special-case
 *  discipline). `image.url` is the resolved, model-fetchable URL/data-URI the chat domain produced at the
 *  engine REQUEST seam (asset→CAS URL or a gated external URL); a non-vision model never receives image parts
 *  (the engine drops them, gated by `ModelCapability.input.vision`, + emits a `warning` bus event), and a
 *  non-video model never receives video parts (`input.video`, `video_dropped` — the #317 twin). This is
 *  the ONE home (D45 "the cross-boundary message DTOs in `@orb/contracts/chat` carry the same"); the infra
 *  `ChatHistoryMessage` imports it. Distinct from the D44 RENDER `MessageContentBlock` (display ⇆ client). */
/** The PER-WIRE opaque provenance a `reasoning` part carries so the next leg of a tool loop can hand the
 *  model back its own verified thinking. CLOSED by wire, never an open bag: each arm is exactly what that
 *  provider's SDK reads off a replayed reasoning part, spelled in the provider's own vocabulary.
 *
 *  • `anthropic` — `signature` on a normal thinking block, `redactedData` on a redacted one
 *    (`@ai-sdk/anthropic` emits them on `reasoning-delta` / `reasoning-start` respectively and requires one
 *    of the two back, else it drops the block with a warning).
 *  • `openrouter` — the whole `reasoning_details` list verbatim. It is provider-shaped JSON (Anthropic
 *    signatures, Gemini thought signatures, OpenAI encrypted reasoning) that OUR layer never interprets: the
 *    OR provider re-validates it and strips entries whose signature is missing, so round-tripping the exact
 *    bytes is the whole contract. `JsonValue` (not `unknown`) keeps it serializable and re-parsable. */
export interface ReasoningPartMeta {
  readonly anthropic?: { readonly signature?: string | undefined; readonly redactedData?: string | undefined } | undefined;
  readonly openrouter?: { readonly reasoningDetails: readonly JsonValue[] } | undefined;
}

export type ChatContentPart =
  | { readonly type: "text"; readonly text: string }
  /* The model's own THINKING, kept so a tool loop can replay it (audit A1). Content, not display: the
   * rendered reasoning a user reads is the variant's `reasoning` string — this part exists because every
   * hosted provider verifies its prior reasoning by an opaque signature and a loop that drops it hands the
   * model an amnesiac transcript (and, on the arms that enforce verification, a 400). `text` may be EMPTY:
   * a redacted thinking block is signature-only. */
  | { readonly type: "reasoning"; readonly text: string; readonly meta?: ReasoningPartMeta | undefined }
  | { readonly type: "image"; readonly url: string }
  /* The #317 video sibling of the image part — same resolve seam, same attachment-only rule, gated by
   * `ModelCapability.input.video` instead of `input.vision`. The MEDIA KIND is a fact of the stored asset
   * (mime, plus the animated byte-fact for gif-as-motion), classified ONCE by the engine's injected
   * resolver — a translator dispatches on `type` and never re-sniffs. `url` is a data URI/model-fetchable
   * URL exactly like `image.url`. */
  | { readonly type: "video"; readonly url: string }
  /* The D48 tool exchange (tool-use-design/02 §1): parts are the WIRE form only — persisted form is
   * `ToolCallRecord[]` on the variant (never markdown in a body, never a slot row); assembly MATERIALIZES
   * a recorded exchange into `assistant(tool-call)` + `tool(tool-result)` messages at the engine REQUEST
   * seam, so the string-shaped assemble/SHAPE transforms stay parts-blind (the D51 law, both directions). */
  | {
      readonly type: "tool-call"; // assistant emits — one per model-requested call
      readonly toolCallId: string;
      readonly name: string;
      /** RAW model-emitted JSON string (parsed once, at execute). */
      readonly arguments: string;
    }
  | {
      readonly type: "tool-result"; // the wire `tool` role carries — one per executed call
      /** Joins back to the originating tool-call. */
      readonly toolCallId: string;
      /** The record's `result` JSON document. */
      readonly content: string;
      readonly isError?: boolean | undefined;
    };

/** The warning codes whose user-facing notice is written from the CODE ALONE — every degrade except the
 *  `settings_adjusted` carrier, which needs its payload (#1440). Its own tuple rather than an
 *  `Exclude<ChatWarningCode, …>` for a measured reason: biome's type service does not evaluate a conditional
 *  type, so an `Exclude`-typed field makes it call every arm of the client's copy switch unreachable
 *  (`lint/suspicious/noUnnecessaryConditions`) while `tsc` is fine — the cross-module-union family. A tuple
 *  it can read keeps the switch legible to BOTH checkers. */
export const PLAIN_CHAT_WARNING_CODES = [
  // Image parts were stripped because the resolved model's `input.vision` isn't true (D45).
  "image_dropped",
  // Video parts (mp4/webm/animated-gif attachments, #317) were stripped because the resolved model's
  // `input.video` isn't true — the video twin of `image_dropped`, emitted from the same engine seam.
  "video_dropped",
  // Tools were attached but `capability.tools` is absent → dropped; the turn proceeds tool-less
  // (D48; the domain-side gate per D51's rule — the emit site is the engine's attach gate).
  "tools_unsupported",
  // The post-turn memory build (§3a fire-and-forget) threw — group/scoped digests did NOT build this turn
  // (a summarizer outage, a store failure, a mint failure). Emitted from the engine's memory-trigger catch so
  // the silent-failure black hole (stickler F1/F1d) is observable; the turn's reply is unaffected.
  "memory_build_failed",
  // mixC recall's cross-encoder reranker failed after vector retrieval had already succeeded. The turn keeps
  // the exact mixB/vector order and emits once for the whole turn's round + per-speaker recall episode.
  "memory_rerank_unavailable",
  // A structured-output `responseFormat` was requested but `capability.output.structured` isn't true → dropped;
  // the turn proceeds free-text (D79 interactive-axis degrade, 04 §7; the emit site is the engine's structured
  // request-builder gate, mirror of tools_unsupported).
  "structured_output_unsupported",
  // A registered `PromptTransform` (automation `transform_draft` / a plugin) threw or blew its 250 ms deadline
  // → the draft passed through UNCHANGED (D53 — a broken transform never eats a turn).
  // Emitted from the registry's apply pass so a host sees a misbehaving rule/plugin without losing the reply.
  "prompt_transform_skipped",
  // An image generation dropped its edit/avatar-reference input because the resolved image model lacks
  // `input.imageEdit` (the domain B3 gate drops-with-warning, or the runner belt strips
  // a stale-capability edit). Emitted from `chat.generateImage`, mapping `GeneratedPicture.warnings` onto the
  // one chat `warning` surface so the user sees "generated without the avatar reference (model can't edit)".
  "image_edit_dropped",
  // Managed compaction (the post-turn LINEAR-marker refresh) FAILED — the quiet marker generation threw or
  // returned empty, so the EXISTING marker is untouched (never a half-written marker). Emitted from the engine's
  // compaction-trigger catch (the mirror of memory_build_failed) so the silent-failure black hole is observable;
  // the turn's reply is unaffected.
  "compaction_failed",
  // THE NO-WALL BELT (#9 owner ruling — compaction is a safety property): the pre-turn arm found the context
  // at/over the effective window AND no usable marker materialized (compaction kept failing/empty), so the turn
  // was DEGRADED — the session was force-reseeded (drop-oldest fit-trim, the turn survives) WITHOUT a summary.
  // Degraded-and-loud, never error-and-dead. The client warning-notice mapper is a rotation-4 restoration; the
  // server emits this now so the pickup lands later.
  "context_trimmed_no_summary",
  // The `smart` group policy's side-LLM turn arbiter was unusable this round — the summarize role threw
  // (unwired/offline backend, HTTP error) or its reply named nobody on the eligible roster — so the speaking
  // order fell back to the deterministic talkativeness-weighted `natural` arbitration. Emitted from the turn
  // verb's arbitrate step: the round still happens, but the user is told the MATH picked, not the model.
  "smart_arbitration_degraded",
  // A BACKGROUND task (summaries, captions, digests) could not run for this turn's funder — no binding, or the
  // bound row has `allowBackground` off (inference program §5.3a: the background tasks share ONE degrade
  // notice so "nothing ran" is never the whole signal). The turn itself is unaffected.
  "background_task_degraded",
  // A `system`-placement guided steer FELL BACK to a depth-0 injection because the active preset's template
  // lacks (or disabled) the `{{guided_instruction}}` marker (§10 addendum / F8). The steer still lands — via
  // the ChatInjection channel — instead of vanishing behind the config-editor's marker chip. Degraded-and-loud
  // (D41): emitted from the engine's capability-drop pass off the assembled `guidedPlacedAsInjection` flag.
  "guided_placed_as_injection",
  // The preset's `customParameters` escape-hatch blob did NOT reach the wire: it is BYOK/custom-byo-only and
  // OpenRouter's own knobs are the modeled sampling surface (the anti-sprawl design), so both OR chat runners
  // drop it. The INFRA runner raises this as its own `WARNING_CODES` member; the compose bridge re-maps it onto
  // this chat vocabulary — the same infra→chat hop the IMAGE role uses for `image_edit_dropped`
  // (`entry/compose/imagery.ts` narrows, `chat/verbs/generate-image.ts` re-maps). Spelled IDENTICALLY in both
  // tuples so the map is a MATCH, never a re-spell. Dropped-and-loud (D41), never silently swallowed.
  "custom_parameters_ignored",
  // THE PROVIDER DECLINED THIS REPLY — the wire came back with a content-filter finish rather than prose
  // (Anthropic's `stop_details` refusal, the agent-sdk's own refusal channel). Degraded-and-loud (D41):
  // without it a refusal reads to the author as an empty or truncated reply with no reason given.
  // CODE-ALONE by necessity, not by preference: the provider's `category`/`explanation`/`fallbackModel` are
  // raw upstream strings, and a `warning` bus member may carry only enum literals and plain scalars (the
  // bus-payload allowlist + the `index.test-d.ts` anchor pins). That detail stays where it already lives —
  // the infra `refusal` ChatEvent and the wire-outcome ring — and this is the user's half.
  "provider_refused",
] as const;
export type PlainChatWarningCode = (typeof PLAIN_CHAT_WARNING_CODES)[number];

/** Why the engine dropped content from a turn (the domain-originated `warning` bus event — distinct from the
 *  infra runner's `ResolvedWarning`/`WARNING_CODES`, which report resolve/wire drops). One home; the union is
 *  derived from this tuple (no inline re-spell), and the tuple COMPOSES the plain codes above with the one
 *  detail-bearing carrier so neither list can drift from the other.
 *
 *  THE PROVIDER-ADJUSTMENT CARRIER (#1440, owner ruling 2026-09-05). Ten resolve/wire degradation classes
 *  used to map to `null` at the domain boundary (`engine.ts` `toChatWarning`) and were filtered out, so a
 *  user believed a requested knob/budget/tool result applied when the provider had ignored or clamped it.
 *  They surface as ONE code carrying STRUCTURED detail rather than ten members, because the ten share a
 *  single user sentence — "the provider did not do what you asked, here is what it did instead" — and the
 *  thing that differs is DATA (which knob, which value), not copy structure. The detail rides
 *  `adjustment` (+ `knob`/`appliedBudget`/`appliedEffort`); the client renders one notice per class. */
export const CHAT_WARNING_CODES = [...PLAIN_CHAT_WARNING_CODES, "settings_adjusted"] as const;
export type ChatWarningCode = (typeof CHAT_WARNING_CODES)[number];

/** WHICH provider degradation a `settings_adjusted` warning reports — the chat-side vocabulary for the
 *  resolve/wire drop classes the infra runners raise (`infra/providers/contract/resolve.ts` `WARNING_CODES`).
 *  Spelled IDENTICALLY to that tuple's ten degradation members so the domain map is a MATCH, never a
 *  re-spell — the `custom_parameters_ignored` precedent. It is a SEPARATE tuple by necessity and by design:
 *  `contracts` sits below `server`, so it cannot import infra's vocabulary, and chat must stay free to
 *  classify a drop differently from the runner that raised it. One home; the union derives from it. */
export const PROVIDER_ADJUSTMENT_KINDS = [
  // A sampling/quality knob was not sent: the resolved model exposes no range for it, does not support it,
  // or (for `thinkingBudgetTokens`) reasons by effort level and has no budget field. `knob` names which.
  "sampling_knob_dropped",
  // Two knobs the model rejects TOGETHER (`capability.sampling.exclusive`); the funnel kept the first-listed
  // and dropped the other. `knob` names the dropped one.
  "sampling_knob_conflict",
  // The requested reasoning effort is not one the model lists — it chose its own.
  "effort_dropped",
  // A thinking-budget request hit an ADAPTIVE-reasoning model, which budgets itself (an explicit budget 400s it).
  "adaptive_budget_dropped",
  // The requested reasoning-display mode is not one the model offers.
  "display_dropped",
  // The requested verbosity level is not one the model offers.
  "verbosity_dropped",
  // The per-turn system half was asked to ride the mid-conversation hook channel on a model that does not
  // honor one, so it was folded into the system block instead.
  "dynamic_context_demoted",
  // Reasoning is MANDATORY on this model, so an off/absent effort was clamped UP. `appliedEffort` is what ran.
  "reasoning_mandatory_clamp",
  // A budget-mode reasoning budget was clamped DOWN to leave the visible reply headroom under the output
  // cap. `appliedBudget` is the budget that ran.
  "reasoning_budget_clamped",
  // A history tool-result carried `isError`, which this wire cannot express — the model reads a failed tool
  // result as an ordinary one.
  "tool_result_error_dropped",
  // The turn carried a content prefill AND asked for thinking — mutually exclusive on this wire, so the
  // prefill won and the thinking kwargs were dropped.
  "reasoning_dropped_for_prefill",
  // The provider ran the turn in a COMPATIBILITY mode: it substituted its own value where this model spells
  // a setting differently (a default thinking budget, an output cap guessed for a model it does not know) or
  // accepted a deprecated spelling. Distinct from the drop classes above because the setting DID apply —
  // just not as asked — so "wasn't used" would be the wrong sentence.
  "provider_compatibility_mode",
] as const;
export type ProviderAdjustmentKind = (typeof PROVIDER_ADJUSTMENT_KINDS)[number];

/** The knob a `sampling_knob_dropped` adjustment NAMES — a closed subset of `UserIntent`'s own knob field
 *  names (pinned in `tests/contracts/chat/index.test-d.ts`: every member is a `keyof UserIntent`, so this
 *  tuple cannot drift into naming a setting that does not exist). A CLOSED union rather than free text
 *  BY CONSTRUCTION: the bus's raw-string pin admits exactly two anchored free-text keys and this is not one
 *  of them — the `ReactionEmoji`/`MemoryRecallPhase` precedent. One home; the union derives from it. */
export const ADJUSTED_KNOBS = [
  "temperature",
  "topP",
  "topK",
  "frequencyPenalty",
  "presencePenalty",
  "repetitionPenalty",
  "minP",
  "topA",
  "seed",
  "logitBias",
  "stop",
  // The quality DIAL (not a sampling knob): dropped when the stored value is not a known quality level.
  "quality",
  // The reasoning token budget, dropped on an effort-mode model that has no budget field.
  "thinkingBudgetTokens",
  // The reply-pictures ask (`text+image`), dropped on a model whose capability produces text only.
  "replyMedia",
] as const;
export type AdjustedKnob = (typeof ADJUSTED_KNOBS)[number];

/** The PAYLOAD half of a `warning` bus event — the shape a client's copy mapper dispatches on.
 *  `settings_adjusted` ALWAYS carries its `adjustment`; every other code carries none, and `tsc` enforces
 *  both directions.
 *
 *  DECLARED, not derived, and the two arms below are spelled a second time on the bus union — deliberately,
 *  against this repo's own no-doubling instinct, because BOTH readers have a hard constraint:
 *    • biome's type service cannot see through a distributive-conditional `Omit` of the bus union: every
 *      `case` of the client's copy switch reads `lint/suspicious/noUnnecessaryConditions` "unreachable"
 *      while tsc is fine (the cross-module-union family — declare the type, never re-derive it).
 *    • the bus union must stay a set of PLAIN OBJECT LITERALS: `index.test-d.ts` walks its members' keys
 *      with a mapped type, and an intersection or a conditional arm hides keys from that walk (a false
 *      clean on the D16 anchor allowlist), while `bus-payload-allowlist` refuses an unmodelled shape kind.
 *  The doubling is therefore ENFORCED rather than trusted: `index.test-d.ts` pins that the bus's `warning`
 *  members and this type are the same set, so a field added to one and not the other fails `tsc`. */
export type ChatWarning = { code: PlainChatWarningCode } | ChatSettingsAdjustedWarning;

/** The detail-bearing arm on its own — a NAMED type rather than an `Extract<ChatWarning, …>` at each reader,
 *  for the same measured reason the code tuple is split: biome does not evaluate a conditional type, so a copy
 *  mapper whose parameter is an `Extract<>` has every arm of its `adjustment` switch called unreachable. */
export interface ChatSettingsAdjustedWarning {
  code: "settings_adjusted";
  adjustment: ProviderAdjustmentKind;
  knob?: AdjustedKnob | undefined;
  appliedBudget?: number | undefined;
  appliedEffort?: EffortLevel | undefined;
}

/** The turn kinds a lifecycle bus event reports. One home (no inline re-spell across the three members). */
export const TURN_INTENTS = ["send", "swipe", "continue", "generate", "impersonate"] as const;
export type TurnIntent = (typeof TURN_INTENTS)[number];

/** Why a turn aborted. */
export const TURN_ABORT_REASONS = ["user", "error", "stale"] as const;
export type TurnAbortReason = (typeof TURN_ABORT_REASONS)[number];

/** The pre-provider `{{memory}}` recall phase the header brain-icon reflects (the `memoryRecall` bus member).
 *  `"recalling"` is stamped the instant recall begins for a turn (memory on) — the embed → cosine → CSLS →
 *  optional rerank window that runs BEFORE the provider streams, so it doubles as the "is my request hanging?"
 *  tell; `"recalled"` carries the surfaced count once that window closes. Memory OFF emits neither (the icon
 *  stays idle — an absent event, never a lying "recalled 0"). One home; the member below derives its `phase`
 *  from this tuple. */
export const MEMORY_RECALL_PHASES = ["recalling", "recalled"] as const;
export type MemoryRecallPhase = (typeof MEMORY_RECALL_PHASES)[number];

/** The `DomainOperationError.code` a lock-loss / cancel / fault turn abort surfaces to an AWAITING caller —
 *  the wire-vocabulary home the client keys on off a tRPC error's `data.reason` (the seat-refusal precedent:
 *  reason codes live ONCE in contracts, and the server's `CHAT_OP_CODES` derives this literal). A turn that
 *  dies to a stale lock rejects the awaited verb with this code; the client suppresses its generic
 *  "couldn't send" toast for it so the honest bus notice (`turnAbortNotice`) is the single stale surface. */
export const TURN_ABORTED_OP_CODE = "aborted" as const;
/** @public twin: TURN_ABORTED_OP_CODE — type twin of the live constant (cross-package PUBLIC). */
export type TurnAbortedOpCode = typeof TURN_ABORTED_OP_CODE;

/** The `DomainOperationError.code` a turn requested while the per-chat lock is HELD surfaces to the caller —
 *  the same wire-vocabulary home, for the same reason as the twin above: the client keys on `data.reason`,
 *  never on message text, and the server's `CHAT_OP_CODES.locked` derives this literal. The refusal is total
 *  (no turn ran, nothing was written), and it is the ONE turn error whose cause the user can act on — so the
 *  client maps it to honest copy naming the other turn instead of its generic "couldn't swipe" toast
 *  (`features/chat/lib/turn-abort-notice.ts`). */
export const TURN_LOCKED_OP_CODE = "locked" as const;
/** @public twin: TURN_LOCKED_OP_CODE — type twin of the live constant (cross-package PUBLIC). */
export type TurnLockedOpCode = typeof TURN_LOCKED_OP_CODE;

/** The `DomainOperationError.code` `chat.setUserMacroValues` refuses an off-vocabulary select pick with
 *  (#1356) — the same wire-vocabulary home as the two twins above, for the same reason: the picks pane keys
 *  on `data.reason` rather than on message text, and the server's `CHAT_OP_CODES.unknownMacroPick` derives
 *  this literal. The refusal is total (the flush is a whole-column write, so nothing was stored) and it is
 *  ACTIONABLE — the knob the user just moved names a value its preset no longer declares — so the pane
 *  renders it beside that control instead of letting it read as a server fault. */
export const USER_MACRO_UNKNOWN_PICK_OP_CODE = "unknown_macro_pick" as const;
/** @public twin: USER_MACRO_UNKNOWN_PICK_OP_CODE — type twin of the live constant (cross-package PUBLIC). */
export type UserMacroUnknownPickOpCode = typeof USER_MACRO_UNKNOWN_PICK_OP_CODE;

// ── Turn origin — who/what started a turn + its cascade depth ──
// TURN-PATH STATE, never a bus-event field: the D19/D50 allowlist forbids attribution on the public bus, so
// this rides the committed reply SLOT (`messages.initiator`/`.automationDepth`) and is read back by the ONE
// narrow `getTurnOrigin` op — the automation cascade guard's depth source. Human turns are born
// `"human"`/depth 0 (the column defaults); a NON-HUMAN `requestTurn` (AC-B) stamps its initiator + the parent
// depth + 1. `"automation"` = an automation rule's `trigger_turn` arm; `"plugin"` = a Tier-2 plugin membrane
// host-fn's turn.trigger (both funded by + consent-gated on the responsible human, depth-capped). The cascade
// guard treats every non-`"human"` initiator identically (depth is the lever, not the label). A new initiator
// fails `tsc` at the `messages.initiator` CHECK derive until the enum learns it.
export const TURN_INITIATORS = ["human", "automation", "plugin"] as const;
export type TurnInitiator = (typeof TURN_INITIATORS)[number];

/** The hard cascade-depth cap — nothing fires at `automationDepth >= cap`, opt-in or
 *  not, and a `requestTurn` may not stamp a reply DEEPER than it. ONE home for the magic bound: the automation
 *  dispatch gate reads it (the READ side) and chat's `requestTurn` self-refuses `> cap` (the WRITE-side belt for
 *  the plugin path, which has no dispatch gate above it). Homed in `contracts/chat` beside `TurnOrigin` because
 *  it is turn-origin-depth vocabulary shared by two domains that cannot import each other (chat ↮ automation). */
export const AUTOMATION_DEPTH_HARD_CAP = 3;

/** A turn's origin classification — the metadata automation rules gate on (the cascade guard's depth counter
 *  + the initiator). Read back through `getTurnOrigin`; stamped on the reply slot at commit. */
export interface TurnOrigin {
  readonly initiator: TurnInitiator;
  /** 0 for a human turn; parentDepth + 1 for an automation-triggered turn (hard cap 3 — 03 §4). */
  readonly automationDepth: number;
}

// ── The D50 PromptTransform seam ──
// The ONE synchronous hook onto the turn pipeline: an ordered, bounded transform over a turn's draft text,
// applied at exactly TWO fixed points (never anywhere else). Automation's `transform_draft` arm and the
// plugin host are its only two REGISTRARS; chat owns the pipeline points + the deadline/skip discipline.
// D50's ruling: ST's mutable-prompt interceptor cluster is NEVER a bus effect — by the time a bus subscriber
// runs, the prompt has shipped; a synchronous transform is this ordered step instead.
export const PROMPT_TRANSFORM_POINTS = [
  // SEND, after the macro pass, before USER_INPUT regex (the author-side transform order — D51).
  "user_input",
  // End of BUILD, over the DYNAMIC half only — the static (cache-stable) half is untransformable (the
  // per-turn-cache-bill argument); a rule wanting static content uses `insert_world_info_entry` instead.
  "assembled_dynamic",
] as const;
export type PromptTransformPoint = (typeof PROMPT_TRANSFORM_POINTS)[number];

/** The read-only env a transform sees. `vars` is a snapshot of the chat's runtime fold cache — mutation goes
 *  through actions (`set_variable`), NEVER a transform (a transform only rewrites the draft it's handed). */
export interface PromptTransformEnv {
  readonly chatId: ChatId;
  readonly vars: Record<string, string>;
}

/** The maximum length of a transform's ABORT reason — the string a refused turn tells its author. Capped
 *  because it is untrusted text (a guest writes it) that reaches a refusal surface. */
export const PROMPT_TRANSFORM_ABORT_REASON_MAX = 200;

/** A transform's deliberate ABORT of the generation (plugin-ui-plane §5.14, U6). It is NOT the D53 skip:
 *  a skip means "this transform did not run, keep the draft"; an abort means "this transform ran and says
 *  the turn must not happen". The two are different outcomes and the shape makes them un-confusable — a
 *  timeout can never be mistaken for a refusal, and a transform can never abort by returning nothing. */
export interface PromptTransformAbort {
  /** The author-facing reason, capped at {@link PROMPT_TRANSFORM_ABORT_REASON_MAX}. */
  readonly abort: string;
}

/** What ONE transform's `apply` may answer: the rewritten draft, or an abort. */
export type PromptTransformOutcome = string | PromptTransformAbort;

/** What the REGISTRY's fold answers for a whole point — the transformed text, or the first abort with the
 *  id of the transform that raised it (the fold stops there; later transforms never see an aborted turn). */
export type PromptTransformResult =
  | { readonly aborted: false; readonly text: string }
  | { readonly aborted: true; readonly transformId: string; readonly reason: string };

/** An ordered, bounded, synchronous-per-call transform over a turn's draft text. Registered at
 *  `entry/compose` into the pipeline's transform list; applied in ascending `order` (automation registers
 *  0–999, plugins 1000+ — host policy wraps guest). Each `apply` is deadline-bounded by the CALLER (250 ms);
 *  a timeout or throw SKIPS it (draft unchanged) + emits a `prompt_transform_skipped` warning (D53). A
 *  transform that instead returns a {@link PromptTransformAbort} REFUSES the generation — the deliberate
 *  outcome, distinct from the skip in both shape and consequence. */
export interface PromptTransform {
  readonly id: string;
  readonly point: PromptTransformPoint;
  readonly order: number;
  readonly apply: (draft: string, env: PromptTransformEnv) => Promise<PromptTransformOutcome>;
}

/** The entity kinds whose OWNER-PLANE edits reach a room's member-visible projections (the entity→room
 *  member-freshness bridge, `docs/design/entity-room-member-freshness-bridge.md` §3.3). ONE axis, keyed on
 *  by three places that must never disagree: the `roomEntityChanged` member below, the composition root's
 *  `ROOM_REACH` resolver table (`entry/compose/room-reach.ts` — a `satisfies Record<RoomEntityKind, …>`, so
 *  a new kind cannot ship unresolved), and the client's `BUS_FILTERS.roomEntityChanged` Record. Presets are
 *  deliberately ABSENT (owner word): members never fetch a preset — the server assembles per turn.
 *
 *  `regex` joined 2026-09-05 (#1733, the prerequisite of the #1742 Regex section). It is the one kind whose
 *  fan is raised DIRECTLY by a verb rather than resolved from an entity id: a host's `attachToChat` /
 *  `detachFromChat` / chat-arm `applyScopeOrder` already knows its `chatId`, and the member-visible
 *  consequence is in THAT room. Before it, those three verbs emitted a `regexChanged` USER event only — the
 *  host's own devices repainted and every other member of the room kept a stale rack until they reloaded. The
 *  reach table's `regex` resolver serves the OTHER half (a library row's `enabled`/name changing under every
 *  room that attaches it), which is the same staleness one plane up. */
export const ROOM_ENTITY_KINDS = ["character", "persona", "world-info", "regex"] as const;
export type RoomEntityKind = (typeof ROOM_ENTITY_KINDS)[number];

/** The chat bus union — the room-public event stream (the `chat` ROOM fans these out; the durable log
 *  replays them). It EMBEDS `WiBusEvent` (`#world-info`) so the WI domain emits without importing chat.
 *
 *  BUS-PAYLOAD ALLOWLIST (Part III inv §11): every member is a closed object literal of branded ids, enum
 *  literals, plain scalars, and `MessageView` — there is NO `unknown`/`Record`/index field. Credentials /
 *  secrets / baseUrls are therefore TYPE-LEVEL UNREPRESENTABLE: a producer cannot place an `apiKey` into a
 *  bus event because no member declares a field to carry it. (The `.contract.test` pins this.) No member
 *  carries a caller id — turn attribution lives on the turn path (`triggeredBy`/`runAsUserId`), never the
 *  public bus (D19). */
export type ChatBusEvent =
  // `slotSeq` = the `messages.seq` of the canon slot these tokens are being streamed INTO — the D16
  // classification anchor that makes a raw-text delta decidable by `substrate/auth::isBelowHistoryFloor`
  // exactly like a `view`-carrying member (a delta below a caller's join floor is withheld; one at/above it
  // streams). Without it every delta was unclassifiable and had to be withheld from EVERY clamped member,
  // which killed token streaming for every `from-join` member in a room with prior canon (back when
  // `from-join` was the column DEFAULT — it now costs only host-restricted members, and is still wrong:
  // streaming is the product). Stamped by the ONE emit site (`domain/chat/engine/engine.ts`, the turn pipeline's
  // `onDelta`) from the target it already resolved: the loaded slot's own `seq` for swipe/continue, the
  // allocated tail seq (`maxSeq + 1`) for a new slot. NEVER client-supplied, never defaulted; on the
  // new-slot seq-race retry the real row lands at a HIGHER seq than announced, which errs toward
  // withholding, never toward leaking.
  // `memberText` = the §3.6 MEMBER PROJECTION of this tick's `text` bytes, STAMPED AT THE PRODUCER
  // (`domain/chat/bus::createChatBus`, via `substrate/member-visibility::createMemberDeltaStamper`).
  // WHY IT LIVES ON THE EVENT: the hidden-span scrub is STATEFUL across a slot's whole delta stream (a
  // `<lie …/>` opener is withheld until its `/>` arrives) and VIEWER-INDEPENDENT (every non-host member is
  // owed identical bytes). Holding that state per-SUBSCRIBER was a leak: a subscription that starts — or
  // RESUMES — while a span is open cold-starts mid-tag, finds no `<` in `1234"/> …`, calls the whole tail
  // safe, and hands the member the secret's last bytes (and the withheld open makes the ghost visibly
  // stall, which tells the member exactly when to reconnect). So the state lives ONCE, on the write side,
  // warm from the slot's first byte; every read seam (the live fan-out, the durable replay, a future room
  // source) is then a STATELESS field read that cannot cold-start.
  //   • `undefined` ⇒ NOT stamped ⇒ a member receives NOTHING for this tick. FAIL-CLOSED by construction: a
  //     producer that bypasses the bus can only under-deliver, never leak.
  //   • `null`      ⇒ stamped and byte-identical to `delta.text` (the overwhelming majority of ticks) — the
  //     durable row and the host's wire carry a marker instead of a second copy of every token.
  //   • a string    ⇒ exactly the bytes a member may see this tick; `""` ⇒ withhold the whole row.
  // It is free text, but never UNANCHORED free text: it rides the same member as `slotSeq`, so the D16
  // clamp (`substrate/auth::isBelowHistoryFloor`) covers it exactly as it covers `delta`.
  | { type: "delta"; chatId: ChatId; slotSeq: number; delta: ChatDeltaEvent; memberText?: string | null }
  // ── Canon mutations (view = the no-refetch carrier; absent only if the row raced a delete) ──
  | { type: "messageCommitted"; chatId: ChatId; messageId: MessageId; view?: MessageView }
  | { type: "messageEdited"; chatId: ChatId; messageId: MessageId; view?: MessageView }
  // A slot's `excludedFromPrompt` flag flipped (hidden from assembly / restored) — a pure slot-flag change,
  // no content edit; the fresh view carries the flag (PD-86: the dedicated carrier, not `messageEdited`).
  | { type: "messageHidden"; chatId: ChatId; messageId: MessageId; view?: MessageView }
  | { type: "variantSelected"; chatId: ChatId; messageId: MessageId; view?: MessageView }
  | { type: "messagesDeleted"; chatId: ChatId; messageIds: MessageId[] }
  | { type: "messagesReordered"; chatId: ChatId }
  | { type: "reasoningEdited"; chatId: ChatId; messageId: MessageId; view?: MessageView }
  | { type: "reasoningCleared"; chatId: ChatId; messageId: MessageId; view?: MessageView }
  | { type: "reasoningStreamDone"; chatId: ChatId }
  // ── Turn lifecycle (the extensibility seam) ─────────────────────────────────
  // Emitted the instant a turn is ACCEPTED — before arbitration, before the engine's `turnStarted`. It exists
  // so the client can open its turn slot (→ render Stop) during a hung smart arbitration, which runs BEFORE
  // `turnStarted` and used to leave the user with no Stop affordance at all. Carries no speaker: the group
  // arbitration that picks the speaker has not run yet, so `speakerCharacterId` is null on accept and the
  // later `turnStarted` re-opens the slot with the resolved speaker. The AUXILIARY turns (swipe / continue /
  // generate) accept for the same reason at a different wall: their `turnStarted` lands only after the
  // room/connection resolve, the context assembly and MEMORY RECALL (measured 151 ms - 1.9 s, unbounded), and
  // until it did, the reader saw the OLD variant with no feedback. `targetMessageId` is the ghost-slot a
  // swipe/continue rerolls/extends (null for a fresh reply) — the client renders its ghost over that message.
  //
  // Every acceptance is TOTAL-RESOLVED — a `turnAccepted` slot never strands open. The arbitration path emits
  // `turnStarted`→`turnCompleted`/`turnAborted` on the speaking path, `turnAborted` on a cancelled
  // arbitration, and `turnCompleted`(messageId:null) when arbitration yields no eligible speaker; an auxiliary
  // turn emits `turnAborted` when its resolve/validation throws; and for EVERY accepted turn the engine's
  // PRE-START refusals (lock contention · consent · budget · a missing persist target) emit `turnAborted` too
  // (`TurnPrep.slotAccepted` — the engine is the only party that knows `turnStarted` never fired).
  | {
      type: "turnAccepted";
      chatId: ChatId;
      intent: TurnIntent;
      /** Null on accept — the group arbitration that resolves the speaker has not run yet; `turnStarted`
       *  carries the resolved speaker once it does. */
      speakerCharacterId: CharacterId | null;
      /** For a swipe/continue, the message this turn rerolls/extends (the ghost-slot id). Null otherwise. */
      targetMessageId: MessageId | null;
    }
  | {
      type: "turnStarted";
      chatId: ChatId;
      intent: TurnIntent;
      api: ChatApi | null;
      /** The provider REGISTRY id the turn resolved to (inference program §5.3c) — the source axis is retired. */
      provider: ProviderId;
      model: string;
      /** The roster character speaking this turn (group "whose turn is it" automation; ST GROUP_MEMBER_DRAFTED).
       *  Null for a single-character chat or a non-character turn. */
      speakerCharacterId: CharacterId | null;
      /** For swipe/continue, the message this turn rerolls/extends (the ghost-slot id). Null otherwise. */
      targetMessageId: MessageId | null;
    }
  | { type: "turnCompleted"; chatId: ChatId; intent: TurnIntent; messageId: MessageId | null }
  // An aborted turn commits NO reply slot, so its cascade depth cannot be read back
  // through `getTurnOrigin` (there is no message to read). It therefore rides HERE as a plain scalar so the
  // automation fact-resolver can gate the cascade: an aborted automation turn (depth ≥ 1) must NOT re-trigger
  // non-opted `turnAborted` rules — a "retry on failure" rule at depth 0 self-loops otherwise. This is turn-
  // path DEPTH, not attribution: no caller id, no secret (the allowlist bans those, not a counter). 0 = a
  // human-plane turn (the `TurnPrep.automationDepth` default).
  | { type: "turnAborted"; chatId: ChatId; intent: TurnIntent; reason: TurnAbortReason; automationDepth: number }
  // ── Pre-provider MEMORY RECALL phase (the header brain-icon's live feed; #313) ──────────────
  // The one signal that surfaces the `{{memory}}` recall WINDOW to a viewer: `phase:"recalling"` the instant
  // recall starts for a turn (memory on), `phase:"recalled"` with the surfaced `count` once it closes. Stamped
  // at the SINGLE recall convergence (`domain/chat/memory/recall/recall.ts::finish` + its start), so both the
  // round-level and the per-speaker witnessed recall feed it with no second emit site. Memory OFF emits
  // NEITHER — an absent event is the idle icon, never a lying "recalled 0". Allowlist-clean (Part III inv §11):
  // a branded id, an enum phase, and a plain-scalar count — it carries NO digest content or scores (that detail
  // is host-only and stays off the room-public bus; the header popover reads it from the host-gated assembly
  // preview). LIVE-ONLY (see LIVE_ONLY_CHAT_EVENT_TYPES): the phase is EPHEMERAL per-turn state — replaying a
  // stale "recalling" from a prior subscription would be a lie, and there is nothing to persist.
  // `count` is null on `"recalling"` (not known yet) and the surfaced block count on `"recalled"`.
  | { type: "memoryRecall"; chatId: ChatId; phase: MemoryRecallPhase; count: number | null }
  // ── Turn warning (domain-originated; e.g. image parts dropped for a non-vision model, D45) ──
  //    TWO ARMS, and the split is the enforcer (#1440): `settings_adjusted` is the only code whose notice
  //    cannot be written from the code alone, so it is the only arm that carries detail — and it carries it
  //    REQUIRED, so an emit site cannot ship the carrier without saying what the provider actually did.
  //    Every field is an enum literal or a plain number: no structured carrier (the D16 anchor allowlist
  //    admits only `view`/`delta`) and no raw string (the two anchored free-text keys are spoken for), so
  //    both `index.test-d.ts` pins hold BY CONSTRUCTION rather than by exemption.
  | { type: "warning"; chatId: ChatId; code: PlainChatWarningCode }
  | {
      type: "warning";
      chatId: ChatId;
      code: "settings_adjusted";
      /** WHICH degradation class — the dispatch axis the client's copy switch is total over. */
      adjustment: ProviderAdjustmentKind;
      /** The setting a `sampling_knob_dropped` names; absent on every class that names itself. */
      knob?: AdjustedKnob | undefined;
      /** The reasoning budget, IN TOKENS, that actually ran (`reasoning_budget_clamped`). Named
       *  `appliedBudget` rather than `appliedTokens` deliberately: the `bus-payload-allowlist` gate reads
       *  `token` as a credential word, and it is right to — a name is the honest fix here, never a
       *  sanctioned-field row for a field that only looks like auth by accident. */
      appliedBudget?: number | undefined;
      /** The reasoning effort that actually ran (`reasoning_mandatory_clamp`). */
      appliedEffort?: EffortLevel | undefined;
    }
  // ── World-info ACTIVATION (which entries FIRED during this turn's assembly — distinct from the
  //    attachment changes in WiBusEvent; ST WORLD_INFO_ACTIVATED — the "what lore fired" automation hook) ──
  //    `automationDepth` is the cascade depth of the GENERATING turn (the same plain scalar `turnAborted`
  //    carries, and for the same reason): the activation is emitted DURING assembly, BEFORE this turn's reply
  //    slot commits, so its depth cannot be read back through `getTurnOrigin` — there is no message yet. It
  //    rides HERE so the automation fact-resolver can bound the cascade: a turn-generating rule on this trigger
  //    (the reactToLoreActivation family) re-runs assembly and can RE-activate the same lore, a self-chain the
  //    depth cap must catch. 0 = a human-plane turn (the `TurnPrep.automationDepth` default). This is turn-path
  //    DEPTH, not attribution — no caller id, no secret (the allowlist bans those, not a counter).
  | { type: "worldInfoActivated"; chatId: ChatId; entryIds: WorldEntryId[]; automationDepth: number }
  | { type: "personaSwitched"; chatId: ChatId; from: PersonaId | null; to: PersonaId | null }
  // ── A message reaction was added or removed (B6/MR0). CANON, not per-viewer: every member of the room sees
  //    the same reaction set, so a toggle by one member must reach every other member's open transcript —
  //    which is the whole reason this member exists rather than the writing tab reconciling alone (MA-2 §5).
  //    DURABLE (absent from `LIVE_ONLY_CHAT_EVENT_TYPES`): the reaction it announces is canon that survives
  //    the fan, so a device dark through the toggle must learn about it on replay like any other canon
  //    mutation — the `roomEntityChanged` live-only ECONOMY argument does not apply, because there is no
  //    attach synthesis that re-reads reactions.
  //    Emitted AFTER the durable write commits (durable-first, the `createChatBus` discipline).
  //    NO VIEW CARRIER, deliberately: the pill row is a SEPARATE bounded room-scoped read the client indexes
  //    by `variantId` (`chat.listReactions`), not a field of `MessageView` — folding reactions into the view
  //    would put a join on every canon read and every bus carrier for an ornament most rows never carry.
  //    `emoji` + `added` ride the event so an automation predicate can say WHAT happened without a re-read
  //    (the `reactionsChanged` trigger's fact projects exactly these). `emoji` is the CLOSED `ReactionEmoji`
  //    union, not a raw `string`, and that is load-bearing rather than cosmetic: `index.test-d.ts` pins that
  //    the ONLY raw-string keys on this bus are `turnStarted.model` and the seq-anchored `delta.memberText`
  //    ("adding a THIRD raw-string key must clear the same bar: name the anchor, or don't ship it"). A
  //    string-literal union does not satisfy `string extends T`, so this member stays outside that pin BY
  //    CONSTRUCTION — the `roomEntityChanged.entity` / `memoryRecall.phase` precedent — allowlist-clean
  //    (Part III inv §11): branded ids, a plain string, a boolean, and no caller id (D19 — the REACTOR is a
  //    participant SEAT, which is room-public roster data, not a caller identity; it is deliberately absent
  //    here anyway, because the grouped re-read is what tells a client who reacted).
  | { type: "reactionsChanged"; chatId: ChatId; messageId: MessageId; variantId: MessageVariantId; emoji: ReactionEmoji; added: boolean }
  // ── World-info attachment changes (chat-surface only; embedded from #world-info) ──
  | WiBusEvent
  | { type: "chatCreated"; chatId: ChatId }
  // ── The room DIED. LIVE-ONLY (see LIVE_ONLY_CHAT_EVENT_TYPES), and it is the one member for which that
  //    lane is not an optimisation but the only correct shape: `chat_events.chat_id` FKs to `chats` with
  //    ON DELETE CASCADE, so a durable `chatDeleted` row either FK-fails (appended after the delete) or is
  //    cascaded away by the very delete it announces — no `chatDeleted` was EVER replayable. Being
  //    append-free is what lets both delete paths run the DELETE FIRST and fan only on `RETURNING` rows,
  //    which CLOSES the R1-4a false-emit (a raced reap used to announce the death of a room that survived)
  //    rather than narrowing it. Owner fork F-A: the pump delivers this one GATE-FREE to every attached
  //    subscriber, because after the row is gone the member probe can only answer "not a member".
  | { type: "chatDeleted"; chatId: ChatId }
  // ── Chat session open (subscription-synthesized at participant stream-attach, like `historyTruncated`;
  //    per-viewer, NOT a canon mutation, never logged — the ST CHAT_CHANGED automation trigger: "on chat
  //    open, set POV / run setup") ──
  | { type: "chatOpened"; chatId: ChatId }
  // ── Resume control (subscription-synthesized; never emitted by domain code, never logged) ──
  | { type: "historyTruncated"; chatId: ChatId }
  // ── Catch-all for low-payload chat-row changes (starred/archive/title/variables/injections/compact) ──
  | { type: "chatUpdated"; chatId: ChatId }
  // ── The entity→room member-freshness bridge (design §3.3). An OWNER-PLANE entity edit (a card, a persona,
  //    a lorebook) moved something this room's MEMBER-VISIBLE projections read, so every member re-READS
  //    through the already-clamped verbs. LIVE-ONLY (see LIVE_ONLY_CHAT_EVENT_TYPES): never appended to
  //    `chat_events`, so it is never replayed — the heal for a device that was dark is the attach synthesis
  //    (`chatOpened`, whose invalidate row covers the bridge's member-card read).
  //    ID-FREE BY DESIGN: the entity's own id is deliberately absent. The client's filters are PATH-level
  //    either way (`chat.getMemberCard.pathFilter()`), so an id would buy no narrower targeting and would add
  //    a leak surface — a room member would learn the id of an owner-plane row they may not read. `entity`
  //    is the dispatch axis: ONE member with an enum, never three members (design F-C).
  | { type: "roomEntityChanged"; chatId: ChatId; entity: RoomEntityKind };

/** Valid bus discriminators, derived from the union. The `satisfies Record<ChatBusEvent["type"], true>`
 *  makes `tsc` error if a member is added without a matching entry — keeping the replay guard exhaustive
 *  (the durable log is untyped JSON; corrupt/legacy rows are filtered against this set before re-emit).
 *
 *  ADDING A MEMBER IS A COUPLED-SITE CHANGE — the union + this map are the two `tsc` forces the rest, and
 *  the rest fail at RUNTIME or in a suite nobody associates with the change:
 *    • `packages/db/src/schema/chat.ts` — the `chat_events.type` CHECK constraint DERIVES from this map
 *      minus `LIVE_ONLY_CHAT_EVENT_TYPES`, so the live schema drifts from the committed baseline and
 *      `schema-baseline-parity` reds until the baseline is regenerated.
 *    • the client's central invalidation seam (`packages/client/src/data/invalidation.ts`) + the landing
 *      switch (`data/bus/apply-chat-bus-event.ts`) — a member with no filter row is a wire that reaches the
 *      device and refreshes nothing.
 *    • the `bus-producer-coverage` gate — the member needs a server emit site (declared,
 *      never emitted, is dead wire), and the contract test asserts this map's exact SIZE.
 *    • a NON-DURABLE member (never appended to `chat_events`) must also join `NON_DURABLE_EXEMPT` in
 *      `data/bus/chat-event-seq-guard.ts`, or the seq dedup drops it forever; a DURABLE turn-lifecycle
 *      member must NOT (it replays from zero on subscription churn and needs the seq guard). */
export const CHAT_BUS_EVENT_TYPES = {
  delta: true,
  messageCommitted: true,
  messageEdited: true,
  messageHidden: true,
  variantSelected: true,
  messagesDeleted: true,
  messagesReordered: true,
  reasoningEdited: true,
  reasoningCleared: true,
  reasoningStreamDone: true,
  turnAccepted: true,
  turnStarted: true,
  turnCompleted: true,
  turnAborted: true,
  memoryRecall: true,
  warning: true,
  worldInfoActivated: true,
  personaSwitched: true,
  reactionsChanged: true,
  wiBookAttached: true,
  wiBookDetached: true,
  wiEntryAttached: true,
  wiEntryDetached: true,
  wiEntryScopeChanged: true,
  chatCreated: true,
  chatDeleted: true,
  chatOpened: true,
  historyTruncated: true,
  chatUpdated: true,
  roomEntityChanged: true,
} satisfies Record<ChatBusEvent["type"], true>;

/** True when `t` is a known `ChatBusEvent` discriminator (see {@link CHAT_BUS_EVENT_TYPES}). */
export function isChatBusEventType(t: string): t is ChatBusEvent["type"] {
  return Object.hasOwn(CHAT_BUS_EVENT_TYPES, t);
}

/** THE LIVE-ONLY LANE (design §3.4). These members are fanned on the room's live channel WITHOUT a
 *  `chat_events` append — they carry no canon and have nothing to replay, so paying a durable row per fan
 *  would pollute the log and cost an INSERT per seated room per edit.
 *
 *  The tuple is the lane's PHYSICS, not a note: `DurableChatBusEvent` subtracts these members, and both
 *  durable emit surfaces (`domain/chat/bus::emit`, `entry/compose/services::emitChatEvent`) narrow to it —
 *  so appending a live-only member is a COMPILE ERROR, not a review catch. The db CHECK derives from the
 *  same durable subset (`packages/db/src/schema/chat.ts`), so the column can never hold one either.
 *
 *  Consequences a member of this tuple accepts: no replay (a device dark through the fan never receives it —
 *  the heal is the attach synthesis), and a mandatory seat in the client's `NON_DURABLE_EXEMPT` set (a
 *  non-advancing seq is dropped by the seq guard otherwise).
 *
 *  THE THREE MEMBERS JOIN FOR DIFFERENT REASONS, and each is stated so a fourth is classified rather than
 *  guessed: `roomEntityChanged` is live-only as an ECONOMY (a durable row per seated room per card edit buys
 *  nothing — the heal is the attach synthesis); `chatDeleted` is live-only by PHYSICS (its log row cascades
 *  away with the very chat it announces, so it was never replayable at all — design §4 / R1-4a), and being
 *  append-free is precisely what lets its two producers DELETE FIRST and fan only what `RETURNING` proves
 *  gone; `memoryRecall` is live-only by SEMANTICS (#313) — it is an EPHEMERAL per-turn phase feeding the
 *  header brain-icon, so replaying a stale "recalling" from a prior subscription would be a lie, and there is
 *  no state to persist (the icon idles from an absent event). Only `roomEntityChanged` is quiet-coalescable
 *  (`transport/trpc/quiet-fanout.ts`): a room death is one terminal event per room, never a storm, and
 *  silencing it would strand an open room on a dead chat — and `memoryRecall` must NOT coalesce either, since
 *  its "recalling"→"recalled" transition IS the signal (its volume is already bounded: at most one pair per
 *  scoped speaker per turn). */
export const LIVE_ONLY_CHAT_EVENT_TYPES = ["roomEntityChanged", "chatDeleted", "memoryRecall"] as const;
export type LiveOnlyChatEventType = (typeof LIVE_ONLY_CHAT_EVENT_TYPES)[number];

/** A `ChatBusEvent` that MAY be appended to the durable `chat_events` log — the union minus the live-only
 *  lane. The type both durable emit surfaces accept (see {@link LIVE_ONLY_CHAT_EVENT_TYPES}). */
export type DurableChatBusEvent = Exclude<ChatBusEvent, { type: LiveOnlyChatEventType }>;

/** The complement: a `ChatBusEvent` fanned WITHOUT a durable append — the only thing the transport's
 *  `seq: null` arm and `entry/compose/services::emitChatEventLive` accept. */
export type LiveOnlyChatBusEvent = Extract<ChatBusEvent, { type: LiveOnlyChatEventType }>;
