// domain/chat/contract/errors — the typed chat domain errors.
//   • ChatNotFoundError — the chat is missing OR the caller is not a participant (the two collapse into one
//     answer — no foreign-existence leak; `requireParticipant` failure is NOT_FOUND,
//     never a "you're not the host of <that real chat>" leak). Extends the kit `DomainNotFoundError` so the
//     transport maps it to NOT_FOUND uniformly while callers/tests discriminate the entity.
//   • ChatOperationError — a coded operational failure (the `code` discriminates). The reason strings live
//     ONCE in `CHAT_OP_CODES` (no inline re-spell, §7.5). Extends the kit `DomainOperationError` (BAD_REQUEST).
//
// `requireParticipant` (membership) → ChatNotFoundError (leak-free). `requireHost` (you ARE a member but not
// the host) → ChatOperationError("not_host") — the existence is already known to a member, so this is an
// authority refusal, not a leak. (Authoritative auth surface: docs/law/Spine-Identity-and-Auth.md.)

import { TURN_ABORTED_OP_CODE, TURN_LOCKED_OP_CODE, USER_MACRO_UNKNOWN_PICK_OP_CODE } from "@orb/contracts/chat";
import { DomainNotFoundError, DomainOperationError } from "@orb/kit/errors";
import type { ChatId } from "@orb/kit/ids";

export class ChatNotFoundError extends DomainNotFoundError {
  public readonly chatId: ChatId;
  constructor(chatId: ChatId) {
    super("chat", chatId);
    this.chatId = chatId;
    this.name = this.constructor.name;
  }
}

