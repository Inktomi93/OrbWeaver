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

/** Does `userId` hold HOST authority over `chatId` right now? */
export async function holdsChatHostAuthority(deps: AuthorityDeps, chatId: ChatId, userId: UserId): Promise<boolean> {
  const [principal, role] = await Promise.all([deps.resolveAuthor(userId), loadCallerRole(deps.db, chatId, userId)]);
  if (principal === null || role === undefined) {
    return false;
  }
  try {
    deps.can(principal, "host", { kind: "chat", roster: { role } });
    return true;
  } catch {
    return false;
  }
}
