// An upgrade that adds a provider id or turns `matchAutomationEvents` on widens the plugin's reach with the grant
// unchanged, so it lands disabled and waits for re-consent; a re-enable withholds the unanswered provider, a covering
// grant offers it, and a follow-up bundle that declares the same widening again cannot erase the question. A twin
// upgrade that changes neither re-activates as before. A covering grant answers only the reach its card echoed, so a
// card rendered before a later upgrade cannot approve what that upgrade added.
// @subject packages/server/src/domain/plugin/verbs/upgrade.ts
// @subject packages/server/src/domain/plugin/verbs/set-grant.ts
import { spawn } from "node:child_process";
import type { Principal } from "@orb/contracts/identity";
import type { PluginManifest, PluginView } from "@orb/contracts/plugin";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, pluginManifestSchema } from "@orb/contracts/plugin";
import { DomainOperationError } from "@orb/kit/errors";
import type { PluginId } from "@orb/kit/ids";
import { makePluginProviderRow, pluginProviderId } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, makePluginBundle } from "@orb/testkit/node/composed";

const GUEST = "// provider-only guest";
const PLUGIN = "widening-plugin";
const FIRST = "acme";
const ADDED = "beta";
const LATER = "gamma";
const FIRST_ID = pluginProviderId(PLUGIN, FIRST);
const ADDED_ID = pluginProviderId(PLUGIN, ADDED);
const LATER_ID = pluginProviderId(PLUGIN, LATER);
const DECLARABLE_IDS: ReadonlySet<string> = new Set([FIRST_ID, ADDED_ID, LATER_ID]);
const AUTOMATION_OPT_IN = "matchAutomationEvents" satisfies keyof PluginManifest;

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
  /** Approve the whole ask from a consent card, echoing the reach that card displayed. */
  readonly approve: (card: PluginView) => Promise<PluginView>;
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
    approve: (card) =>
      root.services.plugin.setGrant({
        caller: who,
        pluginId: installed.id,
        grant: [],
        acknowledgedNetHosts: [],
        acknowledgedProviderIds: card.providers.map(({ id }) => id),
        acknowledgedMatchAutomationEvents: card.matchAutomationEvents,
        enable: true,
      }),
    offered: async () =>
      (await root.services.connection.providersAvailable({ principal: who })).map(({ provider }) => provider.id).filter((id) => DECLARABLE_IDS.has(id)),
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

  const consented = await plugin.approve(upgraded);
  expect(consented).toMatchObject({ status: "enabled", reconsentPending: false, widenedProviderIds: [] });
  expect(new Set(await plugin.offered())).toEqual(new Set([FIRST_ID, ADDED_ID]));
});

test("an upgrade turning matchAutomationEvents on waits for re-consent, and a covering grant answers it", { tags: ["slow"] }, async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn });
  const plugin = await installEnabled(root);

  const upgraded = await plugin.upgrade("1.1.0", { matchAutomationEvents: true });
  expect(upgraded).toMatchObject({ status: "disabled", reconsentPending: true, widenedMatchAutomationEvents: true, widenedProviderIds: [] });

  const consented = await plugin.approve(upgraded);
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

test("a card rendered before a later upgrade cannot approve the provider and opt-in that upgrade added", { tags: ["slow"] }, async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn });
  const plugin = await installEnabled(root);

  const stale = await plugin.upgrade("1.1.0", withAdded);
  const current = await plugin.upgrade("1.2.0", {
    providers: [...withAdded.providers, makePluginProviderRow(PLUGIN, LATER)],
    matchAutomationEvents: true,
  });

  const refused: unknown = await plugin.approve(stale).then(
    () => null,
    (err: unknown) => err,
  );
  expect(refused).toBeInstanceOf(DomainOperationError);
  expect(refused).toMatchObject({ message: expect.stringContaining(LATER_ID) });
  expect(refused).toMatchObject({ message: expect.stringContaining(AUTOMATION_OPT_IN) });
  // The refusal writes nothing: the row still waits on the same question, and the added providers stay withheld.
  const [row] = (await root.services.plugin.list({ caller: plugin.who })).filter(({ id }) => id === plugin.pluginId);
  expect(row).toMatchObject({ reconsentPending: true, widenedProviderIds: expect.arrayContaining([ADDED_ID, LATER_ID]), widenedMatchAutomationEvents: true });
  await root.services.plugin.setEnabled({ caller: plugin.who, pluginId: plugin.pluginId, enabled: true });
  expect(await plugin.offered()).toEqual([FIRST_ID]);

  const approved = await plugin.approve(current);
  expect(approved).toMatchObject({ status: "enabled", reconsentPending: false, widenedProviderIds: [], widenedMatchAutomationEvents: false });
  expect(new Set(await plugin.offered())).toEqual(new Set([FIRST_ID, ADDED_ID, LATER_ID]));
});
