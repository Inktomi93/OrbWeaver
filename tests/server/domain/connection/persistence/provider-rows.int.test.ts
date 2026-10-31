// Storage is the subject: the provider rows and plugin claims the registry leaves in the database. An admin row is
// deployment-wide; a plugin row reaches a user only through their own claim, which is permanent per owner and survives
// its install as a tombstone. Writes go through the registry and the plugin lifecycle; the tables are read to see what stayed.
// @subject packages/server/src/domain/connection/persistence/provider-rows.ts

import { spawn } from "node:child_process";
import type { ProviderDef, Task } from "@orb/contracts/inference";
import { PLUGIN_PROVIDER_ID_PREFIX, providerDefSchema, providerTasks, RETIRED_TASKS } from "@orb/contracts/inference";
import type { PluginManifest } from "@orb/contracts/plugin";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, pluginManifestSchema } from "@orb/contracts/plugin";
import { closeDb, pluginProviderClaims, providerRows, users } from "@orb/db";
import { ProviderError } from "@orb/inference";
import type { UserId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, freshDb, makePluginBundle } from "@orb/testkit/node/composed";
import { eq, sql } from "drizzle-orm";

// Each enable starts the real sandbox child process, which outlasts the default test budget.
const PLUGIN_LIFECYCLE_TIMEOUT_MS = 30_000;
const PLUGIN = "acme-plugin";
const PLUGIN_PROVIDER = `${PLUGIN_PROVIDER_ID_PREFIX}${PLUGIN}/acme`;

const provider = (id: string, label: string): ProviderDef =>
  providerDefSchema.parse({
    id,
    label,
    wire: "openai-compat",
    dialect: "openai-compatible",
    auth: "endpoint",
    apis: ["chat-completions"],
    catalog: "url",
    metered: false,
  });

const manifestWith = (label: string): PluginManifest =>
  pluginManifestSchema.parse({
    id: PLUGIN,
    name: "Acme",
    version: "1.0.0",
    hostVersion: PLUGIN_HOST_VERSIONS[0],
    entry: PLUGIN_MAIN_ENTRY,
    description: "Serves one provider.",
    capabilities: ["storage.kv"],
    providers: [provider(PLUGIN_PROVIDER, label)],
  });

async function newRoot(): Promise<ServerTestHarness & AsyncDisposable> {
  return await createServerHarness({ startJobs: false, pluginSpawn: spawn });
}

type PluginService = ServerTestHarness["services"]["plugin"];

interface Installed {
  readonly pluginId: Awaited<ReturnType<PluginService["install"]>>["id"];
  readonly status: string;
}

/** One owner's install of the Acme plugin as `label` defines its provider, enabled through the production consent path. */
async function installAcme(root: ServerTestHarness, owner: UserId, label: string): Promise<Installed> {
  const caller = await root.principalFor(owner);
  const manifest = manifestWith(label);
  const installed = await root.services.plugin.install({ caller, bundle: makePluginBundle(manifest, "orb.host(1);", root.clock.now()), grant: [] });
  const outcome = await root.services.plugin.setGrant({
    caller,
    pluginId: installed.id,
    grant: manifest.capabilities,
    acknowledgedNetHosts: [],
    enable: true,
  });
  return { pluginId: installed.id, status: outcome.status };
}

const ACME_PLUGIN_ID = provider(PLUGIN_PROVIDER, "Acme").id;
const servedLabel = (root: ServerTestHarness, viewer: UserId): string | undefined => root.services.connection.registry.get(ACME_PLUGIN_ID, viewer)?.label;

test("an admin row is replaced in place, dropped once, and never takes a plugin id", async () => {
  await using root = await newRoot();
  const registry = root.services.connection.registry;
  const admin = { admin: root.ownerId };
  const acme = provider("acme-endpoint", "Acme");

  await registry.register(acme, admin);
  await registry.register({ ...acme, label: "Acme v2" }, admin);
  await registry.register({ ...acme, label: "Acme v2" }, admin);
  expect(registry.get(acme.id, root.ownerId)?.label).toBe("Acme v2");
  expect((await root.db.select().from(providerRows)).filter((row) => row.id === acme.id)).toHaveLength(1);

  // A plugin: id is reserved for manifests; the refusal writes nothing, and a bare id is the positive control.
  const rowsBefore = await root.db.select().from(providerRows);
  await expect(registry.register(provider(PLUGIN_PROVIDER, "Squat"), admin)).rejects.toBeInstanceOf(ProviderError);
  expect(await root.db.select().from(providerRows)).toEqual(rowsBefore);

  await registry.drop(acme.id);
  expect(registry.get(acme.id, root.ownerId)).toBeUndefined();
  expect((await root.db.select().from(providerRows)).filter((row) => row.id === acme.id)).toEqual([]);
  await expect(registry.drop(acme.id)).rejects.toBeInstanceOf(ProviderError);
});

