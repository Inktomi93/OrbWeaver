// domain/character/persistence/backfill-plugin-provenance — the #1708 pre-#1702 plugin-provenance DATA
// repair statement, against a real libSQL db (the .int lane). The boot step that runs it is pinned at
// tests/server/entry/boot/backfill-plugin-provenance.int.test.ts.
//
// THE CANDIDATE PREDICATE (`importedFrom IS NULL AND importHash IS NOT NULL`) is asserted FIRST, on its own:
// an authored row (importHash null) and an already-provenanced row (importedFrom already set) must never be
// touched, whatever their `extensions` happen to carry — the reserved `plugin_<slug>` key only decides WHICH
// plugin, never WHETHER a row is a candidate.

import { parsePluginImportedFrom, pluginImportedFrom } from "@orb/contracts/character";
import { pluginManifestSchema } from "@orb/contracts/plugin";
import type { Db } from "@orb/db";
import { assets, characters, plugins } from "@orb/db";
import type { AssetId, Handle, PluginId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { backfillPluginProvenance } from "@orb/server/domain/character";
import { eq } from "drizzle-orm";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedRawCharacter, seedUser } from "../_support.ts";

const AT = 1_700_000_000_000;
const IMPORT_HASH = "sha256-deadbeef";

async function seedPluginRow(db: Db, ownerId: UserId, slug: string): Promise<PluginId> {
  const pluginId = mintTypeId(ID_PREFIX.plugin);
  const bundleAssetId = castId<AssetId>(`asset_${slug}`);
  await db.insert(assets).values({ id: bundleAssetId, ownerId, kind: "plugin", mime: "application/zip", size: 1, hash: `hash-${slug}`, uploadedAt: AT });
  await db.insert(plugins).values({
    id: pluginId,
    ownerId,
    slug,
    name: "Test Plugin",
    version: "1.0.0",
    manifest: pluginManifestSchema.parse({
      id: slug,
      name: "Test Plugin",
      version: "1.0.0",
      hostVersion: 1,
      entry: "main.js",
      description: "d",
      capabilities: [],
    }),
    bundleAssetId,
    grantedCapabilities: [],
    status: "enabled",
    origin: "upload",
    installedAt: AT,
    updatedAt: AT,
  });
  return pluginId;
}

test("a pre-#1702 plugin-ingested card recovers its plugin identity from the reserved card-state key", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const pluginId = await seedPluginRow(db, owner, "card-atlas");
  const characterId = await seedRawCharacter(db, {
    id: "character_preexisting",
    ownerId: owner,
    importedFrom: null,
    importHash: IMPORT_HASH,
    extensions: { ["plugin_card-atlas"]: { source: "hub", ref: "aria-card", importedAtMs: AT } },
  });

  const result = await backfillPluginProvenance(db);

  expect(result).toStrictEqual({ backfilled: 1, leftAuthored: 0 });
  const row = (await db.select({ importedFrom: characters.importedFrom }).from(characters).where(eq(characters.id, characterId)))[0];
  expect(row?.importedFrom).toBe(pluginImportedFrom(pluginId, IMPORT_HASH));
  expect(parsePluginImportedFrom(row?.importedFrom ?? null)?.pluginId).toBe(pluginId);
});

test("a candidate with NO reserved key is left authored, not guessed", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const characterId = await seedRawCharacter(db, {
    id: "character_no_key",
    ownerId: owner,
    importedFrom: null,
    importHash: IMPORT_HASH,
    extensions: { someOtherResidualKey: "x" },
  });

  const result = await backfillPluginProvenance(db);

  expect(result).toStrictEqual({ backfilled: 0, leftAuthored: 1 });
  const row = (await db.select({ importedFrom: characters.importedFrom }).from(characters).where(eq(characters.id, characterId)))[0];
  expect(row?.importedFrom).toBeNull();
});

test("a reserved key naming an UNINSTALLED plugin is left authored", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  await seedRawCharacter(db, {
    id: "character_uninstalled",
    ownerId: owner,
    importedFrom: null,
    importHash: IMPORT_HASH,
    extensions: { ["plugin_ghost-plugin"]: { source: "hub" } },
  });

  const result = await backfillPluginProvenance(db);

  expect(result).toStrictEqual({ backfilled: 0, leftAuthored: 1 });
});

test("an AUTHORED character (no importHash) is never touched, whatever its extensions carry", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  await seedPluginRow(db, owner, "card-atlas");
  const characterId = await seedRawCharacter(db, {
    id: "character_authored",
    ownerId: owner,
    importedFrom: null,
    importHash: null,
    extensions: { ["plugin_card-atlas"]: { source: "hub" } },
  });

  const result = await backfillPluginProvenance(db);

  expect(result).toStrictEqual({ backfilled: 0, leftAuthored: 0 });
  const row = (await db.select({ importedFrom: characters.importedFrom }).from(characters).where(eq(characters.id, characterId)))[0];
  expect(row?.importedFrom).toBeNull();
});

test("a row ALREADY carrying importedFrom is never re-minted, even with a matching reserved key", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  await seedPluginRow(db, owner, "card-atlas");
  const alreadyStamped = "Aria.png";
  const characterId = await seedRawCharacter(db, {
    id: "character_already_stamped",
    ownerId: owner,
    importedFrom: alreadyStamped,
    importHash: IMPORT_HASH,
    extensions: { ["plugin_card-atlas"]: { source: "hub" } },
  });

  const result = await backfillPluginProvenance(db);

  expect(result).toStrictEqual({ backfilled: 0, leftAuthored: 0 });
  const row = (await db.select({ importedFrom: characters.importedFrom }).from(characters).where(eq(characters.id, characterId)))[0];
  expect(row?.importedFrom).toBe(alreadyStamped);
});

test("IDEMPOTENT — the second run rewrites nothing and leaves the stamped row untouched", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const pluginId = await seedPluginRow(db, owner, "card-atlas");
  const characterId = await seedRawCharacter(db, {
    id: "character_idempotent",
    ownerId: owner,
    importedFrom: null,
    importHash: IMPORT_HASH,
    extensions: { ["plugin_card-atlas"]: { source: "hub" } },
  });

  expect(await backfillPluginProvenance(db)).toStrictEqual({ backfilled: 1, leftAuthored: 0 });
  const stamped = pluginImportedFrom(pluginId, IMPORT_HASH);
  const afterFirst = (await db.select({ importedFrom: characters.importedFrom }).from(characters).where(eq(characters.id, characterId)))[0]?.importedFrom;
  expect(afterFirst).toBe(stamped);

  expect(await backfillPluginProvenance(db)).toStrictEqual({ backfilled: 0, leftAuthored: 0 });
  const afterSecond = (await db.select({ importedFrom: characters.importedFrom }).from(characters).where(eq(characters.id, characterId)))[0]?.importedFrom;
  expect(afterSecond).toBe(stamped);
});
