// verb: reportUiCrash — the CLIENT half of the 3-strike crash policy. The
// design claim this file has to make true is a single sentence: "a UI half that dies every mount auto-disables
// like a server half that throws." So the test that matters is not "the counter went up" — it is that THREE
// client-reported crashes reach the SAME auto-disable a throwing server handler reaches, through the same
// policy object, with the same owner notification.
//
// The other half is the honest question about a client-driven counter: what can a hostile caller do with it?
// The answer must be "only to themselves", and the owner-scope test is what makes that a property rather than
// a hope — three calls against SOMEBODY ELSE's real pluginId must disable nothing.

import type { Handle, PluginId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { PLUGIN_CRASH_DISABLE_THRESHOLD, PluginNotFoundError } from "@orb/server/domain/plugin";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeBundle, makePluginHarness, ownerPrincipalFor, seedUser } from "../_support.ts";

describe("reportUiCrash", () => {
  test("THREE client-reported crashes auto-disable the plugin — one counter for both halves", async () => {
    const db = await freshDb();
    const h = makePluginHarness(db);
    const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));
    const installed = await h.service.install({ caller, bundle: makeBundle({ id: "mood" }), grant: [] });
    await h.service.setEnabled({ caller, pluginId: installed.id, enabled: true });

    for (let i = 0; i < PLUGIN_CRASH_DISABLE_THRESHOLD; i++) {
      await h.service.reportUiCrash({ caller, pluginId: installed.id, surfaceId: "panel", reason: "wall-clock deadline" });
    }

    const [row] = await h.service.list({ caller });
    // `errored`, not merely `disabled`: the auto-disable is the SYSTEM's refusal, and the status is what tells
    // the pane's affordance apart from a person's own toggle-off.
    expect(row?.status).toBe("errored");
    // …and the reason is retained for the person who has to find out WHY (the §4.9 diagnosability posture).
    expect(row?.lastError).toContain("panel");
    expect(row?.lastError).toContain("wall-clock deadline");
  });

  test("fewer than three does NOT disable — a flaky mount is not a broken plugin", async () => {
    const db = await freshDb();
    const h = makePluginHarness(db);
    const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));
    const installed = await h.service.install({ caller, bundle: makeBundle({ id: "mood" }), grant: [] });
    await h.service.setEnabled({ caller, pluginId: installed.id, enabled: true });

    for (let i = 0; i < PLUGIN_CRASH_DISABLE_THRESHOLD - 1; i++) {
      await h.service.reportUiCrash({ caller, pluginId: installed.id, surfaceId: "panel", reason: "invalid tree" });
    }
    const [row] = await h.service.list({ caller });
    expect(row?.status).toBe("enabled");
  });

  test("a foreign REAL pluginId is a leak-free NotFound — nobody can three-strike someone else's plugin", async () => {
    const db = await freshDb();
    const h = makePluginHarness(db);
    const alpha = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("alpha") }));
    const beta = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("beta") }));
    const alphaPlugin = await h.service.install({ caller: alpha, bundle: makeBundle({ id: "mood" }), grant: [] });
    await h.service.setEnabled({ caller: alpha, pluginId: alphaPlugin.id, enabled: true });

    // The full three, from a stranger holding alpha's REAL id. This is the remote-disable attack, and every
    // attempt must be refused BEFORE the counter is touched.
    for (let i = 0; i < PLUGIN_CRASH_DISABLE_THRESHOLD; i++) {
      await expect(h.service.reportUiCrash({ caller: beta, pluginId: alphaPlugin.id, surfaceId: "panel", reason: "x" })).rejects.toBeInstanceOf(
        PluginNotFoundError,
      );
    }
    const [row] = await h.service.list({ caller: alpha });
    expect(row?.status).toBe("enabled");
    // …and the counter itself never moved: alpha's own FIRST report must still be its first strike, so a
    // stranger cannot even PRIME someone else's plugin to trip on a single genuine crash.
    await h.service.reportUiCrash({ caller: alpha, pluginId: alphaPlugin.id, surfaceId: "panel", reason: "real" });
    const [after] = await h.service.list({ caller: alpha });
    expect(after?.status).toBe("enabled");

    await expect(h.service.reportUiCrash({ caller: alpha, pluginId: castId<PluginId>("plugin_missing"), surfaceId: "p", reason: "x" })).rejects.toBeInstanceOf(
      PluginNotFoundError,
    );
  });
});
