// infra/network — front door. The outbound-egress adapter: the SSRF egress firewall (private-range +
// DNS-rebind block) + the staged safeFetch wrapper, the shared CIDR matcher, the best-effort `/models`
// probe and its classified health twin (`probeOpenAiEndpoint`). Reads foundation/env DOWN for the firewall
// config. NEVER imports @orb/db or any domain (the sealed-executor invariant).
//
// The ingress IP-allowlist belt (`ingress.ts` — PD-91): `ipAllowlistMiddleware` + `clientIp` (peer-vs-XFF
// trust precedence, PD-52 anti-spoof) + `parseAllowlist`; mounted by `entry/app.ts`, `clientIp` reused by
// the transport seam.

export {
  __pinnedAgentForTest,
  __setEgressResolverForTest,
  ANY_HOST,
  EgressBlockedError,
  ENDPOINT_ADMISSIONS,
  endpointAdmission,
  fetchImageBytes,
  fetchPluginBundle,
  fetchWebDocument,
  installEgressFirewall,
  privateEgressRanges,
  publishPrivateEndpointAllowlist,
  type SafeFetchOptions,
  type SafeFetchResult,
  safeFetch,
  shouldBlockEgress,
} from "./egress.ts";

export { type ImageGuardCaps, ImageRejectedError, isAllowedImageBuffer } from "./image-guard.ts";
export {
  clientIp,
  ipAllowlistMiddleware,
  isIngressAllowed,
  parseAllowlist,
  peerIp,
  resolveClientIp,
} from "./ingress.ts";
export {
  DEFAULT_TRUSTED_RANGES,
  isInRanges,
  isPrivateOrLoopback,
  matchesCidr,
  parseIp,
} from "./ip-ranges.ts";
export { type FetchOpenAiModelsArgs, fetchOpenAiModels, probeOpenAiEndpoint } from "./openai-models.ts";
