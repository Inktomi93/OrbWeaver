import type { UpstreamProbes } from "@orb/kit/version-identity";

/** Manual update probing; failures must remain retryable. */
export interface CachedUpstreamDeps {
  readonly now: () => number;
  readonly probes: UpstreamProbes;
}
