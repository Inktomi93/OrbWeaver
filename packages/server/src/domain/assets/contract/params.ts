// domain/assets/contract/params — every verb's *Params, declared ONCE (§7.4 — one type home). `AssetKind`
// is the upload-wire `kind` axis; its canonical home is `@orb/contracts/assets` (the db enum, the route,
// and the client all derive from the SAME tuple — §7.5 `no-inline-union-redecl`), imported here TYPE-ONLY
// so the verb signatures reference one name (consumers reach it via `@orb/contracts/assets` directly). This
// stays a pure-type file (no `z.object` → no contract-test obligation here; the kind schema is tested in
// `tests/contracts/assets/`).
//
// Every verb carries the resolved `principal` (spine §7.1) — ownership is scoped off `principal.userId`,
// the single source of truth for "whose blobs" (NEVER a `users` read — the `no-direct-users-read` gate).

import type {
  AssetKind,
  GalleryAddParams as GalleryAddWireParams,
  GalleryListParams as GalleryListWireParams,
  ListOwnedParams as ListOwnedWireParams,
  VariantKind,
} from "@orb/contracts/assets";
import type { Principal } from "@orb/contracts/identity";
import type { GalleryItemId } from "@orb/kit/ids";

/** Common to every assets verb: the acting principal whose `userId` scopes ownership. */
interface AssetsActorParams {
  readonly principal: Principal;
}

// The gallery verbs' params = the WIRE shape (from `@orb/contracts/assets`) ∩ the acting principal. The wire
// carries no principal (it's server-resolved §7.1); the `& AssetsActorParams` intersection adds it here so
// the verb signatures reference one name. `removeFromGallery` has no wire-params sibling (a single id), so it
// gets a plain interface.

export type ListOwnedParams = ListOwnedWireParams & AssetsActorParams;
export type GalleryAddParams = GalleryAddWireParams & AssetsActorParams;
export type GalleryListParams = GalleryListWireParams & AssetsActorParams;

export interface RemoveFromGalleryParams extends AssetsActorParams {
  readonly galleryItemId: GalleryItemId;
}

export interface StoreParams extends AssetsActorParams {
  /** The raw bytes to content-address. The CAS hashes them; the `hash`/`size` are derived, not supplied. */
  readonly bytes: Uint8Array;
  readonly kind: AssetKind;
  /** The claimed MIME. With `enforceMagic`, verified against the byte signature before reaching CAS. */
  readonly mime: string;
  /** Verify the claimed mime against the magic bytes (invariant #6 — the upload boundary passes `true`).
   *  Omitted/`false` for trusted non-HTTP callers (DR rebuild, future import backfill). */
  readonly enforceMagic?: boolean;
  /** PD-94 — the hard cap on the byte length accepted into the CAS. Rejected BEFORE the blob is written
   *  (the store's own belt, over and above the HTTP route's body cap). Omitted = no store-level cap (trusted
   *  callers whose input is already bounded). The asset-bearing upload/import paths pass it. */
  readonly maxBytes?: number;
}

export interface GetMetadataParams extends AssetsActorParams {
  /** The CAS key (sha-256 hex) to look up among the caller's own assets. */
  readonly hash: string;
}

export interface ResolveVariantParams extends AssetsActorParams {
  /** The CAS key (sha-256 hex) of the owned original to derive a variant from. */
  readonly hash: string;
  /** The requested display width (px); snapped to the fixed ladder (`icon` → `BLOB_WIDTHS`/
   *  `snapBlobWidth`, `portrait` → `PORTRAIT_WIDTHS`/`snapPortraitWidth`, `substrate/variant-policy`)
   *  before any cache/transform — `kind` selects the ladder. */
  readonly width: number;
  /** Which ladder/crop to produce. `icon` is the existing width-only, any-aspect ladder; `portrait` is the
   *  2:3 smart-cropped ladder (`FINAL-Persona-and-Immersive-Chat-Visuals.md` §B.4). Required — the blob
   *  route always resolves it explicitly from `?v=`, so no caller silently falls through to the wrong
   *  ladder. */
  readonly kind: VariantKind;
}
