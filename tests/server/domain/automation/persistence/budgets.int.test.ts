// Persistence: automation_budgets upsert/read. A first set is born over DB defaults; a re-set touches only
// the provided columns and never the spend accumulator.

import { describe } from "vitest";
import { selectBudget, upsertBudget } from "../../../../../packages/server/src/domain/automation/persistence/budgets.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { FIXED_NOW_MS, seedHostChat, seedUser } from "../_support.ts";

describe("automation_budgets persistence", () => {
  test("upsertBudget is born on first set and patches only provided columns on re-set", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const chatId = await seedHostChat(db, owner);
    await upsertBudget(db, chatId, { maxFiresPerHour: 5, maxUsdPerDay: null }, FIXED_NOW_MS);
    const first = await selectBudget(db, chatId);
    expect(first?.maxFiresPerHour).toBe(5);
    expect(first?.maxUsdPerDay).toBeNull();
    // A re-set of a different column leaves maxFiresPerHour untouched and never resets usd_spent_today.
    await upsertBudget(db, chatId, { maxSpendActionsPerDay: 3 }, FIXED_NOW_MS);
    const second = await selectBudget(db, chatId);
    expect(second?.maxFiresPerHour).toBe(5);
    expect(second?.maxSpendActionsPerDay).toBe(3);
    expect(second?.usdSpentToday).toBe(0);
  });
});
