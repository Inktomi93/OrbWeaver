// Persistence: automation_budgets upsert/read (the per-chat fire-RATE cap). A first set is born over DB
// defaults; a re-set patches only the provided column.

import { describe } from "vitest";
import { selectBudget, upsertBudget } from "../../../../../packages/server/src/domain/automation/persistence/budgets.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { FIXED_NOW_MS, seedHostChat, seedUser } from "../_support.ts";

describe("automation_budgets persistence", () => {
  test("upsertBudget is born on first set and patches the fire-rate cap on re-set", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const chatId = await seedHostChat(db, owner);
    await upsertBudget(db, chatId, { maxFiresPerHour: 5 }, FIXED_NOW_MS);
    const first = await selectBudget(db, chatId);
    expect(first?.maxFiresPerHour).toBe(5);
    // A re-set updates the rate cap.
    await upsertBudget(db, chatId, { maxFiresPerHour: 9 }, FIXED_NOW_MS);
    const second = await selectBudget(db, chatId);
    expect(second?.maxFiresPerHour).toBe(9);
  });
});
