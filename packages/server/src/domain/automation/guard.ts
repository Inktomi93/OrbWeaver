// domain/automation/guard — the rule-authority chokepoint (the crew guard.ts precedent). Rule authoring IS
// room-host authority in v1 (04 §2): every rule verb resolves to `can(principal, "host", {kind:"chat",
// roster})` over the chat's PRESENT membership (never a bare `role === 'host'` — that lives inside `can()`).
// Two entry points: chat-scoped verbs gate a chatId directly; rule-scoped verbs load the rule first and gate
// its chat. A non-member collapses to a leak-free not-found; a member-who-is-not-host is a KNOWN existence,
// so `can()`'s DomainForbiddenError (→ FORBIDDEN) propagates.

import type { Principal } from "@orb/contracts/identity";
import type { AutomationRuleId, ChatId } from "@orb/kit/ids";
import { AutomationChatNotFoundError, RuleNotFoundError } from "./contract/errors";
import type { AutomationContext } from "./contract/service";
import { loadCallerRole } from "./persistence/canon-reads";
import { selectRuleRow } from "./persistence/rules";

type GuardCtx = Pick<AutomationContext, "db" | "can">;

type RuleRow = NonNullable<Awaited<ReturnType<typeof selectRuleRow>>>;
/** A rule the guard has proven chat-scoped (v1 refuses the owner-global chat-less shape) — `chatId` is
 *  narrowed non-null so callers read it without a redundant guard. */
type ChatScopedRule = Omit<RuleRow, "chatId"> & { readonly chatId: ChatId };

/** Host-gate a chat directly (createRule/listRules/reorderRules/setBudgets). A non-member → leak-free
 *  AutomationChatNotFoundError; a member-not-host → `can()`'s DomainForbiddenError. */
export async function requireChatHost(ctx: GuardCtx, principal: Principal, chatId: ChatId): Promise<void> {
  const role = await loadCallerRole(ctx.db, chatId, principal.userId);
  if (role === undefined) {
    throw new AutomationChatNotFoundError(chatId);
  }
  ctx.can(principal, "host", { kind: "chat", roster: { role } });
}

/** Host-gate a rule (updateRule/setRuleEnabled/deleteRule/listFires/testRule). Loads the rule; a missing
 *  rule, an owner-global rule (chat-less — not wired v1), or a caller who is not a present member of the
 *  rule's chat all collapse to a leak-free RuleNotFoundError. Returns the loaded row so the caller skips a
 *  second read. */
export async function requireRuleHost(ctx: GuardCtx, principal: Principal, ruleId: AutomationRuleId): Promise<ChatScopedRule> {
  const rule = await selectRuleRow(ctx.db, ruleId);
  if (rule === undefined || rule.chatId === null) {
    throw new RuleNotFoundError(ruleId);
  }
  const chatId = rule.chatId;
  const role = await loadCallerRole(ctx.db, chatId, principal.userId);
  if (role === undefined) {
    throw new RuleNotFoundError(ruleId);
  }
  ctx.can(principal, "host", { kind: "chat", roster: { role } });
  return { ...rule, chatId };
}
