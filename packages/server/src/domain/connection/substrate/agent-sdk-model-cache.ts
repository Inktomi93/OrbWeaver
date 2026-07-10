// domain/connection/substrate/agent-sdk-model-cache — the in-memory TTL cache of the agent-sdk daemon's
// model catalog (the daemon's family→version map). Mirrors `or-model-cache.ts` (the OR half) but is a
// SEPARATE cache with its own key — the two catalogs never co-mingle (OR ≠ agent-sdk, like OR ≠ vLLM).
// The warm-on-read seam (`persistence/agent-sdk-catalog-snapshot.ts` calls `seedAgentSdkModelCache` after a
// snapshot read) keeps the cold-boot alias resolver correct: without it the first `resolveAgentSdkAlias`
// call finds null and can't map a bare `sonnet` onto the daemon's current version.
//
// DETERMINISM: the TTL clock is INJECTED — `getCachedAgentSdkModels(now)` takes the caller's clock (the
// verb's `ctx.now()`), never `Date.now()`. The seed timestamp is the snapshot's own `fetchedAt` (not
// "now"), so a stale persisted snapshot expires correctly relative to the caller's clock.
//
// ASSUMES(single-replica): module-scope, per-process — a refresh busts only THIS process's copy (true per
// the one-image deploy invariant). The DB `'agent-sdk-model-catalog'` row is the multi-replica seam.

import type { AgentSdkModel } from "@orb/contracts/connection";

/** agent-sdk catalog cache lifetime — 1h (mirrors the OR cache TTL). A read past this returns null (cache
 *  miss); the daily refresh + the warm-on-read seam keep it hydrated in steady state. */
const MS_PER_HOUR = 3_600_000;
const AGENT_SDK_CATALOG_TTL_MS = MS_PER_HOUR;

// ASSUMES(single-replica): module-scope, per-process (cleared by restart / __resetAgentSdkModelCache).
let cache: { readonly at: number; readonly models: readonly AgentSdkModel[] } | null = null;

/** Warm the cache from a snapshot. `fetchedAt` is the snapshot's own timestamp (the TTL is measured from
 *  WHEN it was fetched, not when it was read) — the warm-on-read side-effect of `readAgentSdkCatalogSnapshot`. */
export function seedAgentSdkModelCache(models: readonly AgentSdkModel[], fetchedAt: number): void {
  cache = { at: fetchedAt, models };
}

/** The cached agent-sdk catalog if still within TTL relative to the INJECTED `now`, else null (never
 *  fetches — the live fetch is `infra/providers.fetchAgentSdkModels`, owned by `refreshAgentSdkCatalog`). */
export function getCachedAgentSdkModels(now: number): readonly AgentSdkModel[] | null {
  if (cache !== null && now - cache.at < AGENT_SDK_CATALOG_TTL_MS) {
    return cache.models;
  }
  return null;
}

/** @internal test seam — drop the cache so the next read re-derives from a fresh seed. `isolate:true`
 *  already gives a fresh module per test FILE; this is for within-file cold/warm transitions. */
export function __resetAgentSdkModelCache(): void {
  cache = null;
}
