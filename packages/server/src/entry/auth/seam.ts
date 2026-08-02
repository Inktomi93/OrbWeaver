// THE auth seam: the ONE place a `Principal` is constructed. The only module allowed to import BOTH
// `infra/auth` (db-free VERIFICATION) and `domain/sessions` (RESOLUTION + the users-row upsert). Turns a
// request's headers into an immutable, db-resolved `Principal`; everything below re-reads
// `Principal.userId`, never re-resolves.
//
// Three paths: (1) cookie — `sessions.validate(token)` returns the userId directly, cookie-mode only;
// (2) owner-fallback — origin-gated un-credentialed owner, mints role `owner` via `ensureUser`;
// (3) SSO header — `infra/auth.resolve` verifies, then `provisionIdentity` upserts + gates on `enabled`.
//
// CSRF is a SIGNAL here, not a gate: the seam surfaces `csrfHeaderPresent` + `via`; the transport ladder
// enforces it.

import type { Principal } from "@orb/contracts/identity";
import type { Handle, SessionToken, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { requireAdmin } from "#domain/admin";
import type { SessionsService } from "#domain/sessions";
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

/** The constructed seam — bound at boot, called per request. `isAdmin` must never throw — a transport/db
 *  error resolves to `false` so a misbehaving seam can't open the debug gate. */
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

/** Owner-fallback or SSO header path. `null` for an anonymous/disabled caller (→ transport 401). */
async function resolveHeaderOrFallbackPrincipal(sessions: SessionsService, res: IdentityResolution): Promise<Principal | null> {
  if (res.identity === null) {
    return null;
  }
  if (res.via === "fallback") {
    const userId = await sessions.ensureUser(res.identity.handle);
    return {
      userId,
      role: "owner",
      handle: res.identity.handle,
      externalId: res.identity.externalId,
      via: "fallback",
    };
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
 * The frozen-host → `Principal` bridge, the second Principal-construction site this module owns. Chat's
 * cross-feature ops key on the frozen host `UserId` (host may be offline, no request Principal exists).
 * Role-sensitive ops re-read the host's real `users.role` live via `loadUserById` — a fabricated
 * `role:"user"` would fail-closed-deny the owner's own privileged turn; unknown id degrades to `"user"`.
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

/** Construct the auth seam. Parses the auth config ONCE (production) and returns the per-request resolver. */
export function createAuthSeam(deps: AuthSeamDeps): AuthSeam {
  const config = deps.config ?? authConfigFromEnv();
  const isCookieMode = config.mode === "local" || config.mode === "oidc";

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
    const principal = await resolveHeaderOrFallbackPrincipal(deps.sessions, res);
    return { principal, csrfHeaderPresent };
  }

  async function isAdmin(headers: Headers): Promise<boolean> {
    try {
      const { principal } = await resolvePrincipal(headers);
      if (principal === null) {
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
