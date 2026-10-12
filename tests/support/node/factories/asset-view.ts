// Wire-output builder for an owned-asset blob reference (`assets.resolveBlobRefs`). The defaults parse through
// the contract schema; an override is spread after the parse.

import { assetBlobRefSchema } from "@orb/contracts/assets";
import { ID_PREFIX } from "@orb/kit/ids";
import { createSeededIds } from "../../iso/ids.ts";
import type { TrpcWireOutput } from "../route-trpc.ts";

const ids = createSeededIds();

type AssetBlobRefWire = TrpcWireOutput<"assets.resolveBlobRefs">[number];

/** A PNG blob of unknown dimensions. */
export function makeAssetBlobRef(overrides: Partial<AssetBlobRefWire> = {}): AssetBlobRefWire {
  return {
    ...assetBlobRefSchema.parse({ assetId: ids.next(ID_PREFIX.asset), hash: "deadbeef", mime: "image/png", width: null, height: null }),
    ...overrides,
  };
}
