// The auth bootstrap seam — the client's only pre-tRPC server reads. The two public Hono endpoints are
// deliberately not tRPC: sessions.me is an authed procedure that 401s logged-out, so the client can't
// discover its mode/auth state through tRPC. Response shapes are structural mirrors of
// entry/http/auth-meta.ts (no proxy type to derive from, since the endpoints live outside AppRouter).

import type { AuthMode, UserRole } from "@orb/contracts/identity";
import { CSRF_HEADER } from "@orb/contracts/identity";

/** The `/api/auth/config` wire shape (mirrors `entry/http/auth-meta.ts` — mode-derived flags). */
export interface AuthConfig {
  readonly mode: AuthMode;
  /** TRUE only for the cookie modes (local/oidc) — the modes where /login is a real fix. Single-user can
   *  never be unauthenticated (redirecting would loop); forward-header's fix is proxy config. */
  readonly requiresLogin: boolean;
  readonly localEnabled: boolean;
  readonly oidcEnabled: boolean;
  /** ST `enableDiscreetLogin` parity — TRUE ⇒ blank form (`defaultHandle` is withheld as null). */
  readonly discreetLogin: boolean;
  readonly defaultHandle: string | null;
  /** PD-106 (B4): can this deployment seat ≥2 humans? The HONEST capability signal the multi-human
   *  client surfaces (invite affordances · notifications bell · /join landing) gate on — never a
   *  probe-and-catch of a `multiHumanProcedure` NOT_FOUND. Derived server-side per request from the
   *  same `MULTI_HUMAN_CAPABLE` map the transport belt runs. */
  readonly multiHumanCapable: boolean;
}

/** The `/api/auth/me` wire shape — THIS request's seam-resolved identity (public; never a 401). */
export interface AuthMe {
  readonly authenticated: boolean;
  readonly handle: string | null;
  readonly role: UserRole | null;
}

export const AUTH_CONFIG_KEY = ["auth", "config"] as const;
export const AUTH_ME_KEY = ["auth", "me"] as const;

/** Thrown by `login` with the server's user-safe message (generic "invalid credentials" — the server
 *  never enumerates, and neither do we). */
export class LoginFailedError extends Error {
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

/** Fetch the deployment auth config. MEMOIZED for the session — the mode is boot-env, immutable while
 *  the server runs; a failed fetch clears the memo so the next caller retries. */
let configPromise: Promise<AuthConfig> | null = null;
export function fetchAuthConfig(): Promise<AuthConfig> {
  configPromise ??= getJson<AuthConfig>("/api/auth/config").catch((err: unknown) => {
    configPromise = null;
    throw err;
  });
  return configPromise;
}

/** Fetch THIS request's auth state. Never memoized — the guards want the live cookie verdict. */
export function fetchAuthMe(): Promise<AuthMe> {
  return getJson<AuthMe>("/api/auth/me");
}

/** Local-mode login: POST the credential form → the server verifies (scrypt + dummy-hash floor) and
 *  mints the `__Host-orb_session` cookie. The route parses a FORM body (`parseBody`), so this posts
 *  urlencoded, not JSON. Throws {@link LoginFailedError} with the server's generic message on refusal. */
export async function login(handle: string, password: string): Promise<void> {
  const body = new URLSearchParams({ handle, password });
  const res = await fetch("/api/auth/login", {
    method: "POST",
    credentials: "same-origin",
    body,
  });
  if (!res.ok) {
    const parsed = (await res.json().catch(() => ({}))) as { readonly error?: string };
    throw new LoginFailedError(parsed.error ?? `login failed (HTTP ${res.status})`);
  }
}

/** Revoke the session + clear the cookie (idempotent server-side). The caller owns the post-logout
 *  navigation/cache teardown (a hard redirect to /login is the sanctioned reset — the persona-panel
 *  precedent: a full document load drops every in-memory cache with zero leak surface). */
export async function logout(): Promise<void> {
  const res = await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "same-origin",
    headers: { [CSRF_HEADER]: "1" },
  });
  if (!res.ok) {
    throw new Error(`logout failed (HTTP ${res.status})`);
  }
}
