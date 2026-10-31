// A plugin bundle that names a retired task: a new upload is refused at the trust edge, and an installed plugin's stored
// bundle and row, written before the retirement, still reactivate with the task dropped.
// @subject packages/server/src/domain/plugin/persistence/plugins.ts

import { spawn } from "node:child_process";
import type { Task } from "@orb/contracts/inference";
import { PLUGIN_PROVIDER_ID_PREFIX, RETIRED_TASKS } from "@orb/contracts/inference";
import type { PluginManifest } from "@orb/contracts/plugin";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, pluginManifestSchema } from "@orb/contracts/plugin";
import { assets, plugins } from "@orb/db";
import { ManifestInvalidError } from "@orb/server/domain/plugin";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness, makePluginBundle } from "@orb/testkit/node/composed";
import { eq, sql } from "drizzle-orm";

// Each enable starts the real sandbox child process, which outlasts the default test budget.
const PLUGIN_LIFECYCLE_TIMEOUT_MS = 30_000;
const PLUGIN = "acme-plugin";
const PROVIDER = `${PLUGIN_PROVIDER_ID_PREFIX}${PLUGIN}/sdk`;
const SERVES: Task[] = ["chat", "summarize"];
const RETIRED_SERVES = ["chat", ...RETIRED_TASKS, "summarize"];
const GUEST_SOURCE = "orb.host(1);";

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
  return { ...manifest, providers: manifest.providers?.map((row) => ({ ...row, serves: [...RETIRED_SERVES] as never })) };
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
