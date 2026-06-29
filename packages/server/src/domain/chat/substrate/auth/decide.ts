// domain/chat/substrate/auth/decide — THE PURE chat-authority decision core (chat.md Part III §11; spine
// §2a/§7.1). Zero I/O: every function decides over an ALREADY-LOADED membership (the `loadMemberChat`
// result) — the verb/guard does the one db read (the turn loads it anyway, spine §6 "no extra query"), this
// layer is the verdict. The `chat_participants.role` (`host|member`) IS the authority signal (D18 — replaces
// owner-equality; there is no `chats.ownerId`).
//
// ┌─ PD-1 SWAP POINT ───────────────────────────────────────────────────────────────────────────────────┐
// │ The spine END-STATE (§6 RESOLVED / §2a / chat.md §11) routes EVERY privilege decision through the ONE  │
// │ `can(principal, action, resource)` seam — for chat: `can(principal, 'read'|'host', {kind:'chat',       │
// │ roster})`. That seam's `ResourceRef` is GLOBAL-only today (`domain/admin/contract/guard.ts`), and the  │
// │ `{kind:'chat', roster}` arm + the `ResourceRef`/`Can` promotion to `@orb/contracts/identity` is the    │
// │ DEFERRED PD-1 work (a cross-package change chat cannot make — `domain-no-cross-feature`). So TODAY      │
// │ these are chat-LOCAL predicates over the loaded `role` (spine §7.1 literally: "reading                 │
// │ chat_participants"). When PD-1 lands, the BODIES below become the `can(...)` call — a one-function      │
// │ swap; the guard + the hot turn path (the call sites) do NOT change. FLAGGED to the orchestrator.       │
// └────────────────────────────────────────────────────────────────────────────────────────────────────┘

import type { ParticipantRole } from "@orb/contracts/chat";
import type { ChatId, UserId } from "@orb/kit/ids";
import { CHAT_OP_CODES, ChatNotFoundError, ChatOperationError } from "../../contract/errors";

/** `host` is the room-authority role (D18 — the ONE home for `requireHost`). A pure predicate over the
 *  loaded role; this is the chat-local stand-in for `can(principal, 'host', {kind:'chat', roster})`. */
export function isHost(role: ParticipantRole): boolean {
  return role === "host";
}

/**
 * Present-membership gate (`requireParticipant`'s decision half). A `loadMemberChat` MISS (`undefined` — no
 * such chat OR the caller is not a present member) collapses to ONE leak-free {@link ChatNotFoundError}
 * (chat.md Part III §11: a non-participant must not learn a foreign chat exists). On a hit, returns the
 * loaded membership unchanged (the verb reuses the row — no second query). Generic so it never names the
 * file-local `loadMemberChat` row shape (queries.ts: "callers read the inferred return").
 */
export function assertParticipant<T>(membership: T | undefined, chatId: ChatId): T {
  if (membership === undefined) {
    throw new ChatNotFoundError(chatId);
  }
  return membership;
}

/**
 * Host-authority gate (`requireHost`'s decision half — call AFTER {@link assertParticipant}). A member who
 * is not the host is a KNOWN existence (they're in the room), so this is an authority refusal, NOT a leak:
 * {@link ChatOperationError}(`not_host`) (per `contract/errors.ts`). Host-only surfaces: reseed/reorder/
 * group-config/room-overrides/invites/kick/handoff/anchor-reassignment/memberCardVisibility (chat.md §11).
 */
export function assertHost(role: ParticipantRole, chatId: ChatId): void {
  if (!isHost(role)) {
    throw new ChatOperationError(
      CHAT_OP_CODES.notHost,
      `chat ${chatId}: this action requires the room host`,
    );
  }
}

/**
 * Author-or-host gate (edit/delete a slot — chat.md §11). The HOST may override any slot; otherwise the
 * caller must be the slot's author (`authorUserId === principalUserId`). A null `authorUserId` (a
 * character/system-authored row) is never author-matchable, so only the host clears it. Reuses the
 * `not_host` code (there is no `not_author` code in the contract — `contract/errors.ts` is not ours to
 * extend); the message names the author-or-host requirement.
 */
export function assertAuthorOrHost(
  args: {
    readonly role: ParticipantRole;
    readonly principalUserId: UserId;
    readonly authorUserId: UserId | null;
  },
  chatId: ChatId,
): void {
  if (isHost(args.role)) {
    return;
  }
  if (args.authorUserId !== null && args.authorUserId === args.principalUserId) {
    return;
  }
  throw new ChatOperationError(
    CHAT_OP_CODES.notHost,
    `chat ${chatId}: this action requires the message author or the room host`,
  );
}
