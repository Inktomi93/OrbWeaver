// substrate: bundle-assets — the ONE writer install and upgrade share for putting a bundle's `ui/assets/`
// images into the installer's CAS (#820 seam 11). It performs no validation by design (every wall is at the
// trust edge in `substrate/manifest`), so what there is to pin is the CONTRACT it owes both verbs: the store
// runs under the CALLER, with the mime the sniff produced, in bundle order, and a mid-way failure reports the
// ids that DID land (so the verb reaps them) without ever handing back a link to bytes that are not there.

import type { StoredAsset } from "@orb/contracts/assets";
import type { Principal } from "@orb/contracts/identity";
import type { AssetId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { PluginBundleAssetLink, PluginBundleAssetStoreOutcome } from "../../../../../packages/server/src/domain/plugin/contract/bundle-assets.ts";
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

/** The links of a successful wave — the failure arm is a different shape and a test that reached for `links`
 *  on it would be asserting against `undefined`. */
function linksOf(outcome: PluginBundleAssetStoreOutcome): readonly PluginBundleAssetLink[] {
  if (!outcome.ok) {
    throw new Error(`the asset wave failed: ${String(outcome.error)}`);
  }
  return outcome.links;
}

test("stores every asset under the CALLER with the SNIFFED mime, and returns links in bundle order", async () => {
  const recorder = recordingStore();
  const links = linksOf(
    await storeBundleAssets(
      recorder.store,
      CALLER,
      [
        { path: "ui/assets/a.png", bytes: magicBytes("png"), mime: "image/png" },
        { path: "ui/assets/b.webp", bytes: magicBytes("webp"), mime: "image/webp" },
      ],
      1234,
    ),
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
  expect(linksOf(await storeBundleAssets(recorder.store, CALLER, [], 1))).toEqual([]);
  expect(recorder.seen).toHaveLength(0);
});

// RULING CHANGED, MECHANISM PRESERVED. This used to pin "a failing store REJECTS rather than returning a
// partial link set", on the reasoning that a function which returned what it managed would invert the
// fail-safe direction. The fail-safe direction is unchanged — no caller writes a `plugin_assets` row from a
// failed wave, and both verbs still THROW. What changed is that the ids are now REPORTED on the way out
// instead of dying with the throw, so the verb can reap what it just orphaned (this domain's rule) rather
// than leaving it to the weekly `assets-gc` sweep. A `links` field on the failure arm would have been the
// inversion the old pin feared; `stored` is deliberately a different field with a different name.
test("a failing store reports the ids it already wrote — and stops, never pressing on", async () => {
  let calls = 0;
  const failingStore = (_caller: Principal, bytes: Uint8Array, _mime: string): Promise<StoredAsset> => {
    calls += 1;
    if (calls === 2) {
      return Promise.reject(new Error("cas write failed"));
    }
    return Promise.resolve({ assetId: castId<AssetId>(`asset_stub${calls}`), hash: "h", size: bytes.length, created: true });
  };

  const outcome = await storeBundleAssets(
    failingStore,
    CALLER,
    [
      { path: "ui/assets/a.png", bytes: magicBytes("png"), mime: "image/png" },
      { path: "ui/assets/b.png", bytes: magicBytes("png"), mime: "image/png" },
      { path: "ui/assets/c.png", bytes: magicBytes("png"), mime: "image/png" },
    ],
    1,
  );

  expect(outcome.ok).toBe(false);
  // The one blob that DID land is named, so the verb can reap exactly it…
  expect(outcome.ok ? [] : outcome.stored).toEqual(["asset_stub1"]);
  // …the original failure is carried through unchanged (the verb rethrows it — a caller sees the CAS error)…
  expect(String(outcome.ok ? "" : outcome.error)).toContain("cas write failed");
  // …and it stopped at the failure rather than pressing on to the third image.
  expect(calls).toBe(2);
});
