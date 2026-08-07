// THE auth seam: the ONE place a `Principal` is constructed. The only module allowed to import BOTH
// `infra/auth` (db-free VERIFICATION) and `domain/sessions` (RESOLUTION + the users-row upsert). Turns a
// request's headers into an immutable, db-resolved `Principal`; everything below re-reads
// `Principal.userId`, never re-resolves.
//
// Three paths: (1) cookie — `sessions.validate(token)` returns the userId directly, cookie-mode only;
// (2) owner-fallback — origin-gated un-credentialed owner, resolved to the BOX OWNER'S ROW (D135);
// (3) SSO header — `infra/auth.resolve` verifies, then `provisionIdentity` upserts + gates on `enabled`.
//
// D135 — THE ROLE VERDICT HAS ONE HOME, `users.role`, AND NO PATH INVENTS A ROLE. All three request paths
// and the frozen-host bridge read that column (`validate` / `createHostPrincipalResolver` /
// `provisionIdentity`).
// The fallback arm used to STAMP `role:"owner"` on whatever row `ensureUser(defaultHandle)` returned, so on
// a box where `DEFAULT_USER_HANDLE` (verification's placeholder, default "owner") differs from
// `OWNER_HANDLES` (the resolution tier's owner policy) it minted a SECOND user at role `user` and lied
// `owner` about it — the request principal and the frozen-host principal then disagreed about the same
// caller, and the capability surface and the actual turn silently picked different models.
//
// CSRF is a SIGNAL here, not a gate: the seam surfaces `csrfHeaderPresent` + `via`; the transport ladder
// enforces it.

import type { Principal } from "@orb/contracts/identity";
import type { Handle, SessionToken, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { requireAdmin } from "#domain/admin";
import type { SessionsService } from "#domain/sessions";
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
 * is a third consumer of that one predicate). D17 makes the list a singleton, so `[0]` is THE owner handle;
 * an empty list (structurally unreachable — `ownerHandles()` self-defaults to `[DEFAULT_USER_HANDLE]`) keeps
 * the verification handle so the arm can never resolve to nothing.
 */
function ownerHandleForFallback(verificationHandle: Handle): Handle {
  return castId<Handle>(ownerHandles()[0] ?? verificationHandle);
}

/** Owner-fallback or SSO header path. `null` for an anonymous/disabled caller (→ transport 401). */
async function resolveHeaderOrFallbackPrincipal(
  sessions: SessionsService,
  res: IdentityResolution,
  resolvePrincipalFromRow: (userId: UserId) => Promise<Principal>,
): Promise<Principal | null> {
  if (res.identity === null) {
    return null;
  }
  if (res.via === "fallback") {
    // The fallback ADMITS the owner (the origin gate is the security boundary — `ownerFallbackAllowed`);
    // it does not GRANT a role. Ensure the owner's row exists, then mint through the same row→Principal
    // function the frozen-host bridge uses, so both principals for one user read one column (D135).
    const userId = await sessions.ensureUser(ownerHandleForFallback(res.identity.handle));
    return await resolvePrincipalFromRow(userId);
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
 * THE row → `Principal` mint: the second Principal-construction site this module owns, and (D135) the ONE
 * place a role reaches a `Principal` from a `users` row. TWO consumers, deliberately the same function:
 *   • the FROZEN-HOST bridge — chat's cross-feature ops key on the frozen host `UserId` (the host may be
 *     offline, so no request Principal exists);
 *   • the OWNER FALLBACK above — an un-credentialed origin-gated request, whose `via:"fallback"` this mint
 *     already stamps.
 * Sharing it is the fix, not a coincidence: when the fallback stamped its own `role:"owner"` while this read
 * `users.role`, one caller had two principals that disagreed, and every owner-gated surface (max-pro-sub,
 * `ROLE_SELECTORS.chat`) resolved differently depending on which one reached it.
 *
 * Role-sensitive ops re-read the real `users.role` live via `loadUserById` — a fabricated `role:"user"`
 * would fail-closed-deny the owner's own privileged turn. An unknown id DEGRADES to `"user"`: that is
 * fail-closed on a row that isn't there, never an invented grant.
 */
export function createHostPrincipalResolver(sessions: SessionsService): (userId: UserId) => Promise<Principal> {
  return async (userId: UserId): Promise<Principal> => {
    const fields = await sessions.loadUserById(userId);
    return {
      userId,
      role: fields?.role ?? "user",
      handle: fields?.handle ?? castId<Handle>(userId),
      externalId: fields?.externalId ?? null,
      via: "fallback",
    };
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
  // Bound once: the owner-fallback arm and the frozen-host bridge mint from the SAME row reader (D135).
  const resolvePrincipalFromRow = createHostPrincipalResolver(deps.sessions);

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
    const principal = await resolveHeaderOrFallbackPrincipal(deps.sessions, res, resolvePrincipalFromRow);
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
