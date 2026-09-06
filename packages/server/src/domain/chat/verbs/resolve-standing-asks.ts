// op: resolveStandingAsks — which of a notifications page's CHAT-OWNED decisions are still open (#1799).
// A STANDALONE compose-built factory over `Db`, NOT a `ChatService` verb and never tRPC: it takes no
// Principal (the `resolvePersonasForRoster` / `postNarratorMessage` Principal-less precedent) because its
// one caller is the notifications domain's read model, which already knows whose inbox it is holding and
// passes that user id as the scope. Nothing here is reachable from a router.
//
// WHY THE ANSWER LIVES HERE. The inbox's `actionable` flag means "this row still wants a decision", and the
// settling state for the two chat-shaped asks is chat's own: `chat_invites.status` and
// `chats.pending_host_user_id`. Both move WITHOUT any notification row moving — a share-link accept, a host
// revoke, a re-nominate, or the #1501 accept whose follow-up dismiss failed — so a flag derived from the
// notification row alone would keep asserting a decision that no longer exists. notifications declares the
// op TYPE it needs (`domain/notifications/contract/ops.ts`); this file is the runtime half; `entry/compose`
// is where they meet. Neither domain imports the other.
//
// THE SCOPE IS RE-CHECKED HERE, not trusted: both reads pin the asking user (`invited_user_id`,
// `pending_host_user_id`), so an id belonging to somebody else's room comes back absent rather than
// standing — the same leak-free `undefined` shape the accept-by-id door uses, applied to a set read.

import type { Db } from "@orb/db";
import type { ChatId, ChatInviteId, UserId } from "@orb/kit/ids";
import { selectStandingInviteIds } from "../persistence/invites.ts";
import { selectStandingNominationChatIds } from "../persistence/queries.ts";

/** The op's own spelling of its input — deliberately bare ids, so this file never names a notifications
 *  concept and the consumer never names a chat table. `tsc` proves the two agree at `entry/compose`. */
interface StandingAsks {
  readonly recipientUserId: UserId;
  readonly inviteIds: readonly ChatInviteId[];
  readonly nominatedChatIds: readonly ChatId[];
}

export function createResolveStandingAsks(db: Db): (asks: StandingAsks) => Promise<{ inviteIds: ChatInviteId[]; nominatedChatIds: ChatId[] }> {
  return async ({ recipientUserId, inviteIds, nominatedChatIds }) => {
    // TWO reads, in parallel and each short-circuiting on an empty list: an inbox page is usually all
    // informational rows, and the common case must not cost a round trip per axis.
    const [standingInvites, standingNominations] = await Promise.all([
      selectStandingInviteIds(db, recipientUserId, inviteIds),
      selectStandingNominationChatIds(db, recipientUserId, nominatedChatIds),
    ]);
    return { inviteIds: standingInvites, nominatedChatIds: standingNominations };
  };
}
