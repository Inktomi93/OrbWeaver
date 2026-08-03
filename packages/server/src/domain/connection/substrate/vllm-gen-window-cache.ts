// domain/connection/substrate/vllm-gen-window-cache — mirrors or-model-cache.ts but caches the ONE number
// each engine self-reports as its context window (`/v1/models` → `max_model_len`). Keyed by engine so gen
// (the fit ceiling), embed and rerank (the 8192-consumers' pooling window) each cache independently. The
// resolver reads this synchronously; the async warm (a loopback GET) runs on the resolve-role path and
// seeds it. TTL clock injected, never Date.now(); module-scope, per-process (single-replica). null ⇒ the
// consumer falls back to the env-owned window for that engine — the engine's answer WINS whenever it's
// cached-and-fresh (a misconfigured env can never lie to the capability math).

import type { VllmWindowEngine } from "../contract/service.ts";

/** The `cache` attribute every span event about this mirror carries (the catalog mirrors' twin). */
export const VLLM_WINDOW_CACHE_NAME = "connection.vllm-window";

const MS_PER_HOUR = 3_600_000;
const VLLM_WINDOW_TTL_MS = MS_PER_HOUR;

// ASSUMES(single-replica): a per-process in-memory cache of each engine's self-reported window. Correct
// on the one-box deployment (the engines are loopback-local by definition). The DB-backed replacement
// seam if replicas ever exist: persist per-engine facts in an engine_facts row (seeded by the same
// resolve-role warm) and read it here — the seed/get surface below stays the seam either way.
const cache = new Map<VllmWindowEngine, { readonly at: number; readonly window: number }>();

/** Seed one engine's self-reported window. */
export function seedVllmWindow(engine: VllmWindowEngine, window: number, fetchedAt: number): void {
  cache.set(engine, { at: fetchedAt, window });
}

/** The cached window for an engine if fresh, else null (cold/stale ⇒ the consumer uses its env floor). */
export function getCachedVllmWindow(engine: VllmWindowEngine, now: number): number | null {
  const entry = cache.get(engine);
  if (entry !== undefined && now - entry.at < VLLM_WINDOW_TTL_MS) {
    return entry.window;
  }
  return null;
}

// ── gen-specific back-compat wrappers (the fit-ceiling consumer + resolve-role warm) ─────────────────────
export function seedVllmGenWindow(window: number, fetchedAt: number): void {
  seedVllmWindow("gen", window, fetchedAt);
}
export function getCachedVllmGenWindow(now: number): number | null {
  return getCachedVllmWindow("gen", now);
}

/** @internal test seam — drop the cache for within-file cold/warm transitions. */
export function __resetVllmGenWindowCache(): void {
  cache.clear();
}
