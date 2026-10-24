// A plugin verb that fails after writing CAS assets reaps their assets rows, and a refused reap never replaces the verb's
// own error. The reap refusal is a real storage fault; lifting it proves the same failure then reaps the stored attempt.
// @subject packages/server/src/domain/plugin/substrate/reap-released.ts
// @subject packages/server/src/domain/plugin/verbs/install.ts
// @subject packages/server/src/domain/plugin/verbs/upgrade.ts

import type { Principal } from "@orb/contracts/identity";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, PLUGIN_UI_ASSETS_DIR, pluginManifestSchema } from "@orb/contracts/plugin";
import { assets, plugins } from "@orb/db";
import type { AssetId, PluginId } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import { FROZEN_AT_MS } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { DbFault, ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, makeAssetBytes, makePluginBundle, refuseWrites, seedInstalledPlugin } from "@orb/testkit/node/composed";
import { and, eq, notInArray } from "drizzle-orm";

const SLUG = "reap-witness";
const IMAGE_MIME = "image/png";
const STORE_REFUSAL = "bundle image store refused";
const SWAP_REFUSAL = "plugin bundle swap refused";
const REAP_REFUSAL = "released asset reap refused";

function witnessBundle(root: ServerTestHarness, version: string, imageCount: number): Uint8Array {
  const manifest = pluginManifestSchema.parse({
    id: SLUG,
    name: "Reap witness",
    version,
    hostVersion: PLUGIN_HOST_VERSIONS[0],
    entry: PLUGIN_MAIN_ENTRY,
    description: "Ships cover images so a failed write leaves assets to reap.",
    capabilities: [],
  });
  const images = Object.fromEntries(
    Array.from({ length: imageCount }, (_, index) => [
      `${PLUGIN_UI_ASSETS_DIR}cover-${String(index)}.png`,
      makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset)),
    ]),
  );
  return makePluginBundle(manifest, "orb.host(1);", FROZEN_AT_MS, images);
}

// The driver error a refused statement rejects with carries the trigger's ABORT message on its cause.
const CAUSE_MESSAGE = "cause.message";

/** A new image's insert aborts once the owner holds one image, so the wave fails after the bundle zip and one
 *  image landed. A dedup insert passes: the trigger fires before `ON CONFLICT DO NOTHING` would skip it. */
function refuseSecondImage(root: ServerTestHarness): Promise<DbFault> {
  return refuseWrites(root.db, {
    table: assets,
    event: "INSERT",
    when: [
      `NEW.mime = '${IMAGE_MIME}'`,
      "NOT EXISTS (SELECT 1 FROM assets WHERE owner_id = NEW.owner_id AND hash = NEW.hash)",
      `(SELECT count(*) FROM assets WHERE mime = '${IMAGE_MIME}' AND owner_id = NEW.owner_id) >= 1`,
    ].join(" AND "),
    message: STORE_REFUSAL,
  });
}

function refuseReap(root: ServerTestHarness): Promise<DbFault> {
  return refuseWrites(root.db, { table: assets, event: "DELETE", message: REAP_REFUSAL });
}

/** The caller's asset ids outside `kept`, which are the ones a failed attempt wrote. */
async function attemptAssets(root: ServerTestHarness, caller: Principal, kept: readonly AssetId[]): Promise<readonly AssetId[]> {
  const rows = await root.db
    .select({ id: assets.id })
    .from(assets)
    .where(and(eq(assets.ownerId, caller.userId), notInArray(assets.id, [...kept])));
  return rows.map((row) => row.id);
}

function installedVersion(
  root: ServerTestHarness,
  pluginId: PluginId,
): Promise<Pick<typeof plugins.$inferSelect, "version" | "bundleAssetId" | "status" | "lastError"> | undefined> {
  return root.db
    .select({ version: plugins.version, bundleAssetId: plugins.bundleAssetId, status: plugins.status, lastError: plugins.lastError })
    .from(plugins)
    .where(eq(plugins.id, pluginId))
    .get();
}

