// A settings row the asset-reference walk cannot read refuses the reap; the plugin verb that asked for it
// still finishes its transition on the real composition root, and the refused reap deletes nothing.
// @subject packages/server/src/domain/plugin/verbs/upgrade.ts
// @subject packages/server/src/domain/plugin/verbs/uninstall.ts
// @subject packages/server/src/domain/plugin/substrate/bundle-assets.ts

import "@orb/testkit/node/composed-real.ts";
import { spawn } from "node:child_process";
import type { Principal } from "@orb/contracts/identity";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, PLUGIN_UI_ASSETS_DIR, pluginManifestSchema } from "@orb/contracts/plugin";
import { assets, plugins, userSettings } from "@orb/db";
import type { AssetId, PluginId } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import { FROZEN_AT_MS } from "@orb/testkit/iso/clock.ts";
import { makeAssetBytes } from "@orb/testkit/node/factories/asset.ts";
import { makePluginBundle, seedInstalledPlugin } from "@orb/testkit/node/factories/plugin.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import type { ServerTestHarness } from "@orb/testkit/node/server.ts";
import { createServerHarness } from "@orb/testkit/node/server.ts";
import { eq, inArray, sql } from "drizzle-orm";

const SLUG = "reap-refusal-witness";
const COVER_PATH = `${PLUGIN_UI_ASSETS_DIR}cover.png`;
const GUEST = "orb.host(1);";

function bundleOf(root: ServerTestHarness, version: string): Uint8Array {
  const manifest = pluginManifestSchema.parse({
    id: SLUG,
    name: "Reap refusal witness",
    version,
    hostVersion: PLUGIN_HOST_VERSIONS[0],
    entry: PLUGIN_MAIN_ENTRY,
    description: "Ships one cover image that each version replaces.",
    capabilities: [],
  });
  return makePluginBundle(manifest, GUEST, FROZEN_AT_MS, { [COVER_PATH]: makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset)) });
}

/** An enabled install whose bundle and cover would both be orphaned by the next upgrade or uninstall. */
async function enabledInstall(root: ServerTestHarness, caller: Principal): Promise<{ readonly pluginId: PluginId; readonly held: AssetId[] }> {
  const installed = await seedInstalledPlugin(root, { caller, bundle: bundleOf(root, "1.0.0"), grant: [] });
  await root.services.plugin.setEnabled({ caller, pluginId: installed.plugin.id, enabled: true });
  expect(await statusOf(root, installed.plugin.id)).toMatchObject({ status: "enabled", lastError: null });
  expect(installed.assets).toHaveLength(1);
  return { pluginId: installed.plugin.id, held: [installed.plugin.bundleAssetId, ...installed.assets.map((asset) => asset.assetId)] };
}

async function statusOf(
  root: ServerTestHarness,
  pluginId: PluginId,
): Promise<{ readonly version: string; readonly status: string; readonly lastError: string | null } | undefined> {
  return await root.db
    .select({ version: plugins.version, status: plugins.status, lastError: plugins.lastError })
    .from(plugins)
    .where(eq(plugins.id, pluginId))
    .get();
}

/** Store the owner's settings row through its real verb, then corrupt the background pick the reference walk reads. */
async function plantUnreadableSettings(root: ServerTestHarness, caller: Principal): Promise<void> {
  await root.services.settings.updateUserSettingsSection({ principal: caller, input: { section: "profile", patch: { flankCollapsed: true } } });
  await root.db
    .update(userSettings)
    .set({ config: sql`json_set(${userSettings.config}, '$.appearance.backgroundAssetId', json('{"id":"unreadable"}'))` })
    .where(eq(userSettings.userId, caller.userId));
}

async function survivingAssetIds(root: ServerTestHarness, ids: readonly AssetId[]): Promise<AssetId[]> {
  const rows = await root.db
    .select({ id: assets.id })
    .from(assets)
    .where(inArray(assets.id, [...ids]));
  return rows.map((row) => row.id).toSorted();
}

async function rootWithPlugins(): Promise<ServerTestHarness> {
  return await createServerHarness({ pluginSpawn: spawn });
}

test("an upgrade whose reap is refused still lands the new version enabled and keeps every prior asset", async () => {
  await using root = await rootWithPlugins();
  const caller = await root.principalFor(root.ownerId);
  const { pluginId, held } = await enabledInstall(root, caller);
  await plantUnreadableSettings(root, caller);

  const upgraded = await root.services.plugin.upgrade({ caller, pluginId, bundle: bundleOf(root, "2.0.0") });

  expect(upgraded).toMatchObject({ version: "2.0.0", status: "enabled" });
  expect(await statusOf(root, pluginId)).toEqual({ version: "2.0.0", status: "enabled", lastError: null });
  expect(await survivingAssetIds(root, held)).toEqual(held.toSorted());
});

test("an uninstall whose reap is refused still removes the plugin and keeps its assets", async () => {
  await using root = await rootWithPlugins();
  const caller = await root.principalFor(root.ownerId);
  const { pluginId, held } = await enabledInstall(root, caller);
  await plantUnreadableSettings(root, caller);

  await root.services.plugin.uninstall({ caller, pluginId });

  expect(await root.db.select({ id: plugins.id }).from(plugins).where(eq(plugins.id, pluginId))).toEqual([]);
  expect(await survivingAssetIds(root, held)).toEqual(held.toSorted());
});

test("with readable settings the same upgrade reaps exactly what the old version dropped", async () => {
  await using root = await rootWithPlugins();
  const caller = await root.principalFor(root.ownerId);
  const { pluginId, held } = await enabledInstall(root, caller);

  await root.services.plugin.upgrade({ caller, pluginId, bundle: bundleOf(root, "2.0.0") });

  expect(await survivingAssetIds(root, held)).toEqual([]);
});
