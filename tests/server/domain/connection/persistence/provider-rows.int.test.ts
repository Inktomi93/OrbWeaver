// Storage is the subject: the provider rows and plugin claims the registry leaves in the database. An admin row is
// deployment-wide; a plugin row reaches a user only through their own claim, which is permanent per owner and survives
// its install as a tombstone. Writes go through the registry and the plugin lifecycle; the tables are read to see what stayed.
// @subject packages/server/src/domain/connection/persistence/provider-rows.ts

import { spawn } from "node:child_process";
import type { ProviderDef } from "@orb/contracts/inference";
import { providerDefSchema } from "@orb/contracts/inference";
import type { PluginManifest } from "@orb/contracts/plugin";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, pluginManifestSchema } from "@orb/contracts/plugin";
import { pluginProviderClaims, providerRows } from "@orb/db";
import { ProviderError } from "@orb/inference";
import type { UserId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, makePluginBundle } from "@orb/testkit/node/composed";

// Each enable starts the real sandbox child process, which outlasts the default test budget.
const PLUGIN_LIFECYCLE_TIMEOUT_MS = 30_000;
const PLUGIN = "acme-plugin";
const PLUGIN_PROVIDER = `plugin:${PLUGIN}/acme`;

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
