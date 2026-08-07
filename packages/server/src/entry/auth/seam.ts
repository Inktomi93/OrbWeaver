// THE auth seam: the ONE place a `Principal` is constructed. The only module allowed to import BOTH
// `infra/auth` (db-free VERIFICATION) and `domain/sessions` (RESOLUTION + the users-row upsert). Turns a
// request's headers into an immutable, db-resolved `Principal`; everything below re-reads
// `Principal.userId`, never re-resolves.
//
// Three paths: (1) cookie — `sessions.validate(token)` returns the userId directly, cookie-mode only;
// (2) owner-fallback — origin-gated un-credentialed owner, resolved to the BOX OWNER'S ROW (D135);
// (3) SSO header — `infra/auth.resolve` verifies, then `provisionIdentity` upserts + gates on `enabled`.
//
// D135 — THE ROLE VERDICT HAS ONE HOME, `users.role`, AND NO PATH INVENTS A ROLE THAT GRANTS AUTHORITY. All
// three request paths and the frozen-host bridge read that column (`validate` / `createHostPrincipalResolver`
// / `provisionIdentity`).
// The fallback arm used to STAMP `role:"owner"` on whatever row `ensureUser(defaultHandle)` returned, so on
// a box where `DEFAULT_USER_HANDLE` (verification's placeholder, default "owner") differs from
// `OWNER_HANDLES` (the resolution tier's owner policy) it minted a SECOND user at role `user` and lied
// `owner` about it — the request principal and the frozen-host principal then disagreed about the same
// caller, and the capability surface and the actual turn silently picked different models.
//
// THE CENSUS BEHIND THAT ABSOLUTE (re-derived 2026-08-07 over every `via:"fallback"` Principal literal in
// `packages/server/src`, because an unqualified absolute is what the next cold agent trusts INSTEAD of
// re-sweeping). Elevating stamps: NONE — `entry/compose/role-clients.ts` was the last one and now mints
// through `createHostPrincipalResolver` (D135 clause G), and `entry/lifecycle.ts`'s boot-seed Principal
// reads the row `seedOwner` just wrote. What remains is the FAIL-CLOSED FLOOR, `role:"user"` on synthetic
// principals for role-IRRELEVANT ops — `entry/compose/chat.ts` (its role-SENSITIVE siblings use the
// resolver), `entry/compose/imagery.ts`, `entry/compose/search-discovery.ts` — plus this file's own
// unknown-id `?? "user"`. Inventing the floor DENIES; only inventing a grant is the defect (D135 clause E).
//
// CSRF is a SIGNAL here, not a gate: the seam surfaces `csrfHeaderPresent` + `via`; the transport ladder
// enforces it.

