// The auth bootstrap seam — the client's only pre-tRPC session read (sessions.me is an authed procedure
// that 401s logged-out, so the client can't discover auth state through tRPC). Lives in data/ beside
// `auth-config.ts`: HTTP-route egress gets ONE data/ fetch fn each (fetch-fn-in-features gate) — features
// import the fns, never hand-write `fetch`. Response shape is a structural mirror of
// entry/http/auth-meta.ts (no proxy type to derive from, since the endpoint lives outside AppRouter).

import type { InvitePreview, PendingJoinConfirmRequest, PendingJoinErrorCode, SignupErrorCode, SignupRequest } from "@orb/contracts/chat";
import { invitePreviewSchema, PENDING_JOIN_ERROR_CODES, pendingJoinConfirmResultSchema, SIGNUP_ERROR_CODES, signupResultSchema } from "@orb/contracts/chat";
import type { UserRole } from "@orb/contracts/identity";
import { CSRF_HEADER } from "@orb/contracts/identity";
import type { ChatId, Handle } from "@orb/kit/ids";
import type { UseQueryResult } from "@tanstack/react-query";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { postSessionMessage, sessionDocument } from "#lib";
import { clearJoinStash } from "./session-resume.ts";

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
 *  mints the session cookie. The route parses a FORM body (`parseBody`), so this posts
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
 *  session cookie. Throws {@link LoginFailedError} with the server's message on refusal (already
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

function isSignupErrorCode(value: unknown): value is SignupErrorCode {
  return typeof value === "string" && (SIGNUP_ERROR_CODES as readonly string[]).includes(value);
}

/** D259 — create a local account through the stashed invite. POSTs the JSON body to `/api/auth/signup`; the
 *  server creates the account, spends one invite use, creates the named persona and seats the member as it, then
 *  mints the session cookie.
 *  Resolves with the route's refusal code on a refusal (`null` for a throttle or an unreadable body), so the
 *  form picks its own copy. */
export async function signUpWithInvite(
  request: SignupRequest,
): Promise<{ readonly ok: true; readonly chatId: ChatId } | { readonly ok: false; readonly code: SignupErrorCode | null }> {
  const res = await fetch("/api/auth/signup", {
    method: "POST",
    credentials: "same-origin",
    // Same CSRF belt as login: without it a cross-site page could sign the visitor into an account it made.
    headers: { [CSRF_HEADER]: "1", "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  if (res.ok) {
    return { ok: true, chatId: signupResultSchema.parse(await res.json()).chatId };
  }
  // @orb-waive caught-failure-ownership(res.json): an absent or malformed error body degrades to the empty object, which reads as the unknown refusal (`null`); the refusal is still reported. Ends if every refusal body becomes guaranteed.
  const parsed = (await res.json().catch(() => ({}))) as { readonly error?: unknown };
  return { ok: false, code: isSignupErrorCode(parsed.error) ? parsed.error : null };
}

const NOT_FOUND = 404;
const PENDING_JOIN_PREVIEW_KEY = ["auth", "pendingJoin"] as const;

/** D259 — the room a pending OIDC join opens, or null when there is no live pending join (no pending cookie, past
 *  its window, or an invite that no longer admits). A same-origin POST with the CSRF header: the pending cookie
 *  is `SameSite=Strict` and names the join, so nothing identifying rides the request. */
async function previewPendingJoin(): Promise<InvitePreview | null> {
  const res = await fetch("/api/auth/oidc/pending/preview", {
    method: "POST",
    credentials: "same-origin",
    headers: { [CSRF_HEADER]: "1" },
  });
  if (res.status === NOT_FOUND) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`pending join preview failed (HTTP ${res.status})`);
  }
  return invitePreviewSchema.parse(await res.json());
}

const pendingJoinPreviewOptions = queryOptions({
  queryKey: PENDING_JOIN_PREVIEW_KEY,
  queryFn: previewPendingJoin,
  retry: false,
  staleTime: Number.POSITIVE_INFINITY,
});

