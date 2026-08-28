// verb tests: previewFromUrl / installFromUrl / upgradeFromUrl (plugin-ui-plane #679 U8, seam 15 — the URL
// install/update funnel; the security-review subject). The walls this file pins, red-first where the wall is
// the point:
//   - THE EGRESS GUARD IS THE WALL: any fetch failure — the SSRF-block shape included — collapses to a
//     LEAK-FREE `PluginBundleFetchError` (the underlying reason never crosses into the message), and NOTHING
//     persists.
//   - THE FUNNEL IS THE SAME ONE A FILE INSTALL RIDES: a malicious / non-zip payload is refused by `parseBundle`
//     (`ManifestInvalidError`) before anything persists; the grant ⊆ declared check is `install`'s own.
//   - NEVER-SILENT-UPDATE: `upgradeFromUrl` keeps #615's re-consent wall — a reach-widening bundle lands the row
//     DISABLED pending re-consent — and its owner scope is checked BEFORE any fetch, so a stranger's pluginId is
//     NOT_FOUND without the server ever egressing on their behalf.
//
// The infra-level "a URL that resolves to a private IP is refused by safeFetch ITSELF" red-first receipt lives
// beside the other egress attacks (`tests/server/infra/network/fetch-plugin-bundle.suite.test.ts`); this file
// drives the DOMAIN funnel with an injected `fetchBundle` so the SSRF-block outcome and the funnel refusals are
// provable without live DNS.

import type { Db } from "@orb/db";
import { plugins } from "@orb/db";
import type { Handle, PluginId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { CapabilityNotGrantedError, ManifestInvalidError, PluginBundleFetchError, PluginNotFoundError } from "@orb/server/domain/plugin";
import { eq } from "drizzle-orm";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeBundle, makePluginHarness, ownerPrincipalFor, seedUser } from "../_support.ts";

const URL = "https://plugins.example.com/my-plugin.zip";

/** A fetch that SUCCEEDS with the given bundle bytes. */
const returns = (bytes: Uint8Array) => (): Promise<Uint8Array> => Promise.resolve(bytes);
/** A fetch that FAILS — the shape `fetchPluginBundle` throws for an SSRF block / non-2xx / network error. The
 *  message deliberately carries an "internal" detail (a resolved private address) so the leak-free test can
 *  prove that detail never reaches the caller-facing `PluginBundleFetchError`. */
const blockedFetch = (): Promise<Uint8Array> => Promise.reject(new Error("SSRF_BLOCKED: collector.internal → 10.1.2.3 (private-address)"));

async function ownedPluginCount(db: Db, owner: UserId): Promise<number> {
  return (await db.select({ id: plugins.id }).from(plugins).where(eq(plugins.ownerId, owner))).length;
}

// ── previewFromUrl — fetch + parse, return the manifest (the consent-screen + update-version primitive) ───────

test("previewFromUrl returns the fetched manifest (the consent screen reads its declared capabilities)", async () => {
  const db = await freshDb();
  const bundle = makeBundle({ id: "hub-scraper", version: "2.1.0", capabilities: ["chat.read", "net.fetch"], netHosts: ["api.hub.example"] });
  const h = makePluginHarness(db, { fetchBundle: returns(bundle) });
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });

  const manifest = await h.service.previewFromUrl({ caller: ownerPrincipalFor(owner), url: URL });

  expect(manifest.id).toBe("hub-scraper");
  expect(manifest.version).toBe("2.1.0");
  expect(manifest.capabilities).toEqual(["chat.read", "net.fetch"]);
  expect(manifest.netHosts).toEqual(["api.hub.example"]);
});

test("previewFromUrl on a malicious / non-zip payload is refused by the SAME funnel (ManifestInvalidError)", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db, { fetchBundle: returns(new TextEncoder().encode("<html>not a zip</html>")) });
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });

  await expect(h.service.previewFromUrl({ caller: ownerPrincipalFor(owner), url: URL })).rejects.toBeInstanceOf(ManifestInvalidError);
});

test("a fetch failure is a LEAK-FREE PluginBundleFetchError — the block reason never crosses into the message", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db, { fetchBundle: blockedFetch });
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });

  const err = await h.service.previewFromUrl({ caller: ownerPrincipalFor(owner), url: URL }).catch((e: unknown) => e);
  expect(err).toBeInstanceOf(PluginBundleFetchError);
  const message = (err as Error).message;
  // The URL the caller supplied is named; the SSRF-block internals (the resolved private IP, the "private-address"
  // reason) are NOT — surfacing them would turn this into an SSRF oracle. (The cause carries them for the server
  // log only; tRPC never serializes `cause`.)
  expect(message).toContain(URL);
  expect(message).not.toContain("10.1.2.3");
  expect(message).not.toContain("private-address");
});

// ── installFromUrl — fetch through the guard, then the SAME consent/grant funnel a file install rides ─────────