import type { Principal } from "@orb/contracts/identity";
import type { Handle, SessionToken, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { requireAdmin } from "#domain/admin";
import type { SessionsService, UserPrincipalFields } from "#domain/sessions";
import { ownerHandles } from "#domain/sessions";
import type { AuthConfig, ForwardJwtVerifier, IdentityResolution, OidcTransactionStore } from "#infra/auth";
import { authConfigFromEnv, hasCsrfHeader, resolve, SESSION_COOKIE_NAME } from "#infra/auth";

/** The boot-time deps the seam binds once. `config` is the test/override seam — production parses
 *  `authConfigFromEnv()` once at construction. `verifyForwardJwt`/`oidcStore` are the ports the SSO paths
 *  need; absent ⇒ that layer is inert (fail-closed). */
export interface AuthSeamDeps {
  readonly sessions: SessionsService;
  readonly verifyForwardJwt?: ForwardJwtVerifier;
  readonly oidcStore?: OidcTransactionStore;
  readonly config?: AuthConfig;
}

/** Per-request knobs. `peerIp` is the raw TCP peer socket address the forward-header trusted-proxy gate
 *  matches against — absent ⇒ that path fails closed (anti-spoof: never a spoofable forwarded header). */
export interface PerRequestSeamDeps {
  readonly onSessionSlide?: (expiresAt: number) => void;
  readonly peerIp?: string;
}

/** The seam output: the immutable `Principal` (or `null` for anonymous/disabled → transport 401) plus the
 *  CSRF-header signal the transport ladder keys on. */
export interface SeamResult {
  readonly principal: Principal | null;
  readonly csrfHeaderPresent: boolean;
}

/** The constructed seam — bound at boot, called per request. `isAdmin` is the DEBUG-GATE verdict only (and
 *  carries an OPEN finding — read its doc before touching it); it must never throw — a transport/db error
 *  resolves to `false` so a misbehaving seam can't open the debug gate. */
export interface AuthSeam {
  readonly resolvePrincipal: (headers: Headers, req?: PerRequestSeamDeps) => Promise<SeamResult>;
  readonly isAdmin: (headers: Headers) => Promise<boolean>;
}

/**
 * THE trust-boundary crossing for the read side: an attacker-controlled `Cookie` header becomes a typed
 * `SessionToken` here and NOWHERE else. The brand asserts PROVENANCE ("this string came off our own cookie
 * under our own name"), not authenticity — the authenticity gate is `sessions.validate`, whose peppered-hash
 * lookup fails closed on anything forged. A malformed / percent-broken value is `null` (no session).
 *
 * Exported because all THREE session-cookie call paths must extract the same token from the same header, or
 * the seam authenticates one value while logout revokes another and the expiry-slide re-issues a third:
 * this reader, `entry/http/auth-routes.ts` (logout → `revokeByToken`), and `entry/app.ts` (the slide's
 * `Set-Cookie` re-issue). It was three byte-identical copies; the drift-equality proof is
 * `tests/server/entry/session-cookie-parity.suite.test.ts`, which drives all three paths over one crafted
 * header. Do not re-inline a copy.
 */
export function readSessionCookie(headers: Headers): SessionToken | null {
  const raw = headers.get("cookie");
  if (raw === null) {
    return null;
  }
  for (const part of raw.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) {
      continue;
    }
    if (part.slice(0, eq).trim() === SESSION_COOKIE_NAME) {
      try {
        return castId<SessionToken>(decodeURIComponent(part.slice(eq + 1).trim()));
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** Cookie path: `null` when there's no cookie or the session is gone (→ fall through). */
async function resolveCookiePrincipal(
  sessions: SessionsService,
  headers: Headers,
  onSlide: ((expiresAt: number) => void) | undefined,
): Promise<Principal | null> {
  const token = readSessionCookie(headers);
  if (token === null) {
    return null;
  }
  const validated = await sessions.validate(token, onSlide);
  if (validated === null) {
    return null;
  }
  return {
    userId: validated.userId,
    role: validated.role,
    handle: validated.handle,
    externalId: validated.externalId,
    via: "cookie",
  };
}

/**
 * WHICH handle the owner fallback lands on. Verification stamps `config.defaultHandle`
 * (`DEFAULT_USER_HANDLE`, whose schema default is the literal `"owner"`) on the `via:"fallback"` identity —
 * but that is a PLACEHOLDER, not a verdict: infra deliberately does not read owner policy
 * (`infra/auth/config.ts`, invariant #3). WHO the box owner is, is RESOLUTION-tier policy — `ownerHandles()`,
 * the same predicate `determineRole` and the boot owner-seed read, exported from the sessions front door
 * precisely "so entry's boot owner-seed and the login-derived role path can never fork" (D135: the fallback
 * is a third consumer of that one predicate). D17 makes the list a singleton, so `[0]` is THE owner handle.
 *
 * THE `?? verificationHandle` GUARD IS LOAD-BEARING, NOT DECORATIVE — an earlier comment here called the
 * empty list "structurally unreachable because `ownerHandles()` self-defaults", and that reason is FALSE:
 * `OWNER_HANDLES=",,"` clears `foundation/env`'s superRefine (it rejects `> 1` handle after the empty-filter,
 * and this parses to ZERO), and `ownerHandles()` returns `[]` because its self-default only fires on
 * `raw.trim().length === 0` while `",,".trim()` has length 2 (`sessions/substrate/role-policy.ts`). `[0]` is
 * then `undefined`. What actually keeps a BOOTED server off that branch is `entry/lifecycle.ts` throwing
 * "seedOwner returned no owner id (OWNER_HANDLES resolved empty)" before it ever listens — so the guard is
 * the only belt for a seam constructed OUTSIDE that boot path (unit tests, the int harness, any future
 * embedder), and removing it would resolve the arm to nothing there.
 */
function ownerHandleForFallback(verificationHandle: Handle): Handle {
  return castId<Handle>(ownerHandles()[0] ?? verificationHandle);
}

/** Owner-fallback or SSO header path. `null` for an anonymous/disabled caller (→ transport 401). */
async function resolveHeaderOrFallbackPrincipal(
  sessions: SessionsService,
  res: IdentityResolution,
  resolveFallbackPrincipal: (userId: UserId) => Promise<Principal | null>,
): Promise<Principal | null> {
  if (res.identity === null) {
    return null;
  }
  if (res.via === "fallback") {
    // The fallback ADMITS the owner (the origin gate is the security boundary — `ownerFallbackAllowed`);
    // it does not GRANT a role. Ensure the owner's row exists, then mint through the same row→Principal
    // mapper the frozen-host bridge uses, so both principals for one user read one column (D135) — plus the
    // `enabled` gate every REQUEST arm applies (`null` ⇒ anonymous ⇒ transport 401).
    const userId = await sessions.ensureUser(ownerHandleForFallback(res.identity.handle));
    return await resolveFallbackPrincipal(userId);
  }
  const provisioned = await sessions.provisionIdentity(res.identity);
  // Denied (allowlist gate refused) or disabled → anonymous → transport 401.
  if (provisioned.outcome === "denied") {
    return null;
  }
  if (!provisioned.enabled) {
    return null;
  }
  return {
    userId: provisioned.userId,
    role: provisioned.role,
    handle: res.identity.handle,
    externalId: res.identity.externalId,
    via: res.via,
  };
}

/**
 * THE row-fields → `Principal` MAP: the second Principal-construction site this module owns, and (D135) the
 * ONE place a role reaches a `Principal` from a `users` row. Pure — it decides nothing about admission, so
 * both row-driven resolvers below can share one spelling while applying different gates.
 *
 * An unknown id (`null` fields) DEGRADES to `"user"`: that is fail-closed on a row that isn't there, never
 * an invented grant. Role-sensitive ops need this read because a fabricated `role:"user"` would
 * fail-closed-DENY the owner's own privileged turn.
 */
function principalFromRow(userId: UserId, fields: UserPrincipalFields | null): Principal {
  return {
    userId,
    role: fields?.role ?? "user",
    handle: fields?.handle ?? castId<Handle>(userId),
    externalId: fields?.externalId ?? null,
    via: "fallback",
  };
}

/**
 * THE FROZEN-HOST bridge: chat's cross-feature ops key on the frozen host `UserId` (the host may be offline,
 * so no request Principal exists) — and `entry/compose/role-clients.ts` binds a user's provider bundle
 * through it (D135 clause G). Sharing the mapper with the request arm is the fix, not a coincidence: when
 * the fallback stamped its own `role:"owner"` while this read `users.role`, one caller had two principals
 * that disagreed, and every owner-gated surface (the `max-pro-sub` mint, `ROLE_SELECTORS.chat`) resolved
 * differently depending on which one reached it.
 *
 * DELIBERATELY UN-GATED on `enabled`, unlike {@link createFallbackPrincipalResolver}: nobody is
 * authenticating here, and a disabled (or merely offline) host's row must still answer "what is this room's
 * authority" for the members still reading it. The gate is the CALLER's, and this caller's answer is no.
 */
export function createHostPrincipalResolver(sessions: Pick<SessionsService, "loadUserById">): (userId: UserId) => Promise<Principal> {
  return async (userId: UserId): Promise<Principal> => principalFromRow(userId, await sessions.loadUserById(userId));
}

/**
 * The OWNER-FALLBACK arm's resolver: the same mapper PLUS the `enabled` gate, because this one IS a request
 * authentication. The other two request paths refuse a disabled row — `sessions.validate` re-checks
 * `users.enabled` per request (invariant #8/D40) and the SSO arm returns `null` on `!provisioned.enabled` —
 * so without this the file's "all three request paths agree" claim would be true of `role` and false of
 * `enabled`, and a directly-written `users.enabled = 0` on the owner row would still admit an un-credentialed
 * caller as owner. (`admin.setEnabled` refuses to disable an owner, so today only a raw DB write reaches it:
 * this is depth, not a live hole.)
 *
 * `null` fields ⇒ deny: `ensureUser` just guaranteed the row, so its absence means the row vanished
 * mid-request — anonymous is the fail-closed answer for a REQUEST (the bridge above, which has no admission
 * decision to make, keeps degrading instead).
 */
function createFallbackPrincipalResolver(sessions: Pick<SessionsService, "loadUserById">): (userId: UserId) => Promise<Principal | null> {
  return async (userId: UserId): Promise<Principal | null> => {
    const fields = await sessions.loadUserById(userId);
    if (fields === null || !fields.enabled) {
      return null;
    }
    return principalFromRow(userId, fields);
  };
}

/**
 * Which `Principal.via` provenances count as a CREDENTIAL at the debug gate (AUTHFIX-2, closed 2026-08-07).
 *
 * A POSITIVE allow-list, deliberately not a `via === "fallback"` negative check: the mapped `Record` is
 * exhaustive over the union, so a fourth provenance added later is a `tsc` ERROR here rather than silently
 * defaulting to ADMITTED. Fail-closed by construction beats fail-closed by vigilance (spine §5.5).
 *
 * `fallback` is `false` because that arm is precisely the caller who presented NOTHING: `infra/auth.resolve`
 * mints it whenever `ownerFallbackAllowed` says the ORIGIN is trusted — unconditionally under `single-user`,
 * and under an SSO mode on nothing but the client-supplied `Host` header. An origin is not a credential.
 */
const DEBUG_GATE_CREDENTIALED = {
  /** A session cookie that `sessions.validate` accepted (peppered-hash lookup, fails closed on a forgery). */
  cookie: true,
  /** A verified SSO identity — a signed JWT, or a raw header from a TCP peer inside the trusted-proxy allowlist. */
  header: true,
  /** The un-credentialed origin-gated owner fallback. NOT a credential — see above. */
  fallback: false,
} as const satisfies Record<Principal["via"], boolean>;

/** Construct the auth seam. Parses the auth config ONCE (production) and returns the per-request resolver. */
export function createAuthSeam(deps: AuthSeamDeps): AuthSeam {
  const config = deps.config ?? authConfigFromEnv();
  const isCookieMode = config.mode === "local" || config.mode === "oidc";
  // Bound once: the owner-fallback arm and the frozen-host bridge map the SAME row fields (D135); this arm
  // adds the request-path `enabled` gate its two sibling arms already apply.
  const resolveFallbackPrincipal = createFallbackPrincipalResolver(deps.sessions);

  async function resolvePrincipal(headers: Headers, req?: PerRequestSeamDeps): Promise<SeamResult> {
    const csrfHeaderPresent = hasCsrfHeader(headers);

    if (isCookieMode) {
      const cookiePrincipal = await resolveCookiePrincipal(deps.sessions, headers, req?.onSessionSlide);
      if (cookiePrincipal !== null) {
        return { principal: cookiePrincipal, csrfHeaderPresent };
      }
    }

    const res = await resolve(headers, {
      config,
      ...(deps.verifyForwardJwt !== undefined && { verifyForwardJwt: deps.verifyForwardJwt }),
      ...(deps.oidcStore !== undefined && { oidcStore: deps.oidcStore }),
      ...(req?.peerIp !== undefined && { peerIp: req.peerIp }),
    });
    const principal = await resolveHeaderOrFallbackPrincipal(deps.sessions, res, resolveFallbackPrincipal);
    return { principal, csrfHeaderPresent };
  }

  /**
   * The debug-gate admin verdict — its ONE consumer is `createDebugAuthMiddleware`'s `adminAuth` arm
   * (`entry/app.ts`), which SHORT-CIRCUITS the `DEBUG_TOKEN` check when this returns true. TWO conditions,
   * both required: the caller PRESENTED a credential (`DEBUG_GATE_CREDENTIALED`), and that credential's
   * principal satisfies `can(p,'admin',global)` — i.e. `role` is `owner` or `admin` (D17).
   *
   * THE CREDENTIAL CONDITION IS LOAD-BEARING, NOT BELT-AND-BRACES (AUTHFIX-2, closed 2026-08-07). Without
   * it this returned `true` for the un-credentialed `via:"fallback"` principal, and since the arm runs
   * BEFORE the token check, `/api/_debug/*` served with no cookie and no `DEBUG_TOKEN` — unconditionally
   * under `single-user`, and under an SSO mode to anyone who could reach the port and send
   * `Host: 127.0.0.1`. Note what that means for the token: because the admin arm short-circuits the
   * `expectedToken === undefined` → 404 branch too, UNSETTING `DEBUG_TOKEN` did not close it either.
   * Behind the gate sit principal-blind whole-db reads whose `@owner-scope-ok` exemption
   * (`foundation/observability/debug/inspect/config.ts`) rests entirely on this verdict.
   *
   * The enforcer is `tests/server/entry/debug-gate.suite.test.ts` — every AUTH_MODE × Host × token state,
   * asserted through the REAL registrar. Do not weaken this without turning that suite red first.
   *
   * Never throws — a transport/db error resolves to `false` so a misbehaving seam can't open the gate.
   */
  async function isAdmin(headers: Headers): Promise<boolean> {
    try {
      const { principal } = await resolvePrincipal(headers);
      if (principal === null || !DEBUG_GATE_CREDENTIALED[principal.via]) {
        return false;
      }
      requireAdmin(principal);
      return true;
    } catch {
      return false;
    }
  }

  return { resolvePrincipal, isAdmin };
}
