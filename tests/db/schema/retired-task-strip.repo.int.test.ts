// The forward migration strips retired tasks from stored provider rows and plugin manifests and moves nothing else: every
// definition row and every claim, tombstones included, stays, so D265's per-owner claim survives. The boot rehash step
// owns the hash; tests/server/entry/boot/persistence/rehash-plugin-provider-definitions.int.test.ts proves it.
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
  readonly hash: string;
  readonly serves: string | null;
}

test("the forward migration strips retired tasks at rest and keeps every definition row and claim", async () => {
  await using previous = await migrationsBefore(MIGRATION);
  await using lifetime = new AsyncDisposableStack();
  const db = await createDb(":memory:");
  lifetime.defer(() => closeDb(db));
  await runMigrations(db, previous.path);
  const ids = createIdSource(createSeededIds().next);
  const owner = await seedUser(db, {}, ids);
  // A second owner's own definition of the same id names no retired task; its claim is not the migration's to touch.
  const other = await seedUser(db, {}, ids);
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
    (${SDK_PROVIDER}, 'Acme SDK', 'agent-sdk', 'oauthToken', '["agent-sdk"]', '["chat"]', 'url', 0, 'other-sdk-hash', 'plugin'),
    (${TEXT_PROVIDER}, 'Acme text', 'openai-compat', 'endpoint', '["chat-completions"]', null, 'url', 0, 'text-hash', 'plugin')`);
  await db.run(sql`insert into plugin_provider_claims (owner_id, provider_id, definition_hash, plugin_id) values
    (${owner.id}, ${SDK_PROVIDER}, 'sdk-hash', ${acme}), (${owner.id}, ${TEXT_PROVIDER}, 'text-hash', ${acme}),
    (${other.id}, ${SDK_PROVIDER}, 'other-sdk-hash', null)`);

  await runMigrations(db, SHIPPED_MIGRATIONS);

  await expect(assertReferentialIntegrity(db)).resolves.toBeUndefined();
  expect(await db.all<StoredRow>(sql`select id, definition_hash as hash, serves from provider_rows order by id, definition_hash`)).toEqual([
    { id: "legacy-sdk", hash: "admin-hash", serves: JSON.stringify(STRIPPED_SERVES) },
    { id: "plain-endpoint", hash: "plain-hash", serves: null },
    { id: SDK_PROVIDER, hash: "other-sdk-hash", serves: '["chat"]' },
    { id: SDK_PROVIDER, hash: "sdk-hash", serves: JSON.stringify(STRIPPED_SERVES) },
    { id: TEXT_PROVIDER, hash: "text-hash", serves: null },
  ]);
  const claims = await db.all(
    sql`select owner_id as ownerId, provider_id as providerId, definition_hash as hash, plugin_id as pluginId from plugin_provider_claims`,
  );
  expect(claims).toHaveLength(3);
  expect(claims).toEqual(
    expect.arrayContaining([
      { ownerId: owner.id, providerId: SDK_PROVIDER, hash: "sdk-hash", pluginId: acme },
      { ownerId: owner.id, providerId: TEXT_PROVIDER, hash: "text-hash", pluginId: acme },
      { ownerId: other.id, providerId: SDK_PROVIDER, hash: "other-sdk-hash", pluginId: null },
    ]),
  );
  const stored = await db.all<{ readonly id: string; readonly manifest: string }>(sql`select id, manifest from plugins order by slug`);
  expect(stored.map((row) => ({ id: row.id, manifest: JSON.parse(row.manifest) }))).toEqual([
    { id: acme, manifest: manifest("acme", [sdkProvider(STRIPPED_SERVES), TEXT_DEF]) },
    { id: beta, manifest: betaManifest },
  ]);
});
