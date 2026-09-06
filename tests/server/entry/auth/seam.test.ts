// entry/auth/seam — the ONE Principal construction site. These pin the three resolution paths + the
// fail-closed gates (spine identity-auth-permission §1/§3, ledger D40/D17/D135): cookie validates DIRECTLY
// via sessions.validate (returns userId, no re-query); the owner-fallback resolves the BOX OWNER'S ROW and
// mints from it (D135 — the role verdict has ONE home, `users.role`); the SSO header upserts via
// provisionIdentity and GATES on enabled; a stale cookie is ignored outside cookie modes; CSRF is surfaced
// as a signal. The sessions service is stubbed so the test isolates the seam's branching + Principal
// assembly (the row mechanics are tested in domain/sessions).
//
// D135's pin is the AGREEMENT pin: the request-fallback Principal and the frozen-host Principal for the SAME
// caller must be equal. They were not — the fallback stamped `role:"owner"` on whatever row
// `ensureUser(DEFAULT_USER_HANDLE)` returned, so a box whose `OWNER_HANDLES` differs from the
// `DEFAULT_USER_HANDLE` placeholder minted a SECOND user at role `user` and called it owner. The capability
// surface then read one principal and the turn read the other, and they picked different models.
//
// The D135 AMENDMENT block at the bottom pins the same uniformity claim on the OTHER column the three
// request arms decide with: `enabled`. The fallback arm authenticates through `loadUserById`, which
// documents itself as gating nothing, so the arm owns that gate — and the frozen-host bridge must keep NOT
// owning it. An un-credentialed fallback principal is not a debug-route curiosity: under `single-user` it is
// what reaches every owner- and admin-gated tRPC surface, so "who does this arm admit" is the whole boundary.

import type { Principal, UserRole } from "@orb/contracts/identity";
import type { ExternalId, Handle, SessionId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { SessionsService } from "@orb/server/domain/sessions";
import { ownerHandles } from "@orb/server/domain/sessions";
import { createAuthSeam, createHostPrincipalResolver } from "@orb/server/entry/auth";
import type { AuthConfig } from "@orb/server/infra/auth";
import { afterEach, vi } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

/** Verification's placeholder handle (`DEFAULT_USER_HANDLE`, whose schema default is this literal). */
const OWNER_HANDLE = "owner";
/** The REAL owner handle on a box that configured one — deliberately ≠ `OWNER_HANDLE`, which is the whole
 *  shape of the D135 defect (the live box ran `OWNER_HANDLES=inktomi93@gmail.com` with the default
 *  `DEFAULT_USER_HANDLE`, and grew a second-class twin at handle "owner"). */
const REAL_OWNER_HANDLE = "owner@example.test";
const OWNER_HANDLES_VAR = "OWNER_HANDLES";

afterEach(() => {
  vi.unstubAllEnvs();
});

function baseConfig(overrides: Partial<AuthConfig>): AuthConfig {
  return {
    mode: "single-user",
    fallback: "owner",
    defaultHandle: OWNER_HANDLE,
    verifyForwardJwt: false,
    forwardTrustedProxies: [],
    jwksAllowlist: [],
    ...overrides,
  };
}

/** The owner fallback is now gated on a LOOPBACK TCP peer (#298 f2), so every fallback-arm assertion drives
 *  the seam with one. A non-loopback peer is the DENY case (pinned in its own test below). */
const LOOPBACK: { peerIp: string } = { peerIp: "127.0.0.1" };

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
    revokeAllForUserStatement: unused("revokeAllForUserStatement"),
    revokeByExternalId: unused("revokeByExternalId"),
    listForUser: unused("listForUser"),
    ensureUser: unused("ensureUser") as SessionsService["ensureUser"],
    provisionIdentity: unused("provisionIdentity") as SessionsService["provisionIdentity"],
    loadUserById: unused("loadUserById") as SessionsService["loadUserById"],
    resolveHandle: unused("resolveHandle") as SessionsService["resolveHandle"],
    authenticate: unused("authenticate") as SessionsService["authenticate"],
    linkExternalIdStatement: unused("linkExternalIdStatement") as SessionsService["linkExternalIdStatement"],
    settleUnclaimedLink: unused("settleUnclaimedLink") as SessionsService["settleUnclaimedLink"],
    ownerNeedsPassword: unused("ownerNeedsPassword") as SessionsService["ownerNeedsPassword"],
    claimOwnerPassword: unused("claimOwnerPassword") as SessionsService["claimOwnerPassword"],
    ...overrides,
  };
}

