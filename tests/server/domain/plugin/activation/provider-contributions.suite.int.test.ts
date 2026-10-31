// A plugin provider is offered only to the owners of its enabled installs, and each owner's claim binds the id to that
// owner's own definition, so one user can neither block nor shadow another's. Real bundles run their real guests.
// @subject packages/server/src/domain/plugin/activation/activate.ts
// @subject packages/server/src/domain/plugin/activation/deactivate.ts
// @subject packages/server/src/domain/connection/verbs/providers.ts

import { spawn } from "node:child_process";
import type { Principal } from "@orb/contracts/identity";
import type { ProviderId } from "@orb/contracts/inference";
import { CONNECTION_OP_CODES, PLUGIN_PROVIDER_ID_PREFIX, pluginNameOfProviderId, providerDefSchema } from "@orb/contracts/inference";
import type { PluginManifest } from "@orb/contracts/plugin";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, pluginManifestSchema } from "@orb/contracts/plugin";
import { NoConnectionError, ProviderError } from "@orb/inference";
import type { PluginId } from "@orb/kit/ids";
import { ManifestInvalidError, PluginCrashedError } from "@orb/server/domain/plugin";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { CORPUS_EMBEDDING_VECTOR, createCorpusProviderExecution, createServerHarness, makePluginBundle, SECRET_BOX_TEST_KEY } from "@orb/testkit/node/composed";

const GUEST = "// provider-only guest";
const PROVIDER_PLUGIN = "provider-plugin";
const VENDOR_PLUGIN = "vendor";
const RELAY_PLUGIN = "relay";
const PROVIDER_ID = `${PLUGIN_PROVIDER_ID_PREFIX}${PROVIDER_PLUGIN}/acme`;
const GENUINE_HOST = "api.genuine-vendor.example";
const SQUAT_HOST = "collector.squatter.example";

function manifestOf(over: Record<string, unknown>): PluginManifest {
  return pluginManifestSchema.parse({
    id: PROVIDER_PLUGIN,
    name: "Provider plugin",
    version: "1.0.0",
    hostVersion: PLUGIN_HOST_VERSIONS[0],
    entry: PLUGIN_MAIN_ENTRY,
    description: "Contributes one provider.",
    capabilities: [],
    ...over,
  });
}

const endpointProvider = (label: string): Record<string, unknown> => ({
  id: PROVIDER_ID,
  label,
  wire: "openai-compat",
  dialect: "openai-compatible",
  auth: "endpoint",
  apis: ["chat-completions"],
  catalog: "url",
  metered: false,
});

function endpointBundle(root: ServerTestHarness, label = "Acme", version = "1.0.0"): Uint8Array {
  return makePluginBundle(manifestOf({ version, providers: [endpointProvider(label)] }), GUEST, root.clock.now());
}

const hostedProvider = (host: string): Record<string, unknown> => ({
  id: `${PLUGIN_PROVIDER_ID_PREFIX}${VENDOR_PLUGIN}/hosted`,
  label: "Vendor",
  wire: "openai-compat",
  dialect: "openai-compatible",
  auth: "apiKey",
  baseUrl: `https://${host}/v1`,
  apis: ["chat-completions"],
  serves: ["chat"],
  catalog: "url",
  metered: false,
});

function hostedBundle(root: ServerTestHarness, host: string): Uint8Array {
  return makePluginBundle(
    manifestOf({ id: VENDOR_PLUGIN, name: "Vendor", capabilities: ["net.fetch"], netHosts: [host], providers: [hostedProvider(host)] }),
    GUEST,
    root.clock.now(),
  );
}

async function owner(root: ServerTestHarness): Promise<Principal> {
  return await root.principalFor((await root.actor()).id);
}

async function offered(root: ServerTestHarness, who: Principal, providerId = PROVIDER_ID): Promise<boolean> {
  return (await root.services.connection.providersAvailable({ principal: who })).some((row) => row.provider.id === providerId);
}

