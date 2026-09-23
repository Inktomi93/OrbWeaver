// One probe connection per route. Sonnet-5 everywhere: it is priced below Opus and its cache minimum (1024)
// is well under the fixture's prefix. Keys are the main `.env`'s `*_PROBE_KEY` family.
import type { CacheCase, CacheRoute, RouteRefusal, RouteSpec } from "../contract/types.ts";
import { CACHE_ROUTES } from "../contract/types.ts";

// On agent-sdk, a turn that does not extend the stored transcript forks a fresh session, and a fork reads no
// sibling fork's cache. The owner pinned agent-sdk caching, so the route is opt-in and these cases are known.
const AGENT_SDK_FORK_CAUSE = "item 0150: a turn that does not extend the stored transcript forks a fresh session";
const AGENT_SDK_FORKING_CASES: readonly CacheCase[] = ["deep-note", "group", "narrator", "continue"];

/** A route with no credential: a required one cannot measure (ERROR), an optional one is SKIPPED. */
export function missingCredential(spec: RouteSpec): RouteRefusal {
  const reason = `no ${spec.providerId} credential: set ${spec.credentialEnv} in the environment or the main checkout's .env`;
  return spec.required ? { verdict: "ERROR", reason } : { verdict: "SKIPPED", reason: `${reason}, or keep a ${spec.providerId} credential in the stage DB` };
}

export const ROUTE_SPECS: Readonly<Record<CacheRoute, RouteSpec>> = {
  direct: { providerId: "anthropic", model: "claude-sonnet-5", credentialEnv: "ANTHROPIC_PROBE_KEY", required: true, runByDefault: true, knownFailures: {} },
  openrouter: {
    providerId: "openrouter",
    model: "anthropic/claude-sonnet-5",
    credentialEnv: "OPENROUTER_PROBE_KEY",
    required: true,
    runByDefault: true,
    knownFailures: {},
  },
  "agent-sdk": {
    providerId: "claude-sub",
    model: "claude-sonnet-5",
    credentialEnv: "CLAUDE_SUB_PROBE_TOKEN",
    required: false,
    runByDefault: false,
    knownFailures: Object.fromEntries(AGENT_SDK_FORKING_CASES.map((c) => [c, AGENT_SDK_FORK_CAUSE])),
  },
};

/** The routes a run with no `--routes` covers. */
export const DEFAULT_ROUTES: readonly CacheRoute[] = CACHE_ROUTES.filter((route) => ROUTE_SPECS[route].runByDefault);
