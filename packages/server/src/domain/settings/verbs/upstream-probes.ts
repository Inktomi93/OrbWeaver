import type { Upstream, UpstreamProbeResult, UpstreamProbes } from "@orb/kit/version-identity";
import type { CachedUpstreamDeps } from "../contract/upstream.ts";

/** Successful answers share GitHub's anonymous budget for this window; failures never occupy it. */
export const UPSTREAM_ANSWER_TTL_MS = 300_000;

function cacheAnswer<T extends Upstream>(now: () => number, probe: () => Promise<UpstreamProbeResult<T>>): () => Promise<UpstreamProbeResult<T>> {
  let kept: { readonly at: number; readonly result: UpstreamProbeResult<T> } | undefined;
  return async () => {
    if (kept !== undefined && now() - kept.at < UPSTREAM_ANSWER_TTL_MS) {
      return kept.result;
    }
    const result = await probe();
    if (result.ok) {
      kept = { at: now(), result };
    }
    return result;
  };
}

/** Cache only successful per-channel manual reads. Construction performs no request. */
export function createCachedUpstreamProbes(deps: CachedUpstreamDeps): UpstreamProbes {
  return { main: cacheAnswer(deps.now, deps.probes.main), stable: cacheAnswer(deps.now, deps.probes.stable) };
}