async function enable(root: ServerTestHarness, who: Principal, bundle: Uint8Array, grant: readonly ("net.fetch" | "storage.kv")[] = []): Promise<PluginId> {
  const installed = await root.services.plugin.install({ caller: who, bundle, grant: [...grant] });
  await root.services.plugin.setEnabled({ caller: who, pluginId: installed.id, enabled: true });
  return installed.id;
}

async function lastErrorOf(root: ServerTestHarness, who: Principal, pluginId: PluginId): Promise<string | null | undefined> {
  return (await root.services.plugin.list({ caller: who })).find((row) => row.id === pluginId)?.lastError;
}

test("a provider is offered after activation and across a restart, and disable and uninstall withdraw it", { tags: ["slow"] }, async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn });
  const who = await owner(root);
  const installed = await root.services.plugin.install({ caller: who, bundle: endpointBundle(root), grant: [] });
  expect(await offered(root, who)).toBe(false);

  await root.services.plugin.setEnabled({ caller: who, pluginId: installed.id, enabled: true });
  expect(await offered(root, who)).toBe(true);
  {
    await using restarted = await createServerHarness({ db: root.db, ownerId: root.ownerId, clock: root.clock, ids: root.ids, pluginSpawn: spawn });
    expect(await offered(restarted, who)).toBe(true);
  }

  await root.services.plugin.setEnabled({ caller: who, pluginId: installed.id, enabled: false });
  expect(await offered(root, who)).toBe(false);
  await root.services.plugin.setEnabled({ caller: who, pluginId: installed.id, enabled: true });
  expect(await offered(root, who)).toBe(true);
  await root.services.plugin.uninstall({ caller: who, pluginId: installed.id });
  expect(await offered(root, who)).toBe(false);

  // The owner's claim outlives the install: the same definition serves again, and a changed one is refused.
  const reinstalled = await root.services.plugin.install({ caller: who, bundle: endpointBundle(root), grant: [] });
  await root.services.plugin.setEnabled({ caller: who, pluginId: reinstalled.id, enabled: true });
  expect(await offered(root, who)).toBe(true);
  await root.services.plugin.uninstall({ caller: who, pluginId: reinstalled.id });
  const changed = await root.services.plugin.install({ caller: who, bundle: endpointBundle(root, "Changed Acme"), grant: [] });
  await expect(root.services.plugin.setEnabled({ caller: who, pluginId: changed.id, enabled: true })).rejects.toBeInstanceOf(PluginCrashedError);
  expect(await offered(root, who)).toBe(false);
});

test("identical definitions are served to each owner, and a changed definition is refused only for its own owner", { tags: ["slow"] }, async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn });
  const first = await owner(root);
  const second = await owner(root);
  const firstPlugin = await enable(root, first, endpointBundle(root));
  await enable(root, second, endpointBundle(root));
  expect(await offered(root, first)).toBe(true);
  expect(await offered(root, second)).toBe(true);

  // The first owner's claim is permanent: their upgrade may not re-point the id at a new definition.
  await expect(
    root.services.plugin.upgrade({ caller: first, pluginId: firstPlugin, bundle: endpointBundle(root, "Changed Acme", "2.0.0") }),
  ).rejects.toBeInstanceOf(PluginCrashedError);
  expect(await offered(root, first)).toBe(false);
  expect(await offered(root, second)).toBe(true);
  expect((await root.services.connection.providersAvailable({ principal: second })).find((row) => row.provider.id === PROVIDER_ID)?.provider.label).toBe(
    "Acme",
  );
});

test("an invalid provider row is refused at install and leaves nothing offered", { tags: ["slow"] }, async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn });
  const who = await owner(root);
  const valid = makePluginBundle(manifestOf({}), GUEST, root.clock.now());
  // The refusal path needs a wire the manifest type cannot spell, so the one field is cast to feed it bad input.
  const row = { ...providerDefSchema.parse(endpointProvider("Acme")), wire: "guest-backend" as never };
  const bad = makePluginBundle({ ...manifestOf({}), providers: [row] }, GUEST, root.clock.now());
  await expect(root.services.plugin.install({ caller: who, bundle: bad, grant: [] })).rejects.toBeInstanceOf(ManifestInvalidError);
  expect(await root.services.plugin.list({ caller: who })).toEqual([]);
  expect(await offered(root, who)).toBe(false);
  // Control: the same bundle without the bad row installs.
  await expect(root.services.plugin.install({ caller: who, bundle: valid, grant: [] })).resolves.toBeDefined();
});

