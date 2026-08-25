// verb: install — the trust edge (02 §4). Authority is SELF (D147 — any principal installs for themselves and
// the row is stamped ownerId = caller), the untrusted-bundle validation funnel, the grant ⊆ declared refusal,
// the PER-OWNER slug collision, and the disabled-on-install default (enabling is a second act).

import { plugins } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { CapabilityNotGrantedError, ManifestInvalidError, PluginAlreadyInstalledError } from "@orb/server/domain/plugin";
import { eq } from "drizzle-orm";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
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
