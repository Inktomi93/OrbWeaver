// infra/network — front door. The outbound-egress adapter: the SSRF egress firewall (private-range +
// DNS-rebind block) + the staged safeFetch wrapper, the shared CIDR matcher, and the best-effort
// `/models` probe. Reads foundation/env DOWN for the firewall config. NEVER imports @orb/db or any
// domain (the sealed-executor invariant).
//
// NOTE: the ingress IP-allowlist belt (ipAllowlistMiddleware/clientIp) is deferred — it depends on
// `@hono/node-server/conninfo`, a catalog dep added at the entry tier (4e). It lands here once that dep
// is available (it is a network edge belt; clientIp is reused by the transport seam).

export {
  installEgressFirewall,
  privateEgressRanges,
  type SafeFetchOptions,
  type SafeFetchResult,
  safeFetch,
  shouldBlockEgress,
} from "./egress";
export {
  DEFAULT_TRUSTED_RANGES,
  isInRanges,
  isPrivateOrLoopback,
  matchesCidr,
  parseIp,
} from "./ip-ranges";
export { type FetchOpenAiModelsArgs, fetchOpenAiModels } from "./openai-models";
