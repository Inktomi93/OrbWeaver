// End-to-end lifecycle suite for manifest provider contributions: the real plugin service drives the real
// connection registry/store over one DB. A provider is discoverable only after authoritative activation,
// conflicts fail closed, restart reloads durable rows, and disable/uninstall remove only owned contributions.

import type { ProviderDef, ProviderId } from "@orb/contracts/inference";
import { pluginProviderContributions, plugins, providerRows, userConnections, userCredentials } from "@orb/db";
import type { Handle, UserCredentialId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { PLUGIN_CRASH_DISABLE_THRESHOLD, PluginCrashedError } from "@orb/server/domain/plugin";
import { count, eq } from "drizzle-orm";
import { createCrashPolicy } from "../../../../../packages/server/src/domain/plugin/activation/crash-policy.ts";
import { createPluginLifecycleLanes } from "../../../../../packages/server/src/domain/plugin/substrate/lifecycle-lanes.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness as makeConnectionHarness } from "../../connection/_support.ts";
import { makeBundle, makePluginHarness, ownerPrincipalFor, seedUser } from "../_support.ts";

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
  expect(await db.select({ n: count() }).from(pluginProviderContributions)).toEqual([{ n: 0 }]);
  expect(await db.select({ n: count() }).from(providerRows)).toEqual([{ n: 1 }]);
});

test("two owners share an identical definition; a conflicting activation writes nothing", async () => {
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
  const provider = async (): Promise<unknown> =>
    (await connection.svc.providersAvailable({ principal: ownerPrincipalFor(firstOwner) })).find((row) => row.provider.id === PROVIDER.id);
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
  expect(await db.select({ n: count() }).from(pluginProviderContributions)).toEqual([{ n: 2 }]);

  await expect(
    plugin.service.upgrade({
      caller: ownerPrincipalFor(firstOwner),
      pluginId: first.id,
      bundle: makeBundle({ id: "provider-plugin", version: "2.0.0", providers: [{ ...PROVIDER, label: "Changed Acme" }] }),
    }),
  ).rejects.toBeInstanceOf(PluginCrashedError);
  expect(await provider()).toMatchObject({ provider: { id: PROVIDER.id, label: PROVIDER.label } });
  expect(await db.select({ n: count() }).from(pluginProviderContributions)).toEqual([{ n: 1 }]);

  await plugin.service.setEnabled({ caller: ownerPrincipalFor(firstOwner), pluginId: first.id, enabled: false });
  expect(await provider()).toMatchObject({ provider: { id: PROVIDER.id, label: PROVIDER.label } });
  await plugin.service.setEnabled({ caller: ownerPrincipalFor(secondOwner), pluginId: second.id, enabled: false });
  expect(await provider()).toBeUndefined();

  const conflictOwner = await seedUser(db, { handle: castId<Handle>("provider-conflict") });
  const baseOwner = await seedUser(db, { handle: castId<Handle>("provider-base") });
  const base = await plugin.service.install({
    caller: ownerPrincipalFor(baseOwner),
    bundle: makeBundle({ id: "provider-plugin", providers: [PROVIDER] }),
    grant: [],
  });
  const conflict = await plugin.service.install({
    caller: ownerPrincipalFor(conflictOwner),
    bundle: makeBundle({ id: "provider-plugin", providers: [{ ...PROVIDER, label: "Conflicting Acme" }] }),
    grant: [],
  });
  await plugin.service.setEnabled({ caller: ownerPrincipalFor(baseOwner), pluginId: base.id, enabled: true });
  await expect(plugin.service.setEnabled({ caller: ownerPrincipalFor(conflictOwner), pluginId: conflict.id, enabled: true })).rejects.toBeInstanceOf(
    PluginCrashedError,
  );
  expect(await provider()).toMatchObject({ provider: { id: PROVIDER.id, label: PROVIDER.label } });
  expect(await db.select({ n: count() }).from(pluginProviderContributions)).toEqual([{ n: 1 }]);
});

