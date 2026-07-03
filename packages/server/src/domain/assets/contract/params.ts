// domain/assets/contract/params — every verb's *Params, declared ONCE (§7.4 — one type home). `AssetKind`
// is the upload-wire `kind` axis; its canonical home is `@orb/contracts/assets` (the db enum, the route,
// and the client all derive from the SAME tuple — §7.5 `no-inline-union-redecl`), re-exported here
// TYPE-ONLY so the verb signatures + the front door reference one name. This stays a pure-type file (no
// `z.object` → no contract-test obligation here; the kind schema is tested in `tests/contracts/assets/`).
//
// Every verb carries the resolved `principal` (spine §7.1) — ownership is scoped off `principal.userId`,
// the single source of truth for "whose blobs" (NEVER a `users` read — the `no-direct-users-read` gate).

import type {
  AssetKind,
  GalleryAddParams as GalleryAddWireParams,
  GalleryListParams as GalleryListWireParams,
  ListOwnedParams as ListOwnedWireParams,
} from "@orb/contracts/assets";
import type { Principal } from "@orb/contracts/identity";
import type { GalleryItemId } from "@orb/kit/ids";

export type { AssetKind } from "@orb/contracts/assets";

/** Common to every assets verb: the acting principal whose `userId` scopes ownership. */
export interface AssetsActorParams {
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
}

export interface GetMetadataParams extends AssetsActorParams {
  /** The CAS key (sha-256 hex) to look up among the caller's own assets. */
  readonly hash: string;
}

export interface ResolveVariantParams extends AssetsActorParams {
  /** The CAS key (sha-256 hex) of the owned original to derive a variant from. */
  readonly hash: string;
  /** The requested display width (px); snapped to the fixed ladder before any cache/transform. */
  readonly width: number;
}
