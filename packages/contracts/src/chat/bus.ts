// @orb/contracts/chat/bus — the chat stream delta + the room-public `ChatBusEvent` union, the provider-send
// content-part shape (D45), the domain warning-code taxonomy (D41), the turn-origin/initiator vocabulary
// (automation-design/03 §4), and the D50 synchronous PromptTransform seam.
//
// LAWS honored here:
//   • Turn identity (D19): no bus event carries a caller id — turn attribution rides the turn path
//     (`triggeredBy`/`runAsUserId`), never the public bus.
//   • Bus-payload allowlist (Part III inv §11): every `ChatBusEvent` member is a closed object literal of
//     branded ids, enum literals, plain scalars, and `MessageView` — credentials/secrets/baseUrls are
//     TYPE-LEVEL UNREPRESENTABLE (no member declares a field to carry one).

import type { CharacterId, ChatId, MessageId, PersonaId, WorldEntryId } from "@orb/kit/ids";
import type { ChatApi, CredentialSource } from "#connection";
import type { WiBusEvent } from "#world-info";
import type { MessageView } from "./messages.ts";

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
 *  (the engine drops them, gated by `ModelCapability.input.vision`, + emits a `warning` bus event). This is
 *  the ONE home (D45 "the cross-boundary message DTOs in `@orb/contracts/chat` carry the same"); the infra
 *  `ChatHistoryMessage` imports it. Distinct from the D44 RENDER `MessageContentBlock` (display ⇆ client). */
export type ChatContentPart =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "image"; readonly url: string }
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

/** Why the engine dropped content from a turn (the domain-originated `warning` bus event — distinct from the
 *  infra runner's `ResolvedWarning`/`WARNING_CODES`, which report resolve/wire drops). One home; the union is
 *  derived from this tuple (no inline re-spell). */
export const CHAT_WARNING_CODES = [
  // Image parts were stripped because the resolved model's `input.vision` isn't true (D45).
  "image_dropped",
  // Tools were attached but `capability.tools` is absent → dropped; the turn proceeds tool-less
  // (D48; the domain-side gate per D51's rule — the emit site is the engine's attach gate).
  "tools_unsupported",
  // The post-turn memory build (§3a fire-and-forget) threw — group/scoped digests did NOT build this turn
  // (a summarizer outage, a store failure, a mint failure). Emitted from the engine's memory-trigger catch so
  // the silent-failure black hole (stickler F1/F1d) is observable; the turn's reply is unaffected.
  "memory_build_failed",
  // A structured-output `responseFormat` was requested but `capability.output.structured` isn't true → dropped;
  // the turn proceeds free-text (D79 interactive-axis degrade, 04 §7; the emit site is the engine's structured
  // request-builder gate, mirror of tools_unsupported).
  "structured_output_unsupported",
  // A registered `PromptTransform` (automation `transform_draft` / a plugin) threw or blew its 250 ms deadline
  // → the draft passed through UNCHANGED (automation-design/04 §6; D53 — a broken transform never eats a turn).
  // Emitted from the registry's apply pass so a host sees a misbehaving rule/plugin without losing the reply.
  "prompt_transform_skipped",
  // An image generation dropped its edit/avatar-reference input because the resolved image model lacks
  // `input.imageEdit` (imagery-design/03 §2 — the domain B3 gate drops-with-warning, or the runner belt strips
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
] as const;
export type ChatWarningCode = (typeof CHAT_WARNING_CODES)[number];

/** The turn kinds a lifecycle bus event reports. One home (no inline re-spell across the three members). */
export const TURN_INTENTS = ["send", "swipe", "continue", "generate", "impersonate"] as const;
export type TurnIntent = (typeof TURN_INTENTS)[number];

/** Why a turn aborted. */
export const TURN_ABORT_REASONS = ["user", "error", "stale"] as const;
export type TurnAbortReason = (typeof TURN_ABORT_REASONS)[number];

/** The `DomainOperationError.code` a lock-loss / cancel / fault turn abort surfaces to an AWAITING caller —
 *  the wire-vocabulary home the client keys on off a tRPC error's `data.reason` (the seat-refusal precedent:
 *  reason codes live ONCE in contracts, and the server's `CHAT_OP_CODES` derives this literal). A turn that
 *  dies to a stale lock rejects the awaited verb with this code; the client suppresses its generic
 *  "couldn't send" toast for it so the honest bus notice (`turnAbortNotice`) is the single stale surface. */
export const TURN_ABORTED_OP_CODE = "aborted" as const;
/** @public twin: TURN_ABORTED_OP_CODE — type twin of the live constant (cross-package PUBLIC). */
export type TurnAbortedOpCode = typeof TURN_ABORTED_OP_CODE;

// ── Turn origin — who/what started a turn + its cascade depth (automation-design/03 §4) ──
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

