// Assets produces this owned plate identity; settings consumes it to append the ordinary background library.

import type { AssetId } from "@orb/kit/ids";
import type { Principal } from "#identity";

/** Content-hash dedup identifies the plate without a separate slug column or seed marker. */
export interface SeededPlateAsset {
  readonly assetId: AssetId;
  readonly assetHash: string;
  readonly mime: string;
}

/** Stores one bundled seed plate for a principal, or `null` when the slug has no shipped plate. */
export type StoreSeedPlate = (principal: Principal, slug: string) => Promise<SeededPlateAsset | null>;
