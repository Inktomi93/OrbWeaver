// domain/chat/substrate/auth/decide — THE chat-authority decision core (chat.md Part III §11; spine §2a/§7.1).
// Zero I/O: every function decides over an ALREADY-LOADED membership (the `loadMemberChat` result) — the
// verb/guard does the one db read (the turn loads it anyway, spine §6 "no extra query"), this layer is the
// verdict. The `chat_participants.role` (`host|member`) IS the authority signal (D18 — replaces owner-equality;
// there is no `chats.ownerId`).
//
// PD-1 — RESOLVED (this chunk). The privilege DECISION routes through the ONE injected `can()` seam (spine §6):
// chat loads its own roster and calls `can(principal, 'read'|'host', {kind:'chat', roster})`. The `role ===
// 'host'` comparison lives INSIDE `can()` (admin/guard.ts) and NOWHERE in chat (spine #6). What STAYS chat's:
// (1) the leak-free PRESENCE answer — a `loadMemberChat` miss is a NOT-FOUND, not a `can()` deny (a non-member
// must not learn a foreign chat exists; `can()` only decides authority over a KNOWN membership); (2) the
// chat-coded error VOCAB (`not_host`/`not_author`) — admin's `can()` throws `DomainForbiddenError`, and chat
// re-expresses that verdict as its known-existence coded refusal. `can` is INJECTED (never an admin import).

import type { Can, ChatAction, ParticipantRole, Principal } from "@orb/contracts/identity";
import { DomainForbiddenError } from "@orb/kit/errors";
import type { ChatId, UserId } from "@orb/kit/ids";
import { CHAT_OP_CODES, ChatNotFoundError, ChatOperationError } from "../../contract/errors";

/**
 * Present-membership gate (`requireParticipant`'s leak-free DATA half). A `loadMemberChat` MISS (`undefined` —
 * no such chat OR the caller is not a present member) collapses to ONE leak-free {@link ChatNotFoundError}
 * (chat.md Part III §11: a non-participant must not learn a foreign chat exists). On a hit, returns the loaded
 * membership unchanged (the verb reuses the row — no second query). This is NOT a `can()` decision: presence
 * is the precondition `can()` assumes — a non-member never reaches the seam. Generic so it never names the
 * file-local `loadMemberChat` row shape (queries.ts: "callers read the inferred return").
 */
export function assertParticipant<T>(membership: T | undefined, chatId: ChatId): T {
  if (membership === undefined) {
    throw new ChatNotFoundError(chatId);
  }
  return membership;
}

/** Route a chat-resource action through the ONE injected `can()` seam, returning the verdict as a boolean (a
 *  `DomainForbiddenError` from the seam = deny). `can()` makes the DECISION; the chat-coded/leak-free error
 *  shaping is the caller's. A non-forbidden error (a real bug) is never swallowed — it propagates. */
function permits(
  can: Can,
  principal: Principal,
  action: ChatAction,
  role: ParticipantRole,
): boolean {
  try {
    can(principal, action, { kind: "chat", roster: { role } });
    return true;
  } catch (err) {
    if (err instanceof DomainForbiddenError) {
      return false;
    }
    throw err;
  }
}

/**
 * Host-authority gate (`requireHost`'s decision half — call AFTER {@link assertParticipant}). Routes the
 * verdict through `can(principal, 'host', {kind:'chat', roster})`. A member who is not the host is a KNOWN
 * existence (they're in the room), so the seam's deny is re-expressed as an authority refusal, NOT a leak:
 * {@link ChatOperationError}(`not_host`). Host-only surfaces: reseed/reorder/group-config/room-overrides/
 * invites/kick/handoff/anchor-reassignment/memberCardVisibility (chat.md §11).
 */
export function assertHost(
  can: Can,
  principal: Principal,
  role: ParticipantRole,
  chatId: ChatId,
): void {
  if (!permits(can, principal, "host", role)) {
    throw new ChatOperationError(
      CHAT_OP_CODES.notHost,
      `chat ${chatId}: this action requires the room host`,
    );
  }
}

/**
 * Author-or-host gate (edit/delete a slot — chat.md §11). The caller passes if they authored the slot
 * (`authorUserId === principal.userId`) OR the seam grants host authority (`can(…, 'host', …)`). A null
 * `authorUserId` (a character/system-authored row) is never author-matchable, so only the host clears it.
 * A member who is neither author nor host is a KNOWN existence → {@link ChatOperationError}(`not_author`)
 * (PD-1: the dedicated code chunk 3 had to collapse onto `not_host` now exists).
 */
export function assertAuthorOrHost(
  can: Can,
  args: {
    readonly principal: Principal;
    readonly role: ParticipantRole;
    readonly authorUserId: UserId | null;
  },
  chatId: ChatId,
): void {
  const { principal, role, authorUserId } = args;
  if (authorUserId !== null && authorUserId === principal.userId) {
    return;
  }
  if (!permits(can, principal, "host", role)) {
    throw new ChatOperationError(
      CHAT_OP_CODES.notAuthor,
      `chat ${chatId}: this action requires the message author or the room host`,
    );
  }
}