/** The pending-join preview as a shared read: fetched once per /login visit, never retried (the route spends
 *  the per-address sign-in bucket) and never refetched on focus. */
export function usePendingJoinPreview(): UseQueryResult<InvitePreview | null> {
  return useQuery(pendingJoinPreviewOptions);
}

/** D260 — the room a stashed local sign-up token opens, or null when it names no invite that still admits anyone.
 *  The same controls as the signup route guard it, and a dead token answers the same 404. */
async function previewSignupInvite(token: string): Promise<InvitePreview | null> {
  const res = await fetch("/api/auth/signup/preview", {
    method: "POST",
    credentials: "same-origin",
    headers: { [CSRF_HEADER]: "1", "content-type": "application/json" },
    body: JSON.stringify({ token }),
  });
  if (res.status === NOT_FOUND) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`sign-up invite preview failed (HTTP ${res.status})`);
  }
  return invitePreviewSchema.parse(await res.json());
}

// The preview read's three outcomes: still on its way, answered (a room, or null for a dead link), or failed.
type SignupPreviewState = { readonly kind: "pending" } | { readonly kind: "answered"; readonly preview: InvitePreview | null } | { readonly kind: "failed" };

/** The sign-up form's invite preview, and whether it is still on its way. A POST-shaped read fired once per mount,
 *  like the signed-in join dialog's: never retried (the route spends the per-address sign-in bucket), never
 *  refetched, and never cached under a key, because the token is a secret. `data` stays undefined when the read
 *  failed, which the form shows as the unavailable state. */
export function useSignupInvitePreview(token: string): { readonly isPending: boolean; readonly data: InvitePreview | null | undefined } {
  const [preview, setPreview] = useState<SignupPreviewState>({ kind: "pending" });
  // Guards StrictMode's dev double-invoke, which would spend a second bucket point for the same read. The answer
  // lands through the promise, never through a mutation observer: StrictMode's unsubscribe detaches an observer
  // from a mutation already in flight, and its result would never arrive.
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) {
      return;
    }
    fired.current = true;
    previewSignupInvite(token).then(
      (answer): void => setPreview({ kind: "answered", preview: answer }),
      (): void => setPreview({ kind: "failed" }),
    );
  }, [token]);
  return { isPending: preview.kind === "pending", data: preview.kind === "answered" ? preview.preview : undefined };
}

function isPendingJoinErrorCode(value: unknown): value is PendingJoinErrorCode {
  return typeof value === "string" && (PENDING_JOIN_ERROR_CODES as readonly string[]).includes(value);
}

/** D259 — confirm the pending OIDC join. The body carries only the persona the new account is seated as: the
 *  pending cookie alone names the join. `signedIn` is false when the account waits for an admin's approval (no
 *  session was minted). Resolves with the route's refusal code on a refusal (`null` for a throttle or an
 *  unreadable body). */
export async function confirmPendingJoin(
  body: PendingJoinConfirmRequest,
): Promise<{ readonly ok: true; readonly signedIn: boolean } | { readonly ok: false; readonly code: PendingJoinErrorCode | null }> {
  const res = await fetch("/api/auth/oidc/pending/confirm", {
    method: "POST",
    credentials: "same-origin",
    headers: { [CSRF_HEADER]: "1", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.ok) {
    return { ok: true, signedIn: pendingJoinConfirmResultSchema.parse(await res.json()).signedIn };
  }
  // @orb-waive caught-failure-ownership(res.json): an absent or malformed error body degrades to the empty object, which reads as the unknown refusal (`null`); the refusal is still reported. Ends if every refusal body becomes guaranteed.
  const parsed = (await res.json().catch(() => ({}))) as { readonly error?: unknown };
  return { ok: false, code: isPendingJoinErrorCode(parsed.error) ? parsed.error : null };
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
  // A stashed invite belongs to the visitor who opened it, never to the next person on this tab (D259).
  clearJoinStash();
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
