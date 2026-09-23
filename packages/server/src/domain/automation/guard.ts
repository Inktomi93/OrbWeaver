// domain/automation/guard — the rule-authority chokepoint (the agents guard.ts precedent). A rule's authority
// follows its SCOPE, and there are exactly two:
//   • CHAT-SCOPED (`chat_id` set) — rule authoring IS room-host authority: `can(principal, "host",
//     {kind:"chat", membership})` over the chat's PRESENT membership (never a bare `role === 'host'` — that lives
//     inside `can()`). A non-member collapses to a leak-free not-found; a member-who-is-not-host is a KNOWN
//     existence, so `can()`'s DomainForbiddenError (→ FORBIDDEN) propagates.
//   • OWNER-GLOBAL (`chat_id IS NULL`, C5) — there is no room, so there is no roster and `can()` has no
//     resource to decide over. The authority is the AUTHOR THEMSELVES, which is the axis the D18 single-owned
//     planes already use (`global_variables`, `fetchOwned`): the caller must BE the rule's owner. This
//     invents no permission kind (the committed spec's authority law), it cites the one that exists.
//
// A NON-OWNER'S GLOBAL RULE COLLAPSES TO NOT-FOUND, not FORBIDDEN, and the asymmetry with the chat arm is
// deliberate rather than an inconsistency: a chat rule's existence is already known to every member of its
// room (they can see the room), so refusing them by FORBIDDEN leaks nothing. An owner-global rule is visible
// to exactly one person, so "that rule is not yours" and "that rule does not exist" must be indistinguishable
// or the id becomes an existence oracle over another user's private lane.

import type { Principal } from "@orb/contracts/identity";
import type { AutomationRuleId, ChatId } from "@orb/kit/ids";
import { AutomationChatNotFoundError, RuleNotFoundError } from "./contract/errors.ts";
import type { AutomationContext } from "./contract/service.ts";
import { loadCallerRole } from "./persistence/canon-reads.ts";
import { selectRuleRow } from "./persistence/rules.ts";

type GuardCtx = Pick<AutomationContext, "db" | "can">;

type RuleRow = NonNullable<Awaited<ReturnType<typeof selectRuleRow>>>;
/** A rule the guard has proven chat-scoped — `chatId` is narrowed non-null so callers read it without a
 *  redundant guard. */
type ChatScopedRule = Omit<RuleRow, "chatId"> & { readonly chatId: ChatId };
/** A rule the guard has proven owner-GLOBAL — `chatId` is narrowed to `null` for the same reason. */
type GlobalRule = Omit<RuleRow, "chatId"> & { readonly chatId: null };

/** A rule PLUS the scope its authority was decided under. The discriminant is `chatId`, so a caller that
 *  branches on it gets the narrowed row for free and a caller that forgets to branch fails `tsc` the moment
 *  it reads a chat-only field. */
type ScopedRule = ChatScopedRule | GlobalRule;

/** Host-gate a chat directly (createRule on a chat/listRules/reorderRules). A non-member → leak-free
 *  AutomationChatNotFoundError; a member-not-host → `can()`'s DomainForbiddenError. */
export async function requireChatHost(ctx: GuardCtx, principal: Principal, chatId: ChatId): Promise<void> {
  const role = await loadCallerRole(ctx.db, chatId, principal.userId);
  if (role === undefined) {
    throw new AutomationChatNotFoundError(chatId);
  }
  ctx.can(principal, "host", { kind: "chat", membership: { role } });
}

/** Gate a rule by its OWN scope (updateRule/setRuleEnabled/deleteRule/listFires/testRule/runRuleNow) and hand
 *  back the loaded, scope-narrowed row so the caller skips a second read. Every refusal that could reveal
 *  another user's private lane is a `RuleNotFoundError`; see the header for why the two arms differ. */
export async function requireRuleAuthority(ctx: GuardCtx, principal: Principal, ruleId: AutomationRuleId): Promise<ScopedRule> {
  const rule = await selectRuleRow(ctx.db, ruleId);
  if (rule === undefined) {
    throw new RuleNotFoundError(ruleId);
  }
  const chatId = rule.chatId;
  if (chatId === null) {
    // The owner-global arm: the author IS the authority. `principal.userId` came from an authenticated
    // request, which re-checks `users.enabled` per request (D40 / invariant #8), so "this caller is enabled"
    // is already proven upstream and is not re-derived here.
    if (rule.ownerId !== principal.userId) {
      throw new RuleNotFoundError(ruleId);
    }
    return { ...rule, chatId: null };
  }
  const role = await loadCallerRole(ctx.db, chatId, principal.userId);
  if (role === undefined) {
    throw new RuleNotFoundError(ruleId);
  }
  ctx.can(principal, "host", { kind: "chat", membership: { role } });
  return { ...rule, chatId };
}
