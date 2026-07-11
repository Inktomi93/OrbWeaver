// entry/http/auth-meta — the PUBLIC auth bootstrap surface (FINAL-Auth-Modes §7 P0; the neo
// `http/auth-meta.ts` shape). Two anonymous GETs the client boots off BEFORE any tRPC call can succeed
// (`sessions.me` is an authed procedure that 401s logged-out — the client cannot discover its mode or
// auth state through tRPC, so these stay raw Hono, pre-tRPC, and must never move behind auth):
//   • GET /api/auth/config — which AUTH_MODE the server runs (so /login renders the right surface:
//     password form / OIDC button / forward-header explainer) + the seed handle pre-fill + the
//     discreet-login flag.
//   • GET /api/auth/me — is THIS request authenticated, and as whom. It reads the principal `app.ts`'s
//     auth middleware ALREADY resolved through `entry/auth/seam.ts` — the ONE resolver the tRPC context
//     uses. Deliberately NOT a second resolution call: a parallel resolve path is exactly how
//     server/client identity drift creeps in (FINAL-Auth-Modes §10).
//
// `mode` is INJECTED (the lifecycle passes the env the seam was built against), never re-read from env
// here — /config and /me must agree with whatever the resolver actually runs (the neo DI note).
// `defaultHandle` is not a secret (the operator chose it); under discreet login it is WITHHELD (null) so
// the login surface stays enumeration-free (ST `enableDiscreetLogin` parity — §7 P2).

import type { AuthMode, Principal } from "@orb/contracts/identity";
import type { Hono } from "hono";

/** The request-context shape `app.ts` populates (the blob.ts precedent — the middleware-resolved caller). */
interface PrincipalEnv {
  // biome-ignore lint/style/useNamingConvention: `Variables` is Hono's reserved Env key (framework-fixed name).
  Variables: { principal: Principal | null };
}

export interface AuthMetaDeps {
  /** The AUTH_MODE the seam was built against (injected — see the file header). */
  readonly mode: AuthMode;
  /** The seed-time owner handle (env DEFAULT_USER_HANDLE / OWNER_HANDLES[0]) — the local-form pre-fill. */
  readonly defaultHandle: string;
  /** The sync resolved-settings read (`settings.getEffectiveConfig`) — the discreet-login runtime toggle
   *  is an AppSetting, so it is read per request, never frozen at registration. */
  readonly discreetLogin: () => boolean;
  /** The PD-106 multi-human capability (B4): can ≥2 humans authenticate here? The SAME per-request
   *  derivation the tRPC context + `/join/:token` use (`MULTI_HUMAN_CAPABLE[mode](effectiveConfig)`,
   *  injected from `app.ts` — never re-derived here). Read per request: the local arm rides the runtime
   *  `LOCAL_MULTI_USER` AppSetting. The client gates its invite/inbox surfaces on this HONEST flag
   *  instead of probing `multiHumanProcedure` NOT_FOUNDs. */
  readonly multiHumanCapable: () => boolean;
}

/** Register the public bootstrap routes `GET /api/auth/config` + `GET /api/auth/me` on `app`. */
export function registerAuthMeta(app: Hono<PrincipalEnv>, deps: AuthMetaDeps): void {
  app.get("/api/auth/config", (c) => {
    const discreet = deps.discreetLogin();
    return c.json({
      mode: deps.mode,
      // Can the request be UNauthenticated with a login page as the fix? single-user always resolves the
      // owner fallback (a /login redirect would loop); forward-header's fix is proxy config, not a form.
      requiresLogin: deps.mode === "local" || deps.mode === "oidc",
      localEnabled: deps.mode === "local",
      oidcEnabled: deps.mode === "oidc",
      discreetLogin: discreet,
      // Withheld under discreet login (no handle enumeration on the login surface).
      defaultHandle: discreet ? null : deps.defaultHandle,
      multiHumanCapable: deps.multiHumanCapable(),
    });
  });

  app.get("/api/auth/me", (c) => {
    // The seam-resolved principal off THIS request's context — resolved once by the auth middleware,
    // shared with the tRPC mount (drift-free by construction). Anonymous → authenticated:false.
    const principal = c.get("principal");
    return c.json({
      authenticated: principal !== null,
      handle: principal?.handle ?? null,
      role: principal?.role ?? null,
    });
  });
}
