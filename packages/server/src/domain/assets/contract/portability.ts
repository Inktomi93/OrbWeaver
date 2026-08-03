// contract/portability — the types the assets-portability halves (export/import verbs + the pure
// `substrate/portable-asset-file` codec) share. Types-only (no zod, no runtime) — the bundle bytes are
// opaque blobs, not a validated wire payload; the codec validates the FILENAME's fields against boundary
// primitives at parse time.

import type { AssetKind } from "@orb/contracts/assets";
import type { AssetId } from "@orb/kit/ids";
import type { AssetsContext } from "./service.ts";

/** The lossless identity of one portable blob file — everything the target box needs to rebuild the
 *  `assets` row UNDER ITS ORIGINAL ID and restore the bytes (Option-A re-link). */
export interface PortableAssetIdentity {
  /** sha-256 hex of the bytes (the CAS key + the import-side poison-defense target). */
  readonly hash: string;
  /** The ORIGINAL `assets.id` — the blob is restored under this id so FK + inline-text refs re-link with
   *  no remap. */
  readonly id: AssetId;
  readonly kind: AssetKind;
  readonly mime: string;
}

/** The DI slice the portability verbs close over — a structural subset of {@link AssetsContext} (only the
 *  db handle, the CAS byte store, and the injected clock; no imageTransform/emit/id-minter). The entry root
 *  passes the full `AssetsContext`, which satisfies this. */
export type AssetsPortabilityContext = Pick<AssetsContext, "db" | "cas" | "now">;