/** The hard cascade-depth cap (automation-design/03 §4) — nothing fires at `automationDepth >= cap`, opt-in or
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

// ── The D50 PromptTransform seam (automation-design/04 §6) ──
// The ONE synchronous hook onto the turn pipeline: an ordered, bounded transform over a turn's draft text,
// applied at exactly TWO fixed points (never anywhere else). Automation's `transform_draft` arm and the
// plugin host are its only two REGISTRARS; chat owns the pipeline points + the deadline/skip discipline.
// D50's ruling: ST's mutable-prompt interceptor cluster is NEVER a bus effect — by the time a bus subscriber
// runs, the prompt has shipped; a synchronous transform is this ordered step instead.
export const PROMPT_TRANSFORM_POINTS = [
  // SEND, after the macro pass, before USER_INPUT regex (the author-side transform order — D51).
  "user_input",
  // End of BUILD, over the DYNAMIC half only — the static (cache-stable) half is untransformable (03 §1.2's
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

/** An ordered, bounded, synchronous-per-call transform over a turn's draft text. Registered at
 *  `entry/compose` into the pipeline's transform list; applied in ascending `order` (automation registers
 *  0–999, plugins 1000+ — host policy wraps guest). Each `apply` is deadline-bounded by the CALLER (250 ms);
 *  a timeout or throw SKIPS it (draft unchanged) + emits a `prompt_transform_skipped` warning (D53). */
export interface PromptTransform {
  readonly id: string;
  readonly point: PromptTransformPoint;
  readonly order: number;
  readonly apply: (draft: string, env: PromptTransformEnv) => Promise<string>;
}

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
  // later `turnStarted` re-opens the slot with the resolved speaker. `targetMessageId` is the ghost-slot for a
  // swipe/continue (null for a fresh reply). Every acceptance is TOTAL-RESOLVED: the arbitration path emits
  // `turnStarted`→`turnCompleted`/`turnAborted` on the speaking path, `turnAborted` on a cancelled
  // arbitration, and `turnCompleted`(messageId:null) when arbitration yields no eligible speaker — so a
  // `turnAccepted` slot never strands open.
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
      api: ChatApi;
      source: CredentialSource;
      model: string;
      /** The roster character speaking this turn (group "whose turn is it" automation; ST GROUP_MEMBER_DRAFTED).
       *  Null for a single-character chat or a non-character turn. */
      speakerCharacterId: CharacterId | null;
      /** For swipe/continue, the message this turn rerolls/extends (the ghost-slot id). Null otherwise. */
      targetMessageId: MessageId | null;
    }
  | { type: "turnCompleted"; chatId: ChatId; intent: TurnIntent; messageId: MessageId | null }
  // An aborted turn commits NO reply slot, so its cascade depth (automation-design/03 §4) cannot be read back
  // through `getTurnOrigin` (there is no message to read). It therefore rides HERE as a plain scalar so the
  // automation fact-resolver can gate the cascade: an aborted automation turn (depth ≥ 1) must NOT re-trigger
  // non-opted `turnAborted` rules — a "retry on failure" rule at depth 0 self-loops otherwise. This is turn-
  // path DEPTH, not attribution: no caller id, no secret (the allowlist bans those, not a counter). 0 = a
  // human-plane turn (the `TurnPrep.automationDepth` default).
  | { type: "turnAborted"; chatId: ChatId; intent: TurnIntent; reason: TurnAbortReason; automationDepth: number }
  // ── Turn warning (domain-originated; e.g. image parts dropped for a non-vision model, D45) ──
  | { type: "warning"; chatId: ChatId; code: ChatWarningCode }
  // ── World-info ACTIVATION (which entries FIRED during this turn's assembly — distinct from the
  //    attachment changes in WiBusEvent; ST WORLD_INFO_ACTIVATED — the "what lore fired" automation hook) ──
  | { type: "worldInfoActivated"; chatId: ChatId; entryIds: WorldEntryId[] }
  | { type: "personaSwitched"; chatId: ChatId; from: PersonaId | null; to: PersonaId | null }
  // ── World-info attachment changes (chat-surface only; embedded from #world-info) ──
  | WiBusEvent
  | { type: "chatCreated"; chatId: ChatId }
  | { type: "chatDeleted"; chatId: ChatId }
  // ── Chat session open (subscription-synthesized at participant stream-attach, like `historyTruncated`;
  //    per-viewer, NOT a canon mutation, never logged — the ST CHAT_CHANGED automation trigger: "on chat
  //    open, set POV / run setup") ──
  | { type: "chatOpened"; chatId: ChatId }
  // ── Resume control (subscription-synthesized; never emitted by domain code, never logged) ──
  | { type: "historyTruncated"; chatId: ChatId }
  // ── Catch-all for low-payload chat-row changes (starred/archive/title/variables/injections/compact) ──
  | { type: "chatUpdated"; chatId: ChatId };

/** Valid bus discriminators, derived from the union. The `satisfies Record<ChatBusEvent["type"], true>`
 *  makes `tsc` error if a member is added without a matching entry — keeping the replay guard exhaustive
 *  (the durable log is untyped JSON; corrupt/legacy rows are filtered against this set before re-emit). */
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
  warning: true,
  worldInfoActivated: true,
  personaSwitched: true,
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
} satisfies Record<ChatBusEvent["type"], true>;

/** True when `t` is a known `ChatBusEvent` discriminator (see {@link CHAT_BUS_EVENT_TYPES}). */
export function isChatBusEventType(t: string): t is ChatBusEvent["type"] {
  return Object.hasOwn(CHAT_BUS_EVENT_TYPES, t);
}