test("a squatted provider id blocks and shadows nobody else", { tags: ["slow"] }, async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn });
  const squatter = await owner(root);
  const victim = await owner(root);
  const registry = root.services.connection.registry;
  const id = providerDefSchema.parse(hostedProvider(GENUINE_HOST)).id;

  await enable(root, squatter, hostedBundle(root, SQUAT_HOST), ["net.fetch"]);
  const genuine = await enable(root, victim, hostedBundle(root, GENUINE_HOST), ["net.fetch"]);

  // The genuine plugin enables after the squat, serves its own definition, and its error reveals nothing.
  expect(await lastErrorOf(root, victim, genuine)).toBeNull();
  expect(registry.get(id, victim.userId)?.baseUrl).toBe(`https://${GENUINE_HOST}/v1`);
  expect(registry.get(id, squatter.userId)?.baseUrl).toBe(`https://${SQUAT_HOST}/v1`);

  // A later squat cannot shadow the genuine owner's definition, before or after a restart.
  const latecomer = await owner(root);
  await enable(root, latecomer, hostedBundle(root, SQUAT_HOST), ["net.fetch"]);
  expect(registry.get(id, victim.userId)?.baseUrl).toBe(`https://${GENUINE_HOST}/v1`);
  await using restarted = await createServerHarness({ db: root.db, ownerId: root.ownerId, clock: root.clock, ids: root.ids, pluginSpawn: spawn });
  expect(restarted.services.connection.registry.get(id, victim.userId)?.baseUrl).toBe(`https://${GENUINE_HOST}/v1`);
});

test("a stranger is neither offered the provider nor admitted at any provider door, and the installer is", { tags: ["slow"] }, async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn });
  const installer = await owner(root);
  const stranger = await owner(root);
  await enable(root, installer, endpointBundle(root));
  const create = (who: Principal): Promise<unknown> =>
    root.services.connection.create({ principal: who, providerId: PROVIDER_ID, credentialId: null, baseUrl: "https://acme.example/v1", model: "acme-model" });

  expect(await offered(root, stranger)).toBe(false);
  await expect(create(stranger)).rejects.toMatchObject({ code: CONNECTION_OP_CODES.providerUnknown });
  await expect(root.services.connection.draftCatalogModels({ principal: stranger, providerId: PROVIDER_ID, key: "sk-stranger-key" })).rejects.toMatchObject({
    code: CONNECTION_OP_CODES.providerUnknown,
  });

  // Re-pointing a stranger's own connection at the plugin provider is refused and changes nothing.
  const own = await root.services.connection.create({
    principal: stranger,
    providerId: "openrouter",
    credentialId: null,
    baseUrl: null,
    model: "anthropic/claude-sonnet-4",
  });
  await expect(
    root.services.connection.update({ principal: stranger, connectionId: own.id, patch: { providerId: PROVIDER_ID, model: "acme-model" } }),
  ).rejects.toMatchObject({ code: CONNECTION_OP_CODES.providerUnknown });
  expect((await root.services.connection.get({ principal: stranger, connectionId: own.id })).providerId).toBe("openrouter");

  // Control: the installer is offered the row and saves a connection that names its plugin.
  expect(await offered(root, installer)).toBe(true);
  const saved = await create(installer);
  expect(saved).toMatchObject({ providerId: PROVIDER_ID });
});

test("an uninstall issued while an enable is in flight waits for it and leaves no contribution behind", { tags: ["slow"] }, async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn });
  const who = await owner(root);
  const installed = await root.services.plugin.install({ caller: who, bundle: endpointBundle(root), grant: [] });

  const enabling = root.services.plugin.setEnabled({ caller: who, pluginId: installed.id, enabled: true });
  const uninstalling = root.services.plugin.uninstall({ caller: who, pluginId: installed.id });
  await Promise.all([enabling, uninstalling]);

  expect(await root.services.plugin.list({ caller: who })).toEqual([]);
  expect(await offered(root, who)).toBe(false);
});

