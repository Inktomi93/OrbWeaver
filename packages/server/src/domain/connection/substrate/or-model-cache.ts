// domain/connection/substrate/or-model-cache — in-memory TTL cache of the OpenRouter catalog, read
// synchronously (no db/HTTP round-trip) by pickOrModel's guard + resolveModelCapability's OR synthesis.
// The TTL clock is injected (getCachedOrModels(now)) never Date.now(); seed timestamp is the snapshot's
// own fetchedAt. Module-scope, per-process — assumes single-replica (DB row is the multi-replica seam).

import type { ModelCatalogEntry } from "@orb/contracts/connection";

const MS_PER_HOUR = 3_600_000;
const OR_CATALOG_TTL_MS = MS_PER_HOUR;

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
