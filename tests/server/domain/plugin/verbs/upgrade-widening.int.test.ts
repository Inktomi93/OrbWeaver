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
import { PluginReachUnacknowledgedError } from "#server/domain/plugin/contract/errors.ts";

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

/** Install the first version, consenting to everything it declares, and enable it. Left disabled, no activation has
 *  claimed its provider ids for the owner, so the connection claim cannot refuse a later definition of one. */
async function installEnabled(root: ServerTestHarness, enabled = true): Promise<Installed> {
  const who = await root.principalFor(root.ownerId);
  const installed = await root.services.plugin.install({ caller: who, bundle: makePluginBundle(manifestOf("1.0.0", {}), GUEST, root.clock.now()), grant: [] });
  if (enabled) {
    await root.services.plugin.setEnabled({ caller: who, pluginId: installed.id, enabled: true });
  }
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
  // A provider id the prior manifest never declared is new, not changed.
  expect(upgraded).toMatchObject({
    status: "disabled",
    reconsentPending: true,
    widenedProviderIds: [ADDED_ID],
    widenedChangedProviderIds: [],
    widenedMatchAutomationEvents: false,
  });

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

// The first provider under the same id with one more chat route: a definition the owner was never shown.
const REDEFINED_APIS = ["chat-completions", "responses"] as const;
const redefined = { providers: [makePluginProviderRow(PLUGIN, FIRST, { apis: [...REDEFINED_APIS] })] };

test("an upgrade that redefines an approved provider id no activation claimed waits for re-consent and withholds it until approved", {
  tags: ["slow"],
}, async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn });
  const plugin = await installEnabled(root, false);
  expect(await plugin.offered()).toEqual([]);

  const upgraded = await plugin.upgrade("1.1.0", redefined);
  expect(upgraded).toMatchObject({ status: "disabled", reconsentPending: true, widenedProviderIds: [FIRST_ID], widenedChangedProviderIds: [FIRST_ID] });

  // Enabling grants nothing: the redefined provider stays withheld, so no connection can bind the new definition.
  await root.services.plugin.setEnabled({ caller: plugin.who, pluginId: plugin.pluginId, enabled: true });
  expect(await plugin.offered()).toEqual([]);

  const consented = await plugin.approve(upgraded);
  expect(consented).toMatchObject({ status: "enabled", reconsentPending: false, widenedProviderIds: [], widenedChangedProviderIds: [] });
  const offered = (await root.services.connection.providersAvailable({ principal: plugin.who })).find(({ provider }) => provider.id === FIRST_ID);
  expect(offered?.provider.apis).toEqual(REDEFINED_APIS);
});

test("an update that redefines one provider and adds another records which is which, and a later update cannot turn a new id into a changed one", {
  tags: ["slow"],
}, async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn });
  const plugin = await installEnabled(root);

  const redefinedAndAdded = { providers: [...redefined.providers, makePluginProviderRow(PLUGIN, ADDED)] };
  const upgraded = await plugin.upgrade("1.1.0", redefinedAndAdded);
  expect(upgraded).toMatchObject({ widenedProviderIds: [FIRST_ID, ADDED_ID], widenedChangedProviderIds: [FIRST_ID] });

  // The next update redefines the id the owner has never seen, and leaves the other alone. The unanswered new id stays new
  // (the owner never saw any definition of it), and the unanswered redefinition stays changed.
  const redefinedAgain = { providers: [...redefined.providers, makePluginProviderRow(PLUGIN, ADDED, { apis: [...REDEFINED_APIS] })] };
  const carried = await plugin.upgrade("1.2.0", redefinedAgain);
  expect(carried).toMatchObject({ reconsentPending: true, widenedProviderIds: [FIRST_ID, ADDED_ID], widenedChangedProviderIds: [FIRST_ID] });

  // The record is the server's: answering the question clears both lists together.
  const approved = await plugin.approve(carried);
  expect(approved).toMatchObject({ reconsentPending: false, widenedProviderIds: [], widenedChangedProviderIds: [] });
});

