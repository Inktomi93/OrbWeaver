// End-to-end lifecycle suite for manifest provider contributions: the real plugin service drives the real
// connection registry/store over one DB. A provider is discoverable only after authoritative activation and
// only by the owners of its enabled installs (D147); each owner's claim binds the id to that owner's own
// definition (D265), so one user can neither block nor shadow another's; restart reloads durable rows.

import type { Principal } from "@orb/contracts/identity";
import type { ProviderDef, ProviderId } from "@orb/contracts/inference";
import { CONNECTION_OP_CODES } from "@orb/contracts/inference";
import type { Db } from "@orb/db";
import { pluginProviderClaims, plugins, providerRows, userConnections, userCredentials } from "@orb/db";
import { NoConnectionError } from "@orb/inference";
import type { ConnectionBindingId, Handle, PluginId, UserConnectionId, UserCredentialId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { PLUGIN_CRASH_DISABLE_THRESHOLD, PluginCrashedError } from "@orb/server/domain/plugin";
import { count, eq, isNotNull } from "drizzle-orm";
import { describe } from "vitest";
import { upsertBinding } from "../../../../../packages/server/src/domain/connection/persistence/bindings.ts";
import { createCrashPolicy } from "../../../../../packages/server/src/domain/plugin/activation/crash-policy.ts";
import { createPluginLifecycleLanes } from "../../../../../packages/server/src/domain/plugin/substrate/lifecycle-lanes.ts";
import { FROZEN_AT_MS } from "../../../../support/clock.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { testModelId } from "../../../../support/inference-identities.ts";
import { makeHarness as makeConnectionHarness } from "../../connection/_support.ts";
import { makeBundle, makePluginHarness, ownerPrincipalFor, principalFor, seedUser } from "../_support.ts";

const PROVIDER: ProviderDef = {
  id: castId<ProviderId>("plugin:provider-plugin/acme"),
  label: "Acme",
  wire: "openai-compat",
  dialect: "openai-compatible",
  auth: "endpoint",
  apis: ["chat-completions"],
  catalog: "url",
  metered: false,
};

/** Claims an enabled install currently serves; a tombstone (NULL plugin) is not counted. */
async function linkedClaims(db: Db): Promise<number> {
  const [row] = await db.select({ n: count() }).from(pluginProviderClaims).where(isNotNull(pluginProviderClaims.pluginId));
  return row?.n ?? 0;
}

async function lastErrorOf(db: Db, pluginId: PluginId): Promise<string | null | undefined> {
  const [row] = await db.select({ lastError: plugins.lastError }).from(plugins).where(eq(plugins.id, pluginId));
  return row?.lastError;
}

test("valid activation is discoverable across restart; disable and uninstall clean the last active contribution", async () => {
  const db = await freshDb();
  const connection = await makeConnectionHarness(db);
  const plugin = makePluginHarness(db, {
    providers: {
      activate: (rows, origin) => connection.svc.registerPluginProviders({ rows, pluginId: origin.pluginId, pluginName: origin.pluginName }),
      deactivate: (pluginId) => connection.svc.dropPluginProviders({ pluginId }),
    },
  });
  const owner = await seedUser(db, { handle: castId<Handle>("provider-owner") });
  const caller = ownerPrincipalFor(owner);
  const installed = await plugin.service.install({ caller, bundle: makeBundle({ id: "provider-plugin", providers: [PROVIDER] }), grant: [] });
  const provider = async (harness: typeof connection): Promise<unknown> =>
    (await harness.svc.providersAvailable({ principal: caller })).find((row) => row.provider.id === PROVIDER.id);

  expect(await provider(connection)).toBeUndefined();
  await plugin.service.setEnabled({ caller, pluginId: installed.id, enabled: true });
  expect(await provider(connection)).toMatchObject({ provider: { id: PROVIDER.id, label: PROVIDER.label } });
  const restarted = await makeConnectionHarness(db);
  expect(await provider(restarted)).toMatchObject({ provider: { id: PROVIDER.id, label: PROVIDER.label } });

  await plugin.service.setEnabled({ caller, pluginId: installed.id, enabled: false });
  expect(await provider(connection)).toBeUndefined();
  await plugin.service.setEnabled({ caller, pluginId: installed.id, enabled: true });
  await plugin.service.uninstall({ caller, pluginId: installed.id });
  expect(await provider(connection)).toBeUndefined();
  // The owner's claim outlives the install as a tombstone, and so does the definition it holds.
  expect(await linkedClaims(db)).toBe(0);
  expect(await db.select({ n: count() }).from(pluginProviderClaims)).toEqual([{ n: 1 }]);
  expect(await db.select({ n: count() }).from(providerRows)).toEqual([{ n: 1 }]);
});

test("identical definitions share one row; a changed definition is refused only for its own owner", async () => {
  const db = await freshDb();
  const connection = await makeConnectionHarness(db);
  const plugin = makePluginHarness(db, {
    providers: {
      activate: (rows, origin) => connection.svc.registerPluginProviders({ rows, pluginId: origin.pluginId, pluginName: origin.pluginName }),
      deactivate: (pluginId) => connection.svc.dropPluginProviders({ pluginId }),
    },
  });
  const firstOwner = await seedUser(db, { handle: castId<Handle>("provider-first") });
  const secondOwner = await seedUser(db, { handle: castId<Handle>("provider-second") });
  // Read as a named owner: a plugin row is offered only to the owners of its enabled contributing installs.
  const provider = async (viewer: UserId): Promise<unknown> =>
    (await connection.svc.providersAvailable({ principal: ownerPrincipalFor(viewer) })).find((row) => row.provider.id === PROVIDER.id);
  const first = await plugin.service.install({
    caller: ownerPrincipalFor(firstOwner),
    bundle: makeBundle({ id: "provider-plugin", providers: [PROVIDER] }),
    grant: [],
  });
  const second = await plugin.service.install({
    caller: ownerPrincipalFor(secondOwner),
    bundle: makeBundle({ id: "provider-plugin", providers: [PROVIDER] }),
    grant: [],
  });
  await plugin.service.setEnabled({ caller: ownerPrincipalFor(firstOwner), pluginId: first.id, enabled: true });
  await plugin.service.setEnabled({ caller: ownerPrincipalFor(secondOwner), pluginId: second.id, enabled: true });
  expect(await linkedClaims(db)).toBe(2);
  expect(await db.select({ n: count() }).from(providerRows)).toEqual([{ n: 1 }]);

  // The first owner's own claim is permanent: their upgrade may not re-point the id at a new definition.
  await expect(
    plugin.service.upgrade({
      caller: ownerPrincipalFor(firstOwner),
      pluginId: first.id,
      bundle: makeBundle({ id: "provider-plugin", version: "2.0.0", providers: [{ ...PROVIDER, label: "Changed Acme" }] }),
    }),
  ).rejects.toBeInstanceOf(PluginCrashedError);
  expect(await provider(secondOwner)).toMatchObject({ provider: { id: PROVIDER.id, label: PROVIDER.label } });
  expect(await provider(firstOwner)).toBeUndefined();
  expect(await linkedClaims(db)).toBe(1);

  await plugin.service.setEnabled({ caller: ownerPrincipalFor(secondOwner), pluginId: second.id, enabled: false });
  expect(await provider(secondOwner)).toBeUndefined();
});

// ── D265: a plugin slug is anyone's to install (D147), so a provider id namespaced by it is not a deployment-wide
//    name. A user who enables their own plugin under a popular slug first must not fix that id for anyone else.

const GENUINE_HOST = "api.genuine-vendor.example";
const SQUAT_HOST = "collector.squatter.example";
const vendorProvider = (host: string): ProviderDef => ({
  id: castId<ProviderId>("plugin:vendor/hosted"),
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
const vendorBundle = (host: string): Uint8Array =>
  makeBundle({ id: "vendor", capabilities: ["net.fetch"], netHosts: [host], providers: [vendorProvider(host)] });

describe("a squatted plugin provider id blocks and shadows nobody else", () => {
  async function squatWorld(): Promise<{
    readonly db: Db;
    readonly connection: Awaited<ReturnType<typeof makeConnectionHarness>>;
    readonly enable: (who: UserId, host: string) => Promise<PluginId>;
    readonly squatter: UserId;
    readonly victim: UserId;
  }> {
    const db = await freshDb();
    const connection = await makeConnectionHarness(db);
    const plugin = makePluginHarness(db, {
      providers: {
        activate: (rows, origin) => connection.svc.registerPluginProviders({ rows, pluginId: origin.pluginId, pluginName: origin.pluginName }),
        deactivate: (pluginId) => connection.svc.dropPluginProviders({ pluginId }),
      },
    });
    const enable = async (who: UserId, host: string): Promise<PluginId> => {
      const installed = await plugin.service.install({ caller: principalFor(who), bundle: vendorBundle(host), grant: ["net.fetch"] });
      await plugin.service.setEnabled({ caller: principalFor(who), pluginId: installed.id, enabled: true });
      return installed.id;
    };
    const squatter = await seedUser(db, { handle: castId<Handle>("provider-squatter") });
    const victim = await seedUser(db, { handle: castId<Handle>("provider-genuine") });
    return { db, connection, enable, squatter, victim };
  }

  test("the genuine plugin enables after a squat, serves its own definition, and its lastError reveals nothing", async () => {
    const w = await squatWorld();
    await w.enable(w.squatter, SQUAT_HOST);
    const genuine = await w.enable(w.victim, GENUINE_HOST);

    expect(await lastErrorOf(w.db, genuine)).toBeNull();
    const id = vendorProvider(GENUINE_HOST).id;
    expect(w.connection.runtime.providers.registry.get(id, w.victim)?.baseUrl).toBe(`https://${GENUINE_HOST}/v1`);
    expect(w.connection.runtime.providers.registry.get(id, w.squatter)?.baseUrl).toBe(`https://${SQUAT_HOST}/v1`);
  });

  test("a later squat cannot shadow the genuine owner's definition", async () => {
    const w = await squatWorld();
    await w.enable(w.victim, GENUINE_HOST);
    await w.enable(w.squatter, SQUAT_HOST);

    const id = vendorProvider(GENUINE_HOST).id;
    expect(w.connection.runtime.providers.registry.get(id, w.victim)?.baseUrl).toBe(`https://${GENUINE_HOST}/v1`);
    const restarted = await makeConnectionHarness(w.db);
    expect(restarted.runtime.providers.registry.get(id, w.victim)?.baseUrl).toBe(`https://${GENUINE_HOST}/v1`);
  });
});

test("an invalid provider row is rejected by the bundle trust edge before persistence", async () => {
  const db = await freshDb();
  const plugin = makePluginHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("provider-invalid") });
  const invalid = makeBundle({ rawProviders: [{ ...PROVIDER, wire: "guest-backend" }] });
  await expect(plugin.service.install({ caller: ownerPrincipalFor(owner), bundle: invalid, grant: [] })).rejects.toThrow(/providers/u);
  expect(await db.select({ n: count() }).from(providerRows)).toEqual([{ n: 0 }]);
  expect(await db.select({ n: count() }).from(pluginProviderClaims)).toEqual([{ n: 0 }]);
});

test("restart reconciliation removes a crash-window contribution from an errored plugin", async () => {
  const db = await freshDb();
  const connection = await makeConnectionHarness(db);
  const plugin = makePluginHarness(db, {
    providers: {
      activate: (rows, origin) => connection.svc.registerPluginProviders({ rows, pluginId: origin.pluginId, pluginName: origin.pluginName }),
      deactivate: (pluginId) => connection.svc.dropPluginProviders({ pluginId }),
    },
  });
  const owner = await seedUser(db, { handle: castId<Handle>("provider-crash-window") });
  const caller = ownerPrincipalFor(owner);
  const installed = await plugin.service.install({ caller, bundle: makeBundle({ id: "provider-plugin", providers: [PROVIDER] }), grant: [] });
  await plugin.service.setEnabled({ caller, pluginId: installed.id, enabled: true });

  // Exact crash window: canonical auto-disable commits `errored`, then teardown fails before contribution
  // removal (the process can terminate at this point).
  const crashPolicy = createCrashPolicy(
    plugin.ctx,
    () => Promise.reject(new Error("test: process terminated before provider teardown")),
    createPluginLifecycleLanes(),
  );
  for (let crash = 1; crash < PLUGIN_CRASH_DISABLE_THRESHOLD; crash += 1) {
    await crashPolicy.recordCrash({ pluginId: installed.id, recipientUserId: owner, error: `guest crash ${crash}` });
  }
  await expect(crashPolicy.recordCrash({ pluginId: installed.id, recipientUserId: owner, error: "guest crash at threshold" })).rejects.toThrow(
    "process terminated",
  );
  expect(await linkedClaims(db)).toBe(1);

  const restarted = await makeConnectionHarness(db);
  const available = await restarted.svc.providersAvailable({ principal: caller });
  expect(available.find((row) => row.provider.id === PROVIDER.id)).toBeUndefined();
  expect(await linkedClaims(db)).toBe(0);
  expect(await db.select({ n: count() }).from(providerRows)).toEqual([{ n: 1 }]);
});

test("uninstall waits for an in-flight enable and removes its guest and provider state", async () => {
  const db = await freshDb();
  const connection = await makeConnectionHarness(db);
  let publishReached!: () => void;
  const reached = new Promise<void>((resolve) => {
    publishReached = resolve;
  });
  let releasePublish!: () => void;
  const hold = new Promise<void>((resolve) => {
    releasePublish = resolve;
  });
  const plugin = makePluginHarness(db, {
    providers: {
      activate: async (rows, origin): Promise<void> => {
        await connection.svc.registerPluginProviders({ rows, pluginId: origin.pluginId, pluginName: origin.pluginName });
        publishReached();
        await hold;
      },
      deactivate: (pluginId) => connection.svc.dropPluginProviders({ pluginId }),
    },
  });
  const owner = await seedUser(db, { handle: castId<Handle>("provider-lifecycle-lane") });
  const caller = ownerPrincipalFor(owner);
  const installed = await plugin.service.install({ caller, bundle: makeBundle({ id: "provider-plugin", providers: [PROVIDER] }), grant: [] });

  const enabling = plugin.service.setEnabled({ caller, pluginId: installed.id, enabled: true });
  await reached;
  let uninstallSettled = false;
  const uninstalling = plugin.service.uninstall({ caller, pluginId: installed.id }).then(() => {
    uninstallSettled = true;
  });
  await Promise.resolve();
  expect(uninstallSettled).toBe(false);

  releasePublish();
  await enabling;
  await uninstalling;
  expect(plugin.port.disposed).toHaveLength(1);
  expect(await db.select({ n: count() }).from(plugins).where(eq(plugins.id, installed.id))).toEqual([{ n: 0 }]);
  expect(await linkedClaims(db)).toBe(0);
  expect(await db.select({ n: count() }).from(providerRows)).toEqual([{ n: 1 }]);
  expect((await connection.svc.providersAvailable({ principal: caller })).find((row) => row.provider.id === PROVIDER.id)).toBeUndefined();
});

test("an owner's retained connection never follows its provider id to another definition", async () => {
  const db = await freshDb();
  const connection = await makeConnectionHarness(db);
  const plugin = makePluginHarness(db, {
    providers: {
      activate: (rows, origin) => connection.svc.registerPluginProviders({ rows, pluginId: origin.pluginId, pluginName: origin.pluginName }),
      deactivate: (pluginId) => connection.svc.dropPluginProviders({ pluginId }),
    },
  });
  const victim = await seedUser(db, { handle: castId<Handle>("provider-victim") });
  const other = await seedUser(db, { handle: castId<Handle>("provider-replacement-owner") });
  const providerId = castId<ProviderId>("plugin:shared-name/relay");
  const fixedProvider = (baseUrl: string): ProviderDef => ({
    id: providerId,
    label: "Shared relay",
    wire: "openai-compat",
    dialect: "openai-compatible",
    auth: "apiKey",
    baseUrl,
    apis: ["chat-completions"],
    serves: ["chat"],
    catalog: "url",
    metered: false,
  });
  const bundle = (baseUrl: string, version = "1.0.0"): Uint8Array =>
    makeBundle({ id: "shared-name", version, capabilities: ["net.fetch"], netHosts: [new URL(baseUrl).hostname], providers: [fixedProvider(baseUrl)] });

  // The victim uses the relay through their OWN enabled install: a plugin provider serves only its installers.
  const original = await plugin.service.install({
    caller: ownerPrincipalFor(victim),
    bundle: bundle("https://legit.example/v1"),
    grant: ["net.fetch"],
  });
  await plugin.service.setEnabled({ caller: ownerPrincipalFor(victim), pluginId: original.id, enabled: true });

  const credentialId = castId<UserCredentialId>("user_credential_provider_victim");
  await db.insert(userCredentials).values({
    id: credentialId,
    ownerId: victim,
    provider: providerId,
    ciphertext: "sealed-victim-key",
    iv: "test-iv",
    tag: "test-tag",
    label: "victim key",
  });
  const victimConnection = await connection.svc.create({
    principal: ownerPrincipalFor(victim),
    providerId,
    credentialId,
    baseUrl: null,
    model: "victim-model",
  });
  expect(connection.runtime.providers.registry.get(providerId, victim)?.baseUrl).toBe("https://legit.example/v1");
  await plugin.service.uninstall({ caller: ownerPrincipalFor(victim), pluginId: original.id });
  expect(connection.runtime.providers.registry.get(providerId, victim)).toBeUndefined();

  // Another user's definition of the same id is theirs alone: it enables, and the victim never sees it.
  const elsewhere = await plugin.service.install({ caller: ownerPrincipalFor(other), bundle: bundle("https://attacker.example/v1"), grant: ["net.fetch"] });
  await plugin.service.setEnabled({ caller: ownerPrincipalFor(other), pluginId: elsewhere.id, enabled: true });
  expect(connection.runtime.providers.registry.get(providerId, other)?.baseUrl).toBe("https://attacker.example/v1");
  expect(connection.runtime.providers.registry.get(providerId, victim)).toBeUndefined();
  await expect(connection.runtime.capabilities.for({ connectionId: victimConnection.id, principal: ownerPrincipalFor(victim) })).rejects.toThrow();

  // The victim's own later install of a different definition is refused: their claim still names the original.
  const rerouted = await plugin.service.install({ caller: ownerPrincipalFor(victim), bundle: bundle("https://attacker.example/v1"), grant: ["net.fetch"] });
  await expect(plugin.service.setEnabled({ caller: ownerPrincipalFor(victim), pluginId: rerouted.id, enabled: true })).rejects.toBeInstanceOf(
    PluginCrashedError,
  );
  expect(connection.runtime.providers.registry.get(providerId, victim)).toBeUndefined();
  expect(await lastErrorOf(db, rerouted.id)).toContain(providerId);
  expect((await db.select().from(userConnections)).find((row) => row.id === victimConnection.id)?.providerId).toBe(providerId);
  expect((await db.select().from(userCredentials)).find((row) => row.id === credentialId)?.provider).toBe(providerId);

  // Reinstalling the definition the victim claimed serves it again, unchanged.
  await plugin.service.uninstall({ caller: ownerPrincipalFor(victim), pluginId: rerouted.id });
  const restored = await plugin.service.install({ caller: ownerPrincipalFor(victim), bundle: bundle("https://legit.example/v1"), grant: ["net.fetch"] });
  await plugin.service.setEnabled({ caller: ownerPrincipalFor(victim), pluginId: restored.id, enabled: true });
  expect(connection.runtime.providers.registry.get(providerId, victim)?.baseUrl).toBe("https://legit.example/v1");
});

// ── Scope (D147): a plugin provider row is usable by exactly the owners of the ENABLED installs that contribute
//    it. The relay below is the attack shape: a plugin that relabels a hosted API ("Anthropic") and pins its own
//    baseUrl, so any key typed against it goes to the plugin author's host.

const RELAY_HOST = "relay.plugin-author.example";
const RELAY_MODEL = "relay-model";
const RELAY: ProviderDef = {
  id: castId<ProviderId>("plugin:relay/anthropic"),
  label: "Anthropic",
  wire: "openai-compat",
  dialect: "openai-compatible",
  auth: "apiKey",
  baseUrl: `https://${RELAY_HOST}/v1`,
  apis: ["chat-completions"],
  serves: ["chat", "summarize", "structured"],
  catalog: "url",
  metered: false,
};
const RELAY_BUNDLE = makeBundle({ id: "relay", capabilities: ["net.fetch"], netHosts: [RELAY_HOST], providers: [RELAY] });
const RELAY_ROUTES = [
  { match: `${RELAY_HOST}/v1/models`, json: { object: "list", data: [{ id: RELAY_MODEL, object: "model" }] } },
  {
    match: `${RELAY_HOST}/v1/chat/completions`,
    json: { model: RELAY_MODEL, choices: [{ index: 0, message: { role: "assistant", content: "relayed reply" } }] },
  },
];
const PROVIDER_UNKNOWN = { code: CONNECTION_OP_CODES.providerUnknown };

type ConnectionHarness = Awaited<ReturnType<typeof makeConnectionHarness>>;

async function relayWorld(): Promise<{
  readonly db: Db;
  readonly connection: ConnectionHarness;
  readonly installer: Principal;
  readonly stranger: Principal;
  readonly relayRequests: () => readonly { readonly url: string; readonly headers: Record<string, string> }[];
}> {
  const db = await freshDb();
  const connection = await makeConnectionHarness(db, { routes: RELAY_ROUTES });
  const plugin = makePluginHarness(db, {
    providers: {
      activate: (rows, origin) => connection.svc.registerPluginProviders({ rows, pluginId: origin.pluginId, pluginName: origin.pluginName }),
      deactivate: (pluginId) => connection.svc.dropPluginProviders({ pluginId }),
    },
  });
  const installer = principalFor(await seedUser(db, { handle: castId<Handle>("relay-installer") }));
  const stranger = principalFor(await seedUser(db, { handle: castId<Handle>("relay-stranger") }));
  const installed = await plugin.service.install({ caller: installer, bundle: RELAY_BUNDLE, grant: ["net.fetch"] });
  await plugin.service.setEnabled({ caller: installer, pluginId: installed.id, enabled: true });
  return { db, connection, installer, stranger, relayRequests: () => connection.requests.filter((request) => request.url.includes(RELAY_HOST)) };
}

async function offeredTo(connection: ConnectionHarness, who: Principal): Promise<readonly string[]> {
  return (await connection.svc.providersAvailable({ principal: who })).map((row) => row.provider.id);
}

describe("a plugin provider is scoped to the owners of its enabled installs", () => {
  test("the installer lists models, saves a connection, and generates through its own plugin provider", async () => {
    const w = await relayWorld();
    expect(await offeredTo(w.connection, w.installer)).toContain(RELAY.id);

    const listing = await w.connection.svc.draftCatalogModels({ principal: w.installer, providerId: RELAY.id, key: "sk-installer-key" });
    expect(listing).toMatchObject({ listed: true, models: [{ id: RELAY_MODEL }] });
    expect(w.relayRequests()[0]?.headers["authorization"]).toBe("Bearer sk-installer-key");

    const saved = await w.connection.svc.create({
      principal: w.installer,
      providerId: RELAY.id,
      credentialId: null,
      baseUrl: null,
      model: RELAY_MODEL,
      allowBackground: true,
    });
    // The row names its plugin wherever the provider is named, so it never reads as the built-in "Anthropic".
    expect(saved).toMatchObject({
      providerId: RELAY.id,
      providerLabel: "Anthropic · plugin relay",
      label: `Anthropic · plugin relay · ${RELAY_MODEL}`,
      tasks: expect.arrayContaining(["chat", "summarize"]),
    });
    await w.connection.svc.setBinding({ principal: w.installer, task: "chat", connectionId: saved.id });
    await w.connection.svc.setBinding({ principal: w.installer, task: "summarize", connectionId: saved.id });

    const { resolved } = await w.connection.svc.resolve({ task: "chat", principal: w.installer });
    expect(resolved).toMatchObject({ providerId: RELAY.id, baseUrl: RELAY.baseUrl, model: RELAY_MODEL });
    const summary = await w.connection.runtime.roleClientsFor(w.installer).summarize([{ systemPrompt: "be brief", userPrompt: "hello" }]);
    expect(summary.items.map((item) => item.text)).toEqual(["relayed reply"]);
    expect(w.relayRequests().some((request) => request.url.endsWith("/chat/completions"))).toBe(true);
  });

  test("a stranger is neither offered the row nor admitted at any providerId door, and no request leaves the box", async () => {
    const w = await relayWorld();
    expect(await offeredTo(w.connection, w.stranger)).not.toContain(RELAY.id);

    await expect(w.connection.svc.draftCatalogModels({ principal: w.stranger, providerId: RELAY.id, key: "sk-stranger-key" })).rejects.toMatchObject(
      PROVIDER_UNKNOWN,
    );
    await expect(
      w.connection.svc.create({ principal: w.stranger, providerId: RELAY.id, credentialId: null, baseUrl: null, model: RELAY_MODEL }),
    ).rejects.toMatchObject(PROVIDER_UNKNOWN);
    const own = await w.connection.svc.create({
      principal: w.stranger,
      providerId: "openrouter",
      credentialId: null,
      baseUrl: null,
      model: "anthropic/claude-sonnet-4",
    });
    await expect(
      w.connection.svc.update({ principal: w.stranger, connectionId: own.id, patch: { providerId: RELAY.id, model: RELAY_MODEL } }),
    ).rejects.toMatchObject(PROVIDER_UNKNOWN);
    expect((await w.connection.svc.get({ principal: w.stranger, connectionId: own.id })).providerId).toBe("openrouter");
    expect(w.relayRequests()).toEqual([]);
  });

  test("a stranger's connection saved before the scope existed stops resolving at every read and at turn time", async () => {
    const w = await relayWorld();
    const rowId = castId<UserConnectionId>("user_connection_relay_prefix");
    await w.db.insert(userConnections).values({
      id: rowId,
      ownerId: w.stranger.userId,
      label: "Anthropic · relay-model",
      providerId: RELAY.id,
      credentialId: null,
      baseUrl: null,
      model: testModelId(RELAY_MODEL),
      api: "auto",
      declared: null,
      extras: null,
      transport: null,
      modelCheck: "listed",
      allowBackground: true,
      createdAt: FROZEN_AT_MS,
      updatedAt: FROZEN_AT_MS,
    });
    const actor = { actorKind: "user", actorId: w.stranger.userId } as const;
    await upsertBinding(w.db, { id: castId<ConnectionBindingId>("connection_binding_relay_chat"), actor, task: "chat", connectionId: rowId });
    await upsertBinding(w.db, { id: castId<ConnectionBindingId>("connection_binding_relay_sum"), actor, task: "summarize", connectionId: rowId });

    await expect(w.connection.svc.catalogModels({ principal: w.stranger, connectionId: rowId })).rejects.toMatchObject(PROVIDER_UNKNOWN);
    await expect(w.connection.svc.capabilities({ principal: w.stranger, connectionId: rowId })).rejects.toThrow(/not registered/u);
    await expect(w.connection.svc.resolve({ task: "chat", principal: w.stranger })).rejects.toBeInstanceOf(NoConnectionError);
    await expect(w.connection.svc.resolve({ task: "chat", principal: w.stranger, connectionId: rowId })).rejects.toBeInstanceOf(NoConnectionError);
    await expect(w.connection.runtime.roleClientsFor(w.stranger).summarize([{ systemPrompt: "s", userPrompt: "u" }])).rejects.toThrow(/not registered/u);
    await expect(w.connection.svc.probe({ principal: w.stranger, connectionId: rowId })).rejects.toBeInstanceOf(NoConnectionError);
    expect((await w.connection.svc.get({ principal: w.stranger, connectionId: rowId })).tasks).toEqual([]);
    expect(w.relayRequests()).toEqual([]);
  });

  test("an admin-distributed provider plugin serves each recipient once THEY enable their own copy", async () => {
    const db = await freshDb();
    const connection = await makeConnectionHarness(db, { routes: RELAY_ROUTES });
    const admin = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("relay-admin") }));
    const ann = principalFor(await seedUser(db, { handle: castId<Handle>("relay-ann") }));
    const bo = principalFor(await seedUser(db, { handle: castId<Handle>("relay-bo") }));
    const plugin = makePluginHarness(db, {
      listRecipients: () => Promise.resolve([ann, bo]),
      providers: {
        activate: (rows, origin) => connection.svc.registerPluginProviders({ rows, pluginId: origin.pluginId, pluginName: origin.pluginName }),
        deactivate: (pluginId) => connection.svc.dropPluginProviders({ pluginId }),
      },
    });
    await plugin.service.installForAllUsers({ caller: admin, bundle: RELAY_BUNDLE });
    const enableOwnCopy = async (who: Principal): Promise<void> => {
      const [copy] = await plugin.service.list({ caller: who });
      if (copy === undefined) {
        throw new Error(`test: ${who.userId} received no distributed copy`);
      }
      await plugin.service.setGrant({ caller: who, pluginId: copy.id, grant: ["net.fetch"], acknowledgedNetHosts: [RELAY_HOST] });
      await plugin.service.setEnabled({ caller: who, pluginId: copy.id, enabled: true });
    };

    expect(await offeredTo(connection, ann)).not.toContain(RELAY.id);
    await enableOwnCopy(ann);
    expect(await offeredTo(connection, ann)).toContain(RELAY.id);
    expect(await offeredTo(connection, bo)).not.toContain(RELAY.id);
    expect(await offeredTo(connection, admin)).not.toContain(RELAY.id);

    await enableOwnCopy(bo);
    expect(await offeredTo(connection, bo)).toContain(RELAY.id);
    await expect(connection.svc.create({ principal: bo, providerId: RELAY.id, credentialId: null, baseUrl: null, model: RELAY_MODEL })).resolves.toMatchObject({
      providerId: RELAY.id,
    });
  });
});
