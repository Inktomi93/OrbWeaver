// Blob-reference defaults project the canonical byte-derived asset row; overrides pass the owner parser.

import { assetBlobRefSchema } from "@orb/contracts/assets";
import type { IdSource } from "@orb/kit/ids";
import type { TrpcWireOutput } from "../route-trpc.ts";
import { makeAsset } from "./asset.ts";

type AssetBlobRefWire = TrpcWireOutput<"assets.resolveBlobRefs">[number];

/** The real byte-derived identity and dimensions of the synthetic asset input. */
export function makeAssetBlobRef(overrides: Partial<AssetBlobRefWire> = {}, source?: IdSource): AssetBlobRefWire {
  const row = makeAsset({}, source);
  return assetBlobRefSchema.parse({
    assetId: row.id,
    hash: row.hash,
    mime: row.mime,
    width: row.width,
    height: row.height,
    ...overrides,
  });
}
