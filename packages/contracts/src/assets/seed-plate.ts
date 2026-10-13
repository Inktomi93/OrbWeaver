// Assets produces this owned plate identity; settings consumes it to append the ordinary background library.

import type { AssetId } from "@orb/kit/ids";

/** Content-hash dedup identifies the plate without a separate slug column or seed marker. */
export interface SeededPlateAsset {
  readonly assetId: AssetId;
  readonly assetHash: string;
  readonly mime: string;
}
