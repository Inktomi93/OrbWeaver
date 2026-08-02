// domain/chat/substrate/auth/decide — THE chat-authority decision core (spine §2a/§7.1).
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
 * (a non-participant must not learn a foreign chat exists). On a hit, returns the loaded
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
function permits(can: Can, principal: Principal, action: ChatAction, role: ParticipantRole): boolean {
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
 * invites/kick/handoff/anchor-reassignment/memberCardVisibility.
 */
export function assertHost(can: Can, principal: Principal, role: ParticipantRole, chatId: ChatId): void {
  if (!permits(can, principal, "host", role)) {
    throw new ChatOperationError(CHAT_OP_CODES.notHost, `chat ${chatId}: this action requires the room host`);
  }
}

/**
 * The host verdict as a BOOLEAN (assertHost's non-throwing twin) — for a gate whose refusal is COMPOSED with
 * a verb-local fact rather than thrown right here, so it needs the verdict as a value. Derives from the SAME
 * `can()` seam, so a surface that relaxes its gate inherits the correct verdict with no second authority
 * model. Consumer: `verbs/fork.ts::assertForkAllowed` (host OR sole-present-human — the seam answers "is this
 * caller the host?", the verb owns what that means for a fork and throws its own `not_host`).
 *
 * THE BOUNDARY (two sanctioned classes — do not collapse them; ruled 2026-08-03, F1 closed at stage R2):
 * - **This is the ENFORCEMENT arm.** A role comparison that DECIDES what an operation may do belongs here,
 *   under spine invariant #6 ("`can()` is the ONLY privilege-comparison site"). Never re-spell
 *   `role === "host"` inline for a gate.
 * - A role read that SELECTS A VIEWER'S BYTES or produces a payload/view FIELD consumers thread as DATA is
 *   the other class, homed at `substrate/member-visibility.ts::viewerReadsHidden` (D106-F1/D110). Those paths
 *   are deliberately Principal-free and I/O-free; wiring them through `can()` would thread a Principal into a
 *   pure projection for zero behavior change. Do NOT "fix" them to call this function — the F1 ruling moved
 *   `read.ts`'s two former callers here (`replayChatEvents` + `chatEventBounds`) BACK to that lens precisely
 *   because a byte-selection lens may later diverge from operation authority (a co-GM who commands the room
 *   but must not read deception truth), and it can only do that if it has its own home.
 */
export function permitsHost(can: Can, principal: Principal, role: ParticipantRole): boolean {
  return permits(can, principal, "host", role);
}

/**
 * Author-or-host gate (edit/delete a slot). The caller passes if they authored the slot
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
    throw new ChatOperationError(CHAT_OP_CODES.notAuthor, `chat ${chatId}: this action requires the message author or the room host`);
  }
}
