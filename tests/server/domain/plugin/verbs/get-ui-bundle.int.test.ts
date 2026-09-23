// verb: getUiBundle — the SOURCE of a plugin's Tier-C client guest (U4, seam 8). The
// browser worker `evalCode`s whatever this returns, so the questions worth asking are all about WHO gets bytes
// and WHERE they came from:
//
//  1. THE ROUND TRIP IS REAL — the source comes back out of the STORED zip, re-parsed through the ONE unzip
//     funnel, not from anything cached at install time. That is what keeps a single trust edge: nobody can
//     receive `ui.js` bytes that did not just pass the entry allow-list, the size caps and the manifest
//     biconditional.
//  2. ABSENCE IS NORMAL — a Tier-S plugin answers `null`, not an error. Every plugin shipped before U4 is in
//     that class, so treating it as a failure would make the route noisy for the majority case.
//  3. OWNER SCOPE — a foreign REAL pluginId is a leak-free NOT_FOUND. Plugin source is a user's own uploaded
//     file; some are private, and "not yours" must be indistinguishable from "does not exist".
//
// DELIBERATELY NOT ASSERTED HERE: an `enabled` gate. There isn't one, and its absence is a decision (see the
// verb's header) — this verb returns inert text the client can only run inside its own sandbox, and gating it
// on status would break the one legitimate read of a disabled plugin's UI: someone looking at why it broke.

import type { Handle, PluginId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { PluginNotFoundError } from "@orb/server/domain/plugin";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeBundle, makePluginHarness, ownerPrincipalFor, seedUser } from "../_support.ts";

const UI_SOURCE = "orb.ui(1).render('panel', { kind: 'text', value: 'hi' });";

describe("getUiBundle", () => {
  test("returns the ui.js source, re-parsed out of the STORED bundle", async () => {
    const db = await freshDb();
    const h = makePluginHarness(db);
    const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));
    const installed = await h.service.install({
      caller,
      bundle: makeBundle({ id: "scripted", capabilities: ["ui.surface"], uiEntry: true }, "orb.host(1);", UI_SOURCE),
      grant: [],
    });

    expect(await h.service.getUiBundle({ caller, pluginId: installed.id })).toBe(UI_SOURCE);
  });

  test("a plugin with NO client half answers null — an absence, not an error", async () => {
    const db = await freshDb();
    const h = makePluginHarness(db);
    const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));
    const installed = await h.service.install({ caller, bundle: makeBundle({ id: "tier-s" }), grant: [] });

    expect(await h.service.getUiBundle({ caller, pluginId: installed.id })).toBeNull();
  });

  test("a missing/foreign plugin is a leak-free NotFound — plugin source is never readable across tenants", async () => {
    const db = await freshDb();
    const h = makePluginHarness(db);
    const alpha = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("alpha") }));
    const beta = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("beta") }));
    const alphaPlugin = await h.service.install({
      caller: alpha,
      bundle: makeBundle({ id: "scripted", capabilities: ["ui.surface"], uiEntry: true }, "orb.host(1);", UI_SOURCE),
      grant: [],
    });

    // Beta holding alpha's REAL pluginId reads absent → NotFound, never alpha's source.
    await expect(h.service.getUiBundle({ caller: beta, pluginId: alphaPlugin.id })).rejects.toBeInstanceOf(PluginNotFoundError);
    await expect(h.service.getUiBundle({ caller: alpha, pluginId: castId<PluginId>("plugin_missing") })).rejects.toBeInstanceOf(PluginNotFoundError);
  });
});
