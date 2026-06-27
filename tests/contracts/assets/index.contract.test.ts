import type { AssetKind, StoredAsset } from "@orb/contracts/assets";
import { ASSET_KINDS, assetKindSchema, BLOB_ROUTE, blobUrl } from "@orb/contracts/assets";
import type { AssetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "vitest";

// ── The upload `kind` axis ───────────────────────────────────────────────────
// The ONE home for the union (§7.5). A drift here would mean the db enum / upload route / client have
// re-spelled it — the whole point of this node.
test("ASSET_KINDS is exactly the 3-member upload-wire axis [card, avatar, export]", () => {
  expect(ASSET_KINDS).toEqual(["card", "avatar", "export"]);
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
const KIND_SEEN: Record<AssetKind, true> = { card: true, avatar: true, export: true };
test("AssetKind has no member beyond the tuple (exhaustive over card|avatar|export)", () => {
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
