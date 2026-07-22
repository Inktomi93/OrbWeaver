// domain/automation/engine/spend-gate — the SPEND budget layer (03 §3), the axis owner-consent does not
// cover. Distinct from the per-hour `budget-gate` (that runs in the dispatch gate chain, off the fire log):
// the spend gates need the OP's returned cost, so they sit inside the arm — checked BEFORE the op call
// (`checkSpend`), accumulated AFTER (`accumulateSpend`). Two ceilings, both on the host-editable
// `automation_budgets` row: `max_spend_actions_per_day` (a COUNT, sourced from the fire log — the one count
// home) and `max_usd_per_day` (the $ accumulator, `usd_spent_today`, UTC-day-reset from the injected clock;
// NULL = no dollar ceiling, local-only setups). A refusal is NOT an error — the dispatch records
// `budget_refused` and the rule stays healthy.

import { AUTOMATION_CHAT_BUDGET_DEFAULTS } from "@orb/contracts/automation";
import type { Db } from "@orb/db";
import type { ChatId } from "@orb/kit/ids";
import type { SpendAccumulator } from "../contract/ops";
import { bumpSpendRow, selectBudget } from "../persistence/budgets";
import { countSpendActionsSince } from "../persistence/fires";

const MS_PER_DAY = 86_400_000;
const ISO_DAY_LENGTH = 10; // "yyyy-mm-dd"

/** The UTC calendar day (`yyyy-mm-dd`) of an epoch — the `spend_day` rollover key. */
function utcDayString(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, ISO_DAY_LENGTH);
}

/** The UTC midnight (epoch ms) at or before `nowMs` — the fire-log day-window floor for the action count. */
function utcDayStartMs(nowMs: number): number {
  return Math.floor(nowMs / MS_PER_DAY) * MS_PER_DAY;
}

/** The spend gate's verdict — `ok` to proceed, else the `detail` the `budget_refused` fire row carries.
 *  Local (callers read `.ok`/`.detail` structurally) — not a cross-file type home concern. */
type SpendVerdict = { readonly ok: true } | { readonly ok: false; readonly detail: string };

const SPEND_OK: SpendVerdict = { ok: true };

/** A fresh per-rule spend accumulator (the DispatchFrame's `spend`) — reserves spend actions + USD across a
 *  rule's arms so a second spend arm gates against the first, before the row is persisted at rule end. */
export function createSpendAccumulator(): SpendAccumulator {
  let actions = 0;
  let usd = 0;
  return {
    actions: () => actions,
    usd: () => usd,
    add: (costUsd: number): void => {
      actions += 1;
      usd += costUsd;
    },
  };
}

/** Gate a spend arm BEFORE its op (03 §3): refuse when the day's spend-action COUNT (persisted fires + the
 *  in-flight reservations) has hit the per-day ceiling, or when `usd_spent_today` (rolled for the UTC day) +
 *  the in-flight USD has hit the $ ceiling (`null` ⇒ no dollar ceiling). The image's own cost is unknown
 *  until the op returns, so the $ check is "already at/over the ceiling" — the belt is the accumulation. */
export async function checkSpend(
  db: Db,
  args: { readonly chatId: ChatId; readonly nowMs: number; readonly reservedActions: number; readonly reservedUsd: number },
): Promise<SpendVerdict> {
  const { chatId, nowMs, reservedActions, reservedUsd } = args;
  const budget = await selectBudget(db, chatId);
  const maxActions = budget?.maxSpendActionsPerDay ?? AUTOMATION_CHAT_BUDGET_DEFAULTS.maxSpendActionsPerDay;
  const maxUsd = budget === undefined ? AUTOMATION_CHAT_BUDGET_DEFAULTS.maxUsdPerDay : budget.maxUsdPerDay;
  const today = utcDayString(nowMs);
  const usdBase = budget !== undefined && budget.spendDay === today ? budget.usdSpentToday : 0;

  const priorActions = await countSpendActionsSince(db, chatId, utcDayStartMs(nowMs));
  if (priorActions + reservedActions >= maxActions) {
    return { ok: false, detail: "spend_actions_daily" };
  }
  if (maxUsd !== null && usdBase + reservedUsd >= maxUsd) {
    return { ok: false, detail: "usd_daily" };
  }
  return SPEND_OK;
}

/** Persist a rule's day spend after its arms (03 §3): accumulate `usd` onto `usd_spent_today`, rolling the
 *  accumulator to 0 first when the stored `spend_day` predates today (the injected-clock UTC reset). */
export async function accumulateSpend(db: Db, chatId: ChatId, nowMs: number, usd: number): Promise<void> {
  const today = utcDayString(nowMs);
  const budget = await selectBudget(db, chatId);
  const base = budget !== undefined && budget.spendDay === today ? budget.usdSpentToday : 0;
  await bumpSpendRow(db, chatId, { usdSpentToday: base + usd, spendDay: today, at: nowMs });
}
