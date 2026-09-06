// verb test: upgradeFromShowcase (#1740 — the one-click a DIVERGED seeded showcase install has, since the boot
// auto-upgrade deliberately passes those over). What it pins:
//   - a seeded row whose slug this build ships a NEWER bundle for is taken to that version by the REAL upgrade
//     verb — and the plugin's own `storage.kv` rows survive (an upgrade is not a reinstall);
//   - the OWNER-SCOPED ordering: a stranger holding the owner's REAL pluginId is a leak-free NOT_FOUND, raised
//     BEFORE the shipped set is consulted at all (a stranger cannot learn whether that row is an example);
//   - a plugin this build ships NO bundle for is a typed `PluginNotShowcaseError`, not a NOT_FOUND and not a
//     silent no-op — including a URL install whose slug collides with a shipped one, which stays the owner's
//     own source (the takeover this domain refuses);
//   - #615's wall is UNCHANGED because the bytes go through the same `upgrade`: a bundle that WIDENS declared
//     reach lands the row disabled + pendingReconsent rather than quietly gaining authority.

import { pluginKv } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { PluginNotFoundError, PluginNotShowcaseError } from "@orb/server/domain/plugin";
import { and, eq } from "drizzle-orm";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeBundle, makePluginHarness, makeShowcaseShipping, ownerPrincipalFor, seedUser } from "../_support.ts";

const SLUG = "oracle-deck";

test("upgradeFromShowcase takes a DIVERGED seeded install to the shipped bundle and keeps its stored KV", async () => {
  const db = await freshDb();
  // The build SHIPS 1.2.0; the owner's copy sits at 1.1.0 (they took it over — the boot pass left it alone).
  const h = makePluginHarness(db, { showcase: makeShowcaseShipping([{ id: SLUG, version: "1.2.0", capabilities: ["chat.read"] }]) });
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const caller = ownerPrincipalFor(owner);
  const installed = await h.service.install({ caller, bundle: makeBundle({ id: SLUG, version: "1.1.0", capabilities: ["chat.read"] }), grant: ["chat.read"] });
  // A guest's own persisted state — the thing a reinstall would destroy and an upgrade must not.
  await db.insert(pluginKv).values({ pluginId: installed.id, ownerId: owner, key: "deck", value: JSON.stringify({ drawn: 3 }), updatedAt: 1 });

  const updated = await h.service.upgradeFromShowcase({ caller, pluginId: installed.id });

  expect(updated.version).toBe("1.2.0");
  expect(updated.updateSource).toBe("showcase");
  const kv = await db
    .select({ value: pluginKv.value })
    .from(pluginKv)
    .where(and(eq(pluginKv.pluginId, installed.id), eq(pluginKv.key, "deck")));
  expect(kv[0]?.value).toBe(JSON.stringify({ drawn: 3 }));
});

test("upgradeFromShowcase on a STRANGER's pluginId is a leak-free NOT_FOUND — decided before the shipped set is consulted", async () => {
  const db = await freshDb();
  let bundleAsks = 0;
  const shipping = makeShowcaseShipping([{ id: SLUG, version: "1.2.0" }]);
  const h = makePluginHarness(db, {
    showcase: {
      ...shipping,
      bundle: (slug): Promise<Uint8Array | null> => {
        bundleAsks += 1;
        return shipping.bundle(slug);
      },
    },
  });
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const stranger = await seedUser(db, { handle: castId<Handle>("stranger") });
  const installed = await h.service.install({ caller: ownerPrincipalFor(owner), bundle: makeBundle({ id: SLUG, version: "1.1.0" }), grant: [] });

  await expect(h.service.upgradeFromShowcase({ caller: ownerPrincipalFor(stranger), pluginId: installed.id })).rejects.toBeInstanceOf(PluginNotFoundError);
  // The ordering, not just the verdict: the pack is never asked, so the refusal cannot have been derived from
  // anything about the owner's row.
  expect(bundleAsks).toBe(0);
  // …and the owner's row is untouched.
  const [row] = await h.service.list({ caller: ownerPrincipalFor(owner) });
  expect(row?.version).toBe("1.1.0");
});

test("upgradeFromShowcase on a plugin this build ships no bundle for is a typed PluginNotShowcaseError", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db, { showcase: makeShowcaseShipping([{ id: SLUG, version: "1.2.0" }]) });
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const caller = ownerPrincipalFor(owner);
  const hand = await h.service.install({ caller, bundle: makeBundle({ id: "hand-rolled", version: "1.0.0" }), grant: [] });

  await expect(h.service.upgradeFromShowcase({ caller, pluginId: hand.id })).rejects.toBeInstanceOf(PluginNotShowcaseError);
});

test("upgradeFromShowcase refuses a URL install whose slug collides with a shipped one — that source is the owner's own", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db, {
    fetchBundle: () => Promise.resolve(makeBundle({ id: SLUG, version: "1.1.0" })),
    showcase: makeShowcaseShipping([{ id: SLUG, version: "1.2.0" }]),
  });
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const caller = ownerPrincipalFor(owner);
  const fromUrl = await h.service.installFromUrl({ caller, url: "https://plugins.example.com/oracle-deck.zip", grant: [] });

  // Their remembered source stays the update path (`updateSource: "url"`), and our copy may not be swapped under
  // it — the same "they have taken it over" posture the seeder's divergence oracle holds.
  expect(fromUrl.updateSource).toBe("url");
  await expect(h.service.upgradeFromShowcase({ caller, pluginId: fromUrl.id })).rejects.toBeInstanceOf(PluginNotShowcaseError);
});

test("upgradeFromShowcase keeps #615's wall: a shipped bundle that WIDENS reach lands the row disabled + pendingReconsent", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db, {
    showcase: makeShowcaseShipping([{ id: SLUG, version: "1.2.0", capabilities: ["chat.read", "net.fetch"], netHosts: ["cards.example.com"] }]),
  });
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const caller = ownerPrincipalFor(owner);
  const installed = await h.service.install({ caller, bundle: makeBundle({ id: SLUG, version: "1.1.0", capabilities: ["chat.read"] }), grant: ["chat.read"] });
  await h.service.setEnabled({ caller, pluginId: installed.id, enabled: true });

  const updated = await h.service.upgradeFromShowcase({ caller, pluginId: installed.id });

  expect(updated.version).toBe("1.2.0");
  expect(updated.status).toBe("disabled");
  expect(updated.reconsentPending).toBe(true);
  // The grant is prior ∩ newly-declared — the newly-asked capability is NOT carried in by the update itself.
  expect(updated.grantedCapabilities).toEqual(["chat.read"]);
});