test("a failed install surfaces its own store error when the reap of its written assets is refused", async () => {
  await using root = await createServerHarness();
  const caller = await root.principalFor((await root.actor()).id);
  const bundle = witnessBundle(root, "1.0.0", 2);
  await using storeFault = await refuseSecondImage(root);
  await using reapFault = await refuseReap(root);

  await expect(root.services.plugin.install({ caller, bundle, grant: [] })).rejects.toHaveProperty(CAUSE_MESSAGE, expect.stringContaining(STORE_REFUSAL));
  expect(await attemptAssets(root, caller, [])).toHaveLength(2);
  expect(await root.db.select().from(plugins).where(eq(plugins.ownerId, caller.userId))).toEqual([]);

  await reapFault.lift();
  await expect(root.services.plugin.install({ caller, bundle, grant: [] })).rejects.toHaveProperty(CAUSE_MESSAGE, expect.stringContaining(STORE_REFUSAL));
  expect(await attemptAssets(root, caller, [])).toEqual([]);
  await storeFault.lift();
});

test("a failed upgrade store surfaces its own error when the reap is refused and leaves the installed version", async () => {
  await using root = await createServerHarness();
  const caller = await root.principalFor((await root.actor()).id);
  const installed = await seedInstalledPlugin(root, { caller, bundle: witnessBundle(root, "1.0.0", 0), grant: [] });
  const pluginId = installed.plugin.id;
  const before = await installedVersion(root, pluginId);
  const bundle = witnessBundle(root, "2.0.0", 2);
  await using storeFault = await refuseSecondImage(root);
  await using reapFault = await refuseReap(root);

  await expect(root.services.plugin.upgrade({ caller, pluginId, bundle })).rejects.toHaveProperty(CAUSE_MESSAGE, expect.stringContaining(STORE_REFUSAL));
  expect(await attemptAssets(root, caller, [installed.plugin.bundleAssetId])).toHaveLength(2);
  expect(await installedVersion(root, pluginId)).toEqual(before);

  await reapFault.lift();
  await expect(root.services.plugin.upgrade({ caller, pluginId, bundle })).rejects.toHaveProperty(CAUSE_MESSAGE, expect.stringContaining(STORE_REFUSAL));
  expect(await attemptAssets(root, caller, [installed.plugin.bundleAssetId])).toEqual([]);
  await storeFault.lift();
});

test("a failed upgrade swap surfaces its own error when the repair's reap is refused, and the row is repaired", async () => {
  await using root = await createServerHarness();
  const caller = await root.principalFor((await root.actor()).id);
  const installed = await seedInstalledPlugin(root, { caller, bundle: witnessBundle(root, "1.0.0", 0), grant: [] });
  const pluginId = installed.plugin.id;
  const bundle = witnessBundle(root, "2.0.0", 1);
  await using swapFault = await refuseWrites(root.db, {
    table: plugins,
    event: "UPDATE",
    columns: [plugins.bundleAssetId],
    when: "NEW.bundle_asset_id <> OLD.bundle_asset_id",
    message: SWAP_REFUSAL,
  });
  await using reapFault = await refuseReap(root);

  await expect(root.services.plugin.upgrade({ caller, pluginId, bundle })).rejects.toHaveProperty(CAUSE_MESSAGE, expect.stringContaining(SWAP_REFUSAL));
  expect(await attemptAssets(root, caller, [installed.plugin.bundleAssetId])).toHaveLength(2);
  const repaired = await installedVersion(root, pluginId);
  expect(repaired).toMatchObject({ version: "1.0.0", bundleAssetId: installed.plugin.bundleAssetId, status: "disabled" });
  expect(repaired?.lastError).toContain(SWAP_REFUSAL);

  await reapFault.lift();
  await expect(root.services.plugin.upgrade({ caller, pluginId, bundle })).rejects.toHaveProperty(CAUSE_MESSAGE, expect.stringContaining(SWAP_REFUSAL));
  expect(await attemptAssets(root, caller, [installed.plugin.bundleAssetId])).toEqual([]);
  await swapFault.lift();
});
