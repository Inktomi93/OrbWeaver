// @orb/contracts/plugin/budget — the PER-PLUGIN spend envelope (PLUGIN-SPEND, the automation §3 spend-ceiling
// pattern re-keyed rule→plugin). One `plugin_budgets` row per plugin, keyed `pluginId`, owner-scoped
// transitively through `plugins.ownerId` (no denormalized owner column). The ONE app-side home for the
// defaults: the `@orb/db` `plugin_budgets` DDL mirrors these SAME values as column defaults (the automation
// AUTOMATION_CHAT_BUDGET_DEFAULTS / GLOBAL_VARIABLE-cap precedent — the app-validation bound and the SQL
// bound can never drift), and the domain spend gate imports THIS const for the missing-row default.
//
// TWO CEILINGS — both load-bearing (the plan-for-small-hardware doctrine: honest arms for BOTH the hosted and
// the local operator):
//   • `maxUsdPerDay` (nullable = no dollar ceiling) is the HOSTED belt — bounds a plugin that fires metered
//     hosted turns/images. `null` = local-only setups the host cleared it for.
//   • `maxActionsPerDay` (nullable = no cap, but shipped NON-NULL by default) is the LOCAL-HARDWARE belt — a
//     plugin on a local backend pays $0/turn, so a USD-only ceiling can NEVER bound a runaway plugin firing
//     free local turns. The action COUNT is the only belt that bounds the $0-turn case. Automation sources
//     its count from the fire log; PLUGINS HAVE NO FIRE LOG, so the count lives ON the budget row
//     (`actionsSpentToday`), bumped by the spend accumulator alongside `usdSpentToday`, both reset on the
//     UTC-day rollover (`spendDay`).

/** The per-plugin budget ceilings' defaults — the values the spend accumulator stamps on a fresh
 *  `plugin_budgets` row (mirrored by the `plugin_budgets` DDL column defaults). `maxActionsPerDay` ships a sane
 *  NON-NULL default (the local-hardware belt — a $0-turn plugin is bounded by the action count regardless of
 *  its dollar cost); `maxUsdPerDay` is the born value (the automation precedent), a host may later clear it to
 *  `null` (no dollar ceiling — local-only setups). */
export const PLUGIN_BUDGET_DEFAULTS = {
  maxActionsPerDay: 50,
  maxUsdPerDay: 1,
} as const;

/** The plugin budget-panel read model (`getPluginBudget` / the `plugin.list` rider) — the host-editable
 *  ceilings + the day spend accumulator. An absent row projects to `PLUGIN_BUDGET_DEFAULTS` (caps) + a
 *  zero/empty accumulator. Each ceiling is `null` when the owner cleared it; `spendDay` is the accumulator's
 *  UTC `yyyy-mm-dd` (`""` = never spent, so `actionsSpentToday`/`usdSpentToday` are stale unless `spendDay`
 *  is today). */
export interface PluginBudgetView {
  readonly maxActionsPerDay: number | null;
  readonly maxUsdPerDay: number | null;
  readonly actionsSpentToday: number;
  readonly usdSpentToday: number;
  readonly spendDay: string;
}
