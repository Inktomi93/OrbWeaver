import type { ExternalId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { AuthConfig, ResolveDeps, ValidatedSession } from "@orb/server/infra/auth";
import { dispatchMode, isLocalOrigin, ownerFallbackAllowed } from "@orb/server/infra/auth";
import { describe, expect, test } from "vitest";

function cfg(over: Partial<AuthConfig> = {}): AuthConfig {
  return {
    mode: "single-user",
    fallback: "owner",
    defaultHandle: "owner",
    ownerHandles: ["owner"],
    verifyForwardJwt: false,
    trustedLocalHosts: [],
    trustedPrivateRanges: [],
    forwardTrustedProxies: [],
    jwksAllowlist: [],
    ...over,
  };
}

const session: ValidatedSession = {
  userId: castId<UserId>("u"),
  handle: castId<Handle>("alice"),
  externalId: castId<ExternalId>("sub"),
  role: "user",
  enabled: true,
};

function deps(over: Partial<ResolveDeps> = {}): ResolveDeps {
  return {
    upsertUser: () =>
      Promise.resolve({ userId: castId<UserId>("u"), role: "user" as const, enabled: true }),
    ...over,
  };
}

const headers = (init: Record<string, string> = {}): Headers => new Headers(init);

describe("dispatchMode — one exhaustive branch point over AUTH_MODE", () => {
  test("single-user → none (delegates to the unconditional owner fallback)", async () => {
    expect(await dispatchMode(headers(), cfg({ mode: "single-user" }), deps())).toEqual({
      kind: "none",
    });
  });

  test("local: a live cookie → a session outcome", async () => {
    const out = await dispatchMode(
      headers({ cookie: "__Host-orb_session=tok" }),
      cfg({ mode: "local" }),
      deps({ validateCookie: () => Promise.resolve(session) }),
    );
    expect(out).toEqual({ kind: "session", session });
  });

  test("local: no cookie → none", async () => {
    const out = await dispatchMode(
      headers(),
      cfg({ mode: "local" }),
      deps({ validateCookie: () => Promise.resolve(null) }),
    );
    expect(out).toEqual({ kind: "none" });
  });

  test("oidc: a live cookie → a session outcome", async () => {
    const out = await dispatchMode(
      headers({ cookie: "__Host-orb_session=tok" }),
      cfg({ mode: "oidc" }),
      deps({ validateCookie: () => Promise.resolve(session) }),
    );
    expect(out).toEqual({ kind: "session", session });
  });

  test("forward-header: a trusted header → an identity outcome", async () => {
    const out = await dispatchMode(
      headers({ "x-authentik-username": "alice" }),
      cfg({ mode: "forward-header" }),
      deps(),
    );
    expect(out.kind).toBe("identity");
  });
});

describe("ownerFallbackAllowed", () => {
  test("single-user → always allowed (even on a public-looking host)", () => {
    expect(ownerFallbackAllowed(headers({ host: "chat.example.com" }), cfg())).toBe(true);
  });

  test("SSO mode → allowed only on a local origin", () => {
    expect(ownerFallbackAllowed(headers({ host: "localhost" }), cfg({ mode: "oidc" }))).toBe(true);
    expect(ownerFallbackAllowed(headers({ host: "chat.example.com" }), cfg({ mode: "oidc" }))).toBe(
      false,
    );
  });
});

describe("isLocalOrigin (reads Host, fails closed)", () => {
  test("localhost is local", () => {
    expect(isLocalOrigin(headers({ host: "localhost:8788" }), [])).toBe(true);
  });

  test("a loopback IP literal is local", () => {
    expect(isLocalOrigin(headers({ host: "127.0.0.1" }), [])).toBe(true);
  });

  test("a public FQDN is NOT local (SSO required)", () => {
    expect(isLocalOrigin(headers({ host: "chat.example.com" }), [])).toBe(false);
  });

  test("a configured trusted host is local", () => {
    expect(isLocalOrigin(headers({ host: "orb.lan" }), ["orb.lan"])).toBe(true);
  });

  test("a missing Host header fails closed (not local)", () => {
    expect(isLocalOrigin(headers(), [])).toBe(false);
  });
});
