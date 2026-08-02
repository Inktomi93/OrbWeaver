// domain/connection/substrate/agent-sdk-model-cache — in-memory MIRROR of the persisted agent-sdk daemon
// catalog snapshot; mirrors or-model-cache.ts (the OR half) but is a separate cache with its own key — the
// two catalogs never co-mingle. TTL clock is injected (getCachedAgentSdkModels(now)) never Date.now();
// module-scope, per-process (the persisted KV snapshot is the durable truth + single-replica seam).
//
// TTL invariant: the cache is a mirror, NOT a freshness gate. The durable snapshot's freshness is owned by
// the refresh-model-catalog workload (daily cadence — the same contribution refresh that re-seeds OR)
// which re-seeds on every write, plus the boot-seed (entry reads the persisted snapshot on startup via
// getAgentSdkCatalog, warming this cache across a restart). The daemon's alias→version map + reasoning flags
// are stable for far longer than a day, so a day-old snapshot is fully serviceable — the bug was a 1h TTL
// expiring the mirror LONG before the daily refresh re-warmed it, so a cold/restarted process returned null
// and max-pro-sub / OR-skin models silently lost their advertised reasoning capability. The TTL is
// therefore a very-stale sanity CEILING set well above the daily cadence, never a per-hour gate.

import type { AgentSdkModel } from "@orb/contracts/connection";
import { addSpanEvent } from "#foundation/observability";

/** The `cache` attribute every span event about THIS mirror carries (the OR twin's `OR_MODEL_CACHE_NAME`). */
export const AGENT_SDK_MODEL_CACHE_NAME = "connection.agent-sdk-catalog";

const MS_PER_WEEK = 604_800_000;
/** Stale ceiling ≥ the daily refresh cadence (DEFAULT_REFRESH_EVERY_MS = 1 day, catalog-refresh-scheduler)
 *  with a week of slack for the hourly-retry outage window — NOT a freshness gate (see file header). */
const AGENT_SDK_CATALOG_TTL_MS = MS_PER_WEEK;

let cache: { readonly at: number; readonly models: readonly AgentSdkModel[] } | null = null;

export function seedAgentSdkModelCache(models: readonly AgentSdkModel[], fetchedAt: number): void {
  cache = { at: fetchedAt, models };
}

export function getCachedAgentSdkModels(now: number): readonly AgentSdkModel[] | null {
  if (cache !== null && now - cache.at < AGENT_SDK_CATALOG_TTL_MS) {
    return cache.models;
  }
  return null;
}

/** @internal test seam — drop the cache for within-file cold/warm transitions. */
export function __resetAgentSdkModelCache(): void {
  cache = null;
  inFlightWarm = null;
}

/** The cold-cache WARM single-flight — the twin of `or-model-cache`'s (see its header): a cold mirror makes
 *  max-pro-sub resolve the blanket fallback window instead of the daemon's reported one, and N concurrent
 *  turns must share ONE discovery call rather than stampede the daemon. Cleared on settle so a failed warm
 *  never poisons the next attempt. */
let inFlightWarm: Promise<void> | null = null;

export async function warmAgentSdkModelCacheOnce(warm: () => Promise<void>): Promise<void> {
  if (inFlightWarm !== null) {
    // See the OR twin: the coalesce is invisible in the warm ladder's own events (its closure never runs here).
    addSpanEvent("cache.warm.coalesced", { cache: AGENT_SDK_MODEL_CACHE_NAME });
    await inFlightWarm;
    return;
  }
  const run = warm().finally(() => {
    inFlightWarm = null;
  });
  inFlightWarm = run;
  await run;
}
