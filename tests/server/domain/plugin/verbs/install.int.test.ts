// verb: install — the trust edge (02 §4). Authority is SELF (D147 — any principal installs for themselves and
// the row is stamped ownerId = caller), the untrusted-bundle validation funnel, the grant ⊆ declared refusal,
// the PER-OWNER slug collision, and the disabled-on-install default (enabling is a second act).

import { assets, pluginAssets, plugins } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { HostVersionUnservedError } from "@orb/server/domain/plugin";
import { CapabilityNotGrantedError, ManifestInvalidError, PluginAlreadyInstalledError, PluginNotFoundError } from "@orb/server/domain/plugin";
import { eq, inArray } from "drizzle-orm";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { magicBytes } from "../../../../support/magic-bytes.ts";
import { makeBundle, makePluginHarness, ownerPrincipalFor, principalFor, seedUser } from "../_support.ts";

test("installs a valid bundle: disabled row, granted subset, origin upload, bytes in the CAS", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const bundle = makeBundle({ id: "mood", name: "Mood", capabilities: ["chat.read", "storage.kv"], builtAgainst: { engineVersion: "0.32.0" } });

  const view = await h.service.install({ caller: ownerPrincipalFor(owner), bundle, grant: ["chat.read"] });

  expect(view.slug).toBe("mood");
  expect(view.status).toBe("disabled");
  expect(view.origin).toBe("upload");
  expect(view.grantedCapabilities).toEqual(["chat.read"]); // the paranoid subset, not the full declared set
  expect(view.declaredCapabilities).toEqual(["chat.read", "storage.kv"]); // …and the ASK beside it
  expect(view.netHosts).toBeNull(); // no net.fetch declared ⇒ no allowlist (the manifest biconditional)
  expect(view.builtAgainst).toEqual({ engineVersion: "0.32.0" });
  expect(h.storedBytes.size).toBe(1); // the whole bundle rode the CAS
});

test("the view is ASKED-VS-ALLOWED renderable: declared ⊋ granted, and net.fetch's reach travels with it", async () => {
  // The projection gap this closed: a grant surface carrying only `grantedCapabilities` cannot say the one
  // sentence that makes consent meaningful, and cannot show WHERE a granted `net.fetch` points. Pinned on the
  // INSTALL path; the row path (`toPluginView`) is pinned in list-plugins.int.test.ts — they are one projection
  // now, and this pair is what proves it.
  const db = await freshDb();
  const h = makePluginHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const view = await h.service.install({
    caller: ownerPrincipalFor(owner),
    bundle: makeBundle({ id: "reach", capabilities: ["chat.read", "net.fetch"], netHosts: ["api.vendor.example"] }),
    grant: ["chat.read"],
  });

  expect(view.declaredCapabilities).toEqual(["chat.read", "net.fetch"]);
  expect(view.grantedCapabilities).toEqual(["chat.read"]); // asked for two, allowed one
  expect(view.netHosts).toEqual(["api.vendor.example"]);
});

// D147 — the ruling this test exists to hold. It used to assert the OPPOSITE ("a non-admin caller is
// refused"): install was gated on `can(caller,"admin",{kind:"global"})`, which made plugins an operator
// feature. They are a personal one — a plugin runs under its installer's own ceiling and can reach nothing
// they could not reach themselves — so the gate was a v1 narrowing, not a security boundary.
test("a plain user (role:'user') installs FOR THEMSELVES, and the row is stamped ownerId = caller", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const user = await seedUser(db, { handle: castId<Handle>("user") });

  const view = await h.service.install({ caller: principalFor(user), bundle: makeBundle({ id: "mine" }), grant: [] });

  expect(view.slug).toBe("mine");
  expect(view.status).toBe("disabled");
  // The stamp is the WHOLE authority model (D147) — read off the row, not off the returned view, because the
  // view carries no ownerId and every later verb gates on the column.
  const [row] = await db.select({ ownerId: plugins.ownerId }).from(plugins).where(eq(plugins.id, view.id));
  expect(row?.ownerId).toBe(user);
  // …and it is the caller's OWN list, not a deployment-wide one.
  expect((await h.service.list({ caller: principalFor(user) })).map((p) => p.id)).toEqual([view.id]);
});

