// One probe connection per route. Sonnet-5 everywhere: it is priced below Opus and its cache minimum (1024)
// is well under the fixture's prefix. Keys are the main `.env`'s `*_PROBE_KEY` family.
import type { CacheRoute, RouteRefusal, RouteSpec } from "../contract/types.ts";

/** A route with no credential: a required one cannot measure (ERROR), an optional one is SKIPPED. */
export function missingCredential(spec: RouteSpec): RouteRefusal {
  const reason = `no ${spec.providerId} credential: set ${spec.credentialEnv} in the environment or the main checkout's .env`;
  return spec.required ? { verdict: "ERROR", reason } : { verdict: "SKIPPED", reason: `${reason}, or keep a ${spec.providerId} credential in the stage DB` };
}

export const ROUTE_SPECS: Readonly<Record<CacheRoute, RouteSpec>> = {
  direct: { providerId: "anthropic", model: "claude-sonnet-5", credentialEnv: "ANTHROPIC_PROBE_KEY", required: true },
  openrouter: { providerId: "openrouter", model: "anthropic/claude-sonnet-5", credentialEnv: "OPENROUTER_PROBE_KEY", required: true },
  "agent-sdk": { providerId: "claude-sub", model: "claude-sonnet-5", credentialEnv: "CLAUDE_SUB_PROBE_TOKEN", required: false },
};
