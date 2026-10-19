// infra/network — front door. The outbound-egress adapter: the SSRF egress firewall (private-range +
// DNS-rebind block) + the staged safeFetch wrapper and the shared CIDR matcher. Reads foundation/env DOWN
// for the firewall config. NEVER imports @orb/db or any domain (the sealed-executor invariant).
//
// The ingress IP-allowlist belt (`ingress.ts`): `ipAllowlistMiddleware` + `clientIp` (peer-vs-XFF
// trust precedence, anti-spoof) + `parseAllowlist`; mounted by `entry/app.ts`, `clientIp` reused by
// the transport seam. The IP certificate's https listener (`tls-terminator.ts`) forwards to the app as a loopback hop.

export type { EgressResolver, ScopedEgress, ScopedEgressOptions } from "./contract/egress.ts";
export type { NativeHttpBindings } from "./contract/http-server.ts";
export type { PhysicalPeerRead } from "./contract/ingress.ts";
export type { PluginGitSource } from "./contract/plugin-git.ts";
export type { OwnedResponseBody } from "./contract/response-body.ts";
export type { TlsTerminator, TlsTerminatorOptions } from "./contract/tls-terminator.ts";
export {
  __firewallConnectForTest,
  __setFirewallLookupForTest,
  ANY_HOST,
  createScopedEgress,
  EgressBlockedError,
  ENDPOINT_ADMISSIONS,
  endpointAdmission,
  fetchImageBytes,
  fetchPinnedDownload,
  fetchPluginBundle,
  fetchWebDocument,
  installEgressFirewall,
  type PinnedDownloadLimits,
  publishPrivateEndpointAllowlist,
  resolvedEndpointAdmission,
  type SafeFetchOptions,
  type SafeFetchResult,
  safeFetch,
} from "./egress.ts";
export { drainHttpServer, HANGUP_DRAIN_MS, HTTP_SERVER_TIMEOUTS, joinNativeHttpRequest, SHUTDOWN_DRAIN_MS, serveHttpServer } from "./http-server.ts";
export { type ImageGuardCaps, ImageRejectedError, isAllowedImageBuffer } from "./image-guard.ts";
export {
  addressThrottleKey,
  clientIp,
  createPhysicalPeerMiddleware,
  ipAllowlistMiddleware,
  isTrustedHop,
  parseAllowlist,
  peerIp,
  TRUSTED_PROXIES,
} from "./ingress.ts";
export { isInRanges, isPrivateOrLoopback, isPublicUnicast } from "./ip-ranges.ts";
export type { PluginGitSourceDeps } from "./plugin-git.ts";
export { createNetworkPluginGitSource, pluginGitSource } from "./plugin-git.ts";
export { createOwnedResponseBody } from "./response-body.ts";
export { startTlsTerminator } from "./tls-terminator.ts";
