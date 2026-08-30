// substrate: bundle-assets — the ONE writer install and upgrade share for putting a bundle's `ui/assets/`
// images into the installer's CAS (#820 seam 11). It performs no validation by design (every wall is at the
// trust edge in `substrate/manifest`), so what there is to pin is the CONTRACT it owes both verbs: the store
// runs under the CALLER, with the mime the sniff produced, in bundle order, and a mid-way throw leaves
// unreferenced blobs rather than a link to bytes that are not there.

import type { StoredAsset } from "@orb/contracts/assets";
import type { Principal } from "@orb/contracts/identity";
import type { AssetId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { storeBundleAssets } from "../../../../../packages/server/src/domain/plugin/substrate/bundle-assets.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { magicBytes } from "../../../../support/magic-bytes.ts";

const CALLER: Principal = {
  userId: castId<UserId>("user_bundle_assets"),
  role: "user",
  handle: castId<Handle>("owner"),
  externalId: null,
  via: "fallback",
};

/** A recording CAS store: hands back a deterministic id per call and remembers exactly what it was asked to
 *  write, so the assertions are about WHAT CROSSED the seam rather than about a database. */
function recordingStore(): {
  readonly seen: { principal: Principal; mime: string; bytes: Uint8Array }[];
  readonly store: (caller: Principal, bytes: Uint8Array, mime: string) => Promise<StoredAsset>;
} {
  const seen: { principal: Principal; mime: string; bytes: Uint8Array }[] = [];
  return {
    seen,
    store: (caller, bytes, mime): Promise<StoredAsset> => {
      seen.push({ principal: caller, mime, bytes });
      return Promise.resolve({ assetId: castId<AssetId>(`asset_stub${seen.length}`), hash: `hash-${seen.length}`, size: bytes.length, created: true });
    },
  };
}

test("stores every asset under the CALLER with the SNIFFED mime, and returns links in bundle order", async () => {
  const recorder = recordingStore();
  const links = await storeBundleAssets(
    recorder.store,
    CALLER,
    [
      { path: "ui/assets/a.png", bytes: magicBytes("png"), mime: "image/png" },
      { path: "ui/assets/b.webp", bytes: magicBytes("webp"), mime: "image/webp" },
    ],
    1234,
  );

  expect(links.map((link) => link.bundlePath)).toEqual(["ui/assets/a.png", "ui/assets/b.webp"]);
  expect(links.every((link) => link.at === 1234)).toBe(true);
  // The Principal is the installer's, on EVERY write — the CAS's tenancy key is the store's `principal`, so a
  // writer that dropped it would put a plugin's art in nobody's (or somebody else's) library.
  expect(recorder.seen.every((call) => call.principal === CALLER)).toBe(true);
  // …and the mime is the one the funnel sniffed, forwarded verbatim rather than re-derived from the filename.
  expect(recorder.seen.map((call) => call.mime)).toEqual(["image/png", "image/webp"]);
});

test("an empty asset set writes nothing and returns nothing — the pre-#820 bundle's path", async () => {
  const recorder = recordingStore();
  expect(await storeBundleAssets(recorder.store, CALLER, [], 1)).toEqual([]);
  expect(recorder.seen).toHaveLength(0);
});

test("a failing store REJECTS rather than returning a partial link set", async () => {
  // The fail-safe direction: the caller's whole install/upgrade throws, the already-written blobs are left
  // unreferenced for the scheduled sweep, and no `plugin_assets` row is ever written pointing at bytes that
  // did not land. A function that swallowed the failure and returned the links it managed would invert that.
  let calls = 0;
  const failingStore = (_caller: Principal, bytes: Uint8Array, _mime: string): Promise<StoredAsset> => {
    calls += 1;
    if (calls === 2) {
      return Promise.reject(new Error("cas write failed"));
    }
    return Promise.resolve({ assetId: castId<AssetId>("asset_stub1"), hash: "h", size: bytes.length, created: true });
  };

  await expect(
    storeBundleAssets(
      failingStore,
      CALLER,
      [
        { path: "ui/assets/a.png", bytes: magicBytes("png"), mime: "image/png" },
        { path: "ui/assets/b.png", bytes: magicBytes("png"), mime: "image/png" },
        { path: "ui/assets/c.png", bytes: magicBytes("png"), mime: "image/png" },
      ],
      1,
    ),
  ).rejects.toThrow("cas write failed");
  expect(calls).toBe(2); // …and it stopped at the failure rather than pressing on
});
