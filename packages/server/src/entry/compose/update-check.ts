import type { UpstreamProbes } from "@orb/kit/version-identity";
import { createCachedUpstreamProbes } from "#domain/settings";
import type { UpstreamFetchDeps } from "#infra/upstream-update";
import { createUpstreamFetches } from "#infra/upstream-update";

// @orb-waive no-inline-package-interface(UpstreamProbeDeps): baselined when the gate landed; burn-down item 952.
export interface UpstreamProbeDeps extends UpstreamFetchDeps {
  readonly now: () => number;
}

/** Wire fixed GitHub I/O to settings' success-only manual-check cache. */
export function createUpstreamProbes(deps: UpstreamProbeDeps): UpstreamProbes {
  return createCachedUpstreamProbes({ now: () => deps.now(), probes: createUpstreamFetches(deps) });
}