const FALLBACK_UID = castId<UserId>("u_owner");
const COOKIE_UID = castId<UserId>("u_cookie");
const HEADER_UID = castId<UserId>("u_header");

interface FakeUserRow {
  readonly id: UserId;
  readonly role: UserRole;
  readonly handle: Handle;
  /** The row's live login state. Every REQUEST arm refuses a disabled row (D135 amendment); the frozen-host
   *  bridge deliberately does not. Defaults true on a row `ensureUser` mints. */
  readonly enabled?: boolean;
}

interface FakeUsers {
  readonly sessions: SessionsService;
  /** Every handle `ensureUser` was called with, in order — the twin-minting receipt. */
  readonly ensured: string[];
  /** handle → row. A SECOND entry is a twin: two users where the box has one owner. */
  readonly rows: Map<string, FakeUserRow>;
}

/**
 * A `users` table faithful to the two verbs the fallback arm drives, so the seam's Principal assembly is
 * tested against real row SEMANTICS instead of a fixed id. `ensureUser` derives the role the way the real
 * verb does — `determineRole(handle, [])`, i.e. owner iff the handle is the configured owner (groups are
 * always empty on this path) — so a handle outside `OWNER_HANDLES` is born `user` and is never repaired by
 * this verb. `loadUserById` reads the row back. NOTHING here stamps a role: that is the point.
 */
function fakeUsers(): FakeUsers {
  const rows = new Map<string, FakeUserRow>();
  const ensured: string[] = [];
  const sessions = stubSessions({
    ensureUser: (handle: Handle) => {
      ensured.push(handle);
      const existing = rows.get(handle);
      if (existing !== undefined) {
        return Promise.resolve(existing.id);
      }
      const row: FakeUserRow = { id: castId<UserId>(`u_${handle}`), role: ownerHandles().includes(handle) ? "owner" : "user", handle };
      rows.set(handle, row);
      return Promise.resolve(row.id);
    },
    loadUserById: (userId: UserId) => {
      const row = [...rows.values()].find((r) => r.id === userId);
      return Promise.resolve(row === undefined ? null : { role: row.role, handle: row.handle, externalId: null, enabled: row.enabled ?? true });
    },
  });
  return { sessions, ensured, rows };
}

test("single-user fallback resolves the OWNER's row (role read, not stamped; via=fallback)", async () => {
  // The COHERENT box: OWNER_HANDLES names the same handle verification stamps. Byte-identical to the
  // pre-D135 behaviour — the fix must not move this case.
  vi.stubEnv(OWNER_HANDLES_VAR, OWNER_HANDLE);
  const users = fakeUsers();
  const seam = createAuthSeam({ config: baseConfig({ mode: "single-user" }), sessions: users.sessions });

  const { principal } = await seam.resolvePrincipal(new Headers(), LOOPBACK);

  expect(principal).toEqual({
    userId: castId<UserId>(`u_${OWNER_HANDLE}`),
    role: "owner",
    handle: OWNER_HANDLE,
    externalId: null,
    via: "fallback",
  });
  expect(users.ensured).toEqual([OWNER_HANDLE]);
});

test("#298 f2: a NON-loopback peer is DENIED the owner fallback → null (was owner on any Host)", async () => {
  // The re-gate's headline at the seam: even single-user's un-credentialed owner arm mints NOTHING off a
  // LAN/proxy peer. `ensureUser` must never be reached (a mint here would be the re-opened hole).
  vi.stubEnv(OWNER_HANDLES_VAR, OWNER_HANDLE);
  const users = fakeUsers();
  const seam = createAuthSeam({ config: baseConfig({ mode: "single-user" }), sessions: users.sessions });

  const { principal } = await seam.resolvePrincipal(new Headers({ host: "127.0.0.1" }), { peerIp: "192.168.1.27" });

  expect(principal).toBeNull();
  expect(users.ensured).toEqual([]);
});