test("two different users install the SAME slug — both rows exist, neither collides (the per-owner partition)", async () => {
  // The `plugins_owner_slug_unique` index is on (owner_id, slug), so the slug namespace is PER USER. This is
  // load-bearing under D147: the normal case is now many users holding the same plugin, and a global-slug
  // reading of the collision check would let the first installer deny everyone else the install.
  const db = await freshDb();
  const h = makePluginHarness(db);
  const alice = await seedUser(db, { handle: castId<Handle>("alice") });
  const bob = await seedUser(db, { handle: castId<Handle>("bob") });

  const hers = await h.service.install({ caller: principalFor(alice), bundle: makeBundle({ id: "shared" }), grant: [] });
  const his = await h.service.install({ caller: principalFor(bob), bundle: makeBundle({ id: "shared" }), grant: [] });

  expect(hers.id).not.toBe(his.id);
  expect((await h.service.list({ caller: principalFor(alice) })).map((p) => p.id)).toEqual([hers.id]);
  expect((await h.service.list({ caller: principalFor(bob) })).map((p) => p.id)).toEqual([his.id]);
});

test("a grant the manifest never declared is refused", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const bundle = makeBundle({ capabilities: ["chat.read"] });
  await expect(h.service.install({ caller: ownerPrincipalFor(owner), bundle, grant: ["notify"] })).rejects.toBeInstanceOf(CapabilityNotGrantedError);
});

test("re-installing an already-installed slug is a conflict (use upgrade)", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const bundle = makeBundle({ id: "dup" });
  await h.service.install({ caller: ownerPrincipalFor(owner), bundle, grant: [] });
  await expect(h.service.install({ caller: ownerPrincipalFor(owner), bundle: makeBundle({ id: "dup" }), grant: [] })).rejects.toBeInstanceOf(
    PluginAlreadyInstalledError,
  );
});

test("a corrupt bundle is refused before anything persists", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  await expect(h.service.install({ caller: ownerPrincipalFor(owner), bundle: new Uint8Array([1, 2, 3]), grant: [] })).rejects.toBeInstanceOf(
    ManifestInvalidError,
  );
  expect(h.storedBytes.size).toBe(0); // nothing stored on a validation failure
  expect((await h.service.list({ caller: ownerPrincipalFor(owner) })).length).toBe(0);
});

test("an unsupported host major is a distinct lifecycle refusal before anything persists", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });

  await expect(h.service.install({ caller: ownerPrincipalFor(owner), bundle: makeBundle({ hostVersion: 2 }), grant: [] })).rejects.toMatchObject({
    name: "HostVersionUnservedError",
    code: "plugin_host_version_unserved",
    requested: 2,
    served: [1],
  } satisfies Partial<HostVersionUnservedError>);
  expect(h.storedBytes.size).toBe(0);
  expect(await h.service.list({ caller: ownerPrincipalFor(owner) })).toEqual([]);
});

// ── #820 seam 11: the bundle's own `ui/assets/` images become CAS assets under the INSTALLER, linked through
//    the same `plugin_assets` register #802 minted (so the GC ref registry can see them) and keyed by path.
test("install unpacks ui/assets/ images into the installer's CAS and links each by its bundle path", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });

  const view = await h.service.install({
    caller: ownerPrincipalFor(owner),
    bundle: makeBundle({ id: "sprites" }, undefined, undefined, {
      "ui/assets/happy.png": magicBytes("png"),
      "ui/assets/sad.webp": magicBytes("webp"),
    }),
    grant: [],
  });

  // The bundle zip + the two images: three CAS writes, all under the caller.
  expect(h.storedBytes.size).toBe(3);
  const links = await db.select().from(pluginAssets).where(eq(pluginAssets.pluginId, view.id));
  expect(links.map((link) => link.bundlePath).sort()).toEqual(["ui/assets/happy.png", "ui/assets/sad.webp"]);
  // Every stored image is OWNED BY THE INSTALLER — the row's ownerId is the CAS's own tenancy key.
  const rows = await db
    .select()
    .from(assets)
    .where(
      inArray(
        assets.id,
        links.map((link) => link.assetId),
      ),
    );
  expect(rows.every((row) => row.ownerId === owner)).toBe(true);
  // …and the mime is the SNIFFED one, so the blob route serves what the bytes actually are.
  expect(rows.map((row) => row.mime).sort()).toEqual(["image/png", "image/webp"]);

  // The verb's read side agrees: the path → id map is what a UI node resolves through.
  const map = await h.service.listBundleAssets({ caller: ownerPrincipalFor(owner), pluginId: view.id });
  expect(map.map((entry) => entry.path)).toEqual(["ui/assets/happy.png", "ui/assets/sad.webp"]);
});

