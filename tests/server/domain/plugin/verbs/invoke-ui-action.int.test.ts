// verb: invokeUiAction — the Tier-S guest-action round-trip (plugin-ui-plane #679 U1, §4.4). The AUTHORITY
// GATE is the whole story (it takes a foreign pluginId): owner-scope → residence → surface+handler. The
// success arm re-enters the surface's `onAction` through the resident's crash-policy'd invoke with one
// `{actionId, values, chat}` object; the fakePort rejects invoke (that path is the composed-real runtime), so
// the re-entry ARGS are proven with a recording port and the GATES with the default fake.

import type { Handle, PluginId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { CreateInstanceOutcome, PluginHandlerRef, PluginHostPort, PluginInstance } from "@orb/server/domain/plugin";
import { PluginNotFoundError } from "@orb/server/domain/plugin";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeBundle, makePluginHarness, ownerPrincipalFor, seedUser } from "../_support.ts";

function instanceWith(surfaces: PluginInstance["surfaces"]): PluginInstance {
  return { tools: [], transforms: [], events: [], surfaces };
}

const NOT_ENABLED_RE = /not enabled/u;
const NO_ACTIONABLE_SURFACE_RE = /no actionable UI surface/u;

const PANEL_WITH_ACTION: PluginInstance["surfaces"] = [
  { id: "panel", anchor: "settings", title: "Panel", tier: "static", onAction: castId<PluginHandlerRef>("plugin-handler-0") },
];

test("re-enters the surface's onAction with one {actionId, values, chat:null} object", async () => {
  const db = await freshDb();
  // A recording port: scripts a resident carrying an actionable surface + captures every invoke's argsJson.
  const invokes: { argsJson: string }[] = [];
  const recordingPort: PluginHostPort = {
    createInstance: (): Promise<CreateInstanceOutcome> => Promise.resolve({ ok: true, instance: instanceWith(PANEL_WITH_ACTION) }),
    invoke: (_instance, _handler, argsJson): Promise<string> => {
      invokes.push({ argsJson });
      return Promise.resolve("");
    },
    runSnippet: () => Promise.reject(new Error("runSnippet is not exercised here")),
    readLog: () => [],
    dispose: () => undefined,
  };
  const h = makePluginHarness(db, { port: recordingPort });
  const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));
  const installed = await h.service.install({ caller, bundle: makeBundle({ id: "mood" }), grant: [] });
  await h.service.setEnabled({ caller, pluginId: installed.id, enabled: true });

  await h.service.invokeUiAction({ caller, pluginId: installed.id, surfaceId: "panel", actionId: "save", values: { name: "Alex" } });

  expect(invokes).toHaveLength(1);
  const first = invokes[0];
  if (first === undefined) {
    throw new Error("expected exactly one invoke");
  }
  expect(JSON.parse(first.argsJson)).toEqual({ actionId: "save", values: { name: "Alex" }, chat: null });
});

test("a missing/foreign plugin is a leak-free NotFound BEFORE any guest re-entry", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const alpha = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("alpha") }));
  const beta = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("beta") }));
  const alphaPlugin = await h.service.install({ caller: alpha, bundle: makeBundle({ id: "mood" }), grant: [] });
  // Beta holding alpha's REAL pluginId is refused NOT_FOUND — never re-enters alpha's guest under beta.
  await expect(h.service.invokeUiAction({ caller: beta, pluginId: alphaPlugin.id, surfaceId: "panel", actionId: "save", values: {} })).rejects.toBeInstanceOf(
    PluginNotFoundError,
  );
  await expect(
    h.service.invokeUiAction({ caller: alpha, pluginId: castId<PluginId>("plugin_missing"), surfaceId: "panel", actionId: "save", values: {} }),
  ).rejects.toBeInstanceOf(PluginNotFoundError);
});

test("a DISABLED plugin (no resident) is refused — no surface to act on", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));
  const installed = await h.service.install({ caller, bundle: makeBundle({ id: "mood" }), grant: [] });
  // Installed but never enabled ⇒ no resident.
  await expect(h.service.invokeUiAction({ caller, pluginId: installed.id, surfaceId: "panel", actionId: "save", values: {} })).rejects.toThrow(NOT_ENABLED_RE);
});

test("an unknown surface id (or a surface with no onAction) is refused", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));
  // A resident carrying a DISPLAY-ONLY surface (no onAction) and none named "ghost".
  h.port.script({ ok: true, instance: instanceWith([{ id: "readout", anchor: "settings", title: "Readout", tier: "static" }]) });
  const installed = await h.service.install({ caller, bundle: makeBundle({ id: "mood" }), grant: [] });
  await h.service.setEnabled({ caller, pluginId: installed.id, enabled: true });

  await expect(h.service.invokeUiAction({ caller, pluginId: installed.id, surfaceId: "ghost", actionId: "x", values: {} })).rejects.toThrow(
    NO_ACTIONABLE_SURFACE_RE,
  );
  await expect(h.service.invokeUiAction({ caller, pluginId: installed.id, surfaceId: "readout", actionId: "x", values: {} })).rejects.toThrow(
    NO_ACTIONABLE_SURFACE_RE,
  );
});
