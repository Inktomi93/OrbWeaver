// verb: listSurfaces — the caller's OWN enabled plugins' registered UI surfaces.
// Owner-scoped by the `listOwned` read + the per-caller resident lookup: a stranger's surfaces are never in the
// result, a disabled plugin (no resident) contributes none, and each surface is projected to the serializable
// meta (the `onAction` handle stays server-side) tagged with its pluginId.

import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { PluginHandlerRef, PluginInstance } from "@orb/server/domain/plugin";
import { createPluginHost } from "@orb/server/infra/plugin-host";
import { afterEach } from "vitest";
import { __terminateManagedPluginBrokerForTest } from "../../../../../packages/server/src/infra/plugin-host/process-runtime.ts";
import { FROZEN_AT_MS } from "../../../../support/clock.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeBundle, makePluginHarness, ownerPrincipalFor, seedUser } from "../_support.ts";

// The real-runtime case below activates guests in the managed broker; reset it so a resident from one test
// cannot pin capacity for the next (the seed-example-plugins suite's reset).
afterEach(async () => {
  await __terminateManagedPluginBrokerForTest();
});

/** A scripted resident instance carrying one settings surface (the `onAction` handle is opaque — listSurfaces
 *  must DROP it from the projection). */
function instanceWith(surfaceId: string): PluginInstance {
  return {
    tools: [],
    transforms: [],
    events: [],
    pubsub: [],
    commands: [],
    displayTransforms: [],
    macros: [],
    surfaces: [
      {
        id: surfaceId,
        anchor: "settings",
        title: "My Panel",
        tier: "static",
        spec: { kind: "stack", children: [{ kind: "text", value: "hi" }] },
        onAction: castId<PluginHandlerRef>("plugin-handler-0"),
      },
    ],
  };
}

/** A resident carrying one `tool-card` surface, linked to a guest-local tool name (#679 U3). */
function instanceWithToolCard(toolName: string): PluginInstance {
  return {
    tools: [],
    transforms: [],
    events: [],
    pubsub: [],
    commands: [],
    displayTransforms: [],
    macros: [],
    surfaces: [{ id: "draw_card", anchor: "tool-card", title: "Draw", tier: "static", toolName, spec: { kind: "text", value: "drawn" } }],
  };
}

test("lists the caller's OWN enabled plugin's surfaces, projected to meta + pluginId (no onAction handle)", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const caller = ownerPrincipalFor(owner);
  h.port.script({ ok: true, instance: instanceWith("panel") });
  const installed = await h.service.install({ caller, bundle: makeBundle({ id: "mood" }), grant: [] });
  await h.service.setEnabled({ caller, pluginId: installed.id, enabled: true });

  expect(await h.service.listSurfaces({ caller })).toEqual([
    {
      pluginId: installed.id,
      id: "panel",
      anchor: "settings",
      title: "My Panel",
      tier: "static",
      spec: { kind: "stack", children: [{ kind: "text", value: "hi" }] },
    },
  ]);
});

test("a tool-card surface is projected with the MODEL-VISIBLE wire name (slug hyphens become underscores)", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));
  h.port.script({ ok: true, instance: instanceWithToolCard("draw") });
  // A HYPHENATED slug is the load-bearing case: the model-visible name has no hyphen in it, so a projection
  // that forwarded the raw slug would never match a persisted `ToolCallRecord.name` and the card would be
  // silently unreachable — which reads exactly like "this plugin registered no card".
  const installed = await h.service.install({ caller, bundle: makeBundle({ id: "oracle-deck" }), grant: [] });
  await h.service.setEnabled({ caller, pluginId: installed.id, enabled: true });

  const [surface] = await h.service.listSurfaces({ caller });
  expect(surface?.toolName).toBe("draw");
  expect(surface?.toolWireName).toBe("plugin_oracle__deck_draw");
});

test("a non-tool-card surface carries NO wire name (the linkage is the tool-card anchor's alone)", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));
  h.port.script({ ok: true, instance: instanceWith("panel") });
  const installed = await h.service.install({ caller, bundle: makeBundle({ id: "oracle-deck" }), grant: [] });
  await h.service.setEnabled({ caller, pluginId: installed.id, enabled: true });

  const [surface] = await h.service.listSurfaces({ caller });
  // Non-vacuous: an empty result would satisfy an `undefined` pin while proving nothing.
  expect(surface?.id).toBe("panel");
  expect(surface?.toolWireName).toBeUndefined();
});

