// verb test: previewFromUrl (U8, seam 15 — the consent-screen + update-version primitive).
// READ-ONLY: fetch a bundle through the EGRESS GUARD and return its MANIFEST; nothing persists. The walls this
// file pins, red-first where the wall is the point:
//   - THE EGRESS GUARD IS THE WALL: any fetch failure — the SSRF-block shape included — collapses to a LEAK-FREE
//     `PluginBundleFetchError` (the underlying reason never crosses into the message).
//   - THE FUNNEL IS THE SAME ONE A FILE INSTALL RIDES: a malicious / non-zip payload is refused by `parseBundle`
//     (`ManifestInvalidError`) before anything is returned.
//
// The infra-level "a URL that resolves to a private IP is refused by safeFetch ITSELF" red-first receipt lives
// beside the other egress attacks (`tests/server/infra/network/fetch-plugin-bundle.suite.test.ts`); this file
// drives the DOMAIN funnel with an injected `fetchBundle` so the SSRF-block outcome and the funnel refusals are
// provable without live DNS.

import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { ManifestInvalidError, PluginBundleFetchError } from "@orb/server/domain/plugin";
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

test("previewFromUrl on a fetch failure is a LEAK-FREE PluginBundleFetchError — the block reason never crosses into the message", async () => {
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
