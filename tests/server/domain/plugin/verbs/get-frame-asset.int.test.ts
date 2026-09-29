// verb: getFrameAsset — the installed-image read behind an active isolated-frame handle. These controls use
// the real plugin row, plugin_assets links and owner-scoped CAS fake: the browser path never supplies an id.

import { PLUGIN_UI_ASSET_MAX_BYTES } from "@orb/contracts/plugin";
import type { Handle, PluginId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { PluginInstance } from "@orb/server/domain/plugin";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { magicBytes } from "../../../../support/magic-bytes.ts";
import { makeBundle, makePluginHarness, ownerPrincipalFor, seedUser } from "../_support.ts";

const FRAME_INSTANCE: PluginInstance = {
  tools: [],
  transforms: [],
  events: [],
  pubsub: [],
  displayTransforms: [],
  macros: [],
  commands: [],
  surfaces: [{ id: "board", anchor: "chat-flank", title: "Board", tier: "frame", frame: { html: "<main>board</main>" } }],
};

async function seeded(): Promise<{
  readonly db: Awaited<ReturnType<typeof freshDb>>;
  readonly h: ReturnType<typeof makePluginHarness>;
  readonly caller: ReturnType<typeof ownerPrincipalFor>;
  readonly pluginId: PluginId;
}> {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("asset_owner") }));
  h.port.script({ ok: true, instance: FRAME_INSTANCE });
  const installed = await h.service.install({
    caller,
    bundle: makeBundle({ id: "frame-art", capabilities: ["ui.frame"] }, undefined, undefined, {
      "ui/assets/piece.png": magicBytes("png"),
    }),
    grant: ["ui.frame"],
  });
  await h.service.setEnabled({ caller, pluginId: installed.id, enabled: true });
  return { db, h, caller, pluginId: installed.id };
}

test("an enabled granted frame resolves its own linked bundle path to sniffed bytes", async () => {
  const { h, caller, pluginId } = await seeded();
  const asset = await h.service.getFrameAsset({ caller, pluginId, bundlePath: "ui/assets/piece.png" });
  expect(asset?.mime).toBe("image/png");
  expect(asset?.bytes).toEqual(magicBytes("png"));
  expect(await h.service.getFrameAsset({ caller, pluginId, bundlePath: "ui/assets/missing.png" })).toBeNull();
  expect(await h.service.getFrameAsset({ caller, pluginId, bundlePath: "../piece.png" })).toBeNull();
});

test("a foreign owner cannot read through a real plugin id", async () => {
  const { db, h, pluginId } = await seeded();
  const stranger = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("asset_stranger") }));
  expect(await h.service.getFrameAsset({ caller: stranger, pluginId, bundlePath: "ui/assets/piece.png" })).toBeNull();
});

test("a frame handle's plugin cannot resolve a sibling plugin's same-named asset", async () => {
  const { h, caller, pluginId } = await seeded();
  h.port.script({ ok: true, instance: FRAME_INSTANCE });
  await h.service.upgrade({ caller, pluginId, bundle: makeBundle({ id: "frame-art", version: "1.1.0", capabilities: ["ui.frame"] }) });

  const sibling = await h.service.install({
    caller,
    bundle: makeBundle({ id: "sibling-art", capabilities: ["ui.frame"] }, undefined, undefined, {
      "ui/assets/piece.png": magicBytes("png"),
    }),
    grant: ["ui.frame"],
  });
  h.port.script({ ok: true, instance: FRAME_INSTANCE });
  await h.service.setEnabled({ caller, pluginId: sibling.id, enabled: true });

  expect(await h.service.getFrameAsset({ caller, pluginId, bundlePath: "ui/assets/piece.png" })).toBeNull();
  expect(await h.service.getFrameAsset({ caller, pluginId: sibling.id, bundlePath: "ui/assets/piece.png" })).not.toBeNull();
});

test("removing the path on upgrade revokes the old URL while the plugin stays enabled", async () => {
  const { h, caller, pluginId } = await seeded();
  h.port.script({ ok: true, instance: FRAME_INSTANCE });
  await h.service.upgrade({ caller, pluginId, bundle: makeBundle({ id: "frame-art", version: "1.1.0", capabilities: ["ui.frame"] }) });
  expect(await h.service.getFrameAsset({ caller, pluginId, bundlePath: "ui/assets/piece.png" })).toBeNull();
});

test("disable and uninstall revoke an already-minted frame's asset authority", async () => {
  const { h, caller, pluginId } = await seeded();
  await h.service.setEnabled({ caller, pluginId, enabled: false });
  expect(await h.service.getFrameAsset({ caller, pluginId, bundlePath: "ui/assets/piece.png" })).toBeNull();

  h.port.script({ ok: true, instance: FRAME_INSTANCE });
  await h.service.setEnabled({ caller, pluginId, enabled: true });
  expect(await h.service.getFrameAsset({ caller, pluginId, bundlePath: "ui/assets/piece.png" })).not.toBeNull();
  await h.service.uninstall({ caller, pluginId });
  expect(await h.service.getFrameAsset({ caller, pluginId, bundlePath: "ui/assets/piece.png" })).toBeNull();
});

test("the serve read rechecks the per-asset byte ceiling instead of trusting install-time metadata", async () => {
  const { h, caller, pluginId } = await seeded();
  const link = (await h.service.listBundleAssets({ caller, pluginId }))[0];
  expect(link).toBeDefined();
  if (link === undefined) {
    return;
  }
  h.storedBytes.set(link.assetId, magicBytes("png", PLUGIN_UI_ASSET_MAX_BYTES + 1));
  expect(await h.service.getFrameAsset({ caller, pluginId, bundlePath: link.path })).toBeNull();
});
