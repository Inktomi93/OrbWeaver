function trustedRoot(): Promise<ServerTestHarness> {
  return createServerHarness({
    physicalPeer: () => "127.0.0.1",
    env: { ["FORWARD_AUTH_TRUSTED_PROXIES"]: TRUSTED_PROXIES.join(","), ["AUTH_MODE"]: "forward-header", ["AUTH_FALLBACK"]: "owner", ["FORWARD_AUTH_USER_HEADER"]: FORWARD_USER_HEADER, ["FORWARD_AUTH_GROUPS_HEADER"]: FORWARD_GROUPS_HEADER },
  });
}

function signedRoot(): Promise<ServerTestHarness> {
  return createServerHarness({
    env: { ["AUTH_MODE"]: "forward-header", ["AUTH_FALLBACK"]: "deny", ["FORWARD_AUTH_TRUSTED_PROXIES"]: "127.0.0.1/32,10.0.0.0/8", ["FORWARD_AUTH_VERIFY_JWT"]: "true", ["FORWARD_AUTH_JWKS_ALLOWLIST"]: KEY_HOST, ["FORWARD_AUTH_JWT_ISSUER"]: ISSUER, ["FORWARD_AUTH_JWT_AUDIENCE"]: AUDIENCE },
  });
}

const placed = createServerHarness({ env: { ["AUTH_MODE"]: "forward-header", ["AUTH_FALLBACK"]: "deny" } });
