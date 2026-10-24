function trustedRoot(): Promise<ServerTestHarness> {
  return createServerHarness({
    physicalPeer: () => "127.0.0.1",
    env: { ["FORWARD_AUTH_TRUSTED_PROXIES"]: TRUSTED_PROXIES.join(",") },
    authConfig: {
      mode: "forward-header",
      fallback: "owner",
      forwardUserHeader: FORWARD_USER_HEADER,
      forwardGroupsHeader: FORWARD_GROUPS_HEADER,
    },
  });
}

function signedRoot(): Promise<ServerTestHarness> {
  return createServerHarness({
    authConfig: {
      mode: "forward-header",
      fallback: "deny",
      forwardTrustedProxies: ["127.0.0.1/32", "10.0.0.0/8"],
      verifyForwardJwt: true,
      jwksAllowlist: [KEY_HOST],
      jwtIssuer: ISSUER,
      jwtAudience: AUDIENCE,
      fallbackTrustedPeers: [],
    },
  });
}

const placed = createServerHarness({ env: {}, authConfig: { mode: "forward-header", fallback: "deny" } });
