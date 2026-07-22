// domain/plugin/substrate/spend-gate — the PER-PLUGIN spend layer (PLUGIN-SPEND; the automation engine/spend-gate
// pattern re-keyed rule→plugin). The two spendy plugin ops (chat.requestTurn, imagery.generatePicture) both
// return a metered `costUsd`, so the gate sits at the bridge wrap: checked BEFORE the op (`checkSpend`),
// accumulated AFTER (`accumulateSpend`). A refusal is a TYPED throw the membrane contains as guest errors-as-data
// (attachAsync's reject arm) — never a host crash.
//
// TWO CEILINGS, both on the owner-editable `plugin_budgets` row, both checked against the ROW (NOT a fire log —
// plugins have none, so the day's action COUNT lives on `actions_spent_today`):
//   • `max_actions_per_day` — the LOCAL-HARDWARE belt. A plugin on a local backend pays $0/turn, so a USD-only
//     ceiling can NEVER bound a runaway plugin firing free local turns. The action count is the only belt for
//     the $0-turn case (`accumulateSpend` bumps it by 1 EVERY op regardless of cost). NULL = no count ceiling.
//   • `max_usd_per_day` — the HOSTED belt (`usd_spent_today`, UTC-day-reset from the injected clock). NULL = no
//     dollar ceiling (local-only setups).
//
// RACE-SAFETY (the intra-invocation TOCTOU belt — NOT the port FIFO): a check-then-accumulate against the
// persisted row is atomic per instance ONLY because the bridge runs the whole check→op→accumulate section under
// the per-instance `spend.runExclusive` serializer (a tail-promise; see contract/ops.ts + activate.ts). The port
// FIFO does NOT make this safe — it serializes distinct `invoke()`s (cross-invocation), but a SINGLE guest handler
// can fire up to HOST_CALLS_IN_FLIGHT_MAX (32) CONCURRENT host-fn calls, so without the per-instance serializer
// all 32 checks would read the same `actionsBase` before any accumulate persisted and the action ceiling would
// overshoot by up to 31. `runExclusive` queues the spendy sections so op #2's check reads the row AFTER op #1's
// accumulate persisted. NO in-flight reservation accumulator is needed (unlike automation's per-rule
// createSpendAccumulator) — the serializer is the belt. Different plugins have different budget rows (keyed
// pluginId), so cross-plugin concurrency never contends.
//
// AUTHORITY-BLIND stake: this gate is DOMAIN-side (driven from the bridge wrap). infra/plugin-host never sees a
// budget, a pluginId, or a Principal — the membrane stays authority-blind (it only ever receives an
// already-admitted ChatId). The gate is injected into the bridge, never reached from infra.

import { PLUGIN_BUDGET_DEFAULTS } from "@orb/contracts/plugin";
import type { Db } from "@orb/db";
import type { PluginId } from "@orb/kit/ids";
import { bumpSpendRow, selectBudget } from "../persistence/budgets";

const ISO_DAY_LENGTH = 10; // "yyyy-mm-dd"

/** The UTC calendar day (`yyyy-mm-dd`) of an epoch — the `spend_day` rollover key. */
function utcDayString(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, ISO_DAY_LENGTH);
}

/** The spend gate's verdict — `ok` to proceed, else the `detail` the typed refusal carries. Local + NOT exported
 *  (the automation spend-gate precedent): callers read `.ok`/`.detail` structurally, and `PluginSpendGate.check`
 *  re-declares the shape inline in its own type home — so this is not a cross-file type home concern. */
type SpendVerdict = { readonly ok: true } | { readonly ok: false; readonly detail: string };

const SPEND_OK: SpendVerdict = { ok: true };

/** Gate a spendy plugin op BEFORE its call: refuse when the day's action COUNT (rolled for the UTC day) has hit
 *  the count ceiling, or when `usd_spent_today` (rolled) has hit the $ ceiling (`null` ⇒ that ceiling is off).
 *  The op's own cost is unknown until it returns, so the $ check is "already at/over the ceiling" — the belt is
 *  the after-op accumulation. The action count belt fires the SAME way and is the ONLY belt that bounds a $0
 *  local turn (see header). An ABSENT row is the defaulted budget over a zero accumulator (0 is below any cap). */
export async function checkSpend(db: Db, args: { readonly pluginId: PluginId; readonly nowMs: number }): Promise<SpendVerdict> {
  const { pluginId, nowMs } = args;
  const budget = await selectBudget(db, pluginId);
  const maxActions = budget === undefined ? PLUGIN_BUDGET_DEFAULTS.maxActionsPerDay : budget.maxActionsPerDay;
  const maxUsd = budget === undefined ? PLUGIN_BUDGET_DEFAULTS.maxUsdPerDay : budget.maxUsdPerDay;
  const today = utcDayString(nowMs);
  // A stale accumulator (spend_day predates today) reads as 0 for today — the rollover happens on the next write.
  const rolledToday = budget !== undefined && budget.spendDay === today;
  const actionsBase = rolledToday ? budget.actionsSpentToday : 0;
  const usdBase = rolledToday ? budget.usdSpentToday : 0;

  if (maxActions !== null && actionsBase >= maxActions) {
    return { ok: false, detail: "actions_daily" };
  }
  if (maxUsd !== null && usdBase >= maxUsd) {
    return { ok: false, detail: "usd_daily" };
  }
  return SPEND_OK;
}

/** Persist a plugin's day spend after a spendy op: accumulate `usd` onto `usd_spent_today` AND +1 onto
 *  `actions_spent_today` (the action count bumps EVERY op regardless of $ — the $0-local-turn belt), rolling
 *  BOTH accumulators to 0 first when the stored `spend_day` predates today (the injected-clock UTC reset). */
export async function accumulateSpend(db: Db, pluginId: PluginId, nowMs: number, usd: number): Promise<void> {
  const today = utcDayString(nowMs);
  const budget = await selectBudget(db, pluginId);
  const rolledToday = budget !== undefined && budget.spendDay === today;
  const actionsBase = rolledToday ? budget.actionsSpentToday : 0;
  const usdBase = rolledToday ? budget.usdSpentToday : 0;
  await bumpSpendRow(db, pluginId, { actionsSpentToday: actionsBase + 1, usdSpentToday: usdBase + usd, spendDay: today, at: nowMs });
}
