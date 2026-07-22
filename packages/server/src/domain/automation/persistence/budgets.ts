// domain/automation/persistence/budgets — the `automation_budgets` upsert/read (host-editable per-chat
// ceilings — 03 §3). ONE row per chat; born on the first `setBudgets`. The spend accumulator columns
// (`usd_spent_today`/`spend_day`) are the dispatch engine's (A5) — never touched here (they keep their
// insert defaults). Absent patch fields keep their current value / DB default; `maxUsdPerDay: null` clears
// the dollar ceiling.

import type { BudgetView } from "@orb/contracts/automation";
import { AUTOMATION_CHAT_BUDGET_DEFAULTS } from "@orb/contracts/automation";
import type { Db } from "@orb/db";
import { automationBudgets } from "@orb/db";
import type { ChatId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";

const LIMIT_ONE = 1;

type BudgetRow = typeof automationBudgets.$inferSelect;

/** The host-editable ceiling patch — only the columns `setBudgets` owns (never the spend accumulator). An
 *  absent field keeps the current value / DB default; `maxUsdPerDay: null` clears the dollar ceiling. */
interface BudgetPatch {
  readonly maxFiresPerHour?: number | undefined;
  readonly maxSpendActionsPerDay?: number | undefined;
  readonly maxUsdPerDay?: number | null | undefined;
}

export async function selectBudget(db: Db, chatId: ChatId): Promise<BudgetRow | undefined> {
  const rows = await db.select().from(automationBudgets).where(eq(automationBudgets.chatId, chatId)).limit(LIMIT_ONE);
  return rows[0];
}

/** Project a chat's budget row onto the panel view (`getBudgets`). An ABSENT row is dispatched as the
 *  defaulted budget (the gates read the DB defaults for a missing row), so it projects to those SAME defaults
 *  over a zero/empty accumulator — the honest view of exactly what the write path stamps on insert. */
export async function selectBudgetView(db: Db, chatId: ChatId): Promise<BudgetView> {
  const row = await selectBudget(db, chatId);
  if (row === undefined) {
    return { ...AUTOMATION_CHAT_BUDGET_DEFAULTS, usdSpentToday: 0, spendDay: "" };
  }
  return {
    maxFiresPerHour: row.maxFiresPerHour,
    maxSpendActionsPerDay: row.maxSpendActionsPerDay,
    maxUsdPerDay: row.maxUsdPerDay,
    usdSpentToday: row.usdSpentToday,
    spendDay: row.spendDay,
  };
}

/** Upsert the ceiling columns for a chat. On first set the row is born with the patch over DB defaults; on
 *  a re-set only the provided columns change (the accumulator columns are untouched). */
export async function upsertBudget(db: Db, chatId: ChatId, patch: BudgetPatch, now: number): Promise<void> {
  const set: Partial<Pick<BudgetRow, "maxFiresPerHour" | "maxSpendActionsPerDay" | "maxUsdPerDay">> & { updatedAt: number } = { updatedAt: now };
  if (patch.maxFiresPerHour !== undefined) {
    set.maxFiresPerHour = patch.maxFiresPerHour;
  }
  if (patch.maxSpendActionsPerDay !== undefined) {
    set.maxSpendActionsPerDay = patch.maxSpendActionsPerDay;
  }
  if (patch.maxUsdPerDay !== undefined) {
    set.maxUsdPerDay = patch.maxUsdPerDay;
  }
  await db
    .insert(automationBudgets)
    .values({ chatId, ...set })
    .onConflictDoUpdate({ target: automationBudgets.chatId, set });
}

/** Write the day's spend ACCUMULATOR columns (`usd_spent_today`/`spend_day`) — the SPEND arms' post-op write
 *  (03 §3; the engine orchestrates the rollover, this is the raw upsert). Born with the ceiling DB defaults
 *  when no `setBudgets` ran; on a re-write only the accumulator columns move (the host ceilings are untouched).
 *  Kept separate from `upsertBudget` (the host never edits the accumulator; the engine never edits ceilings). */
export async function bumpSpendRow(
  db: Db,
  chatId: ChatId,
  next: { readonly usdSpentToday: number; readonly spendDay: string; readonly at: number },
): Promise<void> {
  const set = { usdSpentToday: next.usdSpentToday, spendDay: next.spendDay, updatedAt: next.at };
  await db
    .insert(automationBudgets)
    .values({ chatId, ...set })
    .onConflictDoUpdate({ target: automationBudgets.chatId, set });
}
