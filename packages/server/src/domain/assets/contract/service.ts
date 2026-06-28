// domain/assets/contract/service — the typed API surface (read THIS to know everything the slice does).
// Holds:
//   • AssetsContext   the explicit DI bundle the verbs close over (NOT `ReturnType<>` — §7.4 /
//                     no-context-returntype; the conventional re-export home is context.ts, mirroring
//                     every other domain). The bundle is ASSEMBLED at the entry composition root and
//                     handed to `createAssetsService`; assets sideways-imports none of its deps
//                     (domain-no-cross-feature — infra handles + the event op arrive type-only here).
//   • AssetsService   the verb interface (the front door re-exports the type).
//
// SCOPE (4c W1 — the upload/fetch/variant core path): `store` (+ the `asset.created` emit), `getMetadata`
// (the owner-gated blob-serve gate), `resolveVariant` (the snap → cache → transform variant pipeline).
// FLAG[PD-26]: backfillAvatars · collectGarbage · reapIfOrphan · fsck · rebuildFromTree (+ the
// avatar-ref registry) → the assets GC/backfill wave, when `character.remove` can inject `reapIfOrphan`
// and the workloads runner can inject the backfill slice (both are OTHER domains' composition roots —
// building those verbs now would either ship dead, unwired code or collapse tiers). The full 7-verb
// target is `docs/architecture/domains/assets.md` §"Verbs".
//
// Every surface is OWNER-SCOPED off `principal.userId` (§7.1 — never a `users` read; the
// `no-direct-users-read` chokepoint). Assets predate the permission model: there is NO admin/owner guard
// in the bundle (D21 — access control is at the asset itself via `fetchOwned`, not a privileged surface).

import type { EmitDomainEvent } from "@orb/contracts/events";
import type { Db } from "@orb/db";
import type { AssetId } from "@orb/kit/ids";
import type { ImageTransformOptions } from "#infra/image";
import type { Cas, VariantCache } from "#infra/storage";
import type { GetMetadataParams, ResolveVariantParams, StoreParams } from "./params";
import type { AssetMetadata, StoredAsset } from "./results";

/**
 * The DI bundle every assets verb closes over (wired at `service.ts`). Explicit interface (not
 * `ReturnType<typeof …>`) per §7.4 + the `no-context-returntype` gate.
 *   - `db` — the libSQL handle (all DB access routes through `persistence/`).
 *   - `cas` — the per-user content-addressed BYTE store (`infra/storage`, injected DOWN). The domain owns
 *     the index row; the bytes live here; `storeBlob` keeps the pair coherent.
 *   - `variants` — the derived-webp cache (`infra/storage`). OPTIONAL: a caller that never serves variants
 *     (a DR/rebuild env) omits it; `resolveVariant` degrades to recompute-every-time without caching.
 *   - `imageTransform` — the `sharp` adapter op (`infra/image`, D6). The width is already snapped by the
 *     domain's `variant-policy`; this op decodes → resizes → re-encodes (and strips all metadata).
 *   - `emit` — the injected domain-event op (`@orb/contracts/events`). `store` emits `asset.created`; the
 *     domain has ZERO knowledge of subscribers (the embeddings indexer subscribes at the root).
 *   - `now` — the INJECTED clock (epoch-ms). Stamps `assets.uploadedAt` + the CAS mtime touch; no ambient
 *     `Date.now()` in a verb (determinism — `test-determinism`).
 *   - `newAssetId` — the INJECTED id minter. No ambient `mintTypeId()` in a verb (the same seam).
 */
export interface AssetsContext {
  readonly db: Db;
  readonly cas: Cas;
  readonly variants?: VariantCache;
  readonly imageTransform: (bytes: Uint8Array, opts?: ImageTransformOptions) => Promise<Uint8Array>;
  readonly emit: EmitDomainEvent;
  readonly now: () => number;
  readonly newAssetId: () => AssetId;
}

export interface AssetsService {
  /** Persist bytes to the owner's CAS + upsert the index row (the coherence pair). Returns the stored
   *  identity; `created:false` when the same bytes already existed for this owner (within-user dedup,
   *  D21). Emits `asset.created` only on a genuinely new asset. `enforceMagic` (the upload boundary
   *  passes `true`) verifies the claimed mime against the byte signature before anything reaches CAS. */
  readonly store: (params: StoreParams) => Promise<StoredAsset>;
  /** The blob-serve gate: the `{mime,size}` of an asset the CALLER owns, or `undefined` (→ 404) when it
   *  doesn't exist OR isn't theirs (the two collapse — no foreign-existence leak). Owner-scoped off
   *  `principal.userId`. The route resolves the caller (session cookie) then calls this BEFORE serving. */
  readonly getMetadata: (params: GetMetadataParams) => Promise<AssetMetadata | undefined>;
  /** Resolve a resized-webp variant of an owned blob: snap the requested width to the ladder → cache-read
   *  → on miss, transform the owner's CAS original via the injected `imageTransform` and cache it. Returns
   *  the webp bytes, or `undefined` (→ 404) for a non-hash, an off-ladder width, or a blob the caller
   *  doesn't own (per-user CAS keying is the physical gate). */
  readonly resolveVariant: (params: ResolveVariantParams) => Promise<Uint8Array | undefined>;
  /** The image-embed canon re-reader: the CAS bytes of an asset by id ALONE (NO owner gate — D20: the vector
   *  substrate carries no `ownerId`; the indexer is a trusted SYSTEM re-reader, never a user-facing surface).
   *  `null` when the asset row is gone; a present-row-missing-blob is an integrity fault (`cas.read` throws).
   *  NOT routed through `getMetadata`'s owner gate; wired only into the embeddings indexer at the root. */
  readonly loadAssetBytes: (assetId: AssetId) => Promise<Uint8Array | null>;
}
