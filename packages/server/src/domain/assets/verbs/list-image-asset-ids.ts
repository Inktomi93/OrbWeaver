// verb: listImageAssetIds — the embeddings embed pass's enumeration read (PD-53). UN-PRINCIPAL by design
// (D20): the vector substrate carries NO `ownerId`, so the catch-up sweep (a trusted SYSTEM consumer, never a
// user-facing surface) enumerates image assets with no `can()` gate — the same deliberate exception
// `loadAssetBytes` documents. `ownerId` scopes to ONE owner (the workloads SINGULAR sweep: embed MY assets),
// omitted/null = ALL owners (the BULK dev sweep). Wired only into the embeddings service at the composition
// root, never exposed on the transport surface.
//
// Image-mime-only at the source (`mime LIKE 'image/%'`): the pass feeds the `imageEmbed` role, and non-image
// assets (export zips) must never reach it — filtering here keeps the sweep from failing loud on bytes the
// role can't embed.

import type { AssetId, UserId } from "@orb/kit/ids";
import type { AssetsContext } from "../context";
import type { AssetsService } from "../contract/service";
import { listImageAssetIdRows } from "../persistence/queries";

export function createListImageAssetIds(ctx: AssetsContext): AssetsService["listImageAssetIds"] {
  return (ownerId?: UserId | null): Promise<readonly AssetId[]> => listImageAssetIdRows(ctx.db, ownerId);
}
