// The forward migration strips retired tasks from stored provider rows and plugin manifests. A plugin definition that
// named one goes with its claims: its stored hash covers the retired task, so the stripped manifest re-claims it fresh.
// @subject packages/db/src/schema/connection-bindings.ts
import { PLUGIN_PROVIDER_ID_PREFIX, RETIRED_TASKS } from "@orb/contracts/inference";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY } from "@orb/contracts/plugin";
import { assertReferentialIntegrity, closeDb, createDb, runMigrations } from "@orb/db";
import { createIdSource, ID_PREFIX } from "@orb/kit/ids";
import { createSeededIds } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { migrationsBefore, SHIPPED_MIGRATIONS } from "@orb/testkit/node/composed";
import { seedUser } from "@orb/testkit/node/rows";
import { sql } from "drizzle-orm";

const MIGRATION = "0007_retire-agent-task";
const SDK_PROVIDER = `${PLUGIN_PROVIDER_ID_PREFIX}acme/sdk`;
const TEXT_PROVIDER = `${PLUGIN_PROVIDER_ID_PREFIX}acme/text`;
const STORED_SERVES = ["chat", ...RETIRED_TASKS, "summarize"];
const STRIPPED_SERVES = ["chat", "summarize"];

const sdkProvider = (serves: readonly string[]): Record<string, unknown> => ({
  id: SDK_PROVIDER,
  label: "Acme SDK",
  wire: "agent-sdk",
  auth: "oauthToken",
  apis: ["agent-sdk"],
  serves,
  catalog: "url",
  metered: false,
});
const TEXT_DEF = {
  id: TEXT_PROVIDER,
  label: "Acme text",
  wire: "openai-compat",
  dialect: "openai-compatible",
  auth: "endpoint",
  apis: ["chat-completions"],
  catalog: "url",
  metered: false,
};
const manifest = (slug: string, providers?: readonly Record<string, unknown>[]): Record<string, unknown> => ({
  id: slug,
  name: slug,
  version: "1.0.0",
  hostVersion: PLUGIN_HOST_VERSIONS[0],
  entry: PLUGIN_MAIN_ENTRY,
  description: "A stored install.",
  capabilities: ["storage.kv"],
  ...(providers === undefined ? {} : { providers }),
});

interface StoredRow {
  readonly id: string;
  readonly serves: string | null;
}

test("the forward migration strips retired tasks at rest and drops the plugin definitions whose hash named one", async () => {
  await using previous = await migrationsBefore(MIGRATION);
  await using lifetime = new AsyncDisposableStack();
  const db = await createDb(":memory:");
  lifetime.defer(() => closeDb(db));
  await runMigrations(db, previous.path);
  const ids = createIdSource(createSeededIds().next);
  const owner = await seedUser(db, {}, ids);
  const bundle = ids.typeId(ID_PREFIX.asset);
  const [acme, beta] = [ids.typeId(ID_PREFIX.plugin), ids.typeId(ID_PREFIX.plugin)];
  const acmeManifest = manifest("acme", [sdkProvider(STORED_SERVES), TEXT_DEF]);
  const betaManifest = manifest("beta");
  await db.run(sql`insert into assets (id, owner_id, kind, mime, size, hash) values (${bundle}, ${owner.id}, 'plugin', 'application/zip', 1, 'bundle-hash')`);
  await db.run(sql`insert into plugins (id, owner_id, slug, name, version, manifest, bundle_asset_id, granted_capabilities, status, origin, installed_at, updated_at)
    values (${acme}, ${owner.id}, 'acme', 'acme', '1.0.0', ${JSON.stringify(acmeManifest)}, ${bundle}, '["storage.kv"]', 'enabled', 'upload', 1, 1),
      (${beta}, ${owner.id}, 'beta', 'beta', '1.0.0', ${JSON.stringify(betaManifest)}, ${bundle}, '["storage.kv"]', 'disabled', 'upload', 1, 1)`);
  await db.run(sql`insert into provider_rows (id, label, wire, auth, apis, serves, catalog, metered, definition_hash, origin_kind) values
    ('legacy-sdk', 'Legacy SDK', 'agent-sdk', 'oauthToken', '["agent-sdk"]', ${JSON.stringify(STORED_SERVES)}, 'url', 0, 'admin-hash', 'admin'),
    ('plain-endpoint', 'Plain', 'openai-compat', 'endpoint', '["chat-completions"]', null, 'url', 0, 'plain-hash', 'admin'),
    (${SDK_PROVIDER}, 'Acme SDK', 'agent-sdk', 'oauthToken', '["agent-sdk"]', ${JSON.stringify(STORED_SERVES)}, 'url', 0, 'sdk-hash', 'plugin'),
    (${TEXT_PROVIDER}, 'Acme text', 'openai-compat', 'endpoint', '["chat-completions"]', null, 'url', 0, 'text-hash', 'plugin')`);
  await db.run(sql`insert into plugin_provider_claims (owner_id, provider_id, definition_hash, plugin_id) values
    (${owner.id}, ${SDK_PROVIDER}, 'sdk-hash', ${acme}), (${owner.id}, ${TEXT_PROVIDER}, 'text-hash', ${acme})`);

  await runMigrations(db, SHIPPED_MIGRATIONS);

  await expect(assertReferentialIntegrity(db)).resolves.toBeUndefined();
  expect(await db.all<StoredRow>(sql`select id, serves from provider_rows order by id`)).toEqual([
    { id: "legacy-sdk", serves: JSON.stringify(STRIPPED_SERVES) },
    { id: "plain-endpoint", serves: null },
    { id: TEXT_PROVIDER, serves: null },
  ]);
  expect(await db.all(sql`select provider_id as providerId, plugin_id as pluginId from plugin_provider_claims`)).toEqual([
    { providerId: TEXT_PROVIDER, pluginId: acme },
  ]);
  const stored = await db.all<{ readonly id: string; readonly manifest: string }>(sql`select id, manifest from plugins order by slug`);
  expect(stored.map((row) => ({ id: row.id, manifest: JSON.parse(row.manifest) as unknown }))).toEqual([
    { id: acme, manifest: manifest("acme", [sdkProvider(STRIPPED_SERVES), TEXT_DEF]) },
    { id: beta, manifest: betaManifest },
  ]);
});
