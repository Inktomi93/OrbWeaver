// infra/network — front door. The outbound-egress adapter: the SSRF egress firewall (private-range +
// DNS-rebind block) + the staged safeFetch wrapper and the shared CIDR matcher. Reads foundation/env DOWN
// for the firewall config. NEVER imports @orb/db or any domain (the sealed-executor invariant).
//
// The ingress IP-allowlist belt (`ingress.ts`): `ipAllowlistMiddleware` + `clientIp` (peer-vs-XFF
// trust precedence, anti-spoof) + `parseAllowlist`; mounted by `entry/app.ts`, `clientIp` reused by
// the transport seam.

export {
  __pinnedAgentForTest,
  __setEgressResolverForTest,
  __setFirewallLookupForTest,
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
  isTrustedHop,
  parseAllowlist,
  peerIp,
  resolveClientIp,
  TRUSTED_PROXIES,
} from "./ingress.ts";
export {
  DEFAULT_TRUSTED_RANGES,
  isInRanges,
  isPrivateOrLoopback,
  matchesCidr,
} from "./ip-ranges.ts";
