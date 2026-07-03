// domain/connection/persistence/catalog-snapshot — the OR model-catalog snapshot KV (queries only). The
// `'openrouter-model-catalog'` row is connection's TENANT in the shared `settings` table (settings owns the
// table mechanism, connection owns this blob's meaning — db schema/settings.ts). Migrated from neo-tavern's
// `domain/models/persistence/snapshot.ts`. NEVER reads `users` (no-direct-users-read); NO HTTP/fetch
// (persistence-no-io — the live fetch is `infra/providers.fetchOrCatalog`, injected into `refreshCatalog`).
//
// LOAD-BEARING — the warm-on-read seam: `readCatalogSnapshot`
// seeds the in-memory TTL cache (`seedOrModelCache`) as a side-effect so the cold-boot `pickOrModel`
// catalog guard has a hydrated cache after the first read. The seam is co-located with the read that
// triggers it; do NOT split it out.
//
// LOAD-BEARING — the tightened parse: the stored blob is parsed with the EXACT
// `catalogSnapshotSchema` and the inferred result IS used (no neo `value as ModelCatalogSnapshot` blind
// cast after a `.loose()` parse); a malformed row degrades to `null` (treated as "no snapshot").

import type { Db } from "@orb/db";
import { settings } from "@orb/db";
import type { JsonValue } from "@orb/kit/json";
import { eq } from "drizzle-orm";
import { getLog } from "#foundation/observability";
import type { CatalogSnapshot } from "../contract/results";
import { catalogSnapshotSchema } from "../contract/results";
import { seedOrModelCache } from "../substrate/or-model-cache";

/** The connection-owned KV key in the shared `settings` table. One home for the literal (read + write). */
const SNAPSHOT_KEY = "openrouter-model-catalog";

/**
 * Read the persisted OR catalog snapshot, or `null` when absent/malformed. ALWAYS warms the in-memory TTL
 * cache on a successful read (the load-bearing side-effect — file header). The TTL is seeded with the
 * snapshot's own `fetchedAt`, so a stale persisted snapshot expires correctly against the reader's clock.
 */
export async function readCatalogSnapshot(db: Db): Promise<CatalogSnapshot | null> {
  const rows = await db.select().from(settings).where(eq(settings.key, SNAPSHOT_KEY)).limit(1);
  const value = rows[0]?.value;
  if (value === undefined || value === null) {
    return null;
  }
  const parsed = catalogSnapshotSchema.safeParse(value);
  if (!parsed.success) {
    getLog().warn(
      { key: SNAPSHOT_KEY },
      "connection: persisted catalog snapshot failed validation",
    );
    return null;
  }
  const snapshot = parsed.data;
  // Warm-on-read: hydrate the sync TTL cache the hot routing guard reads (no cold-boot null hole).
  seedOrModelCache(snapshot.models, snapshot.fetchedAt);
  return snapshot;
}

/**
 * Upsert the OR catalog snapshot (the refresh write). `updatedAt` mirrors the snapshot's `fetchedAt`.
 * `value` is a valid `JsonValue` at runtime (a CatalogSnapshot is JSON-shaped); the cast bridges only the
 * type (interface → index-signature), the established settings-KV write pattern.
 */
export async function writeCatalogSnapshot(db: Db, snapshot: CatalogSnapshot): Promise<void> {
  const value = snapshot as JsonValue;
  await db
    .insert(settings)
    .values({ key: SNAPSHOT_KEY, value, updatedAt: snapshot.fetchedAt })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value, updatedAt: snapshot.fetchedAt },
    });
}
