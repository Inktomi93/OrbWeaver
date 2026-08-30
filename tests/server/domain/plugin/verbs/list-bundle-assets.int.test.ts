// verb: listBundleAssets — the path → CAS-id map for ONE owned plugin's bundle-shipped images (#820 seam 11).
// The whole surface is one authority decision (the owner-scoped `getById` load) plus a projection, so this
// suite is about exactly two things: that a stranger is refused leak-free, and that the map projects only the
// BUNDLE half of `plugin_assets` (a runtime `net.fetchAsset` cover is not a named resolution target).

import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { PluginNotFoundError, recordPluginFetchedAsset } from "@orb/server/domain/plugin";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { magicBytes } from "../../../../support/magic-bytes.ts";
import { makeBundle, makePluginHarness, ownerPrincipalFor, principalFor, seedUser } from "../_support.ts";

test("projects the plugin's own bundle images, path-keyed and path-ordered", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const installed = await h.service.install({
    caller: ownerPrincipalFor(owner),
    bundle: makeBundle({ id: "sprites" }, undefined, undefined, {
      "ui/assets/z.png": magicBytes("png"),
      "ui/assets/a.gif": magicBytes("gif"),
    }),
    grant: [],
  });

  const map = await h.service.listBundleAssets({ caller: ownerPrincipalFor(owner), pluginId: installed.id });
  expect(map.map((entry) => entry.path)).toEqual(["ui/assets/a.gif", "ui/assets/z.png"]);
  expect(map.every((entry) => entry.assetId.startsWith("asset_"))).toBe(true);
});

test("a plugin that ships no images projects an EMPTY map — not an error", async () => {
  // The renderer only fires this read when a spec names a bundle path, but a spec that names one against a
  // plugin holding none must degrade to placeholders rather than blowing up the surface.
  const db = await freshDb();
  const h = makePluginHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const installed = await h.service.install({ caller: ownerPrincipalFor(owner), bundle: makeBundle({ id: "plain" }), grant: [] });

  expect(await h.service.listBundleAssets({ caller: ownerPrincipalFor(owner), pluginId: installed.id })).toEqual([]);
});

test("a RUNTIME-fetched cover (#802) is NOT in the map — only bundle-shipped paths are resolution targets", async () => {
  // The two provenances share `plugin_assets`, and the distinction is load-bearing: a `net.fetchAsset` cover
  // is reached through published STATE (`assetFrom`), never by name. Leaking it into the path map would put an
  // id in a namespace nothing validates a path against.
  const db = await freshDb();
  const h = makePluginHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const installed = await h.service.install({
    caller: ownerPrincipalFor(owner),
    bundle: makeBundle({ id: "mixed" }, undefined, undefined, { "ui/assets/shipped.png": magicBytes("png") }),
    grant: [],
  });
  // The bundle's own asset id doubles as a stand-in for a fetched cover here — what matters is the `''` path.
  const [shipped] = await h.service.listBundleAssets({ caller: ownerPrincipalFor(owner), pluginId: installed.id });
  expect(shipped).toBeDefined();
  await recordPluginFetchedAsset(db, installed.id, shipped?.assetId as never, 1000);

  const map = await h.service.listBundleAssets({ caller: ownerPrincipalFor(owner), pluginId: installed.id });
  expect(map.map((entry) => entry.path)).toEqual(["ui/assets/shipped.png"]);
});

test("a stranger holding the REAL pluginId is refused leak-free — including the apex owner role", async () => {
  // D147: authority here is the owner-scoped row load and nothing else, so the probe is aimed with the
  // strongest global role a caller can hold. What a dropped gate would hand over is a map of ANOTHER user's
  // CAS ids — inert against today's hash-keyed, session-owner-scoped blob route, which is exactly why the
  // refusal must be the ownership load rather than an argument about the ids being harmless.
  const db = await freshDb();
  const h = makePluginHarness(db);
  const alice = await seedUser(db, { handle: castId<Handle>("alice") });
  const bob = await seedUser(db, { handle: castId<Handle>("bob") });
  const hers = await h.service.install({
    caller: principalFor(alice),
    bundle: makeBundle({ id: "hers" }, undefined, undefined, { "ui/assets/private.png": magicBytes("png") }),
    grant: [],
  });

  await expect(h.service.listBundleAssets({ caller: principalFor(bob), pluginId: hers.id })).rejects.toBeInstanceOf(PluginNotFoundError);
  await expect(h.service.listBundleAssets({ caller: ownerPrincipalFor(bob), pluginId: hers.id })).rejects.toBeInstanceOf(PluginNotFoundError);
  // …and the owner still reads her own, so the refusal is scoping and not a blanket break.
  expect(await h.service.listBundleAssets({ caller: principalFor(alice), pluginId: hers.id })).toHaveLength(1);
});
