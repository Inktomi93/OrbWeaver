import type { AssetKind, StoredAsset, VariantKind } from "@orb/contracts/assets";
import {
  ASSET_KINDS,
  assetKindSchema,
  BLOB_ROUTE,
  blobBannerUrl,
  blobPortraitUrl,
  blobUrl,
  storedAssetSchema,
  VARIANT_KINDS,
  variantKindSchema,
} from "@orb/contracts/assets";
import type { AssetId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "../../support/fixtures";

// ── The upload `kind` axis ───────────────────────────────────────────────────
// The ONE home for the union (§7.5). A drift here would mean the db enum / upload route / client have
// re-spelled it — the whole point of this node.
test("ASSET_KINDS is exactly the upload-wire axis [card, avatar, export, generated, gallery, attachment, document, sprite, background, plugin, pose]", () => {
  expect(ASSET_KINDS).toEqual(["card", "avatar", "export", "generated", "gallery", "attachment", "document", "sprite", "background", "plugin", "pose"]);
  expect(assetKindSchema.options).toEqual(ASSET_KINDS);
});

test("assetKindSchema round-trips every valid kind and rejects non-members", () => {
  for (const kind of ASSET_KINDS) {
    expect(assetKindSchema.parse(kind)).toBe(kind);
  }
  expect(assetKindSchema.safeParse("image").success).toBe(false);
  expect(assetKindSchema.safeParse("png").success).toBe(false);
  expect(assetKindSchema.safeParse("").success).toBe(false);
});

// Exhaustiveness: a `Record<AssetKind, …>` is tsc-red if a member is added/removed, backing the runtime
// assert above with a compile-time guard (no inline re-spelling anywhere).
const KIND_SEEN: Record<AssetKind, true> = {
  card: true,
  avatar: true,
  export: true,
  generated: true,
  gallery: true,
  attachment: true,
  document: true,
  sprite: true,
  background: true,
  plugin: true,
  pose: true,
};
test("AssetKind has no member beyond the tuple (exhaustive over the ASSET_KINDS roster)", () => {
  expect(Object.keys(KIND_SEEN).sort()).toEqual([...ASSET_KINDS].sort());
});

// ── The `/blob/<hash>` route contract (D21 PIN) ──────────────────────────────
// A sample sha-256 hex (64 chars) built from a low-entropy pattern, not pasted (noSecrets).
const SAMPLE_HASH = "ab".repeat(32);

// D21 PIN: the route is the APP-gated path (`/api/blob`), NOT the neo caddy-direct static `/blob` that
// treated the hash as a capability. The owner gate (resolve-caller → fetchOwned) lives at the route; the
// contract just fixes the path the client requests and the server/caddy serve.
test("BLOB_ROUTE is the D21 app-gated path /api/blob (not the neo static /blob)", () => {
  expect(BLOB_ROUTE).toBe("/api/blob");
});

test("blobUrl composes the canonical /api/blob/<hash> route", () => {
  expect(blobUrl(SAMPLE_HASH)).toBe(`/api/blob/${SAMPLE_HASH}`);
  expect(blobUrl(SAMPLE_HASH).startsWith(BLOB_ROUTE)).toBe(true);
});

// ── The upload POST response shape ───────────────────────────────────────────
// Branded AssetId built at the untyped seam (castId is the sanctioned cast) — no pasted ids.
const SAMPLE_ASSET_ID = castId<AssetId>("asset_sample");

test("StoredAsset pins the upload-response shape: assetId+hash+size+created, no ownerId on the wire", () => {
  const stored: StoredAsset = {
    assetId: SAMPLE_ASSET_ID,
    hash: SAMPLE_HASH,
    size: 4096,
    created: true,
  };
  expect(Object.keys(stored).sort()).toEqual(["assetId", "created", "hash", "size"].sort());
  // D21: the uploader already owns it — `ownerId` is stamped server-side, never echoed on the wire.
  expect("ownerId" in stored).toBe(false);
  // `created: false` is the within-user dedup signal (the blob already existed).
  const deduped: StoredAsset = { ...stored, created: false };
  expect(deduped.created).toBe(false);
});

test("storedAssetSchema parses a well-formed upload response and rejects a malformed one", () => {
  // A REAL minted TypeID (not the loose `castId` cast SAMPLE_ASSET_ID above) — `assetIdSchema` validates
  // shape+prefix, so the schema-parse test needs a genuinely well-formed id.
  const mintedAssetId = mintTypeId(ID_PREFIX.asset);
  const parsed = storedAssetSchema.parse({
    assetId: mintedAssetId,
    hash: SAMPLE_HASH,
    size: 4096,
    created: true,
  });
  expect(parsed.assetId).toBe(mintedAssetId);
  expect(storedAssetSchema.safeParse({ assetId: "not_an_asset_id", hash: SAMPLE_HASH }).success).toBe(false);
});

// ── The variant KIND axis (#67 Phase 1 — the portrait smart-crop variant; the immersive-chat redo adds
//    `banner`, Whisper's header-art band) ────
test("VARIANT_KINDS is exactly [icon, portrait, banner] and variantKindSchema derives from it", () => {
  expect(VARIANT_KINDS).toEqual(["icon", "portrait", "banner"]);
  expect(variantKindSchema.options).toEqual(VARIANT_KINDS);
});

test("variantKindSchema round-trips every valid kind and rejects non-members", () => {
  for (const kind of VARIANT_KINDS) {
    expect(variantKindSchema.parse(kind)).toBe(kind);
  }
  expect(variantKindSchema.safeParse("thumbnail").success).toBe(false);
  expect(variantKindSchema.safeParse("").success).toBe(false);
});

const VARIANT_KIND_SEEN: Record<VariantKind, true> = { icon: true, portrait: true, banner: true };
test("VariantKind has no member beyond the tuple (exhaustive over VARIANT_KINDS)", () => {
  expect(Object.keys(VARIANT_KIND_SEEN).sort()).toEqual([...VARIANT_KINDS].sort());
});

test("blobPortraitUrl composes the portrait variant route, distinct from the plain blobUrl", () => {
  const url = blobPortraitUrl(SAMPLE_HASH, 400);
  expect(url).toBe(`/api/blob/${SAMPLE_HASH}?v=portrait&w=400`);
  expect(url.startsWith(blobUrl(SAMPLE_HASH))).toBe(true);
  expect(url).not.toBe(blobUrl(SAMPLE_HASH));
});

test("blobBannerUrl composes the banner variant route, distinct from blobUrl and blobPortraitUrl", () => {
  const url = blobBannerUrl(SAMPLE_HASH, 800);
  expect(url).toBe(`/api/blob/${SAMPLE_HASH}?v=banner&w=800`);
  expect(url.startsWith(blobUrl(SAMPLE_HASH))).toBe(true);
  expect(url).not.toBe(blobUrl(SAMPLE_HASH));
  expect(url).not.toBe(blobPortraitUrl(SAMPLE_HASH, 800));
});
