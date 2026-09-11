// The auth bootstrap seam — the client's only pre-tRPC session read (sessions.me is an authed procedure
// that 401s logged-out, so the client can't discover auth state through tRPC). Lives in data/ beside
// `auth-config.ts`: HTTP-route egress gets ONE data/ fetch fn each (fetch-fn-in-features gate) — features
// import the fns, never hand-write `fetch`. Response shape is a structural mirror of
// entry/http/auth-meta.ts (no proxy type to derive from, since the endpoint lives outside AppRouter).

import type { UserRole } from "@orb/contracts/identity";
import { CSRF_HEADER } from "@orb/contracts/identity";
import type { Handle } from "@orb/kit/ids";
import type { UseQueryResult } from "@tanstack/react-query";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { postSessionMessage, sessionDocument } from "#lib";

/** The `/api/auth/me` wire shape — THIS request's seam-resolved identity (public; never a 401). */
export interface AuthMe {
  readonly authenticated: boolean;
  readonly handle: Handle | null;
  readonly role: UserRole | null;
}

export const AUTH_ME_KEY = ["auth", "me"] as const;

/** Thrown by `login` with the server's user-safe message (generic "invalid credentials" — the server
 *  never enumerates, and neither do we). */
class LoginFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LoginFailedError";
  }
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "same-origin" });
  if (!res.ok) {
    throw new Error(`${url}: HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

/** Fetch THIS request's auth state. Never memoized — the guards want the live cookie verdict. */
export function fetchAuthMe(): Promise<AuthMe> {
  return getJson<AuthMe>("/api/auth/me");
}

const authMeOptions = queryOptions({ queryKey: AUTH_ME_KEY, queryFn: fetchAuthMe });

/** THIS session's auth state, as a shared react-query read (N mounted readers, one cache entry). Lived in
 *  `features/auth/hooks` until #866 S4 — the rail persona switcher's account foot needs it, and a
 *  cross-feature reach into auth is banned, so it moved to `#data` (the `useAuthConfig` precedent exactly).
 *  The app QueryClient's `staleTime: Infinity` default applies — freshness is event-driven: login navigates
 *  (a fresh guard fetch), sign-out hard-redirects (a full document reset), so a mounted reader never polls. */
export function useAuthMe(): UseQueryResult<AuthMe> {
  return useQuery(authMeOptions);
}

/** Local-mode login: POST the credential form → the server verifies (scrypt + dummy-hash floor) and
 *  mints the `__Host-orb_session` cookie. The route parses a FORM body (`parseBody`), so this posts
 *  urlencoded, not JSON. Throws {@link LoginFailedError} with the server's generic message on refusal. */
export async function login(handle: Handle, password: string): Promise<void> {
  const body = new URLSearchParams({ handle, password });
  const res = await fetch("/api/auth/login", {
    method: "POST",
    credentials: "same-origin",
    // The login route requires the custom CSRF header (a cross-site form-POST cannot set it without a
    // preflight this app never grants → blocks login-CSRF). Same belt as logout; presence is enough.
    headers: { [CSRF_HEADER]: "1" },
    body,
  });
  if (!res.ok) {
    // @orb-waive caught-failure-ownership(res.json): a malformed/absent error body degrades to the empty object, and the subsequent `??` falls back to a generic status-line message — the throw always happens. Ends if the fallback message is removed.
    const parsed = (await res.json().catch(() => ({}))) as { readonly error?: string };
    throw new LoginFailedError(parsed.error ?? `login failed (HTTP ${res.status})`);
  }
}

/** B4 — first-run owner-password setup (local mode, fresh box). POSTs the chosen password to the one-shot
 *  `/api/auth/first-run`; the server claims the owner credential (only when it was null) and mints the
 *  `__Host-orb_session` cookie. Throws {@link LoginFailedError} with the server's message on refusal (already
 *  set → 409, non-local origin → 403, too short → 400). The route parses a FORM body, so this posts urlencoded. */
export async function firstRunSetup(password: string): Promise<void> {
  const res = await fetch("/api/auth/first-run", {
    method: "POST",
    credentials: "same-origin",
    // Same CSRF belt as login: the header a cross-site page cannot forge blocks a first-run CSRF driven from
    // the owner's own (loopback-peer) browser, which the route's peer gate does not stop.
    headers: { [CSRF_HEADER]: "1" },
    body: new URLSearchParams({ password }),
  });
  if (!res.ok) {
    // @orb-waive caught-failure-ownership(res.json): a malformed/absent error body degrades to the empty object, and the subsequent `??` falls back to a generic status-line message — the throw always happens. Ends if the fallback message is removed.
    const parsed = (await res.json().catch(() => ({}))) as { readonly error?: string };
    throw new LoginFailedError(parsed.error ?? `first-run setup failed (HTTP ${res.status})`);
  }
}

/** The logout response: the IdP end-session URL to continue to, or null (non-oidc modes, or an issuer
 *  with no end_session_endpoint). Module-local: `logout` below is the only spelling of the name, and
 *  callers consume the shape through that signature (#1847). */
interface LogoutResult {
  readonly endSessionUrl: string | null;
}

/** Sign out END-TO-END: revoke the session ({@link logout}), tell sibling TABS (they hold the same
 *  now-revoked cookie and would keep rendering warm cache until something happened to fail — the cross-tab
 *  channel makes one sign-out land everywhere at once), then hard-redirect (a full document load drops every
 *  in-memory cache/store so a shared browser can't leak the prior user's data). Continues to the IdP
 *  end-session URL when the deployment is OIDC (else clicking Continue signs straight back in). Re-homed
 *  from the retired `account-surface.tsx` (#866 S4 — the account modal dissolved into the persona
 *  switcher's foot); THROWS on failure — the calling control owns the toast. */
export async function signOut(): Promise<void> {
  const { endSessionUrl } = await logout();
  postSessionMessage({ kind: "signed-out" });
  sessionDocument.assign(endSessionUrl ?? "/login");
}

/** Revoke the session + clear the cookie (idempotent server-side). The caller owns the post-logout
 *  navigation/cache teardown (a hard redirect is the sanctioned reset — the persona-panel precedent: a full
 *  document load drops every in-memory cache with zero leak surface).
 *
 *  A6 — returns the IdP `endSessionUrl` when the deployment is OIDC and the issuer exposes an end-session
 *  endpoint, so the caller can end the UPSTREAM SSO session too (else clicking Continue signs straight back
 *  in). Null ⇒ fall back to the local /login reset. */
export async function logout(): Promise<LogoutResult> {
  const res = await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "same-origin",
    headers: { [CSRF_HEADER]: "1" },
  });
  if (!res.ok) {
    throw new Error(`logout failed (HTTP ${res.status})`);
  }
  // @orb-waive caught-failure-ownership(res.json): `res.ok` already confirmed the response succeeded; a malformed/absent body is a best-effort optional read that degrades to the documented null fallback (non-oidc / no end-session endpoint). Ends if endSessionUrl becomes a required field.
  const parsed = (await res.json().catch(() => ({}))) as { readonly endSessionUrl?: string | null };
  return { endSessionUrl: parsed.endSessionUrl ?? null };
}