test("installFromUrl mints the CALLER's own disabled row through the same funnel (grant ⊆ declared)", async () => {
  const db = await freshDb();
  const bundle = makeBundle({ id: "scraper", capabilities: ["chat.read"] });
  const h = makePluginHarness(db, { fetchBundle: returns(bundle) });
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });

  const view = await h.service.installFromUrl({ caller: ownerPrincipalFor(owner), url: URL, grant: ["chat.read"] });

  expect(view.status).toBe("disabled");
  const [row] = await db.select({ ownerId: plugins.ownerId, origin: plugins.origin }).from(plugins).where(eq(plugins.id, view.id));
  expect(row?.ownerId).toBe(owner);
  // Origin stays "upload" — the bundle funnel is source-agnostic (design-sanctioned; a URL is just another byte source).
  expect(row?.origin).toBe("upload");
});

test("installFromUrl grant ⊄ declared is refused by install's own consent check (CapabilityNotGrantedError)", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db, { fetchBundle: returns(makeBundle({ id: "scraper", capabilities: ["chat.read"] })) });
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });

  await expect(h.service.installFromUrl({ caller: ownerPrincipalFor(owner), url: URL, grant: ["notify"] })).rejects.toBeInstanceOf(CapabilityNotGrantedError);
});

test("installFromUrl on an SSRF-blocked fetch is a leak-free refusal AND persists NOTHING", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db, { fetchBundle: blockedFetch });
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });

  await expect(h.service.installFromUrl({ caller: ownerPrincipalFor(owner), url: URL, grant: [] })).rejects.toBeInstanceOf(PluginBundleFetchError);
  expect(await ownedPluginCount(db, owner)).toBe(0);
});

test("installFromUrl on a malicious / non-zip payload persists NOTHING (parseBundle refuses before any write)", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db, { fetchBundle: returns(new TextEncoder().encode("PK corrupt")) });
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });

  await expect(h.service.installFromUrl({ caller: ownerPrincipalFor(owner), url: URL, grant: [] })).rejects.toBeInstanceOf(ManifestInvalidError);
  expect(await ownedPluginCount(db, owner)).toBe(0);
});

// ── upgradeFromUrl — never-silent update: reach-widening → disabled; owner scope BEFORE any fetch ─────────────

test("upgradeFromUrl with a reach-WIDENING bundle lands the row DISABLED pending re-consent (never silent)", async () => {
  const db = await freshDb();
  const v2 = makeBundle({ id: "scraper", version: "1.1.0", capabilities: ["chat.read", "notify"] });
  const h = makePluginHarness(db, { fetchBundle: returns(v2) });
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  // Install + enable v1 (granting only chat.read), so a widening upgrade has something to DISABLE.
  const installed = await h.service.install({
    caller: ownerPrincipalFor(owner),
    bundle: makeBundle({ id: "scraper", capabilities: ["chat.read"] }),
    grant: ["chat.read"],
  });
  await h.service.setEnabled({ caller: ownerPrincipalFor(owner), pluginId: installed.id, enabled: true });

  const upgraded = await h.service.upgradeFromUrl({ caller: ownerPrincipalFor(owner), pluginId: installed.id, url: URL });

  // The wall: a widened-reach upgrade comes back disabled + reconsent-pending, and the new cap is NOT granted.
  expect(upgraded.status).toBe("disabled");
  expect(upgraded.version).toBe("1.1.0");
  const [row] = await db.select({ pending: plugins.pendingReconsent }).from(plugins).where(eq(plugins.id, installed.id));
  expect(row?.pending).toBe(true);
});

test("upgradeFromUrl with a strict NARROWING bundle carries the enabled state forward (no forced disable)", async () => {
  const db = await freshDb();
  const v2 = makeBundle({ id: "scraper", version: "1.1.0", capabilities: ["chat.read"] });
  const h = makePluginHarness(db, { fetchBundle: returns(v2) });
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const installed = await h.service.install({
    caller: ownerPrincipalFor(owner),
    bundle: makeBundle({ id: "scraper", capabilities: ["chat.read"] }),
    grant: ["chat.read"],
  });
  await h.service.setEnabled({ caller: ownerPrincipalFor(owner), pluginId: installed.id, enabled: true });

  const upgraded = await h.service.upgradeFromUrl({ caller: ownerPrincipalFor(owner), pluginId: installed.id, url: URL });

  expect(upgraded.version).toBe("1.1.0");
  expect(upgraded.status).toBe("enabled");
});

test("upgradeFromUrl on a FOREIGN / missing pluginId is NOT_FOUND — and the server NEVER fetches on a stranger's behalf", async () => {
  const db = await freshDb();
  let fetched = false;
  const h = makePluginHarness(db, {
    fetchBundle: () => {
      fetched = true;
      return Promise.reject(new Error("fetch must not run for a non-owner"));
    },
  });
  const stranger = await seedUser(db, { handle: castId<Handle>("stranger") });
  const foreignId = castId<PluginId>("plugin_ffffffffffffffffffffffff");

  await expect(h.service.upgradeFromUrl({ caller: ownerPrincipalFor(stranger), pluginId: foreignId, url: URL })).rejects.toBeInstanceOf(PluginNotFoundError);
  // THE ORDERING IS THE SECURITY PROPERTY: the owner-scoped row load ran and refused BEFORE `ctx.fetchBundle`.
  expect(fetched).toBe(false);
});
