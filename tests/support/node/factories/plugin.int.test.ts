// @subject tests/support/node/factories/plugin.ts

import { spawn } from "node:child_process";
import { pluginKv, pluginProviderClaims } from "@orb/db";
import { ID_PREFIX } from "@orb/kit/ids";
import { PluginNotFoundError } from "@orb/server/domain/plugin";
import { makeAssetBytes } from "@orb/testkit/node/factories/asset.ts";
import { seedDistributedPlugin, seedInstalledPlugin, seedPluginGrant } from "@orb/testkit/node/factories/plugin.ts";
import { seedAdminProvider, seedPluginProviders } from "@orb/testkit/node/factories/provider.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { createServerHarness } from "@orb/testkit/node/server.ts";
import { and, eq, inArray } from "drizzle-orm";
import {
  CORPUS_PLUGIN_ASSET_PATH as ASSET_PATH,
  corpusPluginBundle as bundle,
  CORPUS_ADMIN_PROVIDER,
  CORPUS_PLUGIN_PROVIDER_MANIFEST,
  CORPUS_PLUGIN_MANIFEST as MANIFEST,
  CORPUS_PLUGIN_STORAGE_KEY as STORAGE_KEY,
  CORPUS_PLUGIN_STORAGE_VALUE as STORAGE_VALUE,
} from "../corpus-plugin.ts";

test("real install retains bundle assets and guest activation writes only the consenting owner's private KV", async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn });
  const caller = await root.principalFor(root.ownerId);
  const image = makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset));
  const installed = await seedInstalledPlugin(root.db, root.services.plugin.install, { caller, bundle: bundle(image), grant: [] });
  expect(installed.plugin.id).toBe(installed.outcome.id);
  expect(installed.plugin.status).toBe("disabled");
  expect(installed.kv).toEqual([]);
  expect(installed.assets.map((row) => [row.pluginId, row.bundlePath])).toEqual([[installed.outcome.id, ASSET_PATH]]);
  const link = installed.assets[0];
  if (link === undefined) {
    throw new Error("the actual installed bundle produced no asset link");
  }
  expect(Array.from((await root.app.assets.readOwnedAssetBytes(caller, link.assetId)).bytes)).toEqual(Array.from(image));
  const enabled = await seedPluginGrant(root.db, root.services.plugin.setGrant, {
    caller,
    pluginId: installed.plugin.id,
    grant: MANIFEST.capabilities,
    acknowledgedNetHosts: [],
    enable: true,
  });
  expect(enabled.outcome.status).toBe("enabled");
  expect(enabled.kv.map((row) => [row.pluginId, row.ownerId, row.key, row.value])).toEqual([[installed.plugin.id, caller.userId, STORAGE_KEY, STORAGE_VALUE]]);
  const other = await root.actor();
  const before = await root.db.select().from(pluginKv);
  await expect(
    seedPluginGrant(root.db, root.services.plugin.setGrant, {
      caller: await root.principalFor(other.id),
      pluginId: installed.plugin.id,
      grant: MANIFEST.capabilities,
      acknowledgedNetHosts: [],
      enable: true,
    }),
  ).rejects.toBeInstanceOf(PluginNotFoundError);
  expect(await root.db.select().from(pluginKv)).toEqual(before);
});

test("actual plugin activation captures the manifest's precise provider claim and disable leaves the production tombstone", async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn });
  const caller = await root.principalFor(root.ownerId);
  const manifest = CORPUS_PLUGIN_PROVIDER_MANIFEST;
  const installed = await seedInstalledPlugin(root.db, root.services.plugin.install, {
    caller,
    bundle: bundle(makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset)), manifest),
    grant: [],
  });
  const captured = await seedPluginProviders(
    root.db,
    root.services.plugin.setGrant,
    { caller, pluginId: installed.plugin.id, grant: manifest.capabilities, acknowledgedNetHosts: [], enable: true },
    (manifest.providers ?? []).map((provider) => provider.id),
  );
  expect(
    captured.map(({ claim, definition }) => [
      claim.ownerId,
      claim.pluginId,
      claim.providerId,
      definition.id,
      claim.definitionHash === definition.definitionHash,
    ]),
  ).toEqual((manifest.providers ?? []).map((provider) => [caller.userId, installed.plugin.id, provider.id, provider.id, true]));
  expect(captured).toHaveLength(1);
  await root.services.plugin.setEnabled({ caller, pluginId: installed.plugin.id, enabled: false });
  const tombstones = await root.db
    .select()
    .from(pluginProviderClaims)
    .where(
      and(
        eq(pluginProviderClaims.ownerId, caller.userId),
        inArray(
          pluginProviderClaims.providerId,
          captured.map(({ claim }) => claim.providerId),
        ),
      ),
    );
  expect(tombstones.map((row) => [row.providerId, row.pluginId, row.definitionHash])).toEqual(
    captured.map(({ claim }) => [claim.providerId, null, claim.definitionHash]),
  );
});

