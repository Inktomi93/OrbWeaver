// Asset seeds run the CAS-backed store; the synthetic PNG bytes are the only fixture-owned input.

import { assets } from "@orb/db";
import type { AssetId } from "@orb/kit/ids";
import { writeCardChunk } from "@orb/kit/png-card-chunk";
import type { AssetsService } from "@orb/server/domain/assets";
import { and, eq } from "drizzle-orm";
import type { ServerProducerRoot } from "../server.ts";

type AssetRow = typeof assets.$inferSelect;

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
  readonly row: AssetRow;
}

/** Capture the CAS-backed writer's actual identity, including an existing owner's dedup winner. */
export async function seedAsset(root: ServerProducerRoot, params: Parameters<AssetsService["store"]>[0]): Promise<SeededAsset> {
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
