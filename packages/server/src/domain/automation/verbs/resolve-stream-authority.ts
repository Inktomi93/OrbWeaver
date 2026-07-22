// verb: resolveStreamAuthority — the `automation.stream` subscribe-time visibility gate (04 §5). The
// automation bus is member-visible for ONE event (`quickReplySurfaced` — the room's transient chips); the
// rule fire/error/disable events are the host's hidden hand (host only). So this is a MEMBER gate, not the
// host gate the rule-lifecycle verbs use: a NON-present member collapses to a leak-free AutomationChatNotFound
// (→ NOT_FOUND — a stranger never learns a foreign chat exists, never receives its events), while a present
// member resolves an authority tier the subscription tail projects by (`host` sees everything, `member` sees
// only the chips). `can()` is the ONE host oracle (D17 — automation never compares `role === 'host'`); a
// present-but-not-host member is the `member` tier (a caught `can()` refusal), NOT a leak (they ARE a known
// participant). This is the injected-op-caller-gate class realized fail-closed: the chatId is the untrusted
// input, the present-membership read is the chokepoint, and it runs BEFORE any bus tail attaches.

import { AutomationChatNotFoundError } from "../contract/errors";
import type { ResolveStreamAuthorityParams } from "../contract/params";
import type { StreamAuthority } from "../contract/results";
import type { AutomationContext, AutomationService } from "../contract/service";
import { loadCallerRole } from "../persistence/canon-reads";

export function createResolveStreamAuthority(ctx: AutomationContext): AutomationService["resolveStreamAuthority"] {
  return async ({ principal, chatId }: ResolveStreamAuthorityParams): Promise<StreamAuthority> => {
    const role = await loadCallerRole(ctx.db, chatId, principal.userId);
    if (role === undefined) {
      throw new AutomationChatNotFoundError(chatId);
    }
    try {
      ctx.can(principal, "host", { kind: "chat", roster: { role } });
      return "host";
    } catch {
      // A present member who is not host — a KNOWN participant, so their stream is legitimate (they receive
      // the room-visible chips), just narrowed to the `member` tier. NOT a leak: they already see the chat.
      return "member";
    }
  };
}
