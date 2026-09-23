// verb: listCommands — the caller's OWN enabled plugins' registered commands.
// The `listSurfaces` twin, so the pins are its twin too: the read IS the gate (owner-scoped `listOwned`, no
// foreign id anywhere), a plugin with no resident contributes nothing, and the projection carries the SLUG —
// the first token of `/plugin <slug> <name> …`, which only this side can supply.

import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { PluginHandlerRef, PluginInstance } from "@orb/server/domain/plugin";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeBundle, makePluginHarness, ownerPrincipalFor, seedUser } from "../_support.ts";

function instanceWithCommands(commands: PluginInstance["commands"]): PluginInstance {
  return { tools: [], transforms: [], events: [], pubsub: [], surfaces: [], commands, displayTransforms: [], macros: [] };
}

const DRAW: PluginInstance["commands"] = [{ name: "draw", describe: "Draw a card", onRun: castId<PluginHandlerRef>("plugin-handler-0") }];

test("projects the caller's OWN enabled plugin's commands, carrying the slug + plugin name the surfaces need", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));
  h.port.script({ ok: true, instance: instanceWithCommands(DRAW) });
  const installed = await h.service.install({ caller, bundle: makeBundle({ id: "oracle-deck", name: "Oracle Deck" }), grant: [] });
  await h.service.setEnabled({ caller, pluginId: installed.id, enabled: true });

  const commands = await h.service.listCommands({ caller });
  expect(commands).toEqual([
    // The SLUG is the dispatch token and the NAME is the menu group label — both projected here, because only
    // this side knows the install's slug and re-deriving either client-side would be a second home. `args` is the
    // #791 typed-arg grammar — empty for a command that declared none.
    { pluginId: installed.id, slug: "oracle-deck", pluginName: "Oracle Deck", name: "draw", describe: "Draw a card", args: [] },
  ]);
  // The guest handler ref stays server-side — a client never sees a handle it could forge.
  expect(JSON.stringify(commands)).not.toContain("plugin-handler-0");
});

test("#791: a command's DECLARED typed args are projected verbatim for the surfaces to render", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));
  const cast: PluginInstance["commands"] = [
    {
      name: "cast",
      describe: "Cast a spell",
      args: [{ name: "suit", type: "enum", required: true, enumValues: ["cups", "wands"] }],
      onRun: castId<PluginHandlerRef>("plugin-handler-1"),
    },
  ];
  h.port.script({ ok: true, instance: instanceWithCommands(cast) });
  const installed = await h.service.install({ caller, bundle: makeBundle({ id: "oracle-deck", name: "Oracle Deck" }), grant: [] });
  await h.service.setEnabled({ caller, pluginId: installed.id, enabled: true });

  expect(await h.service.listCommands({ caller })).toEqual([
    {
      pluginId: installed.id,
      slug: "oracle-deck",
      pluginName: "Oracle Deck",
      name: "cast",
      describe: "Cast a spell",
      args: [{ name: "suit", type: "enum", required: true, enumValues: ["cups", "wands"] }],
    },
  ]);
});

test("a DISABLED plugin contributes nothing — no resident, no commands", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));
  h.port.script({ ok: true, instance: instanceWithCommands(DRAW) });
  const installed = await h.service.install({ caller, bundle: makeBundle({ id: "oracle-deck" }), grant: [] });
  // Installed but never enabled.
  expect(await h.service.listCommands({ caller })).toEqual([]);

  await h.service.setEnabled({ caller, pluginId: installed.id, enabled: true });
  expect(await h.service.listCommands({ caller })).toHaveLength(1);
  // …and disabling drops them again, so a disabled plugin's command can never be reached from a menu row.
  await h.service.setEnabled({ caller, pluginId: installed.id, enabled: false });
  expect(await h.service.listCommands({ caller })).toEqual([]);
});

test("THE READ IS THE GATE — a stranger's list never carries another owner's commands", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const alpha = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("alpha") }));
  const beta = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("beta") }));
  h.port.script({ ok: true, instance: instanceWithCommands(DRAW) });
  const alphaPlugin = await h.service.install({ caller: alpha, bundle: makeBundle({ id: "oracle-deck" }), grant: [] });
  await h.service.setEnabled({ caller: alpha, pluginId: alphaPlugin.id, enabled: true });

  expect(await h.service.listCommands({ caller: alpha })).toHaveLength(1);
  // Beta owns no plugin rows, so the owner-scoped read simply has nothing to project — there is no foreign id
  // to pass and therefore no leak to make.
  expect(await h.service.listCommands({ caller: beta })).toEqual([]);
});
