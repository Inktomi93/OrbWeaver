// verb: setPluginBudget — upsert the per-plugin spend ceilings (PLUGIN-SPEND). Owner-scoped exactly like
// getPluginLog: a foreign/missing pluginId is a leak-free NotFound (no cross-user budget write). The row is born
// on the first set; a `null` clears that ceiling. B never mutates A's budget.

import { PLUGIN_BUDGET_DEFAULTS } from "@orb/contracts/plugin";
import type { PluginId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { PluginNotFoundError } from "@orb/server/domain/plugin";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeBundle, makePluginHarness, ownerPrincipalFor, seedUser } from "../_support.ts";

test("setBudget is born on first set and clears a ceiling with null", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const owner = await seedUser(db, { handle: "owner" });
  const installed = await h.service.install({ caller: ownerPrincipalFor(owner), bundle: makeBundle({ id: "mood" }), grant: [] });

  await h.service.setBudget({ caller: ownerPrincipalFor(owner), pluginId: installed.id, maxActionsPerDay: 5, maxUsdPerDay: null });
  const budget = await h.service.getBudget({ caller: ownerPrincipalFor(owner), pluginId: installed.id });

  expect(budget.maxActionsPerDay).toBe(5);
  expect(budget.maxUsdPerDay).toBeNull();
});

test("a missing/foreign plugin is a leak-free NotFound", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const owner = await seedUser(db, { handle: "owner" });

  await expect(
    h.service.setBudget({ caller: ownerPrincipalFor(owner), pluginId: castId<PluginId>("plugin_missing"), maxActionsPerDay: 1 }),
  ).rejects.toBeInstanceOf(PluginNotFoundError);
});

test("owner B cannot edit owner A's plugin budget (cross-user leak-free NotFound; A's row untouched)", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const ownerA = await seedUser(db, { handle: "owner-a" });
  const ownerB = await seedUser(db, { handle: "owner-b" });
  const installed = await h.service.install({ caller: ownerPrincipalFor(ownerA), bundle: makeBundle({ id: "mood" }), grant: [] });

  await expect(h.service.setBudget({ caller: ownerPrincipalFor(ownerB), pluginId: installed.id, maxUsdPerDay: 99 })).rejects.toBeInstanceOf(
    PluginNotFoundError,
  );

  // A's budget is untouched by B's attempt.
  const budget = await h.service.getBudget({ caller: ownerPrincipalFor(ownerA), pluginId: installed.id });
  expect(budget.maxUsdPerDay).toBe(PLUGIN_BUDGET_DEFAULTS.maxUsdPerDay);
});
