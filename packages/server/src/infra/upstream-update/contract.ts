import type { SafeFetch } from "#infra/network";

/** Fixed-upstream adapter construction; no user or deployment identity leaves the box. */
export interface UpstreamFetchDeps {
  readonly localVersion: () => string;
  readonly fetchImpl: SafeFetch;
}