/** The `DomainOperationError.code` discriminators chat verbs throw. ONE home for the strings (§7.5). */
export const CHAT_OP_CODES = {
  /** A host-only verb (roster mutation, group-config, room-overrides, force-character, kick, delete-chat,
   *  invites, handoff, anchor-reassignment, memberCardVisibility) called by a non-host member. */
  notHost: "not_host",
  /** An edit/delete-a-slot verb (`author-or-host`) called by a member who is neither the slot's
   *  `authorUserId` nor the room host — a known-existence authority refusal (the caller IS a member). */
  notAuthor: "not_author",
  /** An abort called by a member who does not own the in-flight turn (`turn-owner` — the
   *  rollback-theft defense; a host aborting a member's turn is refused). */
  notTurnOwner: "not_turn_owner",
  /** `reattributePersona` targeted a non-USER slot (assistant/system) — only a user message carries an
   *  authoring persona (the `{{user}}` subject). A coded validation refusal on a KNOWN membership (the caller
   *  cleared the per-row author-or-host gate), never a NOT_FOUND collapse. */
  notUserMessage: "not_user_message",
  /** A verb's target persona is NOT owned by the required party. `reattributePersona`: not owned by the
   *  targeted row's AUTHOR (a line may only be attributed to a persona its author owns, never the acting
   *  host's own persona; a persona has ONE owner, so a bulk set that mixes authors can never all pass).
   *  `setChatAnchorPersona`: not owned by any PRESENT human participant of the room (the Anchor may only
   *  pin to a persona actually present in the chat — never a foreign id probed in). Leak-free coded refusal. */
  notPersonaOwner: "not_persona_owner",
  /** A roster mutation targeted a participant that is not a PRESENT member of the chat (missing or already
   *  left). Host-only surfaces (the caller already sees the roster), so a coded refusal leaks nothing —
   *  unlike `requireParticipant` failures, which stay a leak-free `ChatNotFoundError`. */
  participantNotFound: "participant_not_found",
  /** A turn was requested while the per-chat turn lock is held (a turn is already in flight). Derived from
   *  the contract wire home (the `aborted` precedent below) — the client keys on the same literal
   *  (`data.reason`) to say WHICH refusal this is instead of a generic "couldn't swipe". */
  locked: TURN_LOCKED_OP_CODE,
  /** `undoContinue`/`revertContinue` on a variant that was never continued (the `preContinue*`/
   *  `lastContinuation*` snapshot columns are empty — D26; nothing to restore). */
  noContinuation: "no_continuation",
  /** A turn aborted (user-cancelled / stale / error) — the lifecycle refusal surfaced to the caller. Derived
   *  from the contract wire home so the client can key on the same literal (`data.reason`) without a re-spell. */
  aborted: TURN_ABORTED_OP_CODE,
  /** A room-override write targeted a field outside the four-field host allowlist, or a `forbidRoomOverride`
   *  field — default-deny. */
  forbiddenOverride: "forbidden_override",
  /** `setChatBackground` was given a `kind:"external"` URL that could not be materialized into an owned image
   *  asset (unreachable / not an image / too large — side-eye F-P0-2). A validation refusal (BAD_REQUEST); the
   *  message carries the honest reason (`backgroundMaterializeMessage`), never the URL or any internal detail. */
  backgroundUnavailable: "background_unavailable",
  /** `requestTurn` was asked to stamp a reply DEEPER than `AUTOMATION_DEPTH_HARD_CAP`.
   *  The WRITE-side belt for the runaway-cascade guard: automation's dispatch gate already refuses an event at
   *  depth ≥ cap, so this bites only a mis-behaving non-dispatch caller (the plugin membrane) — fail-closed. */
  cascadeDepthExceeded: "cascade_depth_exceeded",
  /** #67 — `send` was given an `attachmentAssetIds` id the actor does not OWN (a foreign / gone asset). The
   *  caller IS a present member (the send gate passed), so this is a coded validation refusal, not a
   *  NOT_FOUND collapse — and it leaks nothing about another owner's asset (per-user D21 scope). */
  attachmentNotOwned: "attachment_not_owned",
  /** `setGroupConfig` tried to flip a GAME chat OFF narrator+merged (to `per-speaker`) while an AGENT holds the
   *  GM seat (D60 AP4a, docs/plans/agent-principals/design.md — the F5 SEAL). narrator+merged keeps the GM tool loop on
   *  the narrator turn; `per-speaker` would let a player-CHARACTER turn carry GM-authority tools at an agent-GM
   *  table (the config-coupled invariant made STRUCTURAL). The honest path is unseat-then-flip (assign the GM
   *  seat back to the AI narrator first). Host-only surface (the caller already sees the seat), so a coded
   *  refusal leaks nothing. The seat KIND is read via the injected `ctx.rpg.resolveGmSeatHolderKind` op — chat
   *  never reads rpg tables. Domain-private (no client surface renders it yet). */
  agentGmSeatConfigLocked: "agent_gm_seat_config_locked",
  /** Managed / manual compaction ran the marker generation over a NON-empty span but the model returned EMPTY
   *  text — a real failure, not a benign no-op. The existing marker + coverage stamp are left untouched (never a
   *  blank marker). The engine hook maps this to a `compaction_failed` warning; the manual `compact` verb
   *  propagates it. Host/internal surface only (no membership leak — a chat the caller can compact). */
  compactionEmpty: "compaction_empty",
  /** A turn's generation completed but produced NO prose (zero non-whitespace content) — a tool-only completion
   *  on a prose-silencing wire, a filtered/empty provider answer. A reply nobody can read is a FAILURE, not a
   *  reply: the engine writes nothing (no variant, no stats delta, no selection flip), so a swipe leaves the
   *  slot's PREVIOUS variant selected instead of hiding real prose behind an invisible one. Not a membership
   *  leak — the caller already ran the turn. Distinct from `compaction_empty` (the marker generation's twin). */
  emptyGeneration: "empty_generation",
  /** `setSeededGreeting` targeted a slot that is not a character-voiced ASSISTANT row — only a seeded
   *  greeting has card alternates to step among. Host-only surface (the caller already sees the canon), so a
   *  coded refusal leaks nothing. */
  notGreetingRow: "not_greeting_row",
  /** `setSeededGreeting` was called after the room's FIRST USER TURN. That turn is the freeze
   *  (`freezeGreetingVolatiles`, verbs/turn.ts): volatile macros are baked into the variant and the greeting
   *  stops being malleable, so stepping it would silently discard drawn values and rewrite settled canon. The
   *  window is one-way — a coded refusal, not a NOT_FOUND (the host can see the room and the turn). */
  greetingFrozen: "greeting_frozen",
  /** `setSeededGreeting` was handed a `greetingIndex` the character's card does not have (an out-of-range
   *  step, or a card whose greetings shrank under a stale client). The verb resolves the TEXT from the card
   *  itself — it never accepts caller prose — so an unresolvable index is the only way this write can miss. */
  greetingAlternateNotFound: "greeting_alternate_not_found",
  /** `applyProseRewrite`'s VARIANT pin missed: the slot's selected variant is no longer the one the audit
   *  read — the host swiped between the ask and the yes. The rewrite was written against a different body, so
   *  landing it would silently replace prose nobody audited. Refused; canon is untouched (the legacy
   *  stale-accept guard, `legacy-main:.../crew/verbs/proposals.ts`). */
  rewriteSuperseded: "rewrite_superseded",
  /** `applyProseRewrite`'s CONTENT pin missed: the audited variant is still selected but its bytes changed
   *  (a hand edit, a continue, a freeze) since the audit read them. Same posture, different cause — refused,
   *  canon untouched. Two codes rather than one because they tell a host two different stories about their
   *  own room, and "which thing moved" is exactly what makes a refusal actionable. */
  rewriteStale: "rewrite_stale",
  /** A registered D50 prompt transform DELIBERATELY aborted the generation — an
   *  automation `transform_draft` rule or a plugin returned `{abort}` instead of a draft. Deliberately NOT the
   *  D53 skip: a broken/slow transform is skipped silently and the turn proceeds, while this is a transform
   *  saying the turn must not happen, and the author is owed the difference. The reason string travels in the
   *  message (it is the transform's own words, capped at `PROMPT_TRANSFORM_ABORT_REASON_MAX`). */
  promptTransformAborted: "prompt_transform_aborted",
  /** B7 — a reaction write/read arrived while the room's resolved `reactionsEnabled` posture is OFF
   *  (`chatMetadata.reactionsEnabled` over the host's per-user default). The caller IS a member (the
   *  membership gate passed), so this is a coded posture refusal, not a NOT_FOUND collapse — hidden
   *  client affordances are the courtesy; THIS is the enforcement. */
  reactionsDisabled: "reactions_disabled",
  /** B7 — a segment-targeted `toggleReaction` whose claimed anchor does not resolve against the SERVER's
   *  own parse of the variant's canon (index out of range, or the span at that index is not the claimed
   *  speaker's). Almost always a benign race — the content or roster changed between the picker's parse and
   *  the write — and refusing beats silently retargeting the member's click at the whole message. */
  invalidSegment: "invalid_segment",
  /** #1356 — a `setUserMacroValues` flush carried a `single-select`/`multi-select` pick that is not one of
   *  the input's DECLARED options. The pick is spliced into the author's prompt template, so an
   *  unconstrained value is arbitrary prose in someone else's prompt; the write is refused whole rather
   *  than partially cleaned, and the message names the field and the declared vocabulary so the pane can
   *  say WHICH knob went stale. The caller IS a member and `getUserMacroPicks` already hands them these
   *  options, so a coded refusal leaks nothing. The resolve-side belt (kit `resolveStaticInput`) still
   *  drops an already-STORED pick whose option was renamed away after the write. */
  unknownMacroPick: USER_MACRO_UNKNOWN_PICK_OP_CODE,
  /** #1463 — a STANDALONE (out-of-turn) runtime-variable write lost its compare-and-set every attempt
   *  (`substrate/variable-ops.ts`). The plane has no lock by design, so a loss means a sibling writer
   *  COMMITTED and the write re-derives; losing the bound repeatedly is therefore not contention but a
   *  defect somewhere else, and this refusal exists so it surfaces loudly instead of spinning or silently
   *  dropping the ops. Internal surface (the callers are automation/plugin ops, not a client verb). */
  variableWriteContended: "variable_write_contended",
  /** #1634 — a canon APPEND lost the head allocation on every attempt (`persistence/canon-write.ts`
   *  `commitCanonAppend`). Losing once is ordinary (a sibling writer took `seq`) and the append re-allocates;
   *  losing the whole bound is not a busy chat but a defect elsewhere — a caller aiming at a fixed seq, or a
   *  head that advances faster than any writer can land — and this refusal exists so that says so instead of
   *  spinning. Internal surface (narrator/image posts; the callers were already authorized at their door). */
  canonAppendContended: "canon_append_contended",
  /** #1462 — a PER-SPEAKER round asked to voice a speaker that is not among the turn context's resolved
   *  `speakerRefs` (a seat whose card read came back empty, an arbitration/wiring gap). The card section is
   *  chosen BY that ref, so there is no honest degrade: `assembly/speaker-card` used to keep the PRIMARY, which
   *  ships one character's card under another character's name and attributes the reply to the speaker that was
   *  asked for. Refused instead (D41 no-silent-degrade). Internal surface — the callers are the turn pipeline
   *  and the host preview, both already past their own doors. */
  speakerOffRoster: "speaker_off_roster",
  /** D259 — `createInvite` with `allowSignup` under a sign-in mode that mints no signup invites. */
  inviteSignupUnavailable: "invite_signup_unavailable",
  /** D259 — `createInvite` with `allowSignup` and a missing or over-cap use count or expiry, or a target. */
  inviteSignupShape: "invite_signup_shape",
} as const;

/** The reason-code union (derived from the one tuple of values — never re-spelled). */
export type ChatOpCode = (typeof CHAT_OP_CODES)[keyof typeof CHAT_OP_CODES];

/** A coded chat operational failure — clients/tests key on `code` (one of {@link CHAT_OP_CODES}). */
export class ChatOperationError extends DomainOperationError {
  declare readonly code: ChatOpCode;
  constructor(code: ChatOpCode, message: string) {
    super(code, message);
    this.name = this.constructor.name;
  }
}
