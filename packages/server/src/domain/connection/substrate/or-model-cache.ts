// domain/connection/substrate/or-model-cache — the in-memory TTL cache of the OpenRouter catalog (the
// SYNC routing-guard seam). `pickOrModel`'s catalog guard + `resolveModelCapability`'s OR synthesis read
// the snapshot WITHOUT awaiting a db/HTTP round-trip on the hot path. Migrated from neo-tavern's
// `providers/openrouter/catalog.ts` (the cache half; the live fetch stays infra). The warm-on-read seam
// (`persistence/catalog-snapshot.ts` calls `seedOrModelCache` after a snapshot read — connection.md
// Esoteric §3) keeps the cold-boot guard correct: without it the first request's catalog guard finds null
// and skips for every id.
//
// DETERMINISM: the TTL clock is INJECTED — `getCachedOrModels(now)` takes the caller's clock (the verb's
// `ctx.now()`), never `Date.now()`. The seed timestamp is the snapshot's own `fetchedAt` (not "now"), so a
// stale persisted snapshot expires correctly relative to the caller's clock.
//
// ASSUMES(single-replica): the cache is module-scope, per-process — a refresh busts only THIS process's
// copy (true per the one-image deploy invariant). The DB `'openrouter-model-catalog'` row is the
// documented multi-replica seam if that is ever reversed.

import type { ModelCatalogEntry } from "@orb/contracts/connection";

/** OR catalog cache lifetime — 1h (neo CATALOG_TTL_MS). A read past this returns null (cache miss); the
 *  daily refresh workload + the warm-on-read seam keep it hydrated in steady state. */
const MS_PER_HOUR = 3_600_000;
const OR_CATALOG_TTL_MS = MS_PER_HOUR;

// ASSUMES(single-replica): module-scope, per-process (cleared by restart / __resetOrModelCache in tests).
let cache: { readonly at: number; readonly models: readonly ModelCatalogEntry[] } | null = null;

/** Warm the cache from a snapshot. `fetchedAt` is the snapshot's own timestamp (the TTL is measured from
 *  WHEN it was fetched, not when it was read) — the warm-on-read side-effect of `readCatalogSnapshot`. */
export function seedOrModelCache(models: readonly ModelCatalogEntry[], fetchedAt: number): void {
  cache = { at: fetchedAt, models };
}

/** The cached OR catalog if still within TTL relative to the INJECTED `now`, else null (never fetches —
 *  the live fetch is `infra/providers.fetchOrCatalog`, owned by `refreshCatalog`). */
export function getCachedOrModels(now: number): readonly ModelCatalogEntry[] | null {
  if (cache !== null && now - cache.at < OR_CATALOG_TTL_MS) {
    return cache.models;
  }
  return null;
}

/** @internal test seam — drop the cache so the next read re-derives from a fresh seed. `isolate:true`
 *  already gives a fresh module per test FILE; this is for within-file cold/warm transitions. */
export function __resetOrModelCache(): void {
  cache = null;
}
