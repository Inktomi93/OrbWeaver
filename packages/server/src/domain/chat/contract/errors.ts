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
// authority refusal, not a leak. (Authoritative auth surface: core/Spine-Identity-and-Auth.md.)

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
  /** A turn was requested while the per-chat turn lock is held (a turn is already in flight). */
  locked: "locked",
  /** `undoContinue`/`revertContinue` on a variant that was never continued (the `preContinue*`/
   *  `lastContinuation*` snapshot columns are empty — D26; nothing to restore). */
  noContinuation: "no_continuation",
  /** A turn aborted (user-cancelled / stale / error) — the lifecycle refusal surfaced to the caller. */
  aborted: "aborted",
  /** A room-override write targeted a field outside the four-field host allowlist, or a `forbidRoomOverride`
   *  field — default-deny. */
  forbiddenOverride: "forbidden_override",
  /** A non-owner-triggered `max-pro-sub` turn without explicit owner consent (by-proxy refused, fail-closed,
   *  default OFF). */
  consentRequired: "consent_required",
  /** The per-member turn/request COUNT budget is exhausted (debited in-lock). */
  budgetExceeded: "budget_exceeded",
  /** A multi-human / membership surface was reached while the deployment is in `single-user` AUTH_MODE
   *  (the capability gate). The DOMAIN-side (LAYER-2) discriminator — transport's LAYER-1 belt
   *  (`multiHumanProcedure`, PD-106) refuses the documented procedures as a leak-free NOT_FOUND. */
  singleUserMode: "single_user_mode",
  /** `seatAgent` targeted an owner who is not a PRESENT human member of the room (D60, doc 04 §3 — an agent
   *  may only be seated by/for a present member; host-only surface, so a coded refusal leaks nothing). */
  ownerNotPresent: "owner_not_present",
  /** `seatAgent` targeted a DISABLED agent principal (`users.enabled = false`) — the containment kill switch
   *  refuses the seat (D60, doc 03 §5). */
  agentDisabled: "agent_disabled",
  /** #67 — `send` was given an `attachmentAssetIds` id the actor does not OWN (a foreign / gone asset). The
   *  caller IS a present member (the send gate passed), so this is a coded validation refusal, not a
   *  NOT_FOUND collapse — and it leaks nothing about another owner's asset (per-user D21 scope). */
  attachmentNotOwned: "attachment_not_owned",
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
