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
//
// The seam also owns ONE verdict beside the mint: `debugGateAdmits` — whether the /api/_debug door opens for
// the principal this file already minted for the request. It RESOLVES NOTHING (#1193): a second, peer-less
// resolution at that door is what closed it to the owner's own dev session. It is OWNER-only, deliberately
// narrower than every other privileged surface in the app (D17 — see the verdict's own doc).

import type { Principal, RequestTransport } from "@orb/contracts/identity";
import { isCookieAuthMode } from "@orb/contracts/identity";
import type { Handle, SessionId, SessionToken, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { isOwner } from "#domain/admin";
import type { SessionsService, UserPrincipalFields } from "#domain/sessions";
import { ownerHandles } from "#domain/sessions";
import type { AllowedHostsReader, AuthConfig, ForwardJwtVerifier, IdentityResolution, OidcTransactionStore, RelayedFallbackNotice } from "#infra/auth";
import { authConfigFromEnv, hasCsrfHeader, readRequestCookie, resolve, selectSignedForwardJwt, sessionCookieFor } from "#infra/auth";
import { publishUserEvent } from "../../transport/trpc/index.ts";

/** The boot-time deps the seam binds once. `config` is the test/override seam — production parses
 *  `authConfigFromEnv()` once at construction. `verifyForwardJwt`/`oidcStore` are the ports the SSO paths
 *  need; absent ⇒ that layer is inert (fail-closed). */
export interface AuthSeamDeps {
  readonly sessions: SessionsService;
  readonly verifyForwardJwt?: ForwardJwtVerifier;
  readonly oidcStore?: OidcTransactionStore;
  readonly config?: AuthConfig;
  /**
   * Does THIS deployment's un-credentialed loopback owner fallback count as the operator's credential at the
   * /api/_debug door (#1193)? The RULE is not decided here and has one home —
   * `foundation/env::resolveOwnerFallbackCredential` — because it is a fact about how the box was launched
   * (NODE_ENV × AUTH_FALLBACK), not about a request. `entry/lifecycle.ts` passes the resolved
   * value; a seam constructed without it (unit tests, the int harness, any future embedder) gets the STRICT
   * arm. Absent ⇒ `false` is deliberate: a construction site that forgets this dep loses a dev convenience,
   * never a control.
   */
  readonly ownerFallbackIsOperatorCredential?: boolean;
  /** The per-peer throttled `owner_fallback_relayed` line, built on the composition root's clock. Absent,
   *  every relayed refusal logs. */
  readonly relayedFallbackNotice?: RelayedFallbackNotice;
  /** The relay registry's names; the forward-header path refuses every identity on a request to one of them. */
  readonly relayHosts?: AllowedHostsReader;
}

/** Per-request knobs. `peerIp` is the raw TCP peer socket address that TWO gates match against — the
 *  forward-header trusted-proxy gate AND, since #298 f2, the loopback gate on the un-credentialed owner
 *  fallback (`ownerFallbackAllowed`). Absent ⇒ BOTH fail closed (anti-spoof: never a forwarded header). */
export interface PerRequestSeamDeps {
  readonly onSessionSlide?: (expiresAt: number) => void;
  readonly peerIp?: string;
  /** The request's transport (`infra/auth/transport.ts`), resolved ONCE by `entry/app.ts`, which re-issues
   *  the slid cookie under the same name. It picks the ONE cookie name this request may read. Required: a
   *  defaulted transport would silently read the plantable plain-http name on an https request. */
  readonly transport: RequestTransport;
}

/** The seam output: the immutable `Principal` (or `null` for anonymous/disabled → transport 401) plus the
 *  CSRF-header signal the transport ladder keys on. */
export interface SeamResult {
  readonly principal: Principal | null;
  /**
   * WHICH cookie session admitted this request — the COOKIE arm only; `null` for the owner fallback, the SSO
   * header arms, and any anonymous caller (none of them has a session to name).
   *
   * BESIDE the Principal, never ON it (W7a / F4, and D135's line): the role verdict has one home and a
   * session is not a role — but per-SESSION logout needs to know which connection to kill, and the socket is
   * the one thing that outlives the request its Principal was minted from. So the session identity rides the
   * request context to exactly one consumer, `stream.connect`'s cell stamp. Nothing authorizes on it.
   */
  readonly sessionId: SessionId | null;
  readonly csrfHeaderPresent: boolean;
}

/** The constructed seam — bound at boot, called per request. `debugGateAdmits` is the DEBUG-GATE verdict
 *  only — never a general "is this caller privileged" test (that is `can()`/`requireAdmin`, D17), and it is
 *  strictly NARROWER than the app's admin gate: OWNER only. It judges the principal `resolvePrincipal`
 *  ALREADY minted for the request rather than resolving a second time; read its doc before touching it. */
export interface AuthSeam {
  readonly resolvePrincipal: (headers: Headers, req: PerRequestSeamDeps) => Promise<SeamResult>;
  readonly debugGateAdmits: (principal: Principal | null, headers: Headers) => boolean;
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
 * header per transport. Do not re-inline a copy.
 *
 * It reads ONLY the transport's own name: an https request never reads the prefix-less http name, which a
 * plain-http sibling origin can plant.
 */
export function readSessionCookie(headers: Headers, transport: RequestTransport): SessionToken | null {
  const value = readRequestCookie(headers, sessionCookieFor(transport).name);
  return value === null ? null : castId<SessionToken>(value);
}

/** The cookie arm's product: the Principal PLUS the session row that admitted it (see `SeamResult`). */
interface CookieAdmission {
  readonly principal: Principal;
  readonly sessionId: SessionId;
}

/** Cookie path: `null` when there's no cookie or the session is gone (→ fall through). */
async function resolveCookiePrincipal(sessions: SessionsService, headers: Headers, req: PerRequestSeamDeps): Promise<CookieAdmission | null> {
  const token = readSessionCookie(headers, req.transport);
  if (token === null) {
    return null;
  }
  const validated = await sessions.validate(token, req.onSessionSlide);
  if (validated === null) {
    return null;
  }
  return {
    principal: {
      userId: validated.userId,
      role: validated.role,
      handle: validated.handle,
      externalId: validated.externalId,
      via: "cookie",
    },
    sessionId: validated.sessionId,
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
    // The fallback ADMITS the owner (the LOOPBACK-peer gate is the security boundary — `ownerFallbackAllowed`,
    // #298 f2); it does not GRANT a role. Ensure the owner's row exists, then mint through the same
    // row→Principal mapper the frozen-host bridge uses, so both principals for one user read one column
    // (D135) — plus the `enabled` gate every REQUEST arm applies (`null` ⇒ anonymous ⇒ transport 401).
    //
    // BREAK-GLASS (owner ruling 2026-08-19): production runs AUTH_MODE=oidc + AUTH_FALLBACK=deny, so this arm
    // is OFF in daily use — the owner logs in via SSO (the owner row is seeded at boot by `entry/boot/seed-owner.ts`
    // at role=owner+enabled, so deny+oidc can never lock the owner out at first-run; it is claim-driven, not
    // fallback-driven). This arm is the on-box RECOVERY door for when SSO/Authentik is down: on the box, set
    // AUTH_FALLBACK=owner + AUTH_BREAK_GLASS=true (the flag is required — foundation/env makes prod SSO+owner
    // boot-fatal WITHOUT it, to stop a same-host proxy silently bypassing SSO), restart, then
    // `curl http://127.0.0.1:8788/...` authenticates as owner over the loopback socket. Revert both env knobs
    // when done. There is deliberately NO ambient (off-box) recovery — that is the whole point of deny.
    // CRITICAL: STOP/BYPASS the front proxy during break-glass — a same-host proxy forwarding over 127.0.0.1
    // makes EVERY proxied (LAN/internet) request a loopback peer. `ownerFallbackAllowed` refuses a request
    // that carries a relay tell, but a proxy that sends none is invisible, so a flag left set on such a box
    // mints owner for the whole network, not just the on-box operator (docs/plans/containerize/design.md).
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
  // W7b — an SSO login that RENAMED the handle or RE-DERIVED the role moved a field `sessions.me` projects,
  // and the QueryClient runs `staleTime: Infinity`, so this human's OTHER live devices would render the
  // pre-change identity until they happened to reload. The verb reports the fact (the caller cannot compute
  // it — see `ProvisionResult.identityChanged`); the fan happens HERE because a domain may not import
  // transport. Gated on the flag, never unconditional: this arm runs on EVERY forward-header request, so an
  // unconditional emit would be a per-request storm on the plane W8 exists to keep quiet.
  if (provisioned.identityChanged) {
    publishUserEvent(provisioned.userId, { type: "identityChanged" });
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
// @orb-waive one-principal-mint-population(Principal): the canonical row-to-Principal mapper; ends never (this is the ONE home for the fallback/bridge mint)
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
 * Which `Principal.via` provenances count as a CREDENTIAL at the debug gate (AUTHFIX-2, closed 2026-08-07;
 * amended for the fallback and header arms 2026-09-02, #1193).
 *
 * A POSITIVE allow-list, deliberately not a `via === "fallback"` negative check: the mapped `Record` is
 * exhaustive over the union, so a fourth provenance added later is a `tsc` ERROR here rather than silently
 * defaulting to ADMITTED. Fail-closed by construction beats fail-closed by vigilance (spine §5.5). It is
 * built PER REQUEST rather than frozen at module scope because two of the three arms are facts about the
 * request/deployment, not about the word `via`.
 *
 * `fallback` — THE #1193 AMENDMENT. AUTHFIX-2's absolute ("an ORIGIN is not a credential") closed a hole
 * where anyone who could reach the port and forge `Host: 127.0.0.1` read the whole db; #298 f2 then re-based
 * the arm on the raw LOOPBACK TCP PEER, which a forged header cannot reach. What was left was a door closed
 * to its only user: on a DEV box the fallback IS how the operator authenticates — the same request this gate
 * refused was already being served as `role:"owner"` on every tRPC surface (proven live 2026-09-02: an
 * un-credentialed loopback GET of `sessions.me` answered `globalRole: "owner"` while `/api/_debug/info`
 * answered 401). The rule that decides WHERE that holds is not spelled here: it is
 * `foundation/env::resolveOwnerFallbackCredential`, arriving as `deps.ownerFallbackIsOperatorCredential`.
 * PRODUCTION always resolves `false` — `single-user` and break-glass included — because a same-host proxy
 * makes every external request a loopback peer there, and this door holds more than the app does.
 * DNS REBINDING on a dev box is an ACCEPTED POSTURE (owner ruling 2026-09-04, #1233): a page open in the
 * operator's own browser is a loopback peer too, so it can drive the fallback arm (and this third arm)
 * cross-site. The loopback-only bind is the boundary; no `Host`/`Origin` check is added on the dev path.
 * PRODUCTION never mints the arm, so the posture is dev-only by construction, not by vigilance.
 *
 * `header` — a verified SSO identity, and ONLY a verified one. It used to be an unconditional `true` that was
 * safe by a CALL-SITE OMISSION (the old `isAdmin(headers)` re-resolved with no `peerIp`, so
 * `resolveUnsignedHeader` fail-closed and only the signed-JWT arm could mint `via:"header"` here). The gate
 * now judges the REQUEST's principal, which does carry a peer, so that accident is gone and the condition is
 * stated: `selectSignedForwardJwt` is the same predicate `resolveForwardHeader` branches on (one home), so
 * this admits exactly the JWT-verified caller and still refuses a raw `Remote-User:` from an allowlisted TCP
 * peer. Deliberate: the strength of this door must not collapse onto `FORWARD_AUTH_TRUSTED_PROXIES`, and an
 * unsigned forward-header deployment's admin keeps using `x-debug-token`.
 */
function debugGateCredentialed(config: AuthConfig, headers: Headers, ownerFallbackIsOperatorCredential: boolean): Record<Principal["via"], boolean> {
  return {
    /** A session cookie that `sessions.validate` accepted (peppered-hash lookup, fails closed on a forgery). */
    cookie: true,
    header: selectSignedForwardJwt(headers, config) !== null,
    fallback: ownerFallbackIsOperatorCredential,
  };
}

/** Construct the auth seam. Parses the auth config ONCE (production) and returns the per-request resolver. */
export function createAuthSeam(deps: AuthSeamDeps): AuthSeam {
  const config = deps.config ?? authConfigFromEnv();
  // FAIL-CLOSED default: an omitted dep is the STRICT debug gate, never a widened one (see the dep's doc).
  const ownerFallbackIsOperatorCredential = deps.ownerFallbackIsOperatorCredential ?? false;
  const isCookieMode = isCookieAuthMode(config.mode);
  // Bound once: the owner-fallback arm and the frozen-host bridge map the SAME row fields (D135); this arm
  // adds the request-path `enabled` gate its two sibling arms already apply.
  const resolveFallbackPrincipal = createFallbackPrincipalResolver(deps.sessions);

  async function resolvePrincipal(headers: Headers, req: PerRequestSeamDeps): Promise<SeamResult> {
    const csrfHeaderPresent = hasCsrfHeader(headers);

    if (isCookieMode) {
      const admitted = await resolveCookiePrincipal(deps.sessions, headers, req);
      if (admitted !== null) {
        return { principal: admitted.principal, sessionId: admitted.sessionId, csrfHeaderPresent };
      }
    }

    const res = await resolve(headers, {
      config,
      ...(deps.verifyForwardJwt !== undefined && { verifyForwardJwt: deps.verifyForwardJwt }),
      ...(deps.oidcStore !== undefined && { oidcStore: deps.oidcStore }),
      ...(deps.relayedFallbackNotice !== undefined && { relayedFallbackNotice: deps.relayedFallbackNotice }),
      ...(deps.relayHosts !== undefined && { relayHosts: deps.relayHosts }),
      ...(req.peerIp !== undefined && { peerIp: req.peerIp }),
    });
    const principal = await resolveHeaderOrFallbackPrincipal(deps.sessions, res, resolveFallbackPrincipal);
    // No session id on these arms BY CONSTRUCTION: neither the peer-gated owner fallback nor an SSO header
    // mints a `sessions` row, so there is nothing for a per-session logout to end (their sockets are reached
    // by `evictUser` — the admin/disable arm — instead).
    return { principal, sessionId: null, csrfHeaderPresent };
  }

  /**
   * The debug-gate verdict — its ONE consumer is `createDebugAuthMiddleware`'s `adminAuth` arm
   * (`entry/app.ts`), which SHORT-CIRCUITS the `DEBUG_TOKEN` check when this returns true. TWO conditions,
   * both required: the caller PRESENTED a credential (`debugGateCredentialed`, read its doc — that is where
   * every arm's WHY lives), and that credential's principal satisfies `can(p,'owner',global)` — i.e. `role`
   * is `owner` (D17), asked through the ONE kernel's boolean form.
   *
   * IT IS OWNER-ONLY, NOT `isAdmin` (2026-09-20). This door is BOX-OPERATOR scope, and D17 splits the two
   * global roles by exactly that: `owner` is the single box holder; `admin` is DELEGATED in-app authority
   * that cannot reach owner-only resources, and an actor's inference connections belong to the principal who
   * configured them with no owner credential inherited by another principal. What sits behind the gate is not
   * "the app as an admin" — the probes are principal-BLIND whole-deployment reads that serve classes tRPC
   * refuses even to the owner: any room's selected-variant message content (tRPC answers a non-member
   * `ChatNotFoundError`, D18), every user's config/persona/preset rows, and the wire-capture ring, which
   * holds the literal provider request body of every user's turn — the assembled prompt: system text,
   * persona prose, the transcript — plus the model's literal reply bytes when `WIRE_CAPTURE_REPLY=on`.
   * "They already have admin, so there is no delta" is structurally FALSE at this door.
   *
   * THE NARROWING IS HERE, NOT ON ONE ROUTE, because this verdict is the surface's entire boundary
   * (`foundation/observability/debug/routes.ts` header). Scoping only the wire ring would deny a room's
   * prompt bytes at `/wire/captures` and serve the same room's whole transcript at `/db/chat/:id` one route
   * over. The headless `x-debug-token` arm is untouched — that is the operator credential a deployment
   * hands out deliberately, and it never rides a browser's ambient cookie.
   *
   * IT JUDGES, IT DOES NOT RESOLVE (#1193). The principal is the one `resolvePrincipal` already minted for
   * this request in `entry/app.ts`'s middleware — spine invariant #2, "resolve once". The old shape re-ran
   * the whole resolution from bare headers with NO `PerRequestSeamDeps`, so the gate silently asked a
   * DIFFERENT question than the rest of the app: with no `peerIp`, `ownerFallbackAllowed` fail-closed and the
   * loopback owner arm could not even be minted here, which (with `fallback:false`) is why the owner's own
   * dev session got 401 from a door meant for exactly that human. Keeping this a pure verdict over a
   * principal is what stops a second, peer-less resolution from ever growing back.
   *
   * THE CREDENTIAL CONDITION IS LOAD-BEARING, NOT BELT-AND-BRACES (AUTHFIX-2, closed 2026-08-07). Without
   * any credential test this returned `true` for ANY resolvable principal, and since the arm runs BEFORE the
   * token check, `/api/_debug/*` served with no cookie and no `DEBUG_TOKEN` to anyone who could reach the
   * port and send `Host: 127.0.0.1`. Note what that means for the token: because the admin arm short-circuits
   * the `expectedToken === undefined` → 404 branch too, UNSETTING `DEBUG_TOKEN` did not close it either.
   * Behind the gate sit principal-blind whole-db reads whose `@owner-scope-ok` exemption
   * (`foundation/observability/debug/inspect/config.ts`) rests entirely on this verdict.
   *
   * The enforcer is `tests/server/entry/debug-gate.suite.test.ts` — every AUTH_MODE × peer × posture × token
   * state, asserted through the REAL registrar. Do not weaken this without turning that suite red first.
   *
   * TOTAL — no throw, no await, no I/O: a record lookup plus the kernel's own caught verdict. The gate's
   * `try`/`catch` (`routes.ts`) stays as the port's belt, not because this function has a failure mode.
   */
  function debugGateAdmits(principal: Principal | null, headers: Headers): boolean {
    if (principal === null || !debugGateCredentialed(config, headers, ownerFallbackIsOperatorCredential)[principal.via]) {
      return false;
    }
    return isOwner(principal);
  }

  return { resolvePrincipal, debugGateAdmits };
}
