// domain/connection/substrate/or-model-cache — in-memory MIRROR of the persisted OpenRouter catalog
// snapshot, read synchronously (no db/HTTP round-trip) by pickOrModel's guard + resolveModelCapability's
// OR synthesis. The TTL clock is injected (getCachedOrModels(now)) never Date.now(); seed timestamp is the
// snapshot's own fetchedAt. Module-scope, per-process — assumes single-replica (the persisted KV snapshot
// is the durable truth + multi-replica seam).
//
// TTL invariant: the cache is a mirror, NOT a freshness gate. The durable snapshot's freshness is owned by
// the refresh-model-catalog workload (daily cadence — catalog-refresh-scheduler) which re-seeds on every
// write, plus the boot-seed (entry reads the persisted snapshot on startup, warming this cache across a
// restart). Capability flags (structured/tools/modalities) are stable for far longer than a day, so a
// day-old snapshot is fully serviceable — the bug was a 1h TTL expiring the mirror LONG before the daily
// refresh re-warmed it, so a cold/restarted process returned null and OR models silently lost their
// advertised capabilities. The TTL is therefore a very-stale sanity CEILING set well above the daily
// cadence (a week ⇒ refresh has been failing every hour for 7 days straight), never a per-hour gate.

import type { ModelCatalogEntry } from "@orb/contracts/connection";

const MS_PER_WEEK = 604_800_000;
/** Stale ceiling ≥ the daily refresh cadence (DEFAULT_REFRESH_EVERY_MS = 1 day, catalog-refresh-scheduler)
 *  with a week of slack for the hourly-retry outage window — NOT a freshness gate (see file header). */
const OR_CATALOG_TTL_MS = MS_PER_WEEK;

let cache: { readonly at: number; readonly models: readonly ModelCatalogEntry[] } | null = null;

export function seedOrModelCache(models: readonly ModelCatalogEntry[], fetchedAt: number): void {
  cache = { at: fetchedAt, models };
}

export function getCachedOrModels(now: number): readonly ModelCatalogEntry[] | null {
  if (cache !== null && now - cache.at < OR_CATALOG_TTL_MS) {
    return cache.models;
  }
  return null;
}

/** @internal test seam — drop the cache for within-file cold/warm transitions. */
export function __resetOrModelCache(): void {
  cache = null;
}