test("D135: the fallback Principal and the frozen-host Principal AGREE about the same caller", async () => {
  // THE defect pin. `OWNER_HANDLES` names a real owner; `DEFAULT_USER_HANDLE` still stamps its "owner"
  // placeholder. Pre-fix the seam ensured the PLACEHOLDER's row (born `user`) and stamped `role:"owner"` on
  // it, while `createHostPrincipalResolver` read `users.role` off that same id and answered `"user"` — one
  // caller, two principals, two different models.
  vi.stubEnv(OWNER_HANDLES_VAR, REAL_OWNER_HANDLE);
  const users = fakeUsers();
  const seam = createAuthSeam({ config: baseConfig({ mode: "single-user" }), sessions: users.sessions });

  const { principal } = await seam.resolvePrincipal(new Headers(), LOOPBACK);
  if (principal === null) {
    throw new Error("the owner fallback must admit a principal");
  }
  const fromRow = await createHostPrincipalResolver(users.sessions)(principal.userId);

  expect(principal).toEqual(fromRow);
  expect(principal.role).toBe("owner");
});

test("D135: the fallback lands on the OWNER_HANDLES row and mints NO second-class twin", async () => {
  vi.stubEnv(OWNER_HANDLES_VAR, REAL_OWNER_HANDLE);
  const users = fakeUsers();
  const seam = createAuthSeam({ config: baseConfig({ mode: "single-user" }), sessions: users.sessions });

  const { principal } = await seam.resolvePrincipal(new Headers(), LOOPBACK);

  // WHO the owner is is resolution-tier policy, never verification's placeholder handle.
  expect(users.ensured).toEqual([REAL_OWNER_HANDLE]);
  expect(principal?.handle).toBe(REAL_OWNER_HANDLE);
  // One box, one owner row — a second row here IS the live twin this fix retires.
  expect([...users.rows.keys()]).toEqual([REAL_OWNER_HANDLE]);
});

test("D135: an owner row demoted below owner is REPORTED, not overridden (the fallback never grants)", async () => {
  // Fail-closed control: the fallback ADMITS (origin gate), it does not GRANT. A pre-existing row at a lower
  // role must reach the Principal as-is — the old code would have re-stamped `owner` over it.
  vi.stubEnv(OWNER_HANDLES_VAR, REAL_OWNER_HANDLE);
  const users = fakeUsers();
  users.rows.set(REAL_OWNER_HANDLE, {
    id: castId<UserId>(`u_${REAL_OWNER_HANDLE}`),
    role: "user",
    handle: castId<Handle>(REAL_OWNER_HANDLE),
  });
  const seam = createAuthSeam({ config: baseConfig({ mode: "single-user" }), sessions: users.sessions });

  const { principal } = await seam.resolvePrincipal(new Headers(), LOOPBACK);

  expect(principal?.role).toBe("user");
});

test("the empty-owner-handles guard is LOAD-BEARING: OWNER_HANDLES=',,' still resolves a handle", async () => {
  // The comment on `ownerHandleForFallback` used to call this branch unreachable "because `ownerHandles()`
  // self-defaults". It does not: `foundation/env`'s superRefine rejects only `> 1` handle after the
  // empty-filter, and `",,"` parses to ZERO; `ownerHandles()`'s own self-default needs `raw.trim().length
  // === 0`, and `",,".trim()` has length 2. So `[0]` is `undefined` and the `?? verificationHandle` fallback
  // is the only thing keeping the arm from resolving to nothing. (A booted server never gets here —
  // `entry/lifecycle.ts` throws on an empty owner list first — but a seam constructed outside that boot
  // path, like this one, does.)
  vi.stubEnv(OWNER_HANDLES_VAR, ",,");
  expect(ownerHandles()).toEqual([]);
  const users = fakeUsers();
  const seam = createAuthSeam({ config: baseConfig({ mode: "single-user" }), sessions: users.sessions });

  const { principal } = await seam.resolvePrincipal(new Headers(), LOOPBACK);

  expect(users.ensured).toEqual([OWNER_HANDLE]); // verification's handle, never `undefined`
  expect(principal?.handle).toBe(OWNER_HANDLE);
  // …and with no owner policy configured, that row is honestly `user` — the arm admits, it does not grant.
  expect(principal?.role).toBe("user");
});

