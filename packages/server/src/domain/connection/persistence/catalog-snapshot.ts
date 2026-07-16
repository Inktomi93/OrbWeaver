// domain/connection/persistence/catalog-snapshot — the OR model-catalog snapshot KV (queries only). The
// 'openrouter-model-catalog' row is connection's tenant in the shared settings table. No HTTP/fetch here
// (live fetch is infra/providers.fetchOrCatalog, injected into refreshCatalog).
//
// readCatalogSnapshot ALWAYS warms the in-memory TTL cache (seedOrModelCache) as a side-effect on success,
// co-located with the read that triggers it — do not split it out. A malformed row degrades to null.

import type { Db } from "@orb/db";
import { settings } from "@orb/db";
import type { JsonValue } from "@orb/kit/json";
import { eq } from "drizzle-orm";
import { getLog } from "#foundation/observability";
import type { CatalogSnapshot } from "../contract/results";
import { catalogSnapshotSchema } from "../contract/results";
import { seedOrModelCache } from "../substrate/or-model-cache";

const SNAPSHOT_KEY = "openrouter-model-catalog";

export async function readCatalogSnapshot(db: Db): Promise<CatalogSnapshot | null> {
  const rows = await db.select().from(settings).where(eq(settings.key, SNAPSHOT_KEY)).limit(1);
  const value = rows[0]?.value;
  if (value === undefined || value === null) {
    return null;
  }
  const parsed = catalogSnapshotSchema.safeParse(value);
  if (!parsed.success) {
    getLog().warn({ key: SNAPSHOT_KEY }, "connection: persisted catalog snapshot failed validation");
    return null;
  }
  const snapshot = parsed.data;
  seedOrModelCache(snapshot.models, snapshot.fetchedAt);
  return snapshot;
}

export async function writeCatalogSnapshot(db: Db, snapshot: CatalogSnapshot): Promise<void> {
  // CatalogSnapshot is JSON-shaped at runtime; cast bridges interface → index-signature only.
  const value = snapshot as JsonValue;
  await db
    .insert(settings)
    .values({ key: SNAPSHOT_KEY, value, updatedAt: snapshot.fetchedAt })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value, updatedAt: snapshot.fetchedAt },
    });
}