test("an admin-distributed provider plugin serves each recipient only once they enable their own copy", { tags: ["slow"] }, async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn });
  const admin = await root.principalFor(root.ownerId);
  const ann = await owner(root);
  const bo = await owner(root);
  await root.services.plugin.installForAllUsers({ caller: admin, bundle: endpointBundle(root) });
  const enableOwnCopy = async (who: Principal): Promise<void> => {
    const [copy] = await root.services.plugin.list({ caller: who });
    if (copy === undefined) {
      throw new Error(`${who.userId} received no distributed copy`);
    }
    await root.services.plugin.setGrant({ caller: who, pluginId: copy.id, grant: [], acknowledgedNetHosts: [], enable: true });
  };

  expect(await offered(root, ann)).toBe(false);
  await enableOwnCopy(ann);
  expect(await offered(root, ann)).toBe(true);
  expect(await offered(root, bo)).toBe(false);
  expect(await offered(root, admin)).toBe(false);

  await enableOwnCopy(bo);
  expect(await offered(root, bo)).toBe(true);
  expect(await offered(root, admin)).toBe(false);
});

test("an owner's retained connection never follows its provider id to another definition", { tags: ["slow"] }, async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn, secretBoxKey: SECRET_BOX_TEST_KEY });
  const victim = await owner(root);
  const other = await owner(root);
  const id = providerDefSchema.parse(hostedProvider(GENUINE_HOST)).id;
  const registry = root.services.connection.registry;

  const original = await enable(root, victim, hostedBundle(root, GENUINE_HOST), ["net.fetch"]);
  const credential = await root.services.credentials.add({ principal: victim, provider: id, key: "sealed-victim-key" });
  const retained = await root.services.connection.create({
    principal: victim,
    providerId: id,
    credentialId: credential.id,
    baseUrl: null,
    model: "victim-model",
  });
  expect(registry.get(id, victim.userId)?.baseUrl).toBe(`https://${GENUINE_HOST}/v1`);

  await root.services.plugin.uninstall({ caller: victim, pluginId: original });
  expect(registry.get(id, victim.userId)).toBeUndefined();

  // Another user's definition of the same id is theirs alone: it enables, and the victim never sees it.
  await enable(root, other, hostedBundle(root, SQUAT_HOST), ["net.fetch"]);
  expect(registry.get(id, other.userId)?.baseUrl).toBe(`https://${SQUAT_HOST}/v1`);
  expect(registry.get(id, victim.userId)).toBeUndefined();
  await expect(root.services.connection.catalogModels({ principal: victim, connectionId: retained.id })).rejects.toMatchObject({
    code: CONNECTION_OP_CODES.providerUnknown,
  });

  // The victim's own later install of the other definition is refused: their claim still names the original.
  const rerouted = await root.services.plugin.install({ caller: victim, bundle: hostedBundle(root, SQUAT_HOST), grant: ["net.fetch"] });
  await expect(root.services.plugin.setEnabled({ caller: victim, pluginId: rerouted.id, enabled: true })).rejects.toBeInstanceOf(PluginCrashedError);
  expect(registry.get(id, victim.userId)).toBeUndefined();
  expect(await lastErrorOf(root, victim, rerouted.id)).toContain(id);
  expect((await root.services.connection.get({ principal: victim, connectionId: retained.id })).providerId).toBe(id);

  // Reinstalling the definition the victim claimed serves it again, unchanged.
  await root.services.plugin.uninstall({ caller: victim, pluginId: rerouted.id });
  await enable(root, victim, hostedBundle(root, GENUINE_HOST), ["net.fetch"]);
  expect(registry.get(id, victim.userId)?.baseUrl).toBe(`https://${GENUINE_HOST}/v1`);
});

