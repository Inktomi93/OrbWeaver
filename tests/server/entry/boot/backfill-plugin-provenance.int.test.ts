// entry/boot/backfill-plugin-provenance — the boot STEP for the #1708 pre-#1702 plugin-provenance data
// repair, against a real libSQL db (the .int lane). The repair's own semantics (the candidate predicate, the
// reserved-key plugin recovery, leaving an unrecoverable candidate authored, idempotence) are pinned at the
// persistence mirror, tests/server/domain/character/persistence/backfill-plugin-provenance.int.test.ts; this
// file pins only what the boot door adds — that it reaches the persistence statement and hands back its
// counts — so a compose-time rewire that stops calling it goes red here rather than silently leaving every
// pre-#1702 plugin-ingested card reading "Made here" forever.

import { pluginImportedFrom } from "@orb/contracts/character";
import { pluginManifestSchema } from "@orb/contracts/plugin";
import type { Db } from "@orb/db";
import { assets, characters, plugins } from "@orb/db";
import type { AssetId, CharacterId, Handle, PluginId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { backfillPluginProvenanceOnBoot } from "@orb/server/entry/boot";
import { eq } from "drizzle-orm";
import { freshDb } from "../../../support/db.ts";
import { seedUser } from "../../../support/factories/user.ts";
import { expect, test } from "../../../support/fixtures.ts";

const AT = 1_700_000_000_000;
const IMPORT_HASH = "sha256-boot-fixture";

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

async function seedPreFix1702Card(db: Db, ownerId: UserId, slug: string): Promise<CharacterId> {
  const characterId = castId<CharacterId>("character_boot_fixture");
  await db.insert(characters).values({
    id: characterId,
    handle: castId(characterId),
    ownerId,
    name: "Aria",
    starred: false,
    archived: false,
    synthetic: false,
    importedFrom: null,
    importHash: IMPORT_HASH,
    contentHash: "seed_content_hash",
    createdAt: AT,
    extensions: { [`plugin_${slug}`]: { source: "hub", ref: "aria-card", importedAtMs: AT } },
  });
  return characterId;
}

test("the boot step reaches the persistence repair, reports its counts, and is a no-op on the next boot", async () => {
  const db = await freshDb();
  const owner = castId<UserId>("user_boot_fixture_owner");
  await seedUser(db, { id: owner, handle: castId<Handle>("owner") });
  const pluginId = await seedPluginRow(db, owner, "card-atlas");
  const characterId = await seedPreFix1702Card(db, owner, "card-atlas");

  expect(await backfillPluginProvenanceOnBoot({ db })).toStrictEqual({ backfilled: 1, leftAuthored: 0 });
  const row = (await db.select({ importedFrom: characters.importedFrom }).from(characters).where(eq(characters.id, characterId)))[0];
  expect(row?.importedFrom).toBe(pluginImportedFrom(pluginId, IMPORT_HASH));

  // The second boot matches nothing: the predicate (`importedFrom IS NULL`), not a marker, makes it idempotent.
  expect(await backfillPluginProvenanceOnBoot({ db })).toStrictEqual({ backfilled: 0, leftAuthored: 0 });
});
