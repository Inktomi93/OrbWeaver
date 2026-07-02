// entry/auth/seam — the ONE Principal construction site. These pin the three resolution paths + the
// fail-closed gates (spine identity-auth-permission §1/§3, ledger D40/D17): cookie validates DIRECTLY via
// sessions.validate (returns userId, no re-query); the owner-fallback mints role=owner via ensureUser; the
// SSO header upserts via provisionIdentity and GATES on enabled; a stale cookie is ignored outside cookie
// modes; CSRF is surfaced as a signal. The sessions service is stubbed so the test isolates the seam's
// branching + Principal assembly (the row mechanics are tested in domain/sessions).

import type { ExternalId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { SessionsService } from "@orb/server/domain/sessions";
import { createAuthSeam, createHostPrincipalResolver } from "@orb/server/entry/auth";
import type { AuthConfig } from "@orb/server/infra/auth";
import { expect, test } from "../../../support/fixtures";

const OWNER_HANDLE = "owner";

function baseConfig(overrides: Partial<AuthConfig>): AuthConfig {
  return {
    mode: "single-user",
    fallback: "owner",
    defaultHandle: OWNER_HANDLE,
    verifyForwardJwt: false,
    trustedLocalHosts: [],
    trustedPrivateRanges: [],
    forwardTrustedProxies: [],
    jwksAllowlist: [],
    ...overrides,
  };
}

/** A SessionsService whose unused verbs throw (the seam touches only validate/ensureUser/provisionIdentity
 *  — a throw proves a path didn't reach a verb it shouldn't). */
function stubSessions(overrides: Partial<SessionsService>): SessionsService {
  const unused = (name: string) => (): never => {
    throw new Error(`unexpected sessions.${name}`);
  };
  return {
    create: unused("create"),
    validate: unused("validate") as SessionsService["validate"],
    revokeByToken: unused("revokeByToken"),
    revoke: unused("revoke"),
    revokeAllForUser: unused("revokeAllForUser"),
    listForUser: unused("listForUser"),
    ensureUser: unused("ensureUser") as SessionsService["ensureUser"],
    provisionIdentity: unused("provisionIdentity") as SessionsService["provisionIdentity"],
    // biome-ignore lint/security/noSecrets: a verb name literal, not a secret (high-entropy false positive).
    loadUserById: unused("loadUserById") as SessionsService["loadUserById"],
    // biome-ignore lint/security/noSecrets: a verb name literal, not a secret (high-entropy false positive).
    resolveHandle: unused("resolveHandle") as SessionsService["resolveHandle"],
    authenticate: unused("authenticate") as SessionsService["authenticate"],
    ...overrides,
  };
}

const FALLBACK_UID = castId<UserId>("u_owner");
const COOKIE_UID = castId<UserId>("u_cookie");
const HEADER_UID = castId<UserId>("u_header");

test("single-user fallback mints the OWNER (role=owner, via=fallback) via ensureUser", async () => {
  const handles: string[] = [];
  const seam = createAuthSeam({
    config: baseConfig({ mode: "single-user" }),
    sessions: stubSessions({
      ensureUser: (handle: string) => {
        handles.push(handle);
        return Promise.resolve(FALLBACK_UID);
      },
    }),
  });

  const { principal } = await seam.resolvePrincipal(new Headers());

  expect(principal).toEqual({
    userId: FALLBACK_UID,
    role: "owner",
    handle: OWNER_HANDLE,
    externalId: null,
    via: "fallback",
  });
  expect(handles).toEqual([OWNER_HANDLE]); // ensureUser keyed on the fallback handle, no role derivation
});

test("a valid cookie resolves DIRECTLY via sessions.validate (userId carried, role re-read)", async () => {
  const seam = createAuthSeam({
    config: baseConfig({ mode: "local" }),
    sessions: stubSessions({
      validate: () =>
        Promise.resolve({
          userId: COOKIE_UID,
          role: "user",
          handle: castId<Handle>("alice"),
          externalId: null,
          enabled: true,
        }),
    }),
  });

  const headers = new Headers({ cookie: "__Host-orb_session=tok123" });
  const { principal } = await seam.resolvePrincipal(headers);

  expect(principal).toEqual({
    userId: COOKIE_UID,
    role: "user",
    handle: "alice",
    externalId: null,
    via: "cookie",
  });
});

test("an invalid cookie under fallback=deny is unauthenticated (null), not the owner", async () => {
  const seam = createAuthSeam({
    config: baseConfig({ mode: "local", fallback: "deny" }),
    sessions: stubSessions({ validate: () => Promise.resolve(null) }),
  });

  const headers = new Headers({ cookie: "__Host-orb_session=stale" });
  const { principal } = await seam.resolvePrincipal(headers);

  expect(principal).toBeNull();
});

test("a stale cookie is IGNORED outside cookie modes (forward-header never calls validate)", async () => {
  // validate throws (stub default) — reaching it would fail the test; the seam must skip the cookie.
  const seam = createAuthSeam({
    config: baseConfig({ mode: "forward-header", forwardUserHeader: "x-forwarded-user" }),
    sessions: stubSessions({
      provisionIdentity: () => Promise.resolve({ userId: HEADER_UID, enabled: true, role: "user" }),
    }),
  });

  const headers = new Headers({
    cookie: "__Host-orb_session=leftover",
    "x-forwarded-user": "bob",
  });
  const { principal } = await seam.resolvePrincipal(headers);

  expect(principal?.userId).toBe(HEADER_UID);
  expect(principal?.via).toBe("header");
});

test("an SSO header upserts via provisionIdentity and carries the resolved role", async () => {
  let received: ExternalId | null | undefined;
  const seam = createAuthSeam({
    config: baseConfig({ mode: "forward-header", forwardUserHeader: "x-forwarded-user" }),
    sessions: stubSessions({
      provisionIdentity: (identity) => {
        received = identity.externalId;
        return Promise.resolve({ userId: HEADER_UID, enabled: true, role: "admin" });
      },
    }),
  });

  const headers = new Headers({ "x-forwarded-user": "carol" });
  const { principal } = await seam.resolvePrincipal(headers);

  expect(principal?.role).toBe("admin");
  expect(principal?.handle).toBe("carol");
  expect(received).toBeNull(); // unsigned header path → no externalId
});

test("a disabled SSO row is gated to null (disable takes effect next request, not JWT-baked)", async () => {
  const seam = createAuthSeam({
    config: baseConfig({ mode: "forward-header", forwardUserHeader: "x-forwarded-user" }),
    sessions: stubSessions({
      provisionIdentity: () =>
        Promise.resolve({ userId: HEADER_UID, enabled: false, role: "user" }),
    }),
  });

  const { principal } = await seam.resolvePrincipal(new Headers({ "x-forwarded-user": "dave" }));
  expect(principal).toBeNull();
});

test("the CSRF header presence is surfaced as a signal (the ladder gates, not the seam)", async () => {
  const seam = createAuthSeam({
    config: baseConfig({ mode: "single-user" }),
    sessions: stubSessions({ ensureUser: () => Promise.resolve(FALLBACK_UID) }),
  });

  const withHeader = await seam.resolvePrincipal(new Headers({ "x-orb-csrf": "1" }));
  const without = await seam.resolvePrincipal(new Headers());

  expect(withHeader.csrfHeaderPresent).toBe(true);
  expect(without.csrfHeaderPresent).toBe(false);
});

test("isAdmin is true for owner/admin, false otherwise, and never throws", async () => {
  const ownerSeam = createAuthSeam({
    config: baseConfig({ mode: "single-user" }),
    sessions: stubSessions({ ensureUser: () => Promise.resolve(FALLBACK_UID) }),
  });
  expect(await ownerSeam.isAdmin(new Headers())).toBe(true);

  const userSeam = createAuthSeam({
    config: baseConfig({ mode: "local" }),
    sessions: stubSessions({
      validate: () =>
        Promise.resolve({
          userId: COOKIE_UID,
          role: "user",
          handle: castId<Handle>("alice"),
          externalId: null,
          enabled: true,
        }),
    }),
  });
  expect(await userSeam.isAdmin(new Headers({ cookie: "__Host-orb_session=t" }))).toBe(false);

  // A throwing resolver must fail closed (not admin), never propagate.
  const brokenSeam = createAuthSeam({
    config: baseConfig({ mode: "local" }),
    sessions: stubSessions({
      validate: () => Promise.reject(new Error("db down")),
    }),
  });
  expect(await brokenSeam.isAdmin(new Headers({ cookie: "__Host-orb_session=t" }))).toBe(false);
});

test("createHostPrincipalResolver mints the host Principal from the LIVE row (real role carried)", async () => {
  const resolve = createHostPrincipalResolver(
    stubSessions({
      loadUserById: (userId) =>
        Promise.resolve(
          userId === FALLBACK_UID
            ? { role: "owner", handle: castId<Handle>("owner"), externalId: null }
            : null,
        ),
    }),
  );

  // The known host: the D17 owner-gates see the REAL role (a fabricated "user" would fail-closed-deny).
  expect(await resolve(FALLBACK_UID)).toEqual({
    userId: FALLBACK_UID,
    role: "owner",
    handle: "owner",
    externalId: null,
    via: "fallback",
  });
});

test("createHostPrincipalResolver degrades an unknown id to role=user (fail-closed for privileged gates)", async () => {
  const resolve = createHostPrincipalResolver(
    stubSessions({ loadUserById: () => Promise.resolve(null) }),
  );
  const principal = await resolve(COOKIE_UID);
  expect(principal.role).toBe("user");
  expect(principal.userId).toBe(COOKIE_UID);
  expect(principal.handle).toBe(COOKIE_UID); // the userId-as-handle degrade, never a throw
});