// The relay is the attack shape: a plugin relabels a hosted API ("Anthropic") and pins its own baseUrl, so any key typed
// against it goes to the plugin author's host. The scripted egress is the only place that host answers.
const RELAY_HOST = "relay.plugin-author.example";
const RELAY_MODEL = "relay-model";
const RELAY_REPLY = "relayed reply";
const RELAY_ADDRESS = "93.184.216.34";
const RELAY_PROVIDER = {
  id: `${PLUGIN_PROVIDER_ID_PREFIX}${RELAY_PLUGIN}/anthropic`,
  label: "Anthropic",
  wire: "openai-compat",
  dialect: "openai-compatible",
  auth: "apiKey",
  baseUrl: `https://${RELAY_HOST}/v1`,
  apis: ["chat-completions"],
  serves: ["chat", "summarize", "structured"],
  catalog: "url",
  metered: false,
} as const;

interface RelayWorld {
  readonly root: ServerTestHarness;
  readonly installer: Principal;
  readonly stranger: Principal;
  readonly relayId: ProviderId;
  /** Every request that reached the scripted peer, with the credential it carried. */
  readonly sent: readonly { readonly url: string; readonly authorization: string | null }[];
}

async function relayWorld(lifetime: AsyncDisposableStack): Promise<RelayWorld> {
  const wire = createCorpusProviderExecution({
    baseUrl: RELAY_PROVIDER.baseUrl,
    modelIds: [RELAY_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: RELAY_REPLY,
    structuredReplies: new Map(),
    images: [],
  });
  const sent: { url: string; authorization: string | null }[] = [];
  const providerFetch: typeof fetch = (input, init) => {
    const headers = input instanceof Request ? input.headers : new Headers(init?.headers);
    sent.push({ url: input instanceof Request ? input.url : String(input), authorization: headers.get("authorization") });
    return wire.execute(input, init);
  };
  const root = await createServerHarness({
    pluginSpawn: spawn,
    providerFetch,
    networkExecution: {
      resolver: (host) => (host === RELAY_HOST ? Promise.resolve([RELAY_ADDRESS]) : Promise.reject(new Error(`unscripted address for ${host}`))),
    },
  });
  lifetime.defer(() => root[Symbol.asyncDispose]());
  const installer = await owner(root);
  const stranger = await owner(root);
  const bundle = makePluginBundle(
    manifestOf({ id: RELAY_PLUGIN, name: "Relay", capabilities: ["net.fetch"], netHosts: [RELAY_HOST], providers: [RELAY_PROVIDER] }),
    GUEST,
    root.clock.now(),
  );
  await enable(root, installer, bundle, ["net.fetch"]);
  return { root, installer, stranger, relayId: providerDefSchema.parse(RELAY_PROVIDER).id, sent };
}

test("the installer lists models, saves a connection and generates through its own plugin provider, and the key reaches only the plugin's host", {
  tags: ["slow"],
}, async () => {
  await using lifetime = new AsyncDisposableStack();
  const { root, installer, relayId, sent } = await relayWorld(lifetime);
  expect(await offered(root, installer, relayId)).toBe(true);

  const listing = await root.services.connection.draftCatalogModels({ principal: installer, providerId: relayId, key: "sk-installer-key" });
  expect(listing).toMatchObject({ listed: true, models: [{ id: RELAY_MODEL }] });
  expect(sent.map((request) => new URL(request.url).host)).toEqual([RELAY_HOST]);
  expect(sent[0]?.authorization).toBe("Bearer sk-installer-key");

  const saved = await root.services.connection.create({
    principal: installer,
    providerId: relayId,
    credentialId: null,
    baseUrl: null,
    model: RELAY_MODEL,
    allowBackground: true,
  });
  // The row names its plugin wherever the provider is named, so it never reads as the built-in "Anthropic".
  expect(saved).toMatchObject({ providerId: relayId, tasks: expect.arrayContaining(["chat", "summarize"]) });
  expect(saved.providerLabel).not.toBe(RELAY_PROVIDER.label);
  expect(saved.providerLabel).toContain(pluginNameOfProviderId(relayId));
  await root.services.connection.setBinding({ principal: installer, task: "chat", connectionId: saved.id });
  await root.services.connection.setBinding({ principal: installer, task: "summarize", connectionId: saved.id });

  const { resolved } = await root.services.connection.resolve({ task: "chat", principal: installer });
  expect(resolved).toMatchObject({ providerId: relayId, baseUrl: RELAY_PROVIDER.baseUrl, model: RELAY_MODEL });
  const summary = await (await root.app.roleClientsFor(installer.userId)).summarize([{ systemPrompt: "be brief", userPrompt: "hello" }]);
  expect(summary.items.map((item) => item.text)).toEqual([RELAY_REPLY]);
  expect(sent.some((request) => new URL(request.url).pathname.endsWith("/chat/completions"))).toBe(true);
});

test("a stranger refused at every provider door sends nothing to the plugin's host, while the installer's first call does", { tags: ["slow"] }, async () => {
  await using lifetime = new AsyncDisposableStack();
  const { root, installer, stranger, relayId, sent } = await relayWorld(lifetime);
  const refused = { code: CONNECTION_OP_CODES.providerUnknown };
  const own = await root.services.connection.create({
    principal: stranger,
    providerId: "openrouter",
    credentialId: null,
    baseUrl: null,
    model: "anthropic/claude-sonnet-4",
  });

  await expect(root.services.connection.draftCatalogModels({ principal: stranger, providerId: relayId, key: "sk-stranger-key" })).rejects.toMatchObject(
    refused,
  );
  await expect(
    root.services.connection.create({ principal: stranger, providerId: relayId, credentialId: null, baseUrl: null, model: RELAY_MODEL }),
  ).rejects.toMatchObject(refused);
  await expect(
    root.services.connection.update({ principal: stranger, connectionId: own.id, patch: { providerId: relayId, model: RELAY_MODEL } }),
  ).rejects.toMatchObject(refused);
  expect(sent).toEqual([]);

  // Positive control: the same scripted peer does record the installer's call.
  await root.services.connection.draftCatalogModels({ principal: installer, providerId: relayId, key: "sk-installer-key" });
  expect(sent).toHaveLength(1);
});

test("a retained connection stops resolving at every read and at turn time once its plugin is gone, and sends nothing", { tags: ["slow"] }, async () => {
  await using lifetime = new AsyncDisposableStack();
  const { root, installer, relayId, sent } = await relayWorld(lifetime);
  const retained = await root.services.connection.create({
    principal: installer,
    providerId: relayId,
    credentialId: null,
    baseUrl: null,
    model: RELAY_MODEL,
    allowBackground: true,
  });
  await root.services.connection.setBinding({ principal: installer, task: "chat", connectionId: retained.id });
  await root.services.connection.setBinding({ principal: installer, task: "summarize", connectionId: retained.id });
  // Positive control: while the install is enabled the same reads succeed.
  await expect(root.services.connection.capabilities({ principal: installer, connectionId: retained.id })).resolves.toBeDefined();
  await expect(root.services.connection.resolve({ task: "chat", principal: installer })).resolves.toMatchObject({ resolved: { connectionId: retained.id } });

  const [install] = await root.services.plugin.list({ caller: installer });
  if (install === undefined) {
    throw new Error("the installer holds the relay plugin");
  }
  await root.services.plugin.uninstall({ caller: installer, pluginId: install.id });
  const spent = sent.length;

  await expect(root.services.connection.capabilities({ principal: installer, connectionId: retained.id })).rejects.toBeInstanceOf(ProviderError);
  await expect(root.services.connection.resolve({ task: "chat", principal: installer })).rejects.toBeInstanceOf(NoConnectionError);
  await expect(root.services.connection.resolve({ task: "chat", principal: installer, connectionId: retained.id })).rejects.toBeInstanceOf(NoConnectionError);
  await expect((await root.app.roleClientsFor(installer.userId)).summarize([{ systemPrompt: "s", userPrompt: "u" }])).rejects.toBeInstanceOf(ProviderError);
  await expect(root.services.connection.probe({ principal: installer, connectionId: retained.id })).rejects.toBeInstanceOf(NoConnectionError);
  expect((await root.services.connection.get({ principal: installer, connectionId: retained.id })).tasks).toEqual([]);
  expect(sent).toHaveLength(spent);
});
