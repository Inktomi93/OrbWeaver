// The auth bootstrap seam — the client's only pre-tRPC session read (sessions.me is an authed procedure
// that 401s logged-out, so the client can't discover auth state through tRPC). Lives in data/ beside
// `auth-config.ts`: HTTP-route egress gets ONE data/ fetch fn each (fetch-fn-in-features gate) — features
// import the fns, never hand-write `fetch`. Response shape is a structural mirror of
// entry/http/auth-meta.ts (no proxy type to derive from, since the endpoint lives outside AppRouter).

import type { UserRole } from "@orb/contracts/identity";
import { CSRF_HEADER } from "@orb/contracts/identity";

/** The `/api/auth/me` wire shape — THIS request's seam-resolved identity (public; never a 401). */
export interface AuthMe {
  readonly authenticated: boolean;
  readonly handle: string | null;
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