test("a DISABLED plugin (no resident instance) contributes no surfaces", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const caller = ownerPrincipalFor(owner);
  // Installed but never enabled ⇒ no resident ⇒ no surfaces.
  await h.service.install({ caller, bundle: makeBundle({ id: "mood" }), grant: [] });
  expect(await h.service.listSurfaces({ caller })).toEqual([]);
});

test("owner-scoped: a caller NEVER sees another owner's surfaces (the read is the gate)", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const alpha = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("alpha") }));
  const beta = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("beta") }));
  // Alpha installs + enables a plugin with a surface; beta installs + enables their own.
  h.port.script({ ok: true, instance: instanceWith("alpha_panel") });
  const alphaPlugin = await h.service.install({ caller: alpha, bundle: makeBundle({ id: "mood" }), grant: [] });
  await h.service.setEnabled({ caller: alpha, pluginId: alphaPlugin.id, enabled: true });
  h.port.script({ ok: true, instance: instanceWith("beta_panel") });
  const betaPlugin = await h.service.install({ caller: beta, bundle: makeBundle({ id: "mood" }), grant: [] });
  await h.service.setEnabled({ caller: beta, pluginId: betaPlugin.id, enabled: true });

  // Each sees ONLY their own surface — never the other's.
  const alphaSurfaces = await h.service.listSurfaces({ caller: alpha });
  expect(alphaSurfaces.map((s) => s.id)).toEqual(["alpha_panel"]);
  expect(alphaSurfaces.every((s) => s.pluginId === alphaPlugin.id)).toBe(true);
  const betaSurfaces = await h.service.listSurfaces({ caller: beta });
  expect(betaSurfaces.map((s) => s.id)).toEqual(["beta_panel"]);
});

/** A guest that registers a scripted surface at each of the three host anchors that mount a UI guest. Each
 *  refusal is caught so the plugin stays resident: an absent surface then proves the grant gate, not a dead
 *  activation. */
const SCRIPTED_ANCHORS_MAIN = `
  const host = orb.host(1);
  const defs = [
    { id: "page_panel", anchor: "page", title: "Page", tier: "scripted" },
    { id: "board", anchor: "dialog", title: "Board", tier: "scripted" },
    { id: "draw_card", anchor: "tool-card", title: "Draw", tier: "scripted", toolName: "draw" },
  ];
  for (const def of defs) {
    try { host.ui.register(def); } catch (e) { host.log.warn(def.id + " refused: " + e.name); }
  }
`;

test("#0234: scripted page, dialog and tool-card surfaces list only while ui.surface is granted", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db, { port: createPluginHost({ nowEpochMs: () => FROZEN_AT_MS, nextRandom: () => 0.5, mintId: () => "surface-id" }) });
  const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));
  const bundle = (id: string): Uint8Array => makeBundle({ id, capabilities: ["ui.surface"], uiEntry: true }, SCRIPTED_ANCHORS_MAIN, "orb.ui(1);");

  const granted = await h.service.install({ caller, bundle: bundle("granted"), grant: ["ui.surface"] });
  await h.service.setEnabled({ caller, pluginId: granted.id, enabled: true });
  const listed = await h.service.listSurfaces({ caller });
  expect(listed.map((surface) => [surface.id, surface.anchor, surface.tier])).toEqual([
    ["page_panel", "page", "scripted"],
    ["board", "dialog", "scripted"],
    ["draw_card", "tool-card", "scripted"],
  ]);

  // Revoked: the re-grant restarts the resident under the narrowed set, and every registration is refused.
  const revoked = await h.service.setGrant({ caller, pluginId: granted.id, grant: [], acknowledgedNetHosts: [] });
  expect(revoked.status).toBe("enabled");
  expect(await h.service.listSurfaces({ caller })).toEqual([]);

  // Never granted: the same bundle enabled without consent to ui.surface registers nothing either.
  const ungranted = await h.service.install({ caller, bundle: bundle("ungranted"), grant: [] });
  await h.service.setEnabled({ caller, pluginId: ungranted.id, enabled: true });
  expect((await h.service.list({ caller })).map((plugin) => plugin.status)).toEqual(["enabled", "enabled"]);
  expect(await h.service.listSurfaces({ caller })).toEqual([]);
});
