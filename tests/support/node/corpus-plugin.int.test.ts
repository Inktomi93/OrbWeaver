// @subject tests/support/node/corpus-plugin.ts
import "@orb/testkit/node/composed-real.ts";
import { spawn } from "node:child_process";
import { assertReferentialIntegrity, pluginKv, pluginProviderClaims } from "@orb/db";
import { distributedPluginViewSchema, PluginNotFoundError, pluginFanoutResultSchema } from "@orb/server/domain/plugin";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { createServerHarness } from "@orb/testkit/node/server.ts";
import {
  CORPUS_ADMIN_PROVIDER,
  CORPUS_PLUGIN_ASSET_PATH,
  CORPUS_PLUGIN_PROVIDER_MANIFEST,
  CORPUS_PLUGIN_STORAGE_KEY,
  CORPUS_PLUGIN_STORAGE_VALUE,
  seedCorpusPlugins,
  seedCorpusPluginWithdrawal,
} from "./corpus-plugin.ts";

test("native withdrawal removes matching copies but retains a recipient's upgraded live install and private canon", { tags: ["slow"] }, async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn });
  const recipient = await root.actor();
  const captured = await seedCorpusPluginWithdrawal(root, recipient.id);
  expect(captured.published.outcome.applied).toBe(2);
  expect(captured.published.installs.every(({ plugin }) => plugin.status === "disabled" && plugin.grantedCapabilities.length === 0)).toBe(true);
  expect(captured.upgraded).toMatchObject({ version: "2.0.0", status: "enabled", grantedCapabilities: ["storage.kv"] });
  expect(captured.refused).toEqual([expect.objectContaining({ status: "rejected" })]);
  expect(captured.stillPublished).toHaveLength(1);
  expect(captured.withdrawn).toEqual({
    slug: CORPUS_PLUGIN_PROVIDER_MANIFEST.id,
    name: CORPUS_PLUGIN_PROVIDER_MANIFEST.name,
    version: "1.0.0",
    applied: 1,
    skipped: [{ userId: recipient.id, userHandle: recipient.handle, reason: "version-diverged" }],
  });
  expect(pluginFanoutResultSchema.parse(captured.withdrawn)).toEqual(captured.withdrawn);
  expect(captured.after).toEqual(captured.before);
  expect(captured.after.kv.map(({ value }) => value)).toEqual([CORPUS_PLUGIN_STORAGE_VALUE]);
  expect(captured.ownerInstalls).toEqual([]);
  expect(captured.remainingPublications).toEqual([]);
  expect(captured.lateApplication).toEqual({ installedSlugs: [], skippedSlugs: [] });
  const recipientRpc = await root.internalCallerFor(recipient.id);
  expect(
    await recipientRpc.plugin.uiHostCall({ pluginId: captured.after.plugin.id, fn: "storage.get", argsJson: JSON.stringify([CORPUS_PLUGIN_STORAGE_KEY]) }),
  ).toEqual({ resultJson: JSON.stringify(CORPUS_PLUGIN_STORAGE_VALUE) });
  await assertReferentialIntegrity(root.db);
});

