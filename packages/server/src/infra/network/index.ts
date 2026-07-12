// infra/network — front door. The outbound-egress adapter: the SSRF egress firewall (private-range +
// DNS-rebind block) + the staged safeFetch wrapper, the shared CIDR matcher, and the best-effort
// `/models` probe. Reads foundation/env DOWN for the firewall config. NEVER imports @orb/db or any
// domain (the sealed-executor invariant).
//
// The ingress IP-allowlist belt (`ingress.ts` — PD-91): `ipAllowlistMiddleware` + `clientIp` (peer-vs-XFF
// trust precedence, PD-52 anti-spoof) + `parseAllowlist`; mounted by `entry/app.ts`, `clientIp` reused by
// the transport seam.

export {
  fetchImageBytes,
  installEgressFirewall,
  privateEgressRanges,
  type SafeFetchOptions,
  type SafeFetchResult,
  safeFetch,
  shouldBlockEgress,
} from "./egress";
export {
  fetchTenorGifImage,
  GIF_IMPORT_MAX_BYTES,
  isTenorMediaHost,
  type SearchTenorGifsArgs,
  searchTenorGifs,
  TENOR_API_HOST,
  TENOR_MEDIA_HOST_SUFFIX,
} from "./gif-search";
export { type ImageGuardCaps, ImageRejectedError, isAllowedImageBuffer } from "./image-guard";
export {
  clientIp,
  ipAllowlistMiddleware,
  isIngressAllowed,
  parseAllowlist,
  peerIp,
  resolveClientIp,
} from "./ingress";
export {
  DEFAULT_TRUSTED_RANGES,
  isInRanges,
  isPrivateOrLoopback,
  matchesCidr,
  parseIp,
} from "./ip-ranges";
export { type FetchOpenAiModelsArgs, fetchOpenAiModels } from "./openai-models";
