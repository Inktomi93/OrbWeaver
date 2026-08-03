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
import type { CatalogSnapshot } from "../contract/results.ts";
import { catalogSnapshotSchema } from "../contract/results.ts";
import { seedOrModelCache } from "../substrate/or-model-cache.ts";

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

/** PERSIST + WARM in one call — the pair every fetch path owes (the daily refresh workload AND the
 *  cold-cache on-demand warm at the resolve seam). One home so a new fetch caller can't persist without
 *  seeding the mirror and leave the next routing turn reading the fallback window. */
export async function persistCatalogSnapshot(db: Db, snapshot: CatalogSnapshot): Promise<void> {
  await writeCatalogSnapshot(db, snapshot);
  seedOrModelCache(snapshot.models, snapshot.fetchedAt);
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