test("admin registry capture retains the actual normalized provider definition and admin origin", async () => {
  await using root = await createServerHarness();
  const definition = CORPUS_ADMIN_PROVIDER;
  const row = await seedAdminProvider(root.db, root.services.connection.registry.register, definition, { admin: root.ownerId });
  expect(row.id).toBe(definition.id);
  expect(row.originKind).toBe("admin");
  expect(row.originUserId).toBe(root.ownerId);
  expect(row.definitionHash).not.toBe("");
  expect(root.services.connection.registry.get(definition.id, root.ownerId)).toEqual(definition);
});

test("real distribution leaves each owner disabled and ungranted until their own activation, and repeat publication reports actual skips", async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn });
  const caller = await root.principalFor(root.ownerId);
  const other = await root.actor();
  const bytes = bundle(makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset)));
  const distributed = await seedDistributedPlugin(root.db, root.services.plugin.installForAllUsers, { caller, bundle: bytes });
  expect(distributed.distribution.slug).toBe(distributed.outcome.slug);
  expect(distributed.distribution.distributedBy).toBe(caller.userId);
  expect(distributed.outcome.applied).toBe(2);
  expect(distributed.outcome.skipped).toEqual([]);
  expect(distributed.installs.map(({ plugin }) => plugin.ownerId).toSorted()).toEqual([caller.userId, other.id].toSorted());
  for (const install of distributed.installs) {
    expect(install.plugin.status).toBe("disabled");
    expect(install.plugin.grantedCapabilities).toEqual([]);
    expect(install.plugin.pendingReconsent).toBe(true);
    expect(install.kv).toEqual([]);
    expect(install.assets.map((row) => row.bundlePath)).toEqual([ASSET_PATH]);
  }
  expect(new Set(distributed.installs.map(({ plugin }) => plugin.bundleAssetId)).size).toBe(2);
  const recipient = distributed.installs.find(({ plugin }) => plugin.ownerId === other.id);
  if (recipient === undefined) {
    throw new Error("the actual distribution omitted the existing recipient");
  }
  const enabled = await seedPluginGrant(root.db, root.services.plugin.setGrant, {
    caller: await root.principalFor(other.id),
    pluginId: recipient.plugin.id,
    grant: MANIFEST.capabilities,
    acknowledgedNetHosts: [],
    enable: true,
  });
  expect(enabled.outcome.status).toBe("enabled");
  expect(enabled.kv.map((row) => [row.ownerId, row.key, row.value])).toEqual([[other.id, STORAGE_KEY, STORAGE_VALUE]]);
  const repeated = await seedDistributedPlugin(root.db, root.services.plugin.installForAllUsers, { caller, bundle: bytes });
  expect(repeated.outcome.applied).toBe(0);
  expect(repeated.outcome.skipped.map((row) => [row.userId, row.reason]).toSorted(([left], [right]) => String(left).localeCompare(String(right)))).toEqual(
    [
      [caller.userId, "already-installed"],
      [other.id, "already-installed"],
    ].toSorted(([left], [right]) => String(left).localeCompare(String(right))),
  );
  expect(repeated.installs.find(({ plugin }) => plugin.ownerId === other.id)?.plugin.status).toBe("enabled");
  expect(repeated.installs.find(({ plugin }) => plugin.ownerId === caller.userId)?.plugin.status).toBe("disabled");
});
