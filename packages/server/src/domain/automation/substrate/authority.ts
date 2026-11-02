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
 *  difference is an owner ruling, not a convenience:
 *
 *  - RULE: the author must still host. The ask was "may THIS author's rule act here", and on a handoff it dies
 *    fail-closed: no re-mint, no transfer to the new host.
 *  - PLUGIN: the installer must still be a PRESENT MEMBER. The host's yes is the plugin ask's authority, so the
 *    installer never needed host to be asked about, and a host who was demoted is a member like any other.
 *    The plugin's installed-and-enabled half is the confirm verb's injected `isPluginLive` read.
 *
 *  Never widen the plugin arm to "the confirmer hosts": an installer who left or was removed must leave no
 *  executable card behind, because the act runs as them, on their grants. */
export async function askActorStillStands(deps: AuthorityDeps, ask: Pick<PendingSuggestion, "chatId" | "actorUserId" | "source">): Promise<boolean> {
  if (ask.source.kind === "plugin") {
    return (await loadCallerRole(deps.db, ask.chatId, ask.actorUserId)) !== undefined;
  }
  return await holdsChatHostAuthority(deps, ask.chatId, ask.actorUserId);
}
