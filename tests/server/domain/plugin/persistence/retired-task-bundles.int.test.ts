// A plugin bundle that names a retired task: a new upload is refused at the trust edge, an installed plugin's stored
// bundle and row, written before the retirement, still reactivate with the task dropped, and a server-wide published
// bundle this build refuses (a retired task, an unserved host major) is skipped and reported while the rest of the
// published set still reaches a new user.
// @subject packages/server/src/domain/plugin/persistence/plugins.ts
// @subject packages/server/src/domain/plugin/verbs/apply-distributed-plugins.ts
// @subject packages/server/src/domain/plugin/seeder/distributed.ts

import { spawn } from "node:child_process";
import { ASSET_LIST_LIMIT_MAX } from "@orb/contracts/assets";
import type { Task } from "@orb/contracts/inference";
import { PLUGIN_PROVIDER_ID_PREFIX, RETIRED_TASKS } from "@orb/contracts/inference";
import type { PluginManifest } from "@orb/contracts/plugin";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, pluginManifestSchema } from "@orb/contracts/plugin";
import type { LogLevel } from "@orb/contracts/settings";
import { adminDistributedPlugins, assets, plugins } from "@orb/db";
import { brandedId } from "@orb/kit/ids";
import { ManifestInvalidError } from "@orb/server/domain/plugin";
import { forged } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness, makePluginBundle } from "@orb/testkit/node/composed";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";

// Each enable starts the real sandbox child process, which outlasts the default test budget.
const PLUGIN_LIFECYCLE_TIMEOUT_MS = 30_000;
const PLUGIN = "acme-plugin";
const PROVIDER = `${PLUGIN_PROVIDER_ID_PREFIX}${PLUGIN}/sdk`;
const SERVES: Task[] = ["chat", "summarize"];
const RETIRED_SERVES = ["chat", ...RETIRED_TASKS, "summarize"];
const GUEST_SOURCE = "orb.host(1);";
const LATER_PLUGIN = "later-plugin";
const UNSERVED_PLUGIN = "unserved-plugin";
// A well-formed host major past every one this build serves.
const UNSERVED_HOST_MAJOR = Math.max(...PLUGIN_HOST_VERSIONS) + 1;
const PUBLISH_GAP_MS = 60_000;
const WARN_LEVEL = "warn" satisfies LogLevel;
const LOG_SCAN_LIMIT = 200;
const refusalLogSchema = z.looseObject({ level: z.string(), userId: brandedId("UserId"), slug: z.string(), reason: z.string() });

const sdkManifest = (): PluginManifest =>
  pluginManifestSchema.parse({
    id: PLUGIN,
    name: "Acme",
    version: "1.0.0",
    hostVersion: PLUGIN_HOST_VERSIONS[0],
    entry: PLUGIN_MAIN_ENTRY,
    description: "Serves one subscription provider.",
    capabilities: ["storage.kv"],
    providers: [
      { id: PROVIDER, label: "Acme SDK", wire: "agent-sdk", auth: "oauthToken", apis: ["agent-sdk"], serves: SERVES, catalog: "url", metered: false },
    ],
  });

// A bundle authored before a task retired. The manifest type cannot spell a retired task, so `serves` is cast to feed it.
function retiredSdkManifest(): PluginManifest {
  const manifest = sdkManifest();
  return { ...manifest, providers: manifest.providers?.map((row) => ({ ...row, serves: forged<never>([...RETIRED_SERVES]) })) };
}

test("a new upload that names a retired task is refused, and an installed bundle that names one reactivates without it", {
  timeout: PLUGIN_LIFECYCLE_TIMEOUT_MS,
}, async () => {
  await using root = await createServerHarness({ startJobs: false, pluginSpawn: spawn });
  const caller = await root.principalFor(root.ownerId);
  const retired = retiredSdkManifest();
  await expect(root.services.plugin.install({ caller, bundle: makePluginBundle(retired, GUEST_SOURCE, root.clock.now()), grant: [] })).rejects.toBeInstanceOf(
    ManifestInvalidError,
  );
  expect(await root.services.plugin.list({ caller })).toEqual([]);

  // An install made before the retirement still holds its bundle and row as they were stored then.
  const installed = await root.services.plugin.install({ caller, bundle: makePluginBundle(sdkManifest(), GUEST_SOURCE, root.clock.now()), grant: [] });
  const [current] = await root.db
    .select({ mime: assets.mime })
    .from(plugins)
    .innerJoin(assets, eq(assets.id, plugins.bundleAssetId))
    .where(eq(plugins.id, installed.id));
  if (current === undefined) {
    throw new Error("the install stored no bundle asset");
  }
  const stored = await root.services.assets.store({
    principal: caller,
    bytes: makePluginBundle(retired, GUEST_SOURCE, root.clock.now()),
    kind: "plugin",
    mime: current.mime,
  });
  await root.db.run(sql`update plugins set bundle_asset_id = ${stored.assetId}, manifest = ${JSON.stringify(retired)} where id = ${installed.id}`);

  const outcome = await root.services.plugin.setGrant({ caller, pluginId: installed.id, grant: ["storage.kv"], acknowledgedNetHosts: [], enable: true });
  expect(outcome.status).toBe("enabled");
  expect(root.app.runtime.providers.registry.get(PROVIDER, root.ownerId)?.serves).toEqual(SERVES);
});

