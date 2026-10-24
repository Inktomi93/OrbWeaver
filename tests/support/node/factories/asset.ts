// Asset seeds run the production verbs and return their outcomes; rows-tier twins in `rows/asset.ts` read the rows.

import type { assets } from "@orb/db";
import type { AssetId } from "@orb/kit/ids";
import { writeCardChunk } from "@orb/kit/png-card-chunk";
import type { AssetsService } from "@orb/server/domain/assets";
import type { ServerProducerRoot } from "../server.ts";

export type AssetRow = typeof assets.$inferSelect;

const BASE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGM4ISeHFTEMLQkAkL9BAbKfPiIAAAAASUVORK5CYII=",
  "base64",
);

/** Distinct, deterministic image bytes for a real asset-store input. */
export function makeAssetBytes(assetId: AssetId): Uint8Array {
  return writeCardChunk(BASE_PNG, JSON.stringify({ fixtureAssetId: assetId }));
}

export interface SeededAsset {
  readonly stored: Awaited<ReturnType<AssetsService["store"]>>;
}

/** Run the CAS-backed writer; its returned identity includes an existing owner's dedup winner. */
export async function seedAsset(root: ServerProducerRoot, params: Parameters<AssetsService["store"]>[0]): Promise<SeededAsset> {
  return { stored: await root.services.assets.store(params) };
}