test("a valid cookie resolves DIRECTLY via sessions.validate (userId carried, role re-read)", async () => {
  const seam = createAuthSeam({
    config: baseConfig({ mode: "local" }),
    sessions: stubSessions({
      validate: () =>
        Promise.resolve({
          sessionId: castId<SessionId>("sess_cookie"),
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
    config: baseConfig({
      mode: "forward-header",
      forwardUserHeader: "x-forwarded-user",
      forwardTrustedProxies: ["10.0.0.0/8"],
    }),
    sessions: stubSessions({
      provisionIdentity: () =>
        Promise.resolve({
          outcome: "provisioned",
          userId: HEADER_UID,
          enabled: true,
          role: "user",
          // W7b — this arm re-provisions on EVERY request, so the steady state is "nothing moved" and the
          // seam must fan nothing. The `true` case is pinned in the verb's own suite.
          identityChanged: false,
        }),
    }),
  });

  const headers = new Headers({
    cookie: "__Host-orb_session=leftover",
    "x-forwarded-user": "bob",
  });
  const { principal } = await seam.resolvePrincipal(headers, { peerIp: "10.1.2.3" });

  expect(principal?.userId).toBe(HEADER_UID);
  expect(principal?.via).toBe("header");
});

test("an SSO header upserts via provisionIdentity and carries the resolved role", async () => {
  let received: ExternalId | null | undefined;
  const seam = createAuthSeam({
    config: baseConfig({
      mode: "forward-header",
      forwardUserHeader: "x-forwarded-user",
      forwardTrustedProxies: ["10.0.0.0/8"],
    }),
    sessions: stubSessions({
      provisionIdentity: (identity) => {
        received = identity.externalId;
        return Promise.resolve({
          outcome: "provisioned",
          userId: HEADER_UID,
          enabled: true,
          role: "admin",
          identityChanged: false,
        });
      },
    }),
  });

  const headers = new Headers({ "x-forwarded-user": "carol" });
  const { principal } = await seam.resolvePrincipal(headers, { peerIp: "10.1.2.3" });

  expect(principal?.role).toBe("admin");
  expect(principal?.handle).toBe("carol");
  expect(received).toBeNull(); // unsigned header path → no externalId
});

test("B1 anti-spoof: an SSO header from an UNTRUSTED peer is rejected even with a forged trusted XFF", async () => {
  // provisionIdentity throws (stub default) — reaching it would fail the test; the peer-IP gate must reject
  // BEFORE any upsert. The attacker forges an in-range X-Forwarded-For but the socket peer is off-allowlist.
  const seam = createAuthSeam({
    config: baseConfig({
      mode: "forward-header",
      forwardUserHeader: "x-forwarded-user",
      forwardTrustedProxies: ["10.0.0.0/8"],
    }),
    sessions: stubSessions({}),
  });

  const headers = new Headers({ "x-forwarded-user": "owner", "x-forwarded-for": "10.1.2.3" });
  const { principal } = await seam.resolvePrincipal(headers, { peerIp: "203.0.113.9" });

  expect(principal).toBeNull();
});

test("a disabled SSO row is gated to null (disable takes effect next request, not JWT-baked)", async () => {
  const seam = createAuthSeam({
    config: baseConfig({
      mode: "forward-header",
      forwardUserHeader: "x-forwarded-user",
      forwardTrustedProxies: ["10.0.0.0/8"],
    }),
    sessions: stubSessions({
      provisionIdentity: () =>
        Promise.resolve({
          outcome: "provisioned",
          userId: HEADER_UID,
          enabled: false,
          role: "user",
          identityChanged: false,
        }),
    }),
  });

  const { principal } = await seam.resolvePrincipal(new Headers({ "x-forwarded-user": "dave" }), {
    peerIp: "10.1.2.3",
  });
  expect(principal).toBeNull();
});

test("the CSRF header presence is surfaced as a signal (the ladder gates, not the seam)", async () => {
  vi.stubEnv(OWNER_HANDLES_VAR, OWNER_HANDLE);
  const seam = createAuthSeam({ config: baseConfig({ mode: "single-user" }), sessions: fakeUsers().sessions });

  const withHeader = await seam.resolvePrincipal(new Headers({ "x-orb-csrf": "1" }));
  const without = await seam.resolvePrincipal(new Headers());

  expect(withHeader.csrfHeaderPresent).toBe(true);
  expect(without.csrfHeaderPresent).toBe(false);
});

test("debugGateAdmits requires a CREDENTIAL as well as the admin role", async () => {
  // ⚠ DO NOT "RESTORE" THE OLD ASSERTION HERE. Until 2026-08-07 this test asserted that an un-credentialed
  // caller was admitted — i.e. it PINNED the AUTHFIX-2 hole as if it were behaviour. It was not: this
  // verdict's only consumer is the /api/_debug admin arm, which short-circuits the DEBUG_TOKEN check (and the
  // `expectedToken === undefined` → 404 branch with it), so a loose `true` means a caller reads
  // principal-blind whole-db probes — wire captures included. Both halves are required.
  vi.stubEnv(OWNER_HANDLES_VAR, OWNER_HANDLE);

  // The un-credentialed owner FALLBACK on a STRICT-posture box (the dep omitted ⇒ fail-closed): a real
  // `role:"owner"` principal that presented no cookie and no header, refused at the diagnostics door.
  const strictSeam = createAuthSeam({ config: baseConfig({ mode: "single-user" }), sessions: fakeUsers().sessions });
  const owner = (await strictSeam.resolvePrincipal(new Headers(), LOOPBACK)).principal;
  expect(owner?.role).toBe("owner"); // …and it still authenticates everywhere else, which is the whole point
  expect(strictSeam.debugGateAdmits(owner, new Headers())).toBe(false);

  // The SAME principal on a box whose posture says the loopback owner IS the operator (#1193 — dev, or any
  // non-production box). The rule that decides this lives in `foundation/env`; the seam only carries it.
  const operatorSeam = createAuthSeam({
    config: baseConfig({ mode: "single-user" }),
    sessions: fakeUsers().sessions,
    ownerFallbackIsOperatorCredential: true,
  });
  expect(operatorSeam.debugGateAdmits(owner, new Headers())).toBe(true);
  // The ROLE half is still required on that arm: a loopback caller whose row is a plain user is refused.
  expect(operatorSeam.debugGateAdmits({ ...(owner as NonNullable<typeof owner>), role: "user" }, new Headers())).toBe(false);

  const cookiePrincipal = async (role: UserRole): Promise<Principal | null> => {
    const seam = createAuthSeam({
      config: baseConfig({ mode: "local" }),
      sessions: stubSessions({
        validate: () =>
          Promise.resolve({
            sessionId: castId<SessionId>("sess_cookie"),
            userId: COOKIE_UID,
            role,
            handle: castId<Handle>("carol"),
            externalId: null,
            enabled: true,
          }),
      }),
    });
    return (await seam.resolvePrincipal(new Headers({ cookie: "__Host-orb_session=t" }))).principal;
  };
  const cookieSeam = createAuthSeam({ config: baseConfig({ mode: "local" }), sessions: stubSessions({}) });
  expect(cookieSeam.debugGateAdmits(await cookiePrincipal("admin"), new Headers())).toBe(true);
  expect(cookieSeam.debugGateAdmits(await cookiePrincipal("user"), new Headers())).toBe(false);
  // No principal at all (anonymous, or a context the auth middleware never ran on) → refused.
  expect(cookieSeam.debugGateAdmits(null, new Headers())).toBe(false);
});

test("debugGateAdmits takes a VERIFIED SSO identity, never a proxy-asserted one", async () => {
  // `via:"header"` covers both forward-header sub-paths, and only one of them is a credential at this door:
  // the JWT the deployment verified. The unsigned path is the trusted-proxy allowlist's word about a raw
  // `Remote-User:` header — enough to run the app as that admin, not enough to hand over whole-db reads.
  const signedConfig = baseConfig({ mode: "forward-header", verifyForwardJwt: true, jwksAllowlist: ["idp.example.test"] });
  const seam = createAuthSeam({
    config: signedConfig,
    sessions: stubSessions({
      provisionIdentity: () =>
        Promise.resolve({ outcome: "provisioned" as const, userId: HEADER_UID, role: "admin" as UserRole, enabled: true, identityChanged: false }),
    }),
    verifyForwardJwt: {
      verify: () => Promise.resolve({ handle: castId<Handle>("sso-admin"), externalId: castId<ExternalId>("ext-1"), groups: [], email: null }),
    },
  });

  const signedHeaders = new Headers({ "x-authentik-jwt": "jwt", "x-authentik-meta-jwks": "{}" });
  const signed = (await seam.resolvePrincipal(signedHeaders)).principal;
  expect(signed?.via).toBe("header");
  expect(seam.debugGateAdmits(signed, signedHeaders)).toBe(true);

  // The SAME admin principal, on a request that carried no JWT — the unsigned (proxy-asserted) shape.
  expect(seam.debugGateAdmits(signed, new Headers({ "remote-user": "sso-admin" }))).toBe(false);
});

test("createHostPrincipalResolver mints the host Principal from the LIVE row (real role carried)", async () => {
  const resolve = createHostPrincipalResolver(
    stubSessions({
      loadUserById: (userId) =>
        Promise.resolve(userId === FALLBACK_UID ? { role: "owner", handle: castId<Handle>("owner"), externalId: null, enabled: true } : null),
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
  const resolve = createHostPrincipalResolver(stubSessions({ loadUserById: () => Promise.resolve(null) }));
  const principal = await resolve(COOKIE_UID);
  expect(principal.role).toBe("user");
  expect(principal.userId).toBe(COOKIE_UID);
  expect(principal.handle).toBe(COOKIE_UID); // the userId-as-handle degrade, never a throw
});

// ── The `enabled` parity of the THREE request arms (D135 amendment) ──────────────────────────────────────
// The file header asserts all three request paths read one column for the ROLE verdict. They must also agree
// on ADMISSION: `sessions.validate` re-checks `users.enabled` per request (invariant #8/D40) and the SSO arm
// returns null on `!provisioned.enabled`. The fallback arm authenticates through `loadUserById`, a read that
// deliberately gates NOTHING (the frozen-host bridge needs a disabled host's row to keep resolving), so the
// gate has to live in the arm. Not reachable via `admin.setEnabled` (it refuses to disable an owner) — this
// is the belt for a direct `users.enabled = 0` write.

test("D135: a DISABLED owner row is refused by the fallback arm (parity with cookie + SSO)", async () => {
  vi.stubEnv(OWNER_HANDLES_VAR, REAL_OWNER_HANDLE);
  const users = fakeUsers();
  users.rows.set(REAL_OWNER_HANDLE, {
    id: castId<UserId>(`u_${REAL_OWNER_HANDLE}`),
    role: "owner",
    handle: castId<Handle>(REAL_OWNER_HANDLE),
    enabled: false,
  });
  const seam = createAuthSeam({ config: baseConfig({ mode: "single-user" }), sessions: users.sessions });

  const { principal } = await seam.resolvePrincipal(new Headers(), LOOPBACK);

  // Anonymous → transport 401. The origin gate admitted the request; the ROW refused it.
  expect(principal).toBeNull();
  // And the debug-gate verdict that keys on this principal collapses with it — even on the OPERATOR posture,
  // where the fallback arm IS a credential: a disabled row never becomes a principal to admit.
  expect(seam.debugGateAdmits(principal, new Headers())).toBe(false);
  const operatorSeam = createAuthSeam({
    config: baseConfig({ mode: "single-user" }),
    sessions: users.sessions,
    ownerFallbackIsOperatorCredential: true,
  });
  expect(operatorSeam.debugGateAdmits((await operatorSeam.resolvePrincipal(new Headers(), LOOPBACK)).principal, new Headers())).toBe(false);
});

test("D135: the frozen-host bridge still resolves a DISABLED row (the gate is the CALLER's)", async () => {
  // The deliberate divergence: an offline-or-disabled host's room must keep answering "what is its
  // authority" for the members still reading it. Collapsing these two into one gated read would break that.
  const resolve = createHostPrincipalResolver(
    stubSessions({
      loadUserById: () => Promise.resolve({ role: "owner", handle: castId<Handle>("owner"), externalId: null, enabled: false }),
    }),
  );

  expect((await resolve(FALLBACK_UID)).role).toBe("owner");
});

test("D135: an ENABLED fallback caller still deep-equals the frozen-host Principal (the agreement holds)", async () => {
  vi.stubEnv(OWNER_HANDLES_VAR, REAL_OWNER_HANDLE);
  const users = fakeUsers();
  const seam = createAuthSeam({ config: baseConfig({ mode: "single-user" }), sessions: users.sessions });

  const { principal } = await seam.resolvePrincipal(new Headers(), LOOPBACK);
  if (principal === null) {
    throw new Error("an enabled owner must be admitted");
  }

  expect(principal).toEqual(await createHostPrincipalResolver(users.sessions)(principal.userId));
});
