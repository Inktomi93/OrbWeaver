// Shared scaffolding for the auth infra tests — the `cfg(over)` `AuthConfig` builder + `headers()`
// hoisted from 5 byte-identical local copies (dispatch/index/modes: cookie-session/local/single-user).
import type { AuthConfig } from "@orb/server/infra/auth";

/** A complete `AuthConfig` seeded with the single-user/owner-fallback defaults, `over` applied on top. */
export function makeAuthConfig(over: Partial<AuthConfig> = {}): AuthConfig {
  return {
    mode: "single-user",
    fallback: "owner",
    defaultHandle: "owner",
    verifyForwardJwt: false,
    forwardTrustedProxies: [],
    fallbackTrustedPeers: [],
    jwksAllowlist: [],
    ...over,
  };
}

/** A `Headers` instance seeded from a plain header-name → value record. */
export function headers(init: Record<string, string> = {}): Headers {
  return new Headers(init);
}
