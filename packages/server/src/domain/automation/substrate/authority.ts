// domain/automation/substrate/authority — the ONE "does this user still hold host on this chat" predicate.
//
// It exists as a substrate helper because THREE planes ask the same question and must not answer it
// differently: the dispatch gate (a rule fires only while its AUTHOR still holds host), the S4 confirm
// re-check (§3-S4: confirm re-runs `holdsAuthority(author)` — a confirmer's own host role never stands in
// for the author's), and the RULED host-handoff VOID sweep. A second spelling is how one of the three ends
// up comparing `role === "host"` itself, which is precisely what `can()` exists to prevent.
//
// Fail-CLOSED on every uncertainty: no such user, not a present member, or a `can()` throw ⇒ false.

import type { ChatId, UserId } from "@orb/kit/ids";
import type { AuthorityDeps } from "../contract/ops.ts";
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
  if (principal === null || role === undefined) {
    return false;
  }
  // @orb-gate-ignore caught-failure-ownership(default:catch): FAIL-CLOSED — the ONE `can()` kernel's refusal
  // collapses to a boolean host-authority verdict; a denied `can()` can never read as host. Ends if `can()`
  // grows a distinct infra-error class this boolean must stop swallowing.
  try {
    deps.can(principal, "host", { kind: "chat", membership: { role } });
    return true;
  } catch {
    return false;
  }
}
