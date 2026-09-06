// domain/plugin/persistence/wire-name-census — the slug census the #1391 migration reasons over, against a
// real libSQL db (the .int lane).
//
// The two properties that matter are both about WIDTH, because width is this read's entire safety argument
// (its header: it is the plugin domain's one cross-owner read, and it is safe only because a set of slug
// strings names no subject any verb could act on):
//   • it spans OWNERS — a rename decided from one user's shelf would happily rewrite rows belonging to a
//     namespace another user's plugin occupies, which is exactly the ambiguity the migration must refuse;
//   • it DEDUPES — the seeded showcase plugins exist once per installer, and a duplicated slug would run the
//     rewrite loop once per install for no reason.

import { pluginManifestSchema } from "@orb/contracts/plugin";
import type { Db } from "@orb/db";
import { assets, plugins } from "@orb/db";
import type { AssetId, Handle, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { readInstalledPluginSlugs } from "@orb/server/domain/plugin";
import { freshDb } from "../../../../support/db.ts";
import { seedUser } from "../../../../support/factories/user.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const AT = 1_700_000_000_000;

async function installPlugin(db: Db, ownerId: UserId, slug: string): Promise<void> {
  const bundleAssetId = castId<AssetId>(`asset_${ownerId}_${slug}`);
  await db
    .insert(assets)
    .values({ id: bundleAssetId, ownerId, kind: "plugin", mime: "application/zip", size: 1, hash: `hash-${ownerId}-${slug}`, uploadedAt: AT });
  await db.insert(plugins).values({
    id: mintTypeId(ID_PREFIX.plugin),
    ownerId,
    slug,
    name: slug,
    version: "1.0.0",
    manifest: pluginManifestSchema.parse({ id: slug, name: slug, version: "1.0.0", hostVersion: 1, entry: "main.js", description: "d", capabilities: [] }),
    bundleAssetId,
    grantedCapabilities: [],
    status: "enabled",
    origin: "upload",
    installedAt: AT,
    updatedAt: AT,
  });
}

test("an empty install shelf reads as no slugs, not a crash", async () => {
  const db = await freshDb();
  expect(await readInstalledPluginSlugs(db)).toEqual([]);
});

test("the census spans OWNERS and DEDUPES — one entry per distinct slug, however many people installed it", async () => {
  const db = await freshDb();
  const alice = await seedUser(db, { handle: castId<Handle>("alice") });
  const bob = await seedUser(db, { handle: castId<Handle>("bob") });
  await installPlugin(db, alice.id, "oracle-deck");
  await installPlugin(db, bob.id, "oracle-deck");
  // Bob's `oracle` is what makes Alice's `oracle-deck` namespace ambiguous — a per-owner read would never see
  // it, and would have rewritten Alice's rows into a namespace Bob's plugin can also speak through.
  await installPlugin(db, bob.id, "oracle");

  expect(new Set(await readInstalledPluginSlugs(db))).toEqual(new Set(["oracle-deck", "oracle"]));
  expect((await readInstalledPluginSlugs(db)).length).toBe(2);
});

test("a DISABLED plugin is still in the census — its persisted tool names outlive its enablement", async () => {
  // Status is deliberately not a filter: a disabled plugin's past tool calls are still in the transcript, and
  // its namespace still has to be reasoned about (both to migrate it and to refuse an ambiguity it creates).
  const db = await freshDb();
  const alice = await seedUser(db, { handle: castId<Handle>("alice") });
  await installPlugin(db, alice.id, "card-atlas");
  await db.update(plugins).set({ status: "disabled" });

  expect(await readInstalledPluginSlugs(db)).toEqual(["card-atlas"]);
});
