// domain/automation/substrate/authority — the ONE "does this user still hold host on this chat" predicate,
// and the ONE "does this ask's actor still stand" predicate the S4 confirm re-check and the void sweep share.
//
// Three planes ask the host question and must not answer it differently: the dispatch gate (a rule fires only
// while its AUTHOR still holds host), the confirm re-check of a RULE ask, and the sweep. A second spelling is
// how one of them ends up comparing `role === "host"` itself, which is precisely what `can()` exists to prevent.
//
// Fail-CLOSED on every uncertainty: no such user, not a present member, or a `can()` throw ⇒ false.

import type { ChatId, UserId } from "@orb/kit/ids";
import type { AuthorityDeps, PendingSuggestion } from "../contract/ops.ts";
import { loadMembershipInstance, loadPresentHostUserId } from "../persistence/ask-standing.ts";
import { loadCallerRole } from "../persistence/canon-reads.ts";

/** C5 — the OWNER-GLOBAL twin of {@link holdsChatHostAuthority}: may this author's chat-less rules still act?
 *
 *  It exists for the same reason the chat predicate does — the dispatch must RE-PROVE a standing authority
 *  per fire, not trust the one that existed at mint. What it can prove is different, and that difference is
 *  the design rather than a weakening: a global rule has no room, so there is no roster, no resource and
 *  nothing for `can()` to decide over. What remains is the account itself, so this asks the one question that
 *  still has an answer — is the author still a live, ENABLED user? A disabled or deleted author's global
 *  rules stop firing, which is the exact analogue of an ex-host's chat rules stopping.
 *
 *  THE READ IS AN INJECTED OP, never a local `users` select: that table belongs to `domain/sessions` +
 *  `domain/admin` alone (the no-direct-users-read chokepoint), so the fact crosses as a wired predicate.
 *  Fail-CLOSED on every uncertainty, like its twin: no such user ⇒ false. */
export function holdsOwnerAuthority(deps: Pick<AuthorityDeps, "isAuthorEnabled">, userId: UserId): Promise<boolean> {
  return deps.isAuthorEnabled(userId);
}

/** Does `userId` hold HOST authority over `chatId` right now? */
export async function holdsChatHostAuthority(deps: AuthorityDeps, chatId: ChatId, userId: UserId): Promise<boolean> {
  const [principal, role] = await Promise.all([deps.resolveAuthor(userId), loadCallerRole(deps.db, chatId, userId)]);
  if (role === undefined) {
    return false;
  }
  // the `false` is the denial verdict itself: `decideChat` in
  // `admin/guard.ts` throws only `DomainForbiddenError` for the role `loadCallerRole` already captured, and every
  // caller reads the boolean (`dispatch.ts` records `authority_refused`; `confirm-suggestion.ts` refuses
  // `author_lost_authority`). Ends if `can()` gains a throw that is not a refusal.
  try {
    deps.can(principal, "host", { kind: "chat", membership: { role } });
    return true;
  } catch {
    return false;
  }
}

/** Does an open ask's ACTOR still hold the standing its ORIGIN requires? The answer differs by origin, and the
 *  difference is an owner ruling, not a convenience. Both origins die on a host handoff: no re-mint, no transfer.
 *
 *  - RULE: the author must still host. The ask was "may THIS author's rule act here".
 *  - PLUGIN: the installer need not host, because the authority is the yes of the host who saw the card. So the
 *    host recorded at raise must still host, and the installer must still hold the SAME membership: a removal
 *    followed by a re-invite reuses the row, and only the recorded instance tells the two stays apart. The
 *    plugin's installed-and-enabled half is the confirm verb's injected `isPluginLive` read.
 *
 *  Never widen the plugin arm to "the confirmer hosts": the act runs as the installer, on their grants, so an
 *  installer who left must leave no executable card behind. */
export async function askActorStillStands(deps: AuthorityDeps, ask: PendingSuggestion): Promise<boolean> {
  // Only the plugin arm of the union carries a recorded standing; a nested `source.kind` check cannot narrow it.
  if (!("standing" in ask)) {
    return await holdsChatHostAuthority(deps, ask.chatId, ask.actorUserId);
  }
  const { hostUserId, installerMembership } = ask.standing;
  const [host, membership] = await Promise.all([loadPresentHostUserId(deps.db, ask.chatId), loadMembershipInstance(deps.db, ask.chatId, ask.actorUserId)]);
  return (
    host === hostUserId &&
    membership !== undefined &&
    membership.joinSeq === installerMembership.joinSeq &&
    membership.joinedAt === installerMembership.joinedAt
  );
}
