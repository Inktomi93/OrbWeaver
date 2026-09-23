// domain/automation/engine/budget-gate — the pre-op fire-RATE gates (loop safety), checked BEFORE any arm runs.
// Three layers, all sourced from automation's OWN tables (the fire log IS the per-hour count source, on
// the `(rule_id, fired_at)` index — not the rate_limit_buckets primitive, which can't express the per-rule
// dynamic caps and would split the source of truth from the fire ledger): the per-rule
// cooldown (off completed + held fire-ledger admissions), the per-rule/hour ceiling, and the per-SCOPE/hour
// ceiling — the fixed `AUTOMATION_CHAT_MAX_FIRES_PER_HOUR` for a chat rule, the owner-editable
// `automation_owner_budgets` row for a chat-less one (default 120). This is the belt that bounds a runaway
// rule from hammering a paid API. A refusal is NOT an error — the dispatch records `budget_refused` and the
// rule stays healthy. (The per-day $/spend-action ceilings were stripped for enterprise spend enforcement.)

import { AUTOMATION_CHAT_MAX_FIRES_PER_HOUR, AUTOMATION_OWNER_BUDGET_DEFAULTS } from "@orb/contracts/automation";
import type { Db } from "@orb/db";
import type { ChatId } from "@orb/kit/ids";
import type { BudgetVerdict, RuleRow } from "../contract/ops.ts";
import { selectOwnerBudget } from "../persistence/budgets.ts";
import {
  countChatBudgetAdmissionsSince,
  countOwnerGlobalBudgetAdmissionsSince,
  countRuleBudgetAdmissionsSince,
  hasRuleBudgetAdmissionSince,
} from "../persistence/fires.ts";

const HOUR_MS = 3_600_000;
const MS_PER_SECOND = 1000;

const OK: BudgetVerdict = { ok: true };

/** The SCOPE belt — the second ceiling, the one that bounds a whole scope rather than one rule. Split out so
 *  the shared cooldown/per-rule half above it is written once and the scope fork is the only thing that
 *  branches.
 *
 *  TWO SCOPES, ONE POLICY (C5). The per-chat belt counts a chat's fires against the fixed
 *  `AUTOMATION_CHAT_MAX_FIRES_PER_HOUR`; the per-owner belt counts the author's chat-less fires against their
 *  `automation_owner_budgets` row (an absent row is dispatched as its DDL default, so the projection and the
 *  gate can never disagree). Both read the SAME fire log and refuse identically — a `budget_refused` is not an
 *  error and the rule stays healthy. The same ceilings bind `reserveFireBudget`'s atomic INSERT. */
async function checkScopeBudget(db: Db, rule: RuleRow, chatId: ChatId | null, windowStart: number): Promise<BudgetVerdict> {
  if (chatId === null) {
    const owner = await selectOwnerBudget(db, rule.ownerId);
    const ownerCap = owner?.maxFiresPerHour ?? AUTOMATION_OWNER_BUDGET_DEFAULTS.maxFiresPerHour;
    // The denominator is the author's OWN chat-less fires, never their whole library's: a global rule and a
    // room rule are bounded by different belts on purpose, so a busy room can never starve the global lane
    // (or be starved by it).
    const ownerFires = await countOwnerGlobalBudgetAdmissionsSince(db, rule.ownerId, windowStart);
    return ownerFires >= ownerCap ? { ok: false, detail: "owner_hourly" } : OK;
  }
  const chatFires = await countChatBudgetAdmissionsSince(db, chatId, windowStart);
  return chatFires >= AUTOMATION_CHAT_MAX_FIRES_PER_HOUR ? { ok: false, detail: "chat_hourly" } : OK;
}

/** Gate a rule against its cooldown + per-rule/hour + per-SCOPE/hour ceilings. Completed fires and held
 * reservations both occupy the belts. `scope` is the rule's own chat, or `null` for an owner-global rule. */
export async function checkBudget(db: Db, args: { readonly rule: RuleRow; readonly scope: ChatId | null; readonly nowMs: number }): Promise<BudgetVerdict> {
  const { rule, scope, nowMs } = args;
  if (rule.cooldownSeconds > 0 && (await hasRuleBudgetAdmissionSince(db, rule.id, nowMs - rule.cooldownSeconds * MS_PER_SECOND))) {
    return { ok: false, detail: "cooldown" };
  }
  const windowStart = nowMs - HOUR_MS;
  const ruleFires = await countRuleBudgetAdmissionsSince(db, rule.id, windowStart);
  if (ruleFires >= rule.maxFiresPerHour) {
    return { ok: false, detail: "rule_hourly" };
  }
  return checkScopeBudget(db, rule, scope, windowStart);
}
