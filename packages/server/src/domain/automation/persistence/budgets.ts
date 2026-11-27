// domain/automation/persistence/budgets — the `automation_owner_budgets` upsert/read (C5: the owner-editable
// fire-RATE ceiling every chat-less rule of that owner counts against — the loop-safety belt). ONE row per
// owner; born on the first `setOwnerBudgets`. An absent row is dispatched as the defaulted cap. The per-chat
// belt has no table: it is the fixed `AUTOMATION_CHAT_MAX_FIRES_PER_HOUR`. (The per-day
// $/spend-action ceilings were stripped for enterprise spend enforcement; cost visibility + rate caps stay.)

import type { OwnerBudgetView } from "@orb/contracts/automation";
import { AUTOMATION_OWNER_BUDGET_DEFAULTS } from "@orb/contracts/automation";
import type { Db } from "@orb/db";
import { automationOwnerBudgets } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";

const LIMIT_ONE = 1;

type OwnerBudgetRow = typeof automationOwnerBudgets.$inferSelect;

export async function selectOwnerBudget(db: Db, ownerId: UserId): Promise<OwnerBudgetRow | undefined> {
  const rows = await db.select().from(automationOwnerBudgets).where(eq(automationOwnerBudgets.ownerId, ownerId)).limit(LIMIT_ONE);
  return rows[0];
}

/** Project an owner's budget row onto the pane view (`getOwnerBudgets`). An ABSENT row is dispatched as the
 *  defaulted cap (the rate gate reads the DB default for a missing row), so it projects to that SAME default. */
export async function selectOwnerBudgetView(db: Db, ownerId: UserId): Promise<OwnerBudgetView> {
  const row = await selectOwnerBudget(db, ownerId);
  if (row === undefined) {
    return { ...AUTOMATION_OWNER_BUDGET_DEFAULTS };
  }
  return { maxFiresPerHour: row.maxFiresPerHour };
}

/** Upsert the owner-global rate-cap column. The row is born on the first set (over the DB default when no cap is
 *  given); a re-set replaces the cap, and an absent cap leaves the current one. */
export async function upsertOwnerBudget(db: Db, ownerId: UserId, maxFiresPerHour: number | undefined): Promise<void> {
  const insert = db.insert(automationOwnerBudgets).values(maxFiresPerHour === undefined ? { ownerId } : { ownerId, maxFiresPerHour });
  await (maxFiresPerHour === undefined
    ? insert.onConflictDoNothing()
    : insert.onConflictDoUpdate({ target: automationOwnerBudgets.ownerId, set: { maxFiresPerHour } }));
}
