// infra/network — front door. The outbound-egress adapter: the SSRF egress firewall (private-range +
// DNS-rebind block) + the staged safeFetch wrapper and the shared CIDR matcher. Takes the env record in its
// options for the firewall config. NEVER imports @orb/db or any domain (the sealed-executor invariant).
//
// The ingress IP-allowlist belt (`ingress.ts`): `ipAllowlistMiddleware` + `clientIp` (peer-vs-XFF
// trust precedence, anti-spoof) + `parseAllowlist`; mounted by `entry/app.ts`, `clientIp` reused by
// the transport seam. The IP certificate's https listener (`tls-terminator.ts`) forwards to the app as a loopback hop.

export type { ScopedEgress, ScopedEgressOptions } from "./contract/egress.ts";
export type { NativeHttpBindings } from "./contract/http-server.ts";
export type { PhysicalPeerRead } from "./contract/ingress.ts";

export type { TlsTerminator, TlsTerminatorOptions } from "./contract/tls-terminator.ts";
export {
  ANY_HOST,
  createScopedEgress,
  EgressBlockedError,
  ENDPOINT_ADMISSIONS,
  installEgressFirewall,
  type SafeFetchOptions,
  type SafeFetchResult,
  systemConnector,
  systemFetch,
  systemResolver,
} from "./egress.ts";
export { drainHttpServer, HANGUP_DRAIN_MS, joinNativeHttpRequest, SHUTDOWN_DRAIN_MS, serveHttpServer } from "./http-server.ts";
export { ImageRejectedError, isAllowedImageBuffer } from "./image-guard.ts";
export {
  addressThrottleKey,
  clientIp,
  createPhysicalPeerMiddleware,
  ipAllowlistMiddleware,
  isTrustedHop,
  parseAllowlist,
  peerIp,
  trustedProxiesOf,
} from "./ingress.ts";
export { isInRanges, isPrivateOrLoopback, isPublicUnicast } from "./ip-ranges.ts";

export { createNetworkPluginGitSource } from "./plugin-git.ts";
export { createOwnedResponseBody } from "./response-body.ts";
export { startTlsTerminator } from "./tls-terminator.ts";
