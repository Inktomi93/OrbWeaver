// @module-tag requires-process-chdir
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe } from "vitest";
import { reimportEnvWith, restoreProcessEnvAfterEach, VALID_SESSION_SECRET } from "./_support.ts";

describe("foundation/env — the AUTH_MODE superRefine boot-fatality", () => {
  restoreProcessEnvAfterEach();

  test("AUTH_MODE=oidc WITHOUT OIDC_ISSUER → boot FAILS at parse", async () => {
    await expect(
      reimportEnvWith({
        AUTH_MODE: "oidc",
        OIDC_CLIENT_ID: "x",
        OIDC_CLIENT_SECRET: "x",
        OIDC_REDIRECT_URIS: "https://x/api/auth/oidc/callback",
        SESSION_SECRET: VALID_SESSION_SECRET,
      }),
    ).rejects.toThrow("OIDC_ISSUER is required when AUTH_MODE=oidc");
  });

  // Secrets default on: an unset SESSION_SECRET is generated beside the db at boot (`infra/crypto/key.ts`),
  // and `entry/lifecycle.ts` refuses a cookie mode only when none could be read or generated.
  test("AUTH_MODE=oidc WITHOUT SESSION_SECRET → parses (the secret is generated at boot)", async () => {
    const { env } = await reimportEnvWith({
      AUTH_MODE: "oidc",
      OIDC_ISSUER: "https://idp.example",
      OIDC_CLIENT_ID: "x",
      OIDC_CLIENT_SECRET: "x",
      OIDC_REDIRECT_URIS: "https://x/api/auth/oidc/callback",
    });
    expect(env.AUTH_MODE).toBe("oidc");
    expect(env.SESSION_SECRET).toBeUndefined();
  });

  test("AUTH_MODE=oidc WITH all required vars → boots clean", async () => {
    const { env } = await reimportEnvWith({
      AUTH_MODE: "oidc",
      OIDC_ISSUER: "https://idp.example",
      OIDC_CLIENT_ID: "client",
      OIDC_CLIENT_SECRET: "x",
      OIDC_REDIRECT_URIS: "https://app/api/auth/oidc/callback",
      SESSION_SECRET: VALID_SESSION_SECRET,
    });
    expect(env.AUTH_MODE).toBe("oidc");
    expect(env.OIDC_ISSUER).toBe("https://idp.example");
    // The callback allowlist is a raw CSV string here (parsed into the per-request derivation allowlist at
    // entry/lifecycle — env just carries the floor).
    expect(env.OIDC_REDIRECT_URIS).toBe("https://app/api/auth/oidc/callback");
    // provider-agnostic claim/scope mapping defaults to authentik's shape (non-breaking).
    expect(env.OIDC_SCOPES).toBe("openid profile email");
    expect(env.OIDC_USERNAME_CLAIM).toBe("preferred_username");
    expect(env.OIDC_UID_CLAIM).toBe("sub");
    expect(env.OIDC_GROUPS_CLAIM).toBe("groups");
  });

  test("AUTH_MODE=oidc WITHOUT OIDC_REDIRECT_URIS → boot FAILS", async () => {
    await expect(
      reimportEnvWith({
        AUTH_MODE: "oidc",
        OIDC_ISSUER: "https://idp.example",
        OIDC_CLIENT_ID: "x",
        OIDC_CLIENT_SECRET: "x",
        SESSION_SECRET: VALID_SESSION_SECRET,
      }),
    ).rejects.toThrow("OIDC_REDIRECT_URIS is required when AUTH_MODE=oidc");
  });

  test("OIDC claim overrides parse (provider-agnostic Okta/Azure shape)", async () => {
    const { env } = await reimportEnvWith({
      AUTH_MODE: "oidc",
      OIDC_ISSUER: "https://idp.example",
      OIDC_CLIENT_ID: "client",
      OIDC_CLIENT_SECRET: "x",
      OIDC_REDIRECT_URIS: "https://app/api/auth/oidc/callback",
      SESSION_SECRET: VALID_SESSION_SECRET,
      OIDC_SCOPES: "openid profile email groups",
      OIDC_USERNAME_CLAIM: "upn",
      OIDC_UID_CLAIM: "oid",
      OIDC_GROUPS_CLAIM: "roles",
    });
    expect(env.OIDC_SCOPES).toBe("openid profile email groups");
    expect(env.OIDC_USERNAME_CLAIM).toBe("upn");
    expect(env.OIDC_UID_CLAIM).toBe("oid");
    expect(env.OIDC_GROUPS_CLAIM).toBe("roles");
  });

  test("AUTH_MODE=local WITHOUT LOCAL_INITIAL_PASSWORD → boots (B4: the in-app first-run setup claims the owner password)", async () => {
    // B4 made LOCAL_INITIAL_PASSWORD OPTIONAL: a fresh local box seeds the owner passwordless and the
    // origin-gated one-shot `POST /api/auth/first-run` sets it on first visit. SESSION_SECRET stays required.
    const { env } = await reimportEnvWith({ AUTH_MODE: "local", SESSION_SECRET: VALID_SESSION_SECRET });
    expect(env.AUTH_MODE).toBe("local");
    expect(env.LOCAL_INITIAL_PASSWORD).toBeUndefined();
  });

  test("AUTH_MODE=local WITHOUT SESSION_SECRET → parses (the secret is generated at boot)", async () => {
    const { env } = await reimportEnvWith({ AUTH_MODE: "local", LOCAL_INITIAL_PASSWORD: "abcdefgh" });
    expect(env.AUTH_MODE).toBe("local");
    expect(env.SESSION_SECRET).toBeUndefined();
  });

  // An existing deployment's env file may still carry the deleted opt-in; it must be inert, never a refusal.
  test("a leftover CREDENTIALS_KEY_AUTO line is inert", async () => {
    const { env } = await reimportEnvWith({ CREDENTIALS_KEY_AUTO: "true" });
    expect(Object.keys(env)).not.toContain("CREDENTIALS_KEY_AUTO");
  });

  test("invalid AUTH_MODE enum → the Zod error names the AUTH_MODE field", async () => {
    await expect(reimportEnvWith({ AUTH_MODE: "bogus" })).rejects.toThrow("AUTH_MODE");
  });

  test("a multi-handle OWNER_HANDLES is boot-fatal (D17: exactly one owner)", async () => {
    await expect(reimportEnvWith({ OWNER_HANDLES: "alice,bob" })).rejects.toThrow("OWNER_HANDLES must name EXACTLY ONE owner");
  });

  test("a whitespace/empty-padded single handle still boots (only real duplicates fail)", async () => {
    const { env } = await reimportEnvWith({ OWNER_HANDLES: " alice , , " });
    expect(env.OWNER_HANDLES).toBe(" alice , , ");
  });

  test("SESSION_SECRET shorter than 32 chars is rejected", async () => {
    await expect(
      reimportEnvWith({
        AUTH_MODE: "oidc",
        OIDC_ISSUER: "https://idp.example",
        OIDC_CLIENT_ID: "x",
        OIDC_CLIENT_SECRET: "x",
        OIDC_REDIRECT_URIS: "https://x/api/auth/oidc/callback",
        SESSION_SECRET: "too-short",
      }),
    ).rejects.toThrow("SESSION_SECRET");
  });
});
