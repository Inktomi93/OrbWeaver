// Persistence: plugin_budgets upsert/read (PLUGIN-SPEND). A first set is born over DB defaults; a re-set touches
// only the provided ceiling columns and never the spend accumulator (the host-edits-ceilings /
// gate-writes-accumulators split). The row is keyed pluginId (FK plugins.id) — a plugin row must exist first.

import { selectBudget, selectBudgetView, upsertBudget } from "../../../../../packages/server/src/domain/plugin/persistence/budgets.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeBundle, makePluginHarness, ownerPrincipalFor, seedUser } from "../_support.ts";

const NOW_MS = Date.UTC(2026, 6, 20, 12, 0, 0);

test("upsertBudget is born on first set and patches only provided ceilings on re-set", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const owner = await seedUser(db, { handle: "owner" });
  const installed = await h.service.install({ caller: ownerPrincipalFor(owner), bundle: makeBundle({ id: "spend" }), grant: [] });

  await upsertBudget(db, installed.id, { maxActionsPerDay: 7, maxUsdPerDay: null }, NOW_MS);
  const first = await selectBudget(db, installed.id);
  expect(first?.maxActionsPerDay).toBe(7);
  expect(first?.maxUsdPerDay).toBeNull();

  // A re-set of a different ceiling leaves maxActionsPerDay untouched and never resets the accumulator.
  await upsertBudget(db, installed.id, { maxUsdPerDay: 2 }, NOW_MS);
  const second = await selectBudget(db, installed.id);
  expect(second?.maxActionsPerDay).toBe(7);
  expect(second?.maxUsdPerDay).toBe(2);
  expect(second?.actionsSpentToday).toBe(0);
  expect(second?.usdSpentToday).toBe(0);
});

test("selectBudgetView projects an absent row to the defaulted envelope over a zero accumulator", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const owner = await seedUser(db, { handle: "owner" });
  const installed = await h.service.install({ caller: ownerPrincipalFor(owner), bundle: makeBundle({ id: "spend" }), grant: [] });

  const view = await selectBudgetView(db, installed.id);
  expect(view).toEqual({ maxActionsPerDay: 50, maxUsdPerDay: 1, actionsSpentToday: 0, usdSpentToday: 0, spendDay: "" });
});
