// domain/assets/contract/params — every verb's *Params, declared ONCE (§7.4 — one type home). `AssetKind`
// is the upload-wire `kind` axis; its canonical home is `@orb/contracts/assets` (the db enum, the route,
// and the client all derive from the SAME tuple — §7.5 `no-inline-union-redecl`), re-exported here
// TYPE-ONLY so the verb signatures + the front door reference one name. This stays a pure-type file (no
// `z.object` → no contract-test obligation here; the kind schema is tested in `tests/contracts/assets/`).
//
// Every verb carries the resolved `principal` (spine §7.1) — ownership is scoped off `principal.userId`,
// the single source of truth for "whose blobs" (NEVER a `users` read — the `no-direct-users-read` gate).

import type { AssetKind } from "@orb/contracts/assets";
import type { Principal } from "@orb/contracts/identity";

export type { AssetKind } from "@orb/contracts/assets";

/** Common to every assets verb: the acting principal whose `userId` scopes ownership. */
export interface AssetsActorParams {
  readonly principal: Principal;
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
