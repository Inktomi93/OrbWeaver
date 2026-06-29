// domain/chat/contract/errors — the typed chat domain errors (chat.md Part I 8-slot `contract/errors.ts`).
//   • ChatNotFoundError — the chat is missing OR the caller is not a participant (the two collapse into one
//     answer — no foreign-existence leak; chat.md Part III §11: `requireParticipant` failure is NOT_FOUND,
//     never a "you're not the host of <that real chat>" leak). Extends the kit `DomainNotFoundError` so the
//     transport maps it to NOT_FOUND uniformly while callers/tests discriminate the entity.
//   • ChatOperationError — a coded operational failure (the `code` discriminates). The reason strings live
//     ONCE in `CHAT_OP_CODES` (no inline re-spell, §7.5). Extends the kit `DomainOperationError` (BAD_REQUEST).
//
// `requireParticipant` (membership) → ChatNotFoundError (leak-free). `requireHost` (you ARE a member but not
// the host) → ChatOperationError("not_host") — the existence is already known to a member, so this is an
// authority refusal, not a leak. (Authoritative auth surface: spine/identity-auth-permission.md.)

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
  /** An edit/delete-a-slot verb (`author-or-host`, chat.md §11) called by a member who is neither the slot's
   *  `authorUserId` nor the room host — a known-existence authority refusal (the caller IS a member). */
  notAuthor: "not_author",
  /** An abort called by a member who does not own the in-flight turn (`turn-owner`, chat.md §11 — the
   *  rollback-theft defense; a host aborting a member's turn is refused). */
  notTurnOwner: "not_turn_owner",
  /** A turn was requested while the per-chat turn lock is held (a turn is already in flight). */
  locked: "locked",
  /** A turn aborted (user-cancelled / stale / error) — the lifecycle refusal surfaced to the caller. */
  aborted: "aborted",
  /** A room-override write targeted a field outside the four-field host allowlist, or a `forbidRoomOverride`
   *  field — default-deny (chat.md Part III §9). */
  forbiddenOverride: "forbidden_override",
  /** A non-owner-triggered `max-pro-sub` turn without explicit owner consent (chat.md Part III §5/inv 3 —
   *  by-proxy refused, fail-closed, default OFF). */
  consentRequired: "consent_required",
  /** The per-member turn/request COUNT budget is exhausted (chat.md Part III §5, debited in-lock). */
  budgetExceeded: "budget_exceeded",
  /** A multi-human / membership surface was reached while the deployment is in `single-user` AUTH_MODE
   *  (chat.md Part III §2/§11 — the capability gate). */
  singleUserMode: "single_user_mode",
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
