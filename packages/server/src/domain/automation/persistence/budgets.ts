// domain/automation/persistence/budgets — the `automation_budgets` upsert/read (host-editable per-chat
// fire-RATE ceiling — the loop-safety belt). ONE row per chat; born on the first `setBudgets`. An absent row
// is dispatched as the defaulted cap. (The per-day $/spend-action ceilings + the day accumulator were
// stripped for enterprise spend enforcement; cost visibility + rate caps stay.)

import type { BudgetView } from "@orb/contracts/automation";
import { AUTOMATION_CHAT_BUDGET_DEFAULTS } from "@orb/contracts/automation";
import type { Db } from "@orb/db";
import { automationBudgets } from "@orb/db";
import type { ChatId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";

const LIMIT_ONE = 1;

type BudgetRow = typeof automationBudgets.$inferSelect;

/** The host-editable rate-cap patch. An absent field keeps the current value / DB default. */
interface BudgetPatch {
  readonly maxFiresPerHour?: number | undefined;
}

export async function selectBudget(db: Db, chatId: ChatId): Promise<BudgetRow | undefined> {
  const rows = await db.select().from(automationBudgets).where(eq(automationBudgets.chatId, chatId)).limit(LIMIT_ONE);
  return rows[0];
}

/** Project a chat's budget row onto the panel view (`getBudgets`). An ABSENT row is dispatched as the
 *  defaulted cap (the rate gate reads the DB default for a missing row), so it projects to that SAME default. */
export async function selectBudgetView(db: Db, chatId: ChatId): Promise<BudgetView> {
  const row = await selectBudget(db, chatId);
  if (row === undefined) {
    return { ...AUTOMATION_CHAT_BUDGET_DEFAULTS };
  }
  return { maxFiresPerHour: row.maxFiresPerHour };
}

/** Upsert the rate-cap column for a chat. On first set the row is born with the patch over DB defaults; on
 *  a re-set only the provided column changes. */
export async function upsertBudget(db: Db, chatId: ChatId, patch: BudgetPatch, now: number): Promise<void> {
  const set: Partial<Pick<BudgetRow, "maxFiresPerHour">> & { updatedAt: number } = { updatedAt: now };
  if (patch.maxFiresPerHour !== undefined) {
    set.maxFiresPerHour = patch.maxFiresPerHour;
  }
  await db
    .insert(automationBudgets)
    .values({ chatId, ...set })
    .onConflictDoUpdate({ target: automationBudgets.chatId, set });
}
