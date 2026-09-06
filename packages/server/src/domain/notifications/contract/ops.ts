// domain/notifications/contract/ops — the CROSS-FEATURE op types this domain CONSUMES, declared here (the
// consumer's own contract) and wired at the composition root. Constitution §2: cross-feature dependency is
// never a sideways import; a verb declares the TYPE of the op it needs and the entry root supplies the
// runtime function. The `persona/contract/ops.ts` precedent, mirrored.
//
// WHY THE INBOX NEEDS ONE AT ALL (#1799). `InboxView.actionable` — "this row is still waiting on a
// decision" — is a fact about state the notifications table does not hold and must not: an invite's
// settlement lives in `chat_invites.status`, a nomination's in `chats.pending_host_user_id`, and BOTH move
// without any notification row moving (a share-link accept, a host revoke, the #1501 accept whose follow-up
// dismiss failed). Deriving it from the row's own columns would produce an indicator that keeps claiming a
// decision that no longer exists, which is precisely the defect the owner ruling is about.
//
// THE OP TRAFFICS IN BARE IDS, DELIBERATELY. The provider is the chat domain, which cannot import this file
// (that would be the sideways import) — so nothing in the shape is spelled in either domain's vocabulary:
// the caller hands over id lists and gets back the SUBSET still standing. Both sides type it structurally
// and `tsc` proves the fit at `entry/compose`, which is where the two halves meet by design.

import type { ChatId, ChatInviteId, UserId } from "@orb/kit/ids";

/** What the inbox asks about: the ids on ONE page of rows that carry a chat-owned decision. */
export interface StandingAsksParams {
  /** Whose inbox — the provider re-checks it, so a foreign row can never come back "standing". */
  readonly recipientUserId: UserId;
  /** Invites named by `invite` rows on this page (deduped by the caller). */
  readonly inviteIds: readonly ChatInviteId[];
  /** Chats named by `handoff-nominated` rows on this page (deduped by the caller). */
  readonly nominatedChatIds: readonly ChatId[];
}

/** The SUBSET still awaiting the recipient's decision. An id the caller asked about and does not get back
 *  is settled, gone, or was never theirs — one indistinguishable answer, which is what keeps this read free
 *  of an existence oracle over another user's rooms. */
export interface StandingAsksResult {
  readonly inviteIds: readonly ChatInviteId[];
  readonly nominatedChatIds: readonly ChatId[];
}

/** Resolve which of a page's chat-owned decisions are still standing. ONE call per page, never per row:
 *  an inbox page is up to `NOTIFICATIONS_LIST_MAX_LIMIT` rows and the resume read pumps at that ceiling. */
export type ResolveStandingAsks = (params: StandingAsksParams) => Promise<StandingAsksResult>;
