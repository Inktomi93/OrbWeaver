// entry/auth/seam — THE auth seam: the ONE place a `Principal` is constructed (spine
// Spine-Identity-and-Auth.md §1/§3; core/Tier-5-Entry.md; DECISIONS-LEDGER §7 D1). It is the only module
// allowed to import BOTH `infra/auth` (sealed db-free VERIFICATION) and `domain/sessions` (RESOLUTION +
// the users-row upsert) — the seam-exclusivity invariant. It turns a request's headers into the immutable, db-resolved
// `Principal` that flows down unchanged; everything below re-reads `Principal.userId`, never re-resolves.
//
// THE THREE PATHS (each yields the `userId` a distinct way — spine §1):
//   1. COOKIE (`local`/`oidc`) — the seam calls `sessions.validate(token)` DIRECTLY (ledger D40, Route A:
//      a cookie's validation IS a `users`-row read → RESOLUTION, not verification). `validate` RETURNS the
//      `userId` (+ a freshly-re-read `role`/`enabled`), so the seam never re-queries. The removed infra
//      `validateCookie` port is NOT wired (it would have dropped the id — neo's "validate threw the id
//      away" bug). The cookie is honored ONLY in cookie modes (a stale cookie under forward-header is
//      ignored).
//   2. OWNER FALLBACK (`via:"fallback"`) — the origin-gated un-credentialed owner (single-user: the only
//      way in; SSO modes: local-origin belt). `via:"fallback"` is the SAFE "this IS the owner"
//      discriminator (NEVER `externalId === null` — a forward-header identity is also null). Role is
//      **owner** (D17 — the fallback mints owner, not admin); the `userId` comes from `sessions.ensureUser`
//      (JIT-create on first sight, no role derivation — the boot owner-seed makes the row's role durable).
//   3. SSO HEADER (`via:"header"`) — `infra/auth.resolve` verifies the forwarded header/JWT, then the seam
//      upserts via `sessions.provisionIdentity` (externalId-keyed, role from the owner policy) and GATES on
//      `enabled` (a disabled row → unauthenticated, takes effect next request — not JWT-baked).
//
// CSRF is a SIGNAL here, not a gate: the seam surfaces `csrfHeaderPresent` + `via`; the transport ladder
// enforces (a cookie mutation without the custom header → 403). The seam constructs; it does not police.

import type { Principal } from "@orb/contracts/identity";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { SessionsService } from "#domain/sessions";
import type {
  AuthConfig,
  ForwardJwtVerifier,
  IdentityResolution,
  OidcTransactionStore,
} from "#infra/auth";
import { authConfigFromEnv, hasCsrfHeader, resolve, SESSION_COOKIE_NAME } from "#infra/auth";

/**
 * The boot-time deps the seam binds once (the composition root supplies them). `config` is the
 * test/override seam — production omits it and the seam parses `authConfigFromEnv()` ONCE at construction
 * (no per-request env re-parse). `verifyForwardJwt`/`oidcStore` are the db/crypto VERIFICATION ports
 * `infra/auth.resolve` needs for the SSO paths; absent ⇒ that layer is inert (fail-closed).
 */
export interface AuthSeamDeps {
  readonly sessions: SessionsService;
  readonly verifyForwardJwt?: ForwardJwtVerifier;
  readonly oidcStore?: OidcTransactionStore;
  readonly config?: AuthConfig;
}

/** Per-request knobs. `onSessionSlide` fires with the slid expiry on a throttled cookie session slide so
 *  the HTTP layer can refresh the cookie Max-Age (inert when no response Context is in hand). */
export interface PerRequestSeamDeps {
  readonly onSessionSlide?: (expiresAt: number) => void;
}

/** The seam OUTPUT: the immutable `Principal` (or `null` for an anonymous / disabled caller → transport
 *  401) plus the CSRF-header signal the transport ladder keys on. */
export interface SeamResult {
  readonly principal: Principal | null;
  readonly csrfHeaderPresent: boolean;
}

/** The constructed seam — bound at boot, called per request. `isAdmin` adapts the resolver into the
 *  `AdminAuthChecker` the `/api/_debug` gate consults (it MUST never throw — a transport/db error resolves
 *  to `false` so a misbehaving seam can't open the gate). */
export interface AuthSeam {
  readonly resolvePrincipal: (headers: Headers, req?: PerRequestSeamDeps) => Promise<SeamResult>;
  readonly isAdmin: (headers: Headers) => Promise<boolean>;
}

function readSessionCookie(headers: Headers): string | null {
  // The seam reads its own opaque token (the cookie path is the seam's job per D40, so the read lives
  // here, not behind the removed infra port). Minimal parse — our token is base64url (no percent-encoding);
  // a value that won't decode can't be ours, so treat it as no-session rather than crash the request.
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
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** PATH 1 — cookie (D40 Route A): the seam validates the cookie DIRECTLY (`validate` returns the userId);
 *  `null` when there's no cookie or the session is gone (→ fall through to the header/fallback path). */
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

/** PATH 2 + 3 — owner-fallback (`via:"fallback"` → role owner via ensureUser, D17) or SSO header (upsert
 *  via provisionIdentity + the enabled gate). `null` for an anonymous/disabled caller (→ transport 401). */
async function resolveHeaderOrFallbackPrincipal(
  sessions: SessionsService,
  res: IdentityResolution,
): Promise<Principal | null> {
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
 * The frozen-host → `Principal` bridge (PD-73; the second Principal construction site this module owns).
 * Chat's cross-feature ops are keyed by the FROZEN host `UserId` (D19 — the host funds the turn and may be
 * offline, so no request `Principal` exists to carry). The role-SENSITIVE ops (`connection.resolveChat` /
 * `credentials.resolve` — the D17 max-pro-sub owner-gate, identity §3) must key on the host's REAL
 * `users.role`, re-read live via `sessions.loadUserById` (the sanctioned `users` reader) — a fabricated
 * `role:"user"` would fail-closed-DENY the owner's own Max-sub turn. `via:"fallback"` matches the
 * compose-root synthetic-principal convention (role-clients.ts); an unknown id degrades to a plain
 * `role:"user"` principal (fail-closed for the privileged gates).
 */
export function createHostPrincipalResolver(
  sessions: SessionsService,
): (userId: UserId) => Promise<Principal> {
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
      const cookiePrincipal = await resolveCookiePrincipal(
        deps.sessions,
        headers,
        req?.onSessionSlide,
      );
      if (cookiePrincipal !== null) {
        return { principal: cookiePrincipal, csrfHeaderPresent };
      }
      // Invalid/expired/revoked cookie → fall through (anonymous unless the origin-gated owner belt grants).
    }

    // db-free VERIFICATION (NO validateCookie — the cookie is handled above; wiring it would re-resolve +
    // drop the id, the D40-forbidden bug). Optional ports spread in only when present (exactOptional).
    const res = await resolve(headers, {
      config,
      ...(deps.verifyForwardJwt !== undefined && { verifyForwardJwt: deps.verifyForwardJwt }),
      ...(deps.oidcStore !== undefined && { oidcStore: deps.oidcStore }),
    });
    const principal = await resolveHeaderOrFallbackPrincipal(deps.sessions, res);
    return { principal, csrfHeaderPresent };
  }

  async function isAdmin(headers: Headers): Promise<boolean> {
    try {
      const { principal } = await resolvePrincipal(headers);
      return principal !== null && (principal.role === "owner" || principal.role === "admin");
    } catch {
      // Never throw upward from the debug gate — a resolver/db error fails closed (not admin).
      return false;
    }
  }

  return { resolvePrincipal, isAdmin };
}
