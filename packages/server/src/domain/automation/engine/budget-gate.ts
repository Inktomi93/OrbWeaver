// domain/automation/engine/budget-gate — the pre-op fire-RATE gates (loop safety), checked BEFORE any arm runs.
// Three layers, all sourced from automation's OWN tables (04 §1: the fire log IS the per-hour count source, on
// the `(rule_id, fired_at)` index — not the rate_limit_buckets primitive, which can't express the per-rule
// dynamic caps and would split the source of truth from the fire log the host debugs against): the per-rule
// cooldown (off `last_fired_at`), the per-rule/hour ceiling, and the per-chat/hour ceiling (the host-editable
// `automation_budgets` row, default 120). This is the belt that bounds a runaway rule from hammering a paid
// API. A refusal is NOT an error — the dispatch records `budget_refused` and the rule stays healthy. (The
// per-day $/spend-action ceilings were stripped 2026-07-24 — enterprise spend enforcement.)

import { AUTOMATION_CHAT_BUDGET_DEFAULTS } from "@orb/contracts/automation";
import type { Db } from "@orb/db";
import type { ChatId } from "@orb/kit/ids";
import type { BudgetVerdict, RuleRow } from "../contract/ops";
import { selectBudget } from "../persistence/budgets";
import { countChatFiresSince, countRuleFiresSince } from "../persistence/fires";

const HOUR_MS = 3_600_000;
const MS_PER_SECOND = 1000;

const OK: BudgetVerdict = { ok: true };

/** Gate a rule against its cooldown + per-rule/hour + per-chat/hour ceilings. Sequential short-circuit: the
 *  cheapest check (a field read) first, the COUNT reads only if it clears. */
export async function checkBudget(db: Db, args: { readonly rule: RuleRow; readonly chatId: ChatId; readonly nowMs: number }): Promise<BudgetVerdict> {
  const { rule, chatId, nowMs } = args;
  if (rule.cooldownSeconds > 0 && rule.lastFiredAt !== null && nowMs - rule.lastFiredAt < rule.cooldownSeconds * MS_PER_SECOND) {
    return { ok: false, detail: "cooldown" };
  }
  const windowStart = nowMs - HOUR_MS;
  const ruleFires = await countRuleFiresSince(db, rule.id, windowStart);
  if (ruleFires >= rule.maxFiresPerHour) {
    return { ok: false, detail: "rule_hourly" };
  }
  const budget = await selectBudget(db, chatId);
  const chatCap = budget?.maxFiresPerHour ?? AUTOMATION_CHAT_BUDGET_DEFAULTS.maxFiresPerHour;
  const chatFires = await countChatFiresSince(db, chatId, windowStart);
  if (chatFires >= chatCap) {
    return { ok: false, detail: "chat_hourly" };
  }
  return OK;
}
