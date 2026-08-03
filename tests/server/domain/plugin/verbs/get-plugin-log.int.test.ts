// verb: getPluginLog — the host.log ring for an owned plugin (03 §3). Owner-scoped; a plugin with no resident
// instance (disabled) has no ring → empty. The non-empty ring read is exercised in the round-trip (a logging
// main.js through the real Sandbox port).

import type { Handle, PluginId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { PluginNotFoundError } from "@orb/server/domain/plugin";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeBundle, makePluginHarness, ownerPrincipalFor, seedUser } from "../_support.ts";

test("a disabled plugin (no resident instance) has an empty log", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const installed = await h.service.install({ caller: ownerPrincipalFor(owner), bundle: makeBundle({ id: "mood" }), grant: [] });
  expect(await h.service.getLog({ caller: ownerPrincipalFor(owner), pluginId: installed.id })).toEqual([]);
});

test("a missing/foreign plugin is a leak-free NotFound", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  await expect(h.service.getLog({ caller: ownerPrincipalFor(owner), pluginId: castId<PluginId>("plugin_missing") })).rejects.toBeInstanceOf(
    PluginNotFoundError,
  );
});
