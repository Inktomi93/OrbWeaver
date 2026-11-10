// Storage is the subject: the server-wide published set keeps one record per slug, so a re-publish replaces the record
// and keeps the instant the slug first became policy. The publisher foreign key cascades, because a restrict would
// make the publishing admin's account undeletable by a policy row.
// @subject packages/server/src/domain/plugin/persistence/distributed-plugins.ts
// @subject packages/server/src/domain/plugin/verbs/install-for-all-users.ts
// @subject packages/server/src/domain/plugin/verbs/uninstall-for-all-users.ts

import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, pluginManifestSchema, pluginSlugSchema } from "@orb/contracts/plugin";
import { adminDistributedPlugins, assets, users } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { makePluginBundle } from "@orb/testkit/node/composed";
import { seedDistributedPluginRows } from "@orb/testkit/node/rows";
import { eq } from "drizzle-orm";

const SLUG = pluginSlugSchema.parse("house-style");

function bundle(harness: ServerTestHarness, version: string, name: string): Uint8Array {
  const manifest = pluginManifestSchema.parse({
    id: SLUG,
    name,
    version,
    hostVersion: PLUGIN_HOST_VERSIONS[0],
    entry: PLUGIN_MAIN_ENTRY,
    description: "A house plugin.",
    capabilities: [],
  });
  return makePluginBundle(manifest, "// published guest", harness.clock.now());
}

async function admin(harness: ServerTestHarness): Promise<Awaited<ReturnType<ServerTestHarness["principalFor"]>>> {
  return await harness.principalFor((await harness.actor({ role: "admin" })).id);
}

test("a re-publish replaces the record and keeps the instant the slug first became policy", async ({ harness }) => {
  const caller = await admin(harness);
  const first = await seedDistributedPluginRows(harness, { caller, bundle: bundle(harness, "1.0.0", "House Style") });
  harness.clock.advance(600_000);
  const second = await seedDistributedPluginRows(harness, { caller, bundle: bundle(harness, "1.1.0", "House Style II") });

  const published = await harness.services.plugin.listDistributedPlugins({ caller });
  expect(published).toEqual([
    { slug: SLUG, name: "House Style II", version: "1.1.0", distributedAt: first.distribution.distributedAt, updatedAt: second.distribution.updatedAt },
  ]);
  expect(second.distribution.distributedAt).toBe(first.distribution.distributedAt);
  expect(second.distribution.updatedAt).toBe(first.distribution.updatedAt + 600_000);
  expect(second.distribution.bundleAssetId).not.toBe(first.distribution.bundleAssetId);
});

test("withdrawing the record leaves the publisher's uploaded asset for the ordinary asset sweep", async ({ harness, db }) => {
  const caller = await admin(harness);
  const published = await seedDistributedPluginRows(harness, { caller, bundle: bundle(harness, "1.0.0", "House Style") });
  const assetId = published.distribution.bundleAssetId;
  expect(await db.select().from(assets).where(eq(assets.id, assetId))).toHaveLength(1);

  await harness.services.plugin.uninstallForAllUsers({ caller, slug: SLUG });

  expect(await harness.services.plugin.listDistributedPlugins({ caller })).toEqual([]);
  expect(await db.select().from(adminDistributedPlugins)).toEqual([]);
  expect(await db.select().from(assets).where(eq(assets.id, assetId))).toHaveLength(1);
});

test("deleting the publishing admin's account takes their distributions with them instead of refusing the delete", async ({ harness, db }) => {
  const publisher = await harness.actor({ role: "admin" });
  const caller = await harness.principalFor(publisher.id);
  await seedDistributedPluginRows(harness, { caller, bundle: bundle(harness, "1.0.0", "House Style") });
  expect(await db.select().from(adminDistributedPlugins)).toHaveLength(1);

  await db.delete(users).where(eq(users.id, publisher.id));

  expect(await db.select().from(adminDistributedPlugins)).toEqual([]);
});
