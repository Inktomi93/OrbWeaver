import type { AuthConfig } from "@orb/server/infra/auth";
import { authConfigFromEnv } from "@orb/server/infra/auth";
import { describe, expect, test } from "vitest";

// `authConfigFromEnv` — the SOLE env→AuthConfig projection for this slice. The frozen `env` cannot be
// re-varied per test (parsed once at module load), so the private parse helpers (parseCsv / parseHostList /
// jwksAllowlistFromEnv) aren't directly reachable; what IS asserted here are the projection's structural
// invariants that hold for ANY env — purity, the list fields never collapsing to undefined, the
// conditional-spread "absent, never present-as-undefined" discipline, union membership — plus the
// fail-closed JWKS default that holds under the test runner's single-user env.

const MODES: readonly AuthConfig["mode"][] = ["single-user", "local", "forward-header", "oidc"];
const FALLBACKS: readonly AuthConfig["fallback"][] = ["owner", "deny"];

describe("env → AuthConfig projection", () => {
  test("is a pure projection of the frozen env — two calls are deep-equal", () => {
    expect(authConfigFromEnv()).toEqual(authConfigFromEnv());
  });

  test("the four list fields are always arrays (parseCsv/parseHostList never yield undefined)", () => {
    const cfg = authConfigFromEnv();
    expect(Array.isArray(cfg.trustedLocalHosts)).toBe(true);
    expect(Array.isArray(cfg.trustedPrivateRanges)).toBe(true);
    expect(Array.isArray(cfg.forwardTrustedProxies)).toBe(true);
    expect(Array.isArray(cfg.jwksAllowlist)).toBe(true);
  });

  test("mode + fallback fall within the AuthConfig unions", () => {
    const cfg = authConfigFromEnv();
    expect(MODES).toContain(cfg.mode);
    expect(FALLBACKS).toContain(cfg.fallback);
  });

  test("verifyForwardJwt is a boolean and defaultHandle is a non-empty string", () => {
    const cfg = authConfigFromEnv();
    expect(typeof cfg.verifyForwardJwt).toBe("boolean");
    expect(cfg.defaultHandle.length).toBeGreaterThan(0);
  });

  test("no property is present-but-undefined (the conditional-spread discipline)", () => {
    const cfg = authConfigFromEnv();
    for (const value of Object.values(cfg)) {
      expect(value).not.toBeUndefined();
    }
  });

  test("jwksAllowlist is FAIL-CLOSED empty by default (no explicit allowlist, no OIDC issuer)", () => {
    // Under the runner's single-user env neither FORWARD_AUTH_JWKS_ALLOWLIST nor OIDC_ISSUER is set, so the
    // signed path has no trusted key source → the resolver refuses it.
    expect(authConfigFromEnv().jwksAllowlist).toEqual([]);
  });
});
