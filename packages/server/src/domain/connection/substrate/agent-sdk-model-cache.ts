// domain/connection/substrate/agent-sdk-model-cache — mirrors or-model-cache.ts (the OR half) but is a
// separate cache with its own key — the two catalogs never co-mingle. TTL clock is injected, never
// Date.now(); module-scope, per-process (assumes single-replica).

import type { AgentSdkModel } from "@orb/contracts/connection";

const MS_PER_HOUR = 3_600_000;
const AGENT_SDK_CATALOG_TTL_MS = MS_PER_HOUR;

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
}
