// An upgrade that adds a provider id or turns `matchAutomationEvents` on widens the plugin's reach with the grant
// unchanged, so it lands disabled and waits for re-consent; a re-enable withholds the unanswered provider, a covering
// grant offers it, and a follow-up bundle that declares the same widening again cannot erase the question. A twin
// upgrade that changes neither re-activates as before.
// @subject packages/server/src/domain/plugin/verbs/upgrade.ts
import { spawn } from "node:child_process";
import type { Principal } from "@orb/contracts/identity";
import type { PluginManifest, PluginView } from "@orb/contracts/plugin";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, pluginManifestSchema } from "@orb/contracts/plugin";
import type { PluginId } from "@orb/kit/ids";
import { makePluginProviderRow, pluginProviderId } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, makePluginBundle } from "@orb/testkit/node/composed";

const GUEST = "// provider-only guest";
const PLUGIN = "widening-plugin";
const FIRST = "acme";
const ADDED = "beta";
const FIRST_ID = pluginProviderId(PLUGIN, FIRST);
const ADDED_ID = pluginProviderId(PLUGIN, ADDED);

function manifestOf(version: string, over: Partial<PluginManifest>): PluginManifest {
  return pluginManifestSchema.parse({
    id: PLUGIN,
    name: "Widening plugin",
    version,
    hostVersion: PLUGIN_HOST_VERSIONS[0],
    entry: PLUGIN_MAIN_ENTRY,
    description: "Declares providers and the automation opt-in.",
    capabilities: [],
    providers: [makePluginProviderRow(PLUGIN, FIRST)],
    ...over,
  });
}

const withAdded = { providers: [makePluginProviderRow(PLUGIN, FIRST), makePluginProviderRow(PLUGIN, ADDED)] };

interface Installed {
  readonly who: Principal;
  readonly pluginId: PluginId;
  readonly upgrade: (version: string, over: Partial<PluginManifest>) => Promise<PluginView>;
  readonly offered: () => Promise<readonly string[]>;
}

/** Install and enable the first version, consenting to everything it declares. */
async function installEnabled(root: ServerTestHarness): Promise<Installed> {
  const who = await root.principalFor(root.ownerId);
  const installed = await root.services.plugin.install({ caller: who, bundle: makePluginBundle(manifestOf("1.0.0", {}), GUEST, root.clock.now()), grant: [] });
  await root.services.plugin.setEnabled({ caller: who, pluginId: installed.id, enabled: true });
  return {
    who,
    pluginId: installed.id,
    upgrade: (version, over) =>
      root.services.plugin.upgrade({ caller: who, pluginId: installed.id, bundle: makePluginBundle(manifestOf(version, over), GUEST, root.clock.now()) }),
    offered: async () =>
      (await root.services.connection.providersAvailable({ principal: who }))
        .map(({ provider }) => provider.id)
        .filter((id) => id === FIRST_ID || id === ADDED_ID),
  };
}

test("an upgrade adding a provider id waits for re-consent, a re-enable withholds it, and a covering grant offers it", { tags: ["slow"] }, async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn });
  const plugin = await installEnabled(root);
  expect(await plugin.offered()).toEqual([FIRST_ID]);

  const upgraded = await plugin.upgrade("1.1.0", withAdded);
  expect(upgraded).toMatchObject({ status: "disabled", reconsentPending: true, widenedProviderIds: [ADDED_ID], widenedMatchAutomationEvents: false });

  // Enabling grants nothing: the consented provider runs again, the unanswered one stays withheld.
  await root.services.plugin.setEnabled({ caller: plugin.who, pluginId: plugin.pluginId, enabled: true });
  expect(await plugin.offered()).toEqual([FIRST_ID]);

  const consented = await root.services.plugin.setGrant({ caller: plugin.who, pluginId: plugin.pluginId, grant: [], acknowledgedNetHosts: [], enable: true });
  expect(consented).toMatchObject({ status: "enabled", reconsentPending: false, widenedProviderIds: [] });
  expect(new Set(await plugin.offered())).toEqual(new Set([FIRST_ID, ADDED_ID]));
});

test("an upgrade turning matchAutomationEvents on waits for re-consent, and a covering grant answers it", { tags: ["slow"] }, async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn });
  const plugin = await installEnabled(root);

  const upgraded = await plugin.upgrade("1.1.0", { matchAutomationEvents: true });
  expect(upgraded).toMatchObject({ status: "disabled", reconsentPending: true, widenedMatchAutomationEvents: true, widenedProviderIds: [] });

  const consented = await root.services.plugin.setGrant({ caller: plugin.who, pluginId: plugin.pluginId, grant: [], acknowledgedNetHosts: [], enable: true });
  expect(consented).toMatchObject({ status: "enabled", reconsentPending: false, matchAutomationEvents: true, widenedMatchAutomationEvents: false });
});

test("a follow-up upgrade that declares the same widening again keeps the question open", { tags: ["slow"] }, async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn });
  const plugin = await installEnabled(root);

  await plugin.upgrade("1.1.0", { ...withAdded, matchAutomationEvents: true });
  const repeated = await plugin.upgrade("1.2.0", { ...withAdded, matchAutomationEvents: true });
  expect(repeated).toMatchObject({ status: "disabled", reconsentPending: true, widenedProviderIds: [ADDED_ID], widenedMatchAutomationEvents: true });
});

test("a twin upgrade that adds no provider and keeps the automation opt-in re-activates enabled", { tags: ["slow"] }, async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn });
  const plugin = await installEnabled(root);

  const upgraded = await plugin.upgrade("1.0.1", {});
  expect(upgraded).toMatchObject({ status: "enabled", reconsentPending: false, widenedProviderIds: [], widenedMatchAutomationEvents: false });
  expect(await plugin.offered()).toEqual([FIRST_ID]);
});