test("an invalid provider row is rejected by the bundle trust edge before persistence", async () => {
  const db = await freshDb();
  const plugin = makePluginHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("provider-invalid") });
  const invalid = makeBundle({ rawProviders: [{ ...PROVIDER, wire: "guest-backend" }] });
  await expect(plugin.service.install({ caller: ownerPrincipalFor(owner), bundle: invalid, grant: [] })).rejects.toThrow(/providers/u);
  expect(await db.select({ n: count() }).from(providerRows)).toEqual([{ n: 0 }]);
  expect(await db.select({ n: count() }).from(pluginProviderContributions)).toEqual([{ n: 0 }]);
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
  expect(await db.select({ n: count() }).from(pluginProviderContributions)).toEqual([{ n: 1 }]);

  const restarted = await makeConnectionHarness(db);
  const available = await restarted.svc.providersAvailable({ principal: caller });
  expect(available.find((row) => row.provider.id === PROVIDER.id)).toBeUndefined();
  expect(await db.select({ n: count() }).from(pluginProviderContributions)).toEqual([{ n: 0 }]);
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
  expect(await db.select({ n: count() }).from(pluginProviderContributions)).toEqual([{ n: 0 }]);
  expect(await db.select({ n: count() }).from(providerRows)).toEqual([{ n: 1 }]);
  expect((await connection.svc.providersAvailable({ principal: caller })).find((row) => row.provider.id === PROVIDER.id)).toBeUndefined();
});

test("a retired provider id cannot be reclaimed with a definition that reroutes an existing connection", async () => {
  const db = await freshDb();
  const connection = await makeConnectionHarness(db);
  const plugin = makePluginHarness(db, {
    providers: {
      activate: (rows, origin) => connection.svc.registerPluginProviders({ rows, pluginId: origin.pluginId, pluginName: origin.pluginName }),
      deactivate: (pluginId) => connection.svc.dropPluginProviders({ pluginId }),
    },
  });
  const firstOwner = await seedUser(db, { handle: castId<Handle>("provider-original-owner") });
  const victim = await seedUser(db, { handle: castId<Handle>("provider-victim") });
  const attacker = await seedUser(db, { handle: castId<Handle>("provider-replacement-owner") });
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

  const original = await plugin.service.install({
    caller: ownerPrincipalFor(firstOwner),
    bundle: bundle("https://legit.example/v1"),
    grant: ["net.fetch"],
  });
  await plugin.service.setEnabled({ caller: ownerPrincipalFor(firstOwner), pluginId: original.id, enabled: true });

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

  await plugin.service.setEnabled({ caller: ownerPrincipalFor(firstOwner), pluginId: original.id, enabled: false });
  expect(connection.runtime.providers.registry.get(providerId)).toBeUndefined();

  const replacement = await plugin.service.install({
    caller: ownerPrincipalFor(attacker),
    bundle: bundle("https://attacker.example/v1"),
    grant: ["net.fetch"],
  });
  await expect(plugin.service.setEnabled({ caller: ownerPrincipalFor(attacker), pluginId: replacement.id, enabled: true })).rejects.toBeInstanceOf(
    PluginCrashedError,
  );

  expect(connection.runtime.providers.registry.get(providerId)).toBeUndefined();
  await expect(connection.runtime.capabilities.for({ connectionId: victimConnection.id, principal: ownerPrincipalFor(victim) })).rejects.toThrow();
  expect((await db.select().from(userConnections)).find((row) => row.id === victimConnection.id)?.providerId).toBe(providerId);
  expect((await db.select().from(userCredentials)).find((row) => row.id === credentialId)?.provider).toBe(providerId);
  expect(await db.select({ n: count() }).from(providerRows).where(eq(providerRows.id, providerId))).toEqual([{ n: 1 }]);
});
