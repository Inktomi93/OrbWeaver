// Persistence: automation_owner_budgets upsert/read (C5, the owner-global fire-RATE cap). A first set is born
// over DB defaults; a re-set patches only the provided column; an absent row projects to the default view.

import { AUTOMATION_OWNER_BUDGET_DEFAULTS } from "@orb/contracts/automation";
import { describe } from "vitest";
import { selectOwnerBudget, selectOwnerBudgetView, upsertOwnerBudget } from "../../../../../packages/server/src/domain/automation/persistence/budgets.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { FIXED_NOW_MS, seedUser } from "../_support.ts";

describe("automation_owner_budgets persistence", () => {
  test("an absent row projects to the owner default view and has no stored row", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    await expect(selectOwnerBudget(db, owner)).resolves.toBeUndefined();
    await expect(selectOwnerBudgetView(db, owner)).resolves.toEqual({ maxFiresPerHour: AUTOMATION_OWNER_BUDGET_DEFAULTS.maxFiresPerHour });
  });

  test("upsertOwnerBudget is born on first set, patches on re-set, and an absent field keeps the stored value", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    await upsertOwnerBudget(db, owner, { maxFiresPerHour: 5 }, FIXED_NOW_MS);
    expect((await selectOwnerBudget(db, owner))?.maxFiresPerHour).toBe(5);

    await upsertOwnerBudget(db, owner, { maxFiresPerHour: 9 }, FIXED_NOW_MS + 1);
    const patched = await selectOwnerBudget(db, owner);
    expect(patched?.maxFiresPerHour).toBe(9);
    expect(patched?.updatedAt).toBe(FIXED_NOW_MS + 1);

    await upsertOwnerBudget(db, owner, {}, FIXED_NOW_MS + 2);
    const kept = await selectOwnerBudget(db, owner);
    expect(kept?.maxFiresPerHour).toBe(9);
    expect(kept?.updatedAt).toBe(FIXED_NOW_MS + 2);
    await expect(selectOwnerBudgetView(db, owner)).resolves.toEqual({ maxFiresPerHour: 9 });
  });
});