test("a provider whose fixed endpoint moves is marked changed, and the row names the host its prompts now go to", { tags: ["slow"] }, async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn });
  const who = await root.principalFor(root.ownerId);
  const oldHost = "api.old.example";
  const newHost = "api.new.example";
  const hosted = (version: string, host: string): PluginManifest =>
    manifestOf(version, {
      capabilities: ["net.fetch"],
      netHosts: [host],
      providers: [makePluginProviderRow(PLUGIN, FIRST, { auth: "apiKey", baseUrl: `https://${host}/v1` })],
    });
  const installed = await root.services.plugin.install({
    caller: who,
    bundle: makePluginBundle(hosted("1.0.0", oldHost), GUEST, root.clock.now()),
    grant: ["net.fetch"],
  });
  expect(installed.providers).toEqual([{ id: FIRST_ID, label: FIRST, host: oldHost }]);

  const upgraded = await root.services.plugin.upgrade({
    caller: who,
    pluginId: installed.id,
    bundle: makePluginBundle(hosted("1.1.0", newHost), GUEST, root.clock.now()),
  });
  expect(upgraded).toMatchObject({
    reconsentPending: true,
    widenedNetHosts: [newHost],
    widenedProviderIds: [FIRST_ID],
    widenedChangedProviderIds: [FIRST_ID],
    providers: [{ id: FIRST_ID, host: newHost }],
  });
});

test("an upgrade that re-declares an approved provider unchanged, its keys spelled in another order, re-activates enabled", { tags: ["slow"] }, async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn });
  const plugin = await installEnabled(root);
  const { id, ...rest } = makePluginProviderRow(PLUGIN, FIRST);
  // Built after the schema parse, so the bundle's manifest bytes carry the id last; the definition is the same.
  const respelled = { ...manifestOf("1.0.1", {}), providers: [{ ...rest, id }] };

  const upgraded = await root.services.plugin.upgrade({
    caller: plugin.who,
    pluginId: plugin.pluginId,
    bundle: makePluginBundle(respelled, GUEST, root.clock.now()),
  });
  expect(upgraded).toMatchObject({ status: "enabled", reconsentPending: false, widenedProviderIds: [] });
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

test("a covering grant that omits the reach echo answers nothing, and the row keeps its question", { tags: ["slow"] }, async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn });
  const plugin = await installEnabled(root);
  const upgraded = await plugin.upgrade("1.1.0", { ...withAdded, matchAutomationEvents: true });
  expect(upgraded).toMatchObject({ reconsentPending: true, widenedProviderIds: [ADDED_ID], widenedMatchAutomationEvents: true });
  const echoedProviders = upgraded.providers.map(({ id }) => id);
  const unanswered = { status: "disabled", reconsentPending: true, widenedProviderIds: [ADDED_ID], widenedMatchAutomationEvents: true } as const;
  const rowOf = async (): Promise<PluginView | undefined> => (await root.services.plugin.list({ caller: plugin.who })).find(({ id }) => id === plugin.pluginId);
  const grantWith = (echo: Partial<Parameters<typeof root.services.plugin.setGrant>[0]>): Promise<PluginView> =>
    root.services.plugin.setGrant({ caller: plugin.who, pluginId: plugin.pluginId, grant: [], acknowledgedNetHosts: [], enable: true, ...echo });

  // The domain default for an absent echo is "nothing confirmed", so each missing half refuses on its own.
  await expect(grantWith({})).rejects.toThrow(PluginReachUnacknowledgedError);
  expect(await rowOf()).toMatchObject(unanswered);
  await expect(grantWith({ acknowledgedMatchAutomationEvents: true })).rejects.toThrow(PluginReachUnacknowledgedError);
  expect(await rowOf()).toMatchObject(unanswered);
  await expect(grantWith({ acknowledgedProviderIds: echoedProviders })).rejects.toThrow(PluginReachUnacknowledgedError);
  expect(await rowOf()).toMatchObject(unanswered);

  // Control: the same grant with the full echo answers the question.
  await expect(grantWith({ acknowledgedProviderIds: echoedProviders, acknowledgedMatchAutomationEvents: true })).resolves.toMatchObject({
    status: "enabled",
    reconsentPending: false,
    widenedProviderIds: [],
    widenedMatchAutomationEvents: false,
  });
});