test("owners of one definition share its row, and each release narrows only its own install", { timeout: PLUGIN_LIFECYCLE_TIMEOUT_MS }, async () => {
  await using root = await newRoot();
  const first = root.ownerId;
  const second = (await root.actor()).id;
  const outsider = (await root.actor()).id;
  const [a, b] = [await installAcme(root, first, "Acme"), await installAcme(root, second, "Acme")];
  expect([a.status, b.status]).toEqual(["enabled", "enabled"]);

  expect((await root.db.select().from(providerRows)).filter((row) => row.id === PLUGIN_PROVIDER)).toHaveLength(1);
  expect([servedLabel(root, first), servedLabel(root, second), servedLabel(root, outsider)]).toEqual(["Acme", "Acme", undefined]);

  await root.services.plugin.setEnabled({ caller: await root.principalFor(first), pluginId: a.pluginId, enabled: false });
  expect([servedLabel(root, first), servedLabel(root, second)]).toEqual([undefined, "Acme"]);
  await root.services.plugin.setEnabled({ caller: await root.principalFor(second), pluginId: b.pluginId, enabled: false });
  expect([servedLabel(root, first), servedLabel(root, second)]).toEqual([undefined, undefined]);

  // Both claims remain as their owners' tombstones, so the definition they name is kept.
  const claims = (await root.db.select().from(pluginProviderClaims)).filter((claim) => claim.providerId === PLUGIN_PROVIDER);
  expect(claims.map((claim) => claim.pluginId)).toEqual([null, null]);
  expect((await root.db.select().from(providerRows)).filter((row) => row.id === PLUGIN_PROVIDER)).toHaveLength(1);
});

test("one owner's claim never blocks or answers for another owner's different definition of the same id", {
  timeout: PLUGIN_LIFECYCLE_TIMEOUT_MS,
}, async () => {
  await using root = await newRoot();
  const squatter = root.ownerId;
  const genuine = (await root.actor()).id;
  expect((await installAcme(root, squatter, "Other Acme")).status).toBe("enabled");
  expect((await installAcme(root, genuine, "Acme")).status).toBe("enabled");

  expect([servedLabel(root, genuine), servedLabel(root, squatter)]).toEqual(["Acme", "Other Acme"]);
  expect((await root.db.select().from(providerRows)).filter((row) => row.id === PLUGIN_PROVIDER)).toHaveLength(2);
});

test("an owner's claim refuses a changed definition before any write, even after its install is gone", { timeout: PLUGIN_LIFECYCLE_TIMEOUT_MS }, async () => {
  await using root = await newRoot();
  const owner = root.ownerId;
  const caller = await root.principalFor(owner);
  const first = await installAcme(root, owner, "Acme");
  const claimed = await root.db.select().from(providerRows);

  await root.services.plugin.uninstall({ caller, pluginId: first.pluginId });
  const [tombstone] = (await root.db.select().from(pluginProviderClaims)).filter((claim) => claim.providerId === PLUGIN_PROVIDER);
  expect(tombstone?.pluginId).toBeNull();

  // The changed definition cannot ride the old id: the activation fails and neither table moves.
  const changed = await installAcme(root, owner, "Other Acme");
  expect(changed.status).not.toBe("enabled");
  expect(servedLabel(root, owner)).toBeUndefined();
  expect(await root.db.select().from(providerRows)).toEqual(claimed);
  expect((await root.db.select().from(pluginProviderClaims)).filter((claim) => claim.providerId === PLUGIN_PROVIDER)).toEqual([tombstone]);

  // Positive control: the unchanged definition re-links the same claim.
  await root.services.plugin.uninstall({ caller, pluginId: changed.pluginId });
  expect((await installAcme(root, owner, "Acme")).status).toBe("enabled");
  expect(servedLabel(root, owner)).toBe("Acme");
});

test("a definition row outlives a deleted owner only while another owner's claim still names it", { timeout: PLUGIN_LIFECYCLE_TIMEOUT_MS }, async () => {
  await using root = await newRoot();
  const first = (await root.actor()).id;
  const second = (await root.actor()).id;
  const installDisabled = async (owner: typeof first): Promise<Awaited<ReturnType<typeof installAcme>>["pluginId"]> => {
    const installed = await installAcme(root, owner, "Acme");
    expect(installed.status).toBe("enabled");
    await root.services.plugin.setEnabled({ caller: await root.principalFor(owner), pluginId: installed.pluginId, enabled: false });
    return installed.pluginId;
  };
  const firstPlugin = await installDisabled(first);
  const secondPlugin = await installDisabled(second);
  const definitionRows = async (): Promise<number> => (await root.db.select().from(providerRows)).filter((row) => row.id === PLUGIN_PROVIDER).length;
  expect(await definitionRows()).toBe(1);

  // A user's claims die with the user (D265), which leaves the claim table as the only reference to a definition.
  await root.db.delete(users).where(eq(users.id, first));
  await root.services.connection.registry.dropPlugin(firstPlugin);
  expect(await definitionRows()).toBe(1);

  await root.db.delete(users).where(eq(users.id, second));
  await root.services.connection.registry.dropPlugin(secondPlugin);
  expect(await definitionRows()).toBe(0);
});

// A row stored before its wire stopped serving a task still names that task; the registry loads it without it.
const RETIRED_SERVES = ["chat", ...RETIRED_TASKS, "summarize"] as const;
const SDK_SERVES_AFTER: Task[] = ["chat", "summarize"];

test("a stored admin row that names a retired task loads and serves the remaining tasks", async () => {
  await using lifetime = new AsyncDisposableStack();
  const db = await freshDb();
  lifetime.defer(() => closeDb(db));
  const id = "legacy-sdk";
  await db.run(sql`insert into provider_rows (id, label, wire, auth, apis, serves, catalog, metered, definition_hash, origin_kind)
    values (${id}, 'Legacy SDK', 'agent-sdk', 'oauthToken', '["agent-sdk"]', ${JSON.stringify(RETIRED_SERVES)}, 'url', 0, 'stored-hash', 'admin')`);

  await using root = await createServerHarness({ db, startJobs: false });
  const row = root.services.connection.registry.get(id, root.ownerId);
  expect(row?.serves).toEqual(SDK_SERVES_AFTER);
  expect(row === undefined ? [] : providerTasks(row)).toEqual(SDK_SERVES_AFTER);
});
