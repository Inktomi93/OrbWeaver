// domain/connection/substrate/vllm-gen-window-cache — mirrors or-model-cache.ts but caches the ONE number
// the gen engine self-reports as its context window (`/v1/models` → `max_model_len`). The resolver reads
// this synchronously; the async warm (a loopback GET) runs on the resolve-role path and seeds it. TTL clock
// injected, never Date.now(); module-scope, per-process (single-replica). null ⇒ the resolver falls back to
// the env-owned window (VLLM_GEN_MAX_MODEL_LEN) — the engine's answer WINS whenever it's cached-and-fresh.

const MS_PER_HOUR = 3_600_000;
const VLLM_GEN_WINDOW_TTL_MS = MS_PER_HOUR;

let cache: { readonly at: number; readonly window: number } | null = null;

export function seedVllmGenWindow(window: number, fetchedAt: number): void {
  cache = { at: fetchedAt, window };
}

export function getCachedVllmGenWindow(now: number): number | null {
  if (cache !== null && now - cache.at < VLLM_GEN_WINDOW_TTL_MS) {
    return cache.window;
  }
  return null;
}

/** @internal test seam — drop the cache for within-file cold/warm transitions. */
export function __resetVllmGenWindowCache(): void {
  cache = null;
}
