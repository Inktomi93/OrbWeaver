// entry/compose/resolve-image-ref — the D45 asset→URL gate wiring. The regression this locks: the canon
// `asset:<id>` ref carries the ROW ID, so the metadata gate MUST be keyed by the resolved content HASH — the
// shipped bug passed the id as `hash`, which never matches the sha-256 `hash` column, so every asset image
// silently dropped. Also covers the PD-28 co-participant path (a member's own upload resolves) + the refusals.

import type { Principal } from "@orb/contracts/identity";
import type { ContentImageRef } from "@orb/kit/content";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ImageRefAssets } from "@orb/server/entry/compose";
import { resolveImageRefToUrl } from "@orb/server/entry/compose";
import { describe, vi } from "vitest";
import { expect, test } from "../../../support/fixtures";

const HOST = castId<UserId>("u_host");
const MEMBER = castId<UserId>("u_member");
const ASSET_ID = "asset_pic1";
const HASH = "contenthash_pic1"; // distinct from the row id — the whole point of the gate-by-hash fix.

const resolveHost = (userId: UserId): Promise<Principal> =>
  Promise.resolve({
    userId,
    role: "user",
    handle: castId<Handle>("host"),
    externalId: null,
    via: "cookie",
  });

const assetRef = (assetId = ASSET_ID): ContentImageRef => ({ kind: "asset", assetId });
const dataUri = (mime: string, bytes: number[]): string =>
  `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;

// biome-ignore lint/security/noSecrets: the describe label is a function name, not a secret.
describe("resolveImageRefToUrl", () => {
  test("external ref passes through unchanged (assets never touched)", async () => {
    const url = await resolveImageRefToUrl({} as ImageRefAssets, resolveHost, {
      ownerId: HOST,
      ref: { kind: "external", url: "https://example.com/x.png" },
    });
    expect(url).toBe("https://example.com/x.png");
  });

  test("host-owned asset resolves — gated by the RESOLVED HASH, not the row id (the regression)", async () => {
    const getMetadata = vi.fn((p: { hash: string }) =>
      Promise.resolve(p.hash === HASH ? { mime: "image/png" } : undefined),
    );
    const assets: ImageRefAssets = {
      assetCasRefById: (id) =>
        Promise.resolve(id === ASSET_ID ? { ownerId: HOST, hash: HASH } : undefined),
      getMetadata,
      loadAssetBytes: () => Promise.resolve(new Uint8Array([1, 2, 3])),
    };
    const url = await resolveImageRefToUrl(assets, resolveHost, { ownerId: HOST, ref: assetRef() });
    expect(url).toBe(dataUri("image/png", [1, 2, 3]));
    // The gate was keyed by coords.hash — NOT ref.assetId (a row id, which never matches the hash column).
    expect(getMetadata).toHaveBeenCalledWith(expect.objectContaining({ hash: HASH }));
    expect(getMetadata).not.toHaveBeenCalledWith(expect.objectContaining({ hash: ASSET_ID }));
  });

  test("co-participant-owned asset resolves through the gate (PD-28 fallback)", async () => {
    const assets: ImageRefAssets = {
      assetCasRefById: () => Promise.resolve({ ownerId: MEMBER, hash: HASH }),
      getMetadata: () => Promise.resolve({ mime: "image/webp" }), // fallback resolved the member's row
      loadAssetBytes: () => Promise.resolve(new Uint8Array([9])),
    };
    const url = await resolveImageRefToUrl(assets, resolveHost, { ownerId: HOST, ref: assetRef() });
    expect(url).toBe(dataUri("image/webp", [9]));
  });

  test("a stranger's asset is refused (gate returns undefined) → null", async () => {
    const assets: ImageRefAssets = {
      assetCasRefById: () => Promise.resolve({ ownerId: MEMBER, hash: HASH }),
      getMetadata: () => Promise.resolve(undefined), // no owner hit + no shared chat → refused
      loadAssetBytes: () => Promise.resolve(new Uint8Array([9])),
    };
    const url = await resolveImageRefToUrl(assets, resolveHost, { ownerId: HOST, ref: assetRef() });
    expect(url).toBeNull();
  });

  test("a gone asset (no coordinates) → null, without touching the gate", async () => {
    const getMetadata = vi.fn();
    const assets: ImageRefAssets = {
      assetCasRefById: () => Promise.resolve(undefined),
      getMetadata,
      loadAssetBytes: () => Promise.resolve(new Uint8Array([9])),
    };
    const url = await resolveImageRefToUrl(assets, resolveHost, { ownerId: HOST, ref: assetRef() });
    expect(url).toBeNull();
    expect(getMetadata).not.toHaveBeenCalled();
  });
});
