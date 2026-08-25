// domain/automation/engine/budget-gate — the pre-op fire-RATE gates (loop safety), checked BEFORE any arm runs.
// Three layers, all sourced from automation's OWN tables (the fire log IS the per-hour count source, on
// the `(rule_id, fired_at)` index — not the rate_limit_buckets primitive, which can't express the per-rule
// dynamic caps and would split the source of truth from the fire log the host debugs against): the per-rule
// cooldown (off `last_fired_at`), the per-rule/hour ceiling, and the per-SCOPE/hour ceiling — the
// host-editable `automation_budgets` row for a chat rule, the owner-editable `automation_owner_budgets` row
// for a chat-less one (both default 120). This is the belt that bounds a runaway rule from hammering a paid
// API. A refusal is NOT an error — the dispatch records `budget_refused` and the rule stays healthy. (The
// per-day $/spend-action ceilings were stripped for enterprise spend enforcement.)

import { AUTOMATION_CHAT_BUDGET_DEFAULTS, AUTOMATION_OWNER_BUDGET_DEFAULTS } from "@orb/contracts/automation";
import type { Db } from "@orb/db";
import type { ChatId } from "@orb/kit/ids";
import type { BudgetVerdict, RuleRow } from "../contract/ops.ts";
import { selectBudget, selectOwnerBudget } from "../persistence/budgets.ts";
import { countChatFiresSince, countOwnerGlobalFiresSince, countRuleFiresSince } from "../persistence/fires.ts";

const HOUR_MS = 3_600_000;
const MS_PER_SECOND = 1000;

const OK: BudgetVerdict = { ok: true };

/** The SCOPE belt — the second ceiling, the one that bounds a whole scope rather than one rule. Split out so
 *  the shared cooldown/per-rule half above it is written once and the scope fork is the only thing that
 *  branches.
 *
 *  TWO TABLES, ONE POLICY (C5). The per-chat belt keys on `chat_id` and the per-owner belt on `owner_id`,
 *  because `automation_budgets`'s PK IS the chat id: a NULL-scope row is unrepresentable, and a synthetic
 *  sentinel key would be the D24 soft-ref class. Both read the SAME fire log (an absent budget row is
 *  dispatched as its DDL default, so the projection and the gate can never disagree), and both refuse
 *  identically — a `budget_refused` is not an error and the rule stays healthy. */
async function checkScopeBudget(db: Db, rule: RuleRow, chatId: ChatId | null, windowStart: number): Promise<BudgetVerdict> {
  if (chatId === null) {
    const owner = await selectOwnerBudget(db, rule.ownerId);
    const ownerCap = owner?.maxFiresPerHour ?? AUTOMATION_OWNER_BUDGET_DEFAULTS.maxFiresPerHour;
    // The denominator is the author's OWN chat-less fires, never their whole library's: a global rule and a
    // room rule are bounded by different belts on purpose, so a busy room can never starve the global lane
    // (or be starved by it).
    const ownerFires = await countOwnerGlobalFiresSince(db, rule.ownerId, windowStart);
    return ownerFires >= ownerCap ? { ok: false, detail: "owner_hourly" } : OK;
  }
  const budget = await selectBudget(db, chatId);
  const chatCap = budget?.maxFiresPerHour ?? AUTOMATION_CHAT_BUDGET_DEFAULTS.maxFiresPerHour;
  const chatFires = await countChatFiresSince(db, chatId, windowStart);
  return chatFires >= chatCap ? { ok: false, detail: "chat_hourly" } : OK;
}

/** Gate a rule against its cooldown + per-rule/hour + per-SCOPE/hour ceilings. Sequential short-circuit: the
 *  cheapest check (a field read) first, the COUNT reads only if it clears. `scope` is the rule's own chat, or
 *  `null` for an owner-global rule. */
export async function checkBudget(db: Db, args: { readonly rule: RuleRow; readonly scope: ChatId | null; readonly nowMs: number }): Promise<BudgetVerdict> {
  const { rule, scope, nowMs } = args;
  if (rule.cooldownSeconds > 0 && rule.lastFiredAt !== null && nowMs - rule.lastFiredAt < rule.cooldownSeconds * MS_PER_SECOND) {
    return { ok: false, detail: "cooldown" };
  }
  const windowStart = nowMs - HOUR_MS;
  const ruleFires = await countRuleFiresSince(db, rule.id, windowStart);
  if (ruleFires >= rule.maxFiresPerHour) {
    return { ok: false, detail: "rule_hourly" };
  }
  return checkScopeBudget(db, rule, scope, windowStart);
}
