// Storage is the subject: a plugin that auto-disables as `errored` but dies before its provider teardown leaves its
// claim linked to the install; the next boot unlinks that claim and keeps the owner's definition.
// @subject packages/server/src/domain/plugin/activation/crash-policy.ts
// @subject packages/server/src/domain/connection/persistence/provider-rows.ts

import { spawn } from "node:child_process";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, pluginManifestSchema } from "@orb/contracts/plugin";
import { pluginProviderClaims, providerRows } from "@orb/db";
import { PLUGIN_CRASH_DISABLE_THRESHOLD } from "@orb/server/domain/plugin";
import { makePluginProviderRow, pluginProviderId } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness, makePluginBundle, refuseWrites } from "@orb/testkit/node/composed";
import { count, isNotNull } from "drizzle-orm";

const PLUGIN = "provider-plugin";
const PROVIDER_ID = pluginProviderId(PLUGIN, "acme");
const TEARDOWN_REFUSAL = "the process died before the provider claim was unlinked";

function bundle(clock: number): Uint8Array {
  const manifest = pluginManifestSchema.parse({
    id: PLUGIN,
    name: "Provider plugin",
    version: "1.0.0",
    hostVersion: PLUGIN_HOST_VERSIONS[0],
    entry: PLUGIN_MAIN_ENTRY,
    description: "Contributes one provider.",
    capabilities: [],
    providers: [makePluginProviderRow(PLUGIN, "acme", { label: "Acme" })],
  });
  return makePluginBundle(manifest, "// provider-only guest", clock);
}

test("a boot after a crash-window auto-disable unlinks the errored install's claim and keeps the owner's definition", { tags: ["slow"] }, async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn });
  const who = await root.principalFor((await root.actor()).id);
  const installed = await root.services.plugin.install({ caller: who, bundle: bundle(root.clock.now()), grant: [] });
  await root.services.plugin.setEnabled({ caller: who, pluginId: installed.id, enabled: true });
  const linked = async (): Promise<number> =>
    (await root.db.select({ n: count() }).from(pluginProviderClaims).where(isNotNull(pluginProviderClaims.pluginId)))[0]?.n ?? 0;
  expect(await linked()).toBe(1);

  // The crash window: the install is committed `errored`, then teardown is refused before the claim is unlinked.
  const crash = (): Promise<void> => root.services.plugin.reportUiCrash({ caller: who, pluginId: installed.id, surfaceId: "main", reason: "the surface died" });
  for (let strike = 1; strike < PLUGIN_CRASH_DISABLE_THRESHOLD; strike += 1) {
    await crash();
  }
  await using fault = await refuseWrites(root.db, {
    table: pluginProviderClaims,
    event: "UPDATE",
    columns: [pluginProviderClaims.pluginId],
    message: TEARDOWN_REFUSAL,
  });
  await expect(crash()).rejects.toMatchObject({ cause: expect.objectContaining({ message: expect.stringContaining(TEARDOWN_REFUSAL) }) });
  expect((await root.services.plugin.list({ caller: who })).find((row) => row.id === installed.id)?.status).toBe("errored");
  expect(await linked()).toBe(1);
  await fault.lift();

  await using restarted = await createServerHarness({ db: root.db, ownerId: root.ownerId, clock: root.clock, ids: root.ids, pluginSpawn: spawn });
  const offered = (await restarted.services.connection.providersAvailable({ principal: who })).some((row) => row.provider.id === PROVIDER_ID);
  expect(offered).toBe(false);
  expect(await linked()).toBe(0);
  // The owner's claim and definition outlive the unlink as a tombstone.
  expect(await root.db.select({ n: count() }).from(pluginProviderClaims)).toEqual([{ n: 1 }]);
  expect(await root.db.select({ n: count() }).from(providerRows)).toEqual([{ n: 1 }]);
});
