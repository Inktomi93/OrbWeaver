// A plugin provider claim stored before one of its tasks retired keeps holding its id for its owner (D265). Migration 0007
// strips the task from the stored row under its hash; the boot rehash moves the row and every claim on it, tombstones
// included, so a changed definition is still refused and the owner's same definition re-claims.
// @subject packages/server/src/domain/connection/persistence/provider-rows.ts

import { spawn } from "node:child_process";
import type { Task } from "@orb/contracts/inference";
import { PLUGIN_PROVIDER_ID_PREFIX, RETIRED_TASKS } from "@orb/contracts/inference";
import type { PluginManifest } from "@orb/contracts/plugin";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, pluginManifestSchema } from "@orb/contracts/plugin";
import { createDb, pluginProviderClaims, runMigrations } from "@orb/db";
import { rehashPluginProviderDefinitionsOnBoot } from "@orb/server/entry/boot";
import { present } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, makePluginBundle, migrationsHolding, ownDb } from "@orb/testkit/node/composed";
import { bootGrantFor } from "@orb/testkit/node/helpers";
import { sql } from "drizzle-orm";

// Each enable starts the real sandbox child process, which outlasts the default test budget.
const PLUGIN_LIFECYCLE_TIMEOUT_MS = 30_000;
const MIGRATION = "0007_retire-agent-task";
const PLUGIN = "acme-plugin";
const PROVIDER = `${PLUGIN_PROVIDER_ID_PREFIX}${PLUGIN}/sdk`;
const STORED_HASH = "hash-before-retirement";
const SERVES: Task[] = ["chat", "summarize"];
const STORED_SERVES = ["chat", ...RETIRED_TASKS, "summarize"];

const manifestLabelled = (label: string): PluginManifest =>
  pluginManifestSchema.parse({
    id: PLUGIN,
    name: "Acme",
    version: "1.0.0",
    hostVersion: PLUGIN_HOST_VERSIONS[0],
    entry: PLUGIN_MAIN_ENTRY,
    description: "Serves one subscription provider.",
    capabilities: ["storage.kv"],
    providers: [{ id: PROVIDER, label, wire: "agent-sdk", auth: "oauthToken", apis: ["agent-sdk"], serves: SERVES, catalog: "url", metered: false }],
  });

interface Installed {
  readonly pluginId: Awaited<ReturnType<ServerTestHarness["services"]["plugin"]["install"]>>["id"];
  readonly status: string;
}

async function installLabelled(root: ServerTestHarness, label: string): Promise<Installed> {
  const caller = await root.principalFor(root.ownerId);
  const manifest = manifestLabelled(label);
  const installed = await root.services.plugin.install({ caller, bundle: makePluginBundle(manifest, "orb.host(1);", root.clock.now()), grant: [] });
  const outcome = await root.services.plugin.setGrant({ caller, pluginId: installed.id, grant: manifest.capabilities, acknowledgedNetHosts: [], enable: true });
  return { pluginId: installed.id, status: outcome.status };
}

test("a tombstone stored before its task retired still refuses a changed definition, and the same definition re-claims", {
  timeout: PLUGIN_LIFECYCLE_TIMEOUT_MS,
}, async () => {
  await using chain = await migrationsHolding(MIGRATION);
  using opened = ownDb(await createDb(":memory:"));
  const db = opened.db;
  await runMigrations(db, chain.paths.rest);
  // 0007 changes data only, so the harness runs on the chain before it and the planted tombstone is that chain's data.
  await using root = await createServerHarness({ db, startJobs: false, pluginSpawn: spawn });
  await db.run(sql`insert into provider_rows (id, label, wire, auth, apis, serves, catalog, metered, definition_hash, origin_kind)
    values (${PROVIDER}, 'Acme SDK', 'agent-sdk', 'oauthToken', '["agent-sdk"]', ${JSON.stringify(STORED_SERVES)}, 'url', 0, ${STORED_HASH}, 'plugin')`);
  await db.run(
    sql`insert into plugin_provider_claims (owner_id, provider_id, definition_hash, plugin_id) values (${root.ownerId}, ${PROVIDER}, ${STORED_HASH}, null)`,
  );

  await runMigrations(db, chain.paths.held);
  const rehash = (): Promise<number> => rehashPluginProviderDefinitionsOnBoot({ db: bootGrantFor(db), logger: root.logger });
  const moved = await rehash();
  const claimsAfterBoot = await db.select().from(pluginProviderClaims);

  const changed = await installLabelled(root, "Other Acme SDK");
  expect(changed.status).not.toBe("enabled");
  expect(root.app.runtime.providers.registry.get(PROVIDER, root.ownerId)).toBeUndefined();
  expect(await db.select().from(pluginProviderClaims)).toEqual(claimsAfterBoot);

  await root.services.plugin.uninstall({ caller: await root.principalFor(root.ownerId), pluginId: changed.pluginId });
  expect((await installLabelled(root, "Acme SDK")).status).toBe("enabled");
  expect(root.app.runtime.providers.registry.get(PROVIDER, root.ownerId)?.serves).toEqual(SERVES);

  // The one stale definition moved once, with the owner's tombstone on it; a later boot moves nothing.
  expect(moved).toBe(1);
  expect(await rehash()).toBe(0);
  expect(claimsAfterBoot).toHaveLength(1);
  expect(claimsAfterBoot[0]).toMatchObject({ ownerId: root.ownerId, providerId: PROVIDER, pluginId: null });
  expect(present(claimsAfterBoot[0]).definitionHash).not.toBe(STORED_HASH);
});
