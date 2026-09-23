// verb test: installFromUrl (U8, seam 15 — the URL install-act arm; the security-review
// subject). Fetch a bundle through the EGRESS GUARD, then run it through the EXACT SAME consent/grant funnel a
// file install rides. The walls this file pins, red-first where the wall is the point:
//   - THE EGRESS GUARD IS THE WALL: an SSRF-blocked fetch collapses to a LEAK-FREE `PluginBundleFetchError` and
//     NOTHING persists.
//   - THE FUNNEL IS THE SAME ONE A FILE INSTALL RIDES: a malicious / non-zip payload is refused by `parseBundle`
//     (`ManifestInvalidError`) before any write; the grant ⊆ declared check is `install`'s own
//     (`CapabilityNotGrantedError`).
//   - THE ORIGIN IS HONEST (U8 2b): a URL install records `origin:"url"` + the fetch URL (so the update-check and
//     one-click upgrade can re-fetch it), where a FILE install records `origin:"upload"` and no sourceUrl.
//
// The infra-level "a URL that resolves to a private IP is refused by safeFetch ITSELF" red-first receipt lives
// beside the other egress attacks (`tests/server/infra/network/fetch-plugin-bundle.suite.test.ts`); this file
// drives the DOMAIN funnel with an injected `fetchBundle` so the SSRF-block outcome and the funnel refusals are
// provable without live DNS.

import type { Db } from "@orb/db";
import { plugins } from "@orb/db";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { CapabilityNotGrantedError, ManifestInvalidError, PluginBundleFetchError } from "@orb/server/domain/plugin";
import { eq } from "drizzle-orm";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeBundle, makePluginHarness, ownerPrincipalFor, seedUser } from "../_support.ts";

const URL = "https://plugins.example.com/my-plugin.zip";

/** A fetch that SUCCEEDS with the given bundle bytes. */
const returns = (bytes: Uint8Array) => (): Promise<Uint8Array> => Promise.resolve(bytes);
/** A fetch that FAILS the way `fetchPluginBundle` throws for an SSRF block / non-2xx / network error. */
const blockedFetch = (): Promise<Uint8Array> => Promise.reject(new Error("SSRF_BLOCKED: collector.internal → 10.1.2.3 (private-address)"));

async function ownedPluginCount(db: Db, owner: UserId): Promise<number> {
  return (await db.select({ id: plugins.id }).from(plugins).where(eq(plugins.ownerId, owner))).length;
}

test("installFromUrl mints the CALLER's own disabled row through the same funnel (grant ⊆ declared)", async () => {
  const db = await freshDb();
  const bundle = makeBundle({ id: "scraper", capabilities: ["chat.read"] });
  const h = makePluginHarness(db, { fetchBundle: returns(bundle) });
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });

  const view = await h.service.installFromUrl({ caller: ownerPrincipalFor(owner), url: URL, grant: ["chat.read"] });

  expect(view.status).toBe("disabled");
  // U8 2b — the origin is HONEST now ("url", not the 2a "upload" placeholder) and the fetch URL is REMEMBERED, so
  // the auto update-check + one-click upgrade can re-fetch it. The projected view carries both.
  expect(view.origin).toBe("url");
  expect(view.sourceUrl).toBe(URL);
  const [row] = await db
    .select({ ownerId: plugins.ownerId, origin: plugins.origin, sourceUrl: plugins.sourceUrl })
    .from(plugins)
    .where(eq(plugins.id, view.id));
  expect(row?.ownerId).toBe(owner);
  expect(row?.origin).toBe("url");
  expect(row?.sourceUrl).toBe(URL);
});

test("a FILE install records origin 'upload' and NO sourceUrl (the update-check has nothing to re-fetch)", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });

  const view = await h.service.install({ caller: ownerPrincipalFor(owner), bundle: makeBundle({ id: "filed", capabilities: [] }), grant: [] });

  expect(view.origin).toBe("upload");
  expect(view.sourceUrl).toBeNull();
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
  const h = makePluginHarness(db, { fetchBundle: returns(new TextEncoder().encode("PK corrupt")) });
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });

  await expect(h.service.installFromUrl({ caller: ownerPrincipalFor(owner), url: URL, grant: [] })).rejects.toBeInstanceOf(ManifestInvalidError);
  expect(await ownedPluginCount(db, owner)).toBe(0);
});
