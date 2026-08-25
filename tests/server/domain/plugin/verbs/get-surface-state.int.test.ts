// verb: getSurfaceState — one owned surface's published state (plugin-ui-plane #679 U1). Owner-scoped
// (leak-free NOT_FOUND for a plugin the caller does not own); reads the in-memory surface-state plane the
// compose `ui.setState` op writes. `null` when nothing has been published for that surface.

import type { Handle, PluginId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { PluginNotFoundError } from "@orb/server/domain/plugin";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeBundle, makePluginHarness, ownerPrincipalFor, seedUser } from "../_support.ts";

test("returns the surface's published state for an owned plugin", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const caller = ownerPrincipalFor(owner);
  const installed = await h.service.install({ caller, bundle: makeBundle({ id: "mood" }), grant: [] });
  // The state plane is written by `ui.setState` at compose; here we seed the SAME store the verb reads.
  h.ctx.surfaceState.set(installed.id, "panel", { affinity: 7, mood: "warm" });

  expect(await h.service.getSurfaceState({ caller, pluginId: installed.id, surfaceId: "panel" })).toEqual({ affinity: 7, mood: "warm" });
});

test("returns null when nothing has been published for that surface", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const caller = ownerPrincipalFor(owner);
  const installed = await h.service.install({ caller, bundle: makeBundle({ id: "mood" }), grant: [] });
  expect(await h.service.getSurfaceState({ caller, pluginId: installed.id, surfaceId: "panel" })).toBeNull();
});

test("a missing/foreign plugin is a leak-free NotFound (never a cross-tenant state read)", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const alpha = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("alpha") }));
  const beta = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("beta") }));
  const alphaPlugin = await h.service.install({ caller: alpha, bundle: makeBundle({ id: "mood" }), grant: [] });
  h.ctx.surfaceState.set(alphaPlugin.id, "panel", { secret: "alpha" });

  // Beta holding alpha's REAL pluginId reads absent → NotFound, never alpha's state.
  await expect(h.service.getSurfaceState({ caller: beta, pluginId: alphaPlugin.id, surfaceId: "panel" })).rejects.toBeInstanceOf(PluginNotFoundError);
  await expect(h.service.getSurfaceState({ caller: alpha, pluginId: castId<PluginId>("plugin_missing"), surfaceId: "panel" })).rejects.toBeInstanceOf(
    PluginNotFoundError,
  );
});
