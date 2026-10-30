import type { Clock } from "@orb/kit/time";
import type { UpstreamProbes } from "@orb/kit/version-identity";

/** Manual update probing; failures must remain retryable. */
export interface CachedUpstreamDeps {
  readonly now: Clock;
  readonly probes: UpstreamProbes;
}