test("a REFUSED bundle asset aborts the whole install — no row, no bytes, nothing half-landed", async () => {
  // The trust-edge ordering receipt: `parseBundle` throws before the CAS is touched, so an SVG (or any
  // non-image) in `ui/assets/` cannot leave a partially-installed plugin behind.
  const db = await freshDb();
  const h = makePluginHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });

  await expect(
    h.service.install({
      caller: ownerPrincipalFor(owner),
      bundle: makeBundle({ id: "evil" }, undefined, undefined, { "ui/assets/x.svg": magicBytes("svg") }),
      grant: [],
    }),
  ).rejects.toBeInstanceOf(ManifestInvalidError);

  expect(h.storedBytes.size).toBe(0);
  expect(await h.service.list({ caller: ownerPrincipalFor(owner) })).toEqual([]);
  expect(await db.select().from(pluginAssets)).toEqual([]);
});

// ── A FAILED INSTALL LEAVES NO BLOBS BEHIND ────────────────────────────────────────────────────────────────
// A throw mid-`storeBundleAssets` used to discard the ids it had already written, so the only thing that could
// ever reclaim them was the WEEKLY `assets-gc` mark-sweep (past its one-hour put→link grace). That is a
// fail-safe direction but not this domain's rule: `upgrade` and `uninstall` both reap the ids they just
// orphaned rather than leaving them to the sweep (`schema/plugin.ts`), and the failure path could not because
// the ids died with the throw. The writer now reports what it stored, and the verb reaps it on the way out.
test("a CAS failure mid-image-wave reaps what it already wrote instead of leaving it for the weekly sweep", async () => {
  const db = await freshDb();
  // The bundle zip lands (call 1), the FIRST image lands (call 2), the second image fails (call 3).
  const h = makePluginHarness(db, { failStoreAfter: 2 });
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });

  await expect(
    h.service.install({
      caller: ownerPrincipalFor(owner),
      bundle: makeBundle({ id: "sprites" }, undefined, undefined, {
        "ui/assets/a.png": magicBytes("png"),
        "ui/assets/b.webp": magicBytes("webp"),
      }),
      grant: [],
    }),
  ).rejects.toThrow(/CAS write failed/u);

  // Nothing landed, and nothing was left orphaned: no row, no links, and no unreferenced blobs.
  expect(await h.service.list({ caller: ownerPrincipalFor(owner) })).toEqual([]);
  expect(await db.select().from(pluginAssets)).toEqual([]);
  expect(await db.select().from(assets)).toEqual([]);
  expect(h.storedBytes.size).toBe(0);
});

test("two paths carrying IDENTICAL bytes both resolve — the widened PK keeps both names", async () => {
  // The receipt for the widened `plugin_assets` PK. Under the old (plugin_id, asset_id) key a second path
  // pointing at the same content-addressed id would have collided and been lost, and a node naming it would
  // paint a placeholder forever.
  const db = await freshDb();
  const h = makePluginHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });

  const view = await h.service.install({
    caller: ownerPrincipalFor(owner),
    bundle: makeBundle({ id: "twins" }, undefined, undefined, {
      "ui/assets/a.png": magicBytes("png"),
      "ui/assets/b.png": magicBytes("png"),
    }),
    grant: [],
  });

  const map = await h.service.listBundleAssets({ caller: ownerPrincipalFor(owner), pluginId: view.id });
  expect(map.map((entry) => entry.path)).toEqual(["ui/assets/a.png", "ui/assets/b.png"]);
  expect(map).toHaveLength(2);
});

test("listBundleAssets is owner-scoped — a stranger holding the real pluginId gets a leak-free NOT_FOUND", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const stranger = await seedUser(db, { handle: castId<Handle>("stranger") });
  const view = await h.service.install({
    caller: ownerPrincipalFor(owner),
    bundle: makeBundle({ id: "private-sprites" }, undefined, undefined, { "ui/assets/a.png": magicBytes("png") }),
    grant: [],
  });

  // The apex global role buys nothing here (D147: authority is the owner-scoped row load, not a role), so the
  // stranger is aimed at the row as an OWNER-roled principal too — the strongest caller that must still be refused.
  await expect(h.service.listBundleAssets({ caller: ownerPrincipalFor(stranger), pluginId: view.id })).rejects.toBeInstanceOf(PluginNotFoundError);
  await expect(h.service.listBundleAssets({ caller: principalFor(stranger), pluginId: view.id })).rejects.toBeInstanceOf(PluginNotFoundError);
});
