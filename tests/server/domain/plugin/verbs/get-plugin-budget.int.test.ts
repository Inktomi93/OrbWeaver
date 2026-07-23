// verb: getPluginBudget — read the per-plugin spend envelope (PLUGIN-SPEND). Owner-scoped exactly like
// getPluginLog: a foreign/missing pluginId is a leak-free NotFound (no cross-user budget read). An absent row
// reads back as the defaulted view; the PluginView `list` rider carries the same envelope.

import { PLUGIN_BUDGET_DEFAULTS } from "@orb/contracts/plugin";
import type { PluginId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { PluginNotFoundError } from "@orb/server/domain/plugin";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeBundle, makePluginHarness, ownerPrincipalFor, seedUser } from "../_support.ts";

test("an absent budget row reads back as the defaulted view (never invented ceilings)", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const owner = await seedUser(db, { handle: "owner" });
  const installed = await h.service.install({ caller: ownerPrincipalFor(owner), bundle: makeBundle({ id: "mood" }), grant: [] });

  const budget = await h.service.getBudget({ caller: ownerPrincipalFor(owner), pluginId: installed.id });

  expect(budget).toEqual({
    maxActionsPerDay: PLUGIN_BUDGET_DEFAULTS.maxActionsPerDay,
    maxUsdPerDay: PLUGIN_BUDGET_DEFAULTS.maxUsdPerDay,
    actionsSpentToday: 0,
    usdSpentToday: 0,
    spendDay: "",
  });
});

test("getBudget reads back a set budget (born on the prior setBudget, cleared ceiling stays null)", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const owner = await seedUser(db, { handle: "owner" });
  const installed = await h.service.install({ caller: ownerPrincipalFor(owner), bundle: makeBundle({ id: "mood" }), grant: [] });

  await h.service.setBudget({ caller: ownerPrincipalFor(owner), pluginId: installed.id, maxActionsPerDay: 5, maxUsdPerDay: null });
  const budget = await h.service.getBudget({ caller: ownerPrincipalFor(owner), pluginId: installed.id });

  expect(budget.maxActionsPerDay).toBe(5);
  expect(budget.maxUsdPerDay).toBeNull();
});

test("the PluginView list rider carries the budget (an absent row = the defaulted envelope)", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const owner = await seedUser(db, { handle: "owner" });
  await h.service.install({ caller: ownerPrincipalFor(owner), bundle: makeBundle({ id: "mood" }), grant: [] });

  const [view] = await h.service.list({ caller: ownerPrincipalFor(owner) });

  expect(view?.budget.maxActionsPerDay).toBe(PLUGIN_BUDGET_DEFAULTS.maxActionsPerDay);
  expect(view?.budget.actionsSpentToday).toBe(0);
});

test("a missing/foreign plugin is a leak-free NotFound", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const owner = await seedUser(db, { handle: "owner" });

  await expect(h.service.getBudget({ caller: ownerPrincipalFor(owner), pluginId: castId<PluginId>("plugin_missing") })).rejects.toBeInstanceOf(
    PluginNotFoundError,
  );
});

test("owner B cannot read owner A's plugin budget (cross-user leak-free NotFound)", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const ownerA = await seedUser(db, { handle: "owner-a" });
  const ownerB = await seedUser(db, { handle: "owner-b" });
  const installed = await h.service.install({ caller: ownerPrincipalFor(ownerA), bundle: makeBundle({ id: "mood" }), grant: [] });

  // A's plugin id is a REAL id — B still gets NotFound (the getById ownerId gate makes it indistinguishable).
  await expect(h.service.getBudget({ caller: ownerPrincipalFor(ownerB), pluginId: installed.id })).rejects.toBeInstanceOf(PluginNotFoundError);
});