test("the corpus keeps real consent, per-owner provider claims and distribution outcomes distinct from contained activation failure", async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn });
  const other = await root.actor();
  const captured = await seedCorpusPlugins(root, other.id);
  expect(captured.installed.plugin.status).toBe("disabled");
  expect(captured.installed.plugin.grantedCapabilities).toEqual([]);
  expect(captured.installed.kv).toEqual([]);
  expect(captured.installed.assets.map((row) => [row.pluginId, row.bundlePath])).toEqual([[captured.installed.outcome.id, CORPUS_PLUGIN_ASSET_PATH]]);
  expect(
    captured.providers.map(({ claim, definition }) => [
      claim.ownerId,
      claim.pluginId,
      claim.providerId,
      definition.id,
      claim.definitionHash === definition.definitionHash,
    ]),
  ).toEqual((CORPUS_PLUGIN_PROVIDER_MANIFEST.providers ?? []).map((provider) => [root.ownerId, captured.installed.outcome.id, provider.id, provider.id, true]));
  expect(captured.providers).toHaveLength(1);
  expect(captured.distribution.outcome).toMatchObject({ applied: 1, skipped: [{ userId: root.ownerId, reason: "already-installed" }] });
  expect(captured.distribution.distribution.distributedBy).toBe(root.ownerId);
  expect(captured.publication).toEqual([
    {
      slug: captured.distribution.outcome.slug,
      name: captured.distribution.outcome.name,
      version: captured.distribution.outcome.version,
      distributedAt: captured.distribution.distribution.distributedAt,
      updatedAt: captured.distribution.distribution.updatedAt,
    },
  ]);
  for (const value of captured.publication) {
    expect(distributedPluginViewSchema.parse(JSON.parse(JSON.stringify(value)))).toEqual(value);
  }
  expect(pluginFanoutResultSchema.parse(JSON.parse(JSON.stringify(captured.distribution.outcome)))).toEqual(captured.distribution.outcome);
  expect(pluginFanoutResultSchema.parse(JSON.parse(JSON.stringify(captured.repeated.outcome)))).toEqual(captured.repeated.outcome);
  const owned = captured.distribution.installs.find(({ plugin }) => plugin.ownerId === root.ownerId);
  const pending = captured.distribution.installs.find(({ plugin }) => plugin.ownerId === other.id);
  expect(owned?.plugin.status).toBe("enabled");
  expect(owned?.kv.map((row) => [row.ownerId, row.key, row.value])).toEqual([[root.ownerId, CORPUS_PLUGIN_STORAGE_KEY, CORPUS_PLUGIN_STORAGE_VALUE]]);
  expect(pending?.plugin).toMatchObject({ status: "disabled", grantedCapabilities: [], pendingReconsent: true });
  expect(pending?.kv).toEqual([]);
  expect(new Set(captured.distribution.installs.map(({ plugin }) => plugin.bundleAssetId)).size).toBe(2);
  expect(captured.recipient.plugin).toMatchObject({ id: pending?.plugin.id, ownerId: other.id, status: "enabled", pendingReconsent: false });
  expect(captured.recipient.kv.map((row) => [row.ownerId, row.key, row.value])).toEqual([[other.id, CORPUS_PLUGIN_STORAGE_KEY, CORPUS_PLUGIN_STORAGE_VALUE]]);
  expect(captured.tombstones.map((row) => [row.ownerId, row.providerId, row.pluginId, row.definitionHash])).toEqual(
    captured.providers.map(({ claim }) => [root.ownerId, claim.providerId, null, claim.definitionHash]),
  );
  const registry = root.services.connection.registry;
  for (const provider of CORPUS_PLUGIN_PROVIDER_MANIFEST.providers ?? []) {
    expect(registry.get(provider.id, root.ownerId)).toBeUndefined();
    expect(registry.get(provider.id, other.id)).toEqual(provider);
    expect(registry.deploymentRow(provider.id)).toBeUndefined();
  }
  expect(captured.repeated.outcome.applied).toBe(0);
  expect(
    captured.repeated.outcome.skipped.map(({ userId, reason }) => [userId, reason]).toSorted(([left], [right]) => String(left).localeCompare(String(right))),
  ).toEqual(
    [
      [root.ownerId, "already-installed"],
      [other.id, "already-installed"],
    ].toSorted(([left], [right]) => String(left).localeCompare(String(right))),
  );
  expect(captured.repeated.installs.find(({ plugin }) => plugin.ownerId === other.id)?.plugin.status).toBe("enabled");
  expect(captured.repeated.installs.find(({ plugin }) => plugin.ownerId === root.ownerId)?.plugin.status).toBe("disabled");
  expect(captured.admin).toMatchObject({ id: CORPUS_ADMIN_PROVIDER.id, originKind: "admin", originUserId: root.ownerId });
  expect(captured.admin.definitionHash).not.toBe("");
  expect(registry.get(CORPUS_ADMIN_PROVIDER.id, other.id)).toEqual(CORPUS_ADMIN_PROVIDER);
  expect(captured.refused.outcome.status).toBe("errored");
  expect(captured.refused.plugin.lastError).toContain("corpus guest activation refused");
  expect(captured.refused.kv).toEqual([]);
  expect(captured.refused.plugin.grantedCapabilities).toEqual(CORPUS_PLUGIN_PROVIDER_MANIFEST.capabilities);
  expect(captured.refused.assets.map((row) => row.pluginId)).toEqual([captured.refused.outcome.id]);
  await assertReferentialIntegrity(root.db);
});

test("a real stranger cannot enable the corpus owner's install or alter either owner's private KV and permanent provider claims", async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn });
  const recipient = await root.actor();
  const captured = await seedCorpusPlugins(root, recipient.id);
  const stranger = await root.actor();
  const caller = await root.principalFor(stranger.id);
  const owner = await root.principalFor(root.ownerId);
  const before = {
    plugins: await root.services.plugin.list({ caller: owner }),
    kv: await root.db.select().from(pluginKv),
    claims: await root.db.select().from(pluginProviderClaims),
  };
  await expect(
    root.services.plugin.setGrant({
      caller,
      pluginId: captured.installed.outcome.id,
      grant: CORPUS_PLUGIN_PROVIDER_MANIFEST.capabilities,
      acknowledgedNetHosts: [],
      enable: true,
    }),
  ).rejects.toBeInstanceOf(PluginNotFoundError);
  expect(await root.services.plugin.list({ caller: owner })).toEqual(before.plugins);
  expect(await root.db.select().from(pluginKv)).toEqual(before.kv);
  expect(await root.db.select().from(pluginProviderClaims)).toEqual(before.claims);
  for (const provider of CORPUS_PLUGIN_PROVIDER_MANIFEST.providers ?? []) {
    expect(root.services.connection.registry.get(provider.id, stranger.id)).toBeUndefined();
  }
});
