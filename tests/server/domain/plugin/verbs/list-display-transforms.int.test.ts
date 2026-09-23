// verb: listDisplayTransforms — the caller's OWN enabled plugins' registered DISPLAY transforms
// (U6, seam 14). Owner-scoped by the `listOwned` read + the per-caller resident lookup:
// a stranger's transforms are never in the result, and a disabled plugin (no resident) contributes none.
//
// ITS ONE JOB IS THE BYTE-IDENTITY GATE, which is why it is a verb of its own rather than a field on
// `listSurfaces`: the display round-trip is PER ROW, so a viewer with no display transforms must learn so in
// ONE room-level query and then make zero per-row calls. An empty answer is the whole feature when it is off,
// and these pins are what make "empty" a fact rather than an assumption. The round-trip itself (the fold, the
// D53 skip posture, the guest's `env`) is pinned beside its own verb in transform-for-display.int.test.ts.

import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { PluginHandlerRef, PluginHostPort, PluginInstance } from "@orb/server/domain/plugin";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeBundle, makePluginHarness, ownerPrincipalFor, seedUser } from "../_support.ts";

/** A resident carrying `names` display transforms, each keyed to its own handler ref. */
function instanceWith(names: readonly string[]): PluginInstance {
  return {
    tools: [],
    transforms: [],
    events: [],
    pubsub: [],
    surfaces: [],
    commands: [],
    macros: [],
    displayTransforms: names.map((name) => ({ name, handler: castId<PluginHandlerRef>(`handler-${name}`) })),
  };
}

/** A port that serves ONE scripted instance — this verb never invokes, so the port needs nothing else. */
function portFor(instance: PluginInstance): PluginHostPort {
  return {
    createInstance: (): Promise<{ ok: true; instance: PluginInstance }> => Promise.resolve({ ok: true, instance }),
    invoke: (): Promise<string> => Promise.reject(new Error("listDisplayTransforms never invokes a guest")),
    runSnippet: (): Promise<{ logLines: readonly string[] }> => Promise.resolve({ logLines: [] }),
    readLog: (): [] => [],
    dispose: (): void => undefined,
  };
}

test("lists the caller's OWN enabled plugin's display transforms, tagged with the pluginId", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db, { port: portFor(instanceWith(["furigana", "ruby"])) });
  const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));
  const installed = await h.service.install({ caller, bundle: makeBundle({ id: "mood", capabilities: ["chat.transform"] }), grant: ["chat.transform"] });
  await h.service.setEnabled({ caller, pluginId: installed.id, enabled: true });

  expect(await h.service.listDisplayTransforms({ caller })).toEqual([
    { pluginId: installed.id, name: "furigana" },
    { pluginId: installed.id, name: "ruby" },
  ]);
});

test("a plugin that registered NONE contributes none — the gate's empty answer is the common case", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db, { port: portFor(instanceWith([])) });
  const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));
  const installed = await h.service.install({ caller, bundle: makeBundle({ id: "mood" }), grant: [] });
  await h.service.setEnabled({ caller, pluginId: installed.id, enabled: true });

  expect(await h.service.listDisplayTransforms({ caller })).toEqual([]);
});

test("a DISABLED plugin (no resident instance) contributes none", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db, { port: portFor(instanceWith(["furigana"])) });
  const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));
  // Installed but never enabled ⇒ no resident ⇒ nothing collected.
  await h.service.install({ caller, bundle: makeBundle({ id: "mood" }), grant: [] });

  expect(await h.service.listDisplayTransforms({ caller })).toEqual([]);
});

test("owner-scoped: a caller NEVER sees another owner's display transforms (the read is the gate)", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db, { port: portFor(instanceWith(["alpha_only"])) });
  const alpha = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("alpha") }));
  const beta = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("beta") }));
  const alphaPlugin = await h.service.install({ caller: alpha, bundle: makeBundle({ id: "mood" }), grant: [] });
  await h.service.setEnabled({ caller: alpha, pluginId: alphaPlugin.id, enabled: true });

  expect((await h.service.listDisplayTransforms({ caller: alpha })).map((t) => t.name)).toEqual(["alpha_only"]);
  expect(await h.service.listDisplayTransforms({ caller: beta })).toEqual([]);
});
