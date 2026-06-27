import type { UserRole } from "@orb/contracts/identity";
import type { ExternalId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type {
  AuthConfig,
  ResolveDeps,
  UpsertedUser,
  ValidatedSession,
} from "@orb/server/infra/auth";
import { determineRole, resolve } from "@orb/server/infra/auth";
import { describe, expect, test } from "vitest";

// The front door: `determineRole` (the one app-owned access-control decision) + `resolve(headers, deps)`
// → the ONE immutable `Principal` (or null = unauthenticated → 401 upstream). Every db step is INJECTED
// via fakes (no real db). Tests pass `config` explicitly so they never depend on the frozen env.

const h = (s: string): Handle => castId<Handle>(s);

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

function deps(over: Partial<ResolveDeps> = {}): ResolveDeps {
  return {
    upsertUser: (_identity, seedRole): Promise<UpsertedUser> =>
      Promise.resolve({ userId: castId<UserId>("user-upserted"), role: seedRole, enabled: true }),
    ...over,
  };
}

const headers = (init: Record<string, string> = {}): Headers => new Headers(init);

describe("determineRole — owner iff OWNER_HANDLES/OWNER_GROUP; admin is granted, never derived", () => {
  test("owner — the handle is an owner handle", () => {
    expect(determineRole(h("alex"), [], { handles: ["alex"] })).toBe("owner");
  });

  test("owner — the identity carries the configured owner SSO group", () => {
    expect(
      determineRole(h("alice"), ["staff", "owners"], { handles: ["alex"], group: "owners" }),
    ).toBe("owner");
  });

  test("user — neither the handle nor a group matches (a would-be admin still seeds user)", () => {
    expect(determineRole(h("alice"), ["staff"], { handles: ["alex"], group: "owners" })).toBe(
      "user",
    );
  });

  test("user — no owner group configured and the handle is not an owner handle", () => {
    expect(determineRole(h("bob"), ["admins"], { handles: ["alex"] })).toBe("user");
  });
});

describe("resolve — owner fallback", () => {
  test("single-user → the owner Principal via:'fallback', role owner, seeded owner", async () => {
    let seedSeen: UserRole | undefined;
    const principal = await resolve(
      headers(),
      deps({
        config: cfg({ mode: "single-user" }),
        upsertUser: (_id, seed): Promise<UpsertedUser> => {
          seedSeen = seed;
          return Promise.resolve({
            userId: castId<UserId>("owner-row"),
            role: seed,
            enabled: true,
          });
        },
      }),
    );
    expect(principal).not.toBeNull();
    expect(principal?.via).toBe("fallback");
    expect(principal?.role).toBe("owner");
    expect(principal?.handle).toBe("owner");
    expect(principal?.externalId).toBeNull();
    expect(seedSeen).toBe("owner");
  });

  test("SSO mode: the owner fallback is REFUSED on a public origin (→ null)", async () => {
    const principal = await resolve(
      headers({ host: "chat.example.com" }),
      deps({ config: cfg({ mode: "oidc" }), validateCookie: () => Promise.resolve(null) }),
    );
    expect(principal).toBeNull();
  });

  test("SSO mode: the owner fallback is GRANTED on a local origin (localhost)", async () => {
    const principal = await resolve(
      headers({ host: "localhost:8788" }),
      deps({ config: cfg({ mode: "oidc" }), validateCookie: () => Promise.resolve(null) }),
    );
    expect(principal?.via).toBe("fallback");
    expect(principal?.role).toBe("owner");
  });

  test("fallback 'deny' + no identity → null (SSO mandatory)", async () => {
    const principal = await resolve(
      headers(),
      deps({ config: cfg({ mode: "single-user", fallback: "deny" }) }),
    );
    expect(principal).toBeNull();
  });
});

describe("resolve — cookie modes", () => {
  const session: ValidatedSession = {
    userId: castId<UserId>("user-cookie"),
    handle: castId<Handle>("alice"),
    externalId: castId<ExternalId>("sub-alice"),
    role: "user",
    enabled: true,
  };

  test("local: a live cookie session → Principal via:'cookie' carrying the session's role + userId", async () => {
    const principal = await resolve(
      headers({ cookie: "__Host-orb_session=tok-abc" }),
      deps({ config: cfg({ mode: "local" }), validateCookie: () => Promise.resolve(session) }),
    );
    expect(principal).toEqual({
      userId: "user-cookie",
      role: "user",
      handle: "alice",
      externalId: "sub-alice",
      via: "cookie",
    });
  });

  test("local: a disabled cookie session falls through to the owner fallback (local origin)", async () => {
    const principal = await resolve(
      headers({ host: "127.0.0.1", cookie: "__Host-orb_session=tok-abc" }),
      deps({
        config: cfg({ mode: "local" }),
        validateCookie: () => Promise.resolve({ ...session, enabled: false }),
      }),
    );
    expect(principal?.via).toBe("fallback");
    expect(principal?.role).toBe("owner");
  });
});

describe("resolve — forward-header SSO", () => {
  test("an unsigned forwarded identity is upserted → Principal via:'header'; determineRole seeds the role", async () => {
    let seedSeen: UserRole | undefined;
    const principal = await resolve(
      headers({ "x-authentik-username": "alice", "x-authentik-uid": "sub-alice" }),
      deps({
        config: cfg({ mode: "forward-header", ownerHandles: ["alex"] }),
        upsertUser: (_identity, seed): Promise<UpsertedUser> => {
          seedSeen = seed;
          return Promise.resolve({
            userId: castId<UserId>("user-sso"),
            role: seed,
            enabled: true,
          });
        },
      }),
    );
    expect(principal?.via).toBe("header");
    expect(principal?.handle).toBe("alice");
    expect(principal?.externalId).toBe("sub-alice");
    expect(seedSeen).toBe("user"); // alice is not an owner handle → seeded user
  });

  test("a GRANTED admin is PRESERVED — the upsert returns role:'admin' though the seed was 'user'", async () => {
    const principal = await resolve(
      headers({ "x-authentik-username": "alice" }),
      deps({
        config: cfg({ mode: "forward-header" }),
        upsertUser: (): Promise<UpsertedUser> =>
          Promise.resolve({ userId: castId<UserId>("user-admin"), role: "admin", enabled: true }),
      }),
    );
    expect(principal?.role).toBe("admin");
    expect(principal?.via).toBe("header");
  });

  test("a disabled SSO user → null (unauthenticated, and NOT granted the owner fallback)", async () => {
    const principal = await resolve(
      headers({ host: "127.0.0.1", "x-authentik-username": "alice" }),
      deps({
        config: cfg({ mode: "forward-header" }),
        upsertUser: (): Promise<UpsertedUser> =>
          Promise.resolve({ userId: castId<UserId>("user-x"), role: "user", enabled: false }),
      }),
    );
    expect(principal).toBeNull();
  });
});
