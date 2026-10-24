// persistence/portable-refs — the portability export's owner gate: a foreign or missing id resolves to
// undefined, never exported. The REFERENCE walk is not here: it is the one collector in `asset-refs.ts`
// (`selectOwnedReferencedAssetIds` = the GC live set narrowed to this owner), so the export can never honor
// fewer or more references than GC does.

import type { AssetKind } from "@orb/contracts/assets";
import type { Db } from "@orb/db";
import { assets } from "@orb/db";
import type { AssetId, UserId } from "@orb/kit/ids";
import { and, eq } from "drizzle-orm";

const LIMIT_ONE = 1;

interface OwnedAssetExportRow {
  readonly hash: string;
  readonly kind: AssetKind;
  readonly mime: string;
}

export async function loadOwnedAssetForExport(db: Db, ownerId: UserId, assetId: AssetId): Promise<OwnedAssetExportRow | undefined> {
  const rows = await db
    .select({ hash: assets.hash, kind: assets.kind, mime: assets.mime })
    .from(assets)
    .where(and(eq(assets.id, assetId), eq(assets.ownerId, ownerId)))
    .limit(LIMIT_ONE);
  return rows[0];
}
