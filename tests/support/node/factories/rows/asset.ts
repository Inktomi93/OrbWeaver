// Asset rows a production verb left, read behind the rows door for persistence-tier and corpus captures.

import { assets } from "@orb/db";
import type { AssetsService } from "@orb/server/domain/assets";
import { and, eq } from "drizzle-orm";
import type { ServerProducerRoot } from "../../server.ts";
import type { AssetRow } from "../asset.ts";

export interface SeededAssetRows {
  readonly stored: Awaited<ReturnType<AssetsService["store"]>>;
  readonly row: AssetRow;
}

/** Capture the CAS-backed writer's actual identity, including an existing owner's dedup winner. */
export async function seedAssetRows(root: ServerProducerRoot, params: Parameters<AssetsService["store"]>[0]): Promise<SeededAssetRows> {
  const db = root.db;
  const store = root.services.assets.store;
  const stored = await store(params);
  const row = await db
    .select()
    .from(assets)
    .where(and(eq(assets.id, stored.assetId), eq(assets.ownerId, params.principal.userId)))
    .get();
  if (row === undefined) {
    throw new Error("production asset store left no canonical owned row");
  }
  return { stored, row };
}
