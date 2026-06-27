// `@orb/contracts/assets` — the content-addressed asset WIRE: the upload `kind` axis, the upload POST
// response shape, and the `/blob/<hash>` route contract. Cross-boundary: the client builds blob URLs +
// reads the upload result, the server/caddy serve the route, and the db `assets.kind` enum derives from
// the SAME `ASSET_KINDS` tuple. ONE home (§7.5 `no-inline-union-redecl`): the kind union was re-spelled
// inline across the db enum, the upload-route validation, the client `uploadAsset` helper, and the neo
// `shared/_kit/assets.ts` type — all collapse here. The pure hash GUARD (`isAssetHash`) is a leaf
// primitive in `@orb/kit/assets` (NOT re-exported); the variant-width ladder (`BLOB_WIDTHS` /
// `snapBlobWidth`) is domain POLICY (`domain/assets/substrate`), NOT a contract. Ported from neo-tavern
// `shared/_kit/assets.ts` (the wire parts) + `client/lib/assets.ts` (whose hand-redeclared
// `UploadedAsset` collapses into `StoredAsset`).
//
// D21 — assets are PER-USER (single-owned) and owner-gated; the 64-hex hash is NOT a capability
// (reverses the neo "unauthenticated, hash = capability, `public` cache" model). The `/blob/:hash` route
// is APP-gated: the caller is resolved from the same-origin session cookie → `fetchOwned` (or the narrow
// roster-avatar membership exception) → serve or 404. caddy skips forward-auth on this prefix so an
// `<img>` GET isn't 302-bounced to login, but the app is the gate — hence the route is the app path
// (`/api/blob`), and the served response carries `Cache-Control: private, immutable` (a per-user cache,
// never `public`).

import type { AssetId } from "@orb/kit/ids";
import { z } from "zod";

// ── The upload `kind` axis (ONE home; db enum + route + client all derive from this tuple) ───────────

/** The kinds of binary we content-address. `card` = a character-card PNG (also the avatar); `avatar` =
 *  a persona avatar; `export` = a future generated export (declared intent — the export-blob write path
 *  is unwired in v1, kept per "unwired ≠ worthless"). The db `assets.kind` enum derives from this tuple. */
export const ASSET_KINDS = ["card", "avatar", "export"] as const;

/** The upload-wire `kind` field; `z.enum` over {@link ASSET_KINDS} (the union's single source of truth —
 *  `no-inline-union-redecl`). */
export const assetKindSchema = z.enum(ASSET_KINDS);

export type AssetKind = z.infer<typeof assetKindSchema>;

// ── The `/blob/<hash>` route contract (D21 owner-gated) ──────────────────────────────────────────────

/** The app route prefix that serves a content-addressed blob. APP-gated (D21): the caller is resolved
 *  from the same-origin session cookie and `fetchOwned` BEFORE serve — the hash is NOT a capability.
 *  caddy skips forward-auth on this prefix (so an `<img>` GET isn't 302-bounced to login), but the app is
 *  the gate; the served response is `Cache-Control: private, immutable` (a per-user cache, never the neo
 *  `public`). The path is the app path (`/api/blob`), not a caddy-direct static path. */
export const BLOB_ROUTE = "/api/blob";

/** The URL the client uses to fetch a blob: `/api/blob/<hash>`. Pure string compose (no I/O) — the
 *  format/path-traversal guard `isAssetHash` (`@orb/kit/assets`) is applied server-side at path
 *  construction, and ownership is the real authz (D21). Display transforms (`?w=` / `?f=webp`, the avatar
 *  size ladder) are a CLIENT concern layered on top of this canonical route. */
export function blobUrl(hash: string): string {
  return `${BLOB_ROUTE}/${hash}`;
}

// ── The upload POST response (collapses the client's hand-redeclared `UploadedAsset`) ────────────────

/** The response from `POST /api/assets/upload` — the persisted asset's identity. The client redeclared
 *  this as `UploadedAsset` (with an unbranded `assetId: string`); collapsed here to the ONE shape with a
 *  branded {@link AssetId} (the client casts at its consumer seam). No `ownerId` on the wire — the
 *  uploader already owns it; D21 stamps `ownerId` from the `Principal` server-side. */
export interface StoredAsset {
  assetId: AssetId;
  hash: string;
  size: number;
  /** `false` if the blob already existed (within-user content-addressed dedup, D21). */
  created: boolean;
}