test("a published bundle this build refuses is skipped and reported, and the published set after it still reaches a new user", async () => {
  await using root = await createServerHarness({ startJobs: false, logLevel: WARN_LEVEL });
  const admin = await root.principalFor(root.ownerId);
  const later = pluginManifestSchema.parse({ ...sdkManifest(), id: LATER_PLUGIN, name: "Later", providers: undefined });
  const unserved = pluginManifestSchema.parse({ ...later, id: UNSERVED_PLUGIN, name: "Unserved" });
  // The outdated records are published first, so the apply meets both before the valid one.
  for (const manifest of [sdkManifest(), unserved, later]) {
    await root.services.plugin.installForAllUsers({ caller: admin, bundle: makePluginBundle(manifest, GUEST_SOURCE, root.clock.now()) });
    root.clock.advance(PUBLISH_GAP_MS);
  }

  // Each record as a publish made before this build stored it: bytes in the publisher's CAS that name a retired task,
  // or pin a host major this build no longer serves.
  const plantStored = async (slug: string, manifest: PluginManifest): Promise<string> => {
    const [published] = await root.db
      .select({ mime: assets.mime })
      .from(adminDistributedPlugins)
      .innerJoin(assets, eq(assets.id, adminDistributedPlugins.bundleAssetId))
      .where(eq(adminDistributedPlugins.slug, slug));
    if (published === undefined) {
      throw new Error(`the publish of ${slug} stored no bundle asset`);
    }
    const stored = await root.services.assets.store({
      principal: admin,
      bytes: makePluginBundle(manifest, GUEST_SOURCE, root.clock.now()),
      kind: "plugin",
      mime: published.mime,
    });
    await root.db.update(adminDistributedPlugins).set({ bundleAssetId: stored.assetId }).where(eq(adminDistributedPlugins.slug, slug));
    return stored.assetId;
  };
  const outdatedAssetId = await plantStored(PLUGIN, retiredSdkManifest());
  await plantStored(UNSERVED_PLUGIN, { ...unserved, hostVersion: UNSERVED_HOST_MAJOR });

  const member = await root.principalFor((await root.actor()).id);
  const application = await root.services.plugin.applyDistributedPlugins({ caller: member });
  expect(application).toEqual({
    installedSlugs: [LATER_PLUGIN],
    refused: [
      { slug: PLUGIN, reason: expect.stringMatching(/providers.+serves/s) },
      { slug: UNSERVED_PLUGIN, reason: expect.stringContaining(String(UNSERVED_HOST_MAJOR)) },
    ],
  });
  const held = await root.services.plugin.list({ caller: member });
  expect(held).toMatchObject([{ slug: LATER_PLUGIN, status: "disabled", grantedCapabilities: [], reconsentPending: true }]);
  // Nothing of the refused bundle landed for the member, and the record still points at the bytes it held.
  const memberRows = await root.db.select({ slug: plugins.slug, bundleAssetId: plugins.bundleAssetId }).from(plugins).where(eq(plugins.ownerId, member.userId));
  expect(memberRows.map((row) => row.slug)).toEqual([LATER_PLUGIN]);
  expect((await root.services.assets.listOwned({ principal: member, kind: "plugin", limit: ASSET_LIST_LIMIT_MAX })).map((row) => row.assetId)).toEqual(
    memberRows.map((row) => row.bundleAssetId),
  );
  const [record] = await root.db
    .select({ bundleAssetId: adminDistributedPlugins.bundleAssetId })
    .from(adminDistributedPlugins)
    .where(eq(adminDistributedPlugins.slug, PLUGIN));
  expect(record).toEqual({ bundleAssetId: outdatedAssetId });

  // The new-user seeder treats the refusal as a finished pass: it latches and writes the refusal to the operator log.
  await root.app.distributedPluginApplier.ensureApplied(member);
  expect((await root.services.settings.getUserSettings({ principal: member })).config.onboarding.distributedPluginsApplied).toBe(true);
  const refusals = root.observability
    .logLines(LOG_SCAN_LIMIT)
    .map((line) => refusalLogSchema.safeParse(JSON.parse(line)))
    .flatMap((parsed) => (parsed.success && parsed.data.level === WARN_LEVEL ? [parsed.data] : []));
  // The ring reads newest first; the lines are compared as a set, one per refused record.
  expect(refusals).toHaveLength(application.refused.length);
  expect(refusals).toEqual(
    expect.arrayContaining(application.refused.map(({ slug, reason }) => expect.objectContaining({ userId: member.userId, slug, reason }))),
  );
});
