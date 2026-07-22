// domain/plugin/persistence/budgets — the `plugin_budgets` upsert/read (owner-editable per-plugin ceilings —
// PLUGIN-SPEND, the automation persistence/budgets pattern re-keyed rule→plugin). ONE row per plugin, keyed
// `pluginId`; born on the first `setPluginBudget` OR the first spend. Owner-scoped TRANSITIVELY through
// `plugins.ownerId` — the owner gate lives at the VERB (getById filters ownerId before this runs), so these
// queries are pluginId-keyed only (persistence trusts the verb's admission — the injected-op-caller-gate rule).
//
// THE SPLIT (kept exactly as automation): the OWNER edits ceilings (`upsertBudget`, a ceiling-only patch); the
// spend GATE writes the accumulator (`bumpSpendRow` — usd += , actions += 1, spendDay). Neither touches the
// other's columns. `maxActionsPerDay`/`maxUsdPerDay: null` clears that ceiling; an absent patch field keeps
// the current value / DB default.

import type { PluginBudgetView } from "@orb/contracts/plugin";
import { PLUGIN_BUDGET_DEFAULTS } from "@orb/contracts/plugin";
import type { Db } from "@orb/db";
import { pluginBudgets } from "@orb/db";
import type { PluginId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";

const LIMIT_ONE = 1;

type BudgetRow = typeof pluginBudgets.$inferSelect;

/** The owner-editable ceiling patch — only the columns `setPluginBudget` owns (never the spend accumulator). An
 *  absent field keeps the current value / DB default; a `null` clears that ceiling (no cap). */
interface BudgetPatch {
  readonly maxActionsPerDay?: number | null | undefined;
  readonly maxUsdPerDay?: number | null | undefined;
}

export async function selectBudget(db: Db, pluginId: PluginId): Promise<BudgetRow | undefined> {
  const rows = await db.select().from(pluginBudgets).where(eq(pluginBudgets.pluginId, pluginId)).limit(LIMIT_ONE);
  return rows[0];
}

/** Project a plugin's budget row onto the panel view (`getPluginBudget` / the `plugin.list` rider). An ABSENT
 *  row projects to `PLUGIN_BUDGET_DEFAULTS` (caps) over a zero/empty accumulator — the HONEST view of exactly
 *  what the spend gate stamps on insert (the gate reads the same defaults for a missing row). */
export async function selectBudgetView(db: Db, pluginId: PluginId): Promise<PluginBudgetView> {
  const row = await selectBudget(db, pluginId);
  if (row === undefined) {
    return { ...PLUGIN_BUDGET_DEFAULTS, actionsSpentToday: 0, usdSpentToday: 0, spendDay: "" };
  }
  return {
    maxActionsPerDay: row.maxActionsPerDay,
    maxUsdPerDay: row.maxUsdPerDay,
    actionsSpentToday: row.actionsSpentToday,
    usdSpentToday: row.usdSpentToday,
    spendDay: row.spendDay,
  };
}

/** Upsert the ceiling columns for a plugin. On first set the row is born with the patch over DB defaults; on a
 *  re-set only the provided ceiling columns change (the accumulator columns are untouched). */
export async function upsertBudget(db: Db, pluginId: PluginId, patch: BudgetPatch, now: number): Promise<void> {
  const set: Partial<Pick<BudgetRow, "maxActionsPerDay" | "maxUsdPerDay">> & { updatedAt: number } = { updatedAt: now };
  if (patch.maxActionsPerDay !== undefined) {
    set.maxActionsPerDay = patch.maxActionsPerDay;
  }
  if (patch.maxUsdPerDay !== undefined) {
    set.maxUsdPerDay = patch.maxUsdPerDay;
  }
  await db
    .insert(pluginBudgets)
    .values({ pluginId, ...set })
    .onConflictDoUpdate({ target: pluginBudgets.pluginId, set });
}

/** Write the day's spend ACCUMULATOR columns (`actions_spent_today`/`usd_spent_today`/`spend_day`) — the spend
 *  gate's post-op write. Born with the ceiling DB defaults when no `setPluginBudget` ran; on a re-write only the
 *  accumulator columns move (the owner ceilings are untouched). Kept separate from `upsertBudget` (the owner
 *  never edits the accumulator; the gate never edits ceilings). */
export async function bumpSpendRow(
  db: Db,
  pluginId: PluginId,
  next: { readonly actionsSpentToday: number; readonly usdSpentToday: number; readonly spendDay: string; readonly at: number },
): Promise<void> {
  const set = { actionsSpentToday: next.actionsSpentToday, usdSpentToday: next.usdSpentToday, spendDay: next.spendDay, updatedAt: next.at };
  await db
    .insert(pluginBudgets)
    .values({ pluginId, ...set })
    .onConflictDoUpdate({ target: pluginBudgets.pluginId, set });
}
