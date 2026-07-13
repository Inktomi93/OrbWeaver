// verb: refreshCatalog — fetch OR `/models`, persist the snapshot, warm the cache (the daily-workload
// entry point). Calls the injected `providers.fetchOrCatalog` (the
// live keyless fetch — connection owns the SNAPSHOT, providers owns the I/O), writes the KV row, and seeds
// the in-memory TTL cache immediately so the next routing turn reads it without a re-read. On a fetch
// failure it falls back to the persisted snapshot if one exists (stale-but-serviceable), else throws
// `CatalogUnavailableError` (flagged, not a silent empty — invariant: best-effort, never fake).

import type { ConnectionContext } from "../context";
import { CatalogUnavailableError } from "../contract/errors";
import type { RefreshCatalogParams } from "../contract/params";
import type { CatalogSnapshot } from "../contract/results";
import type { ConnectionService } from "../contract/service";
import { readCatalogSnapshot, writeCatalogSnapshot } from "../persistence/catalog-snapshot";
import { seedOrModelCache } from "../substrate/or-model-cache";

export function createRefreshCatalog(ctx: ConnectionContext): ConnectionService["refreshCatalog"] {
  return async (params: RefreshCatalogParams): Promise<CatalogSnapshot> => {
    let models: CatalogSnapshot["models"];
    try {
      models = await ctx.fetchOrCatalog({ signal: params.signal });
    } catch (err) {
      const existing = await readCatalogSnapshot(ctx.db);
      if (existing !== null) {
        return existing;
      }
      throw new CatalogUnavailableError(err instanceof Error ? err.message : String(err), {
        cause: err,
      });
    }
    const snapshot: CatalogSnapshot = { fetchedAt: ctx.now(), models };
    await writeCatalogSnapshot(ctx.db, snapshot);
    // Warm the sync TTL cache immediately so the next routing turn's OR guard reads fresh without a re-read.
    seedOrModelCache(snapshot.models, snapshot.fetchedAt);
    return snapshot;
  };
}
