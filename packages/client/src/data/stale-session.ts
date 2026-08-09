// Stale-session recovery (#23b). A mid-session tRPC UNAUTHORIZED means the cookie the app booted with is no
// longer valid — revoked/expired, or (the reported case) the user row it pointed at was wiped and the browser
// is still holding a session for an owner that no longer exists. The route `beforeLoad` guard only runs at
// NAVIGATION, so once the authed shell is mounted a session that goes stale would otherwise keep rendering the
// per-user-scoped EMPTY that looks exactly like "no data" ([[per-user-scoped-empty-is-about-the-asker]]) —
// silently, with no re-auth prompt.
//
// This is the always-on belt: on the FIRST such error, hard-redirect to /login. A full document load drops
// every in-memory cache and re-runs the auth bootstrap, which lands on /login for the cookie modes (the owner
// re-authenticates) or, under single-user where the origin-fallback re-owns, straight back onto a correctly
// scoped shell. One-shot + never-on-/login so a burst of concurrent 401s triggers exactly one navigation and
// can never loop.

const LOGIN_PATH = "/login";

/** UNAUTHORIZED is the TRANSPORT verdict "no principal was minted" (session invalid/absent). Per-procedure
 *  authz refusals are FORBIDDEN or the leak-free NOT_FOUND, never this — so keying on it is precisely "the
 *  session is stale", not "this one call was denied". */
function isUnauthorized(error: unknown): boolean {
  return (error as { data?: { code?: string } }).data?.code === "UNAUTHORIZED";
}

let recovering = false;

/** On a stale-session tRPC error, hard-redirect to /login exactly ONCE. No-op for any other error, when a
 *  recovery is already in flight, when already on the login surface (loop guard), or off-browser (node lanes
 *  have no `location` to navigate). */
export function recoverIfStaleSession(error: unknown): void {
  if (recovering || !isUnauthorized(error)) {
    return;
  }
  if (typeof globalThis.location === "undefined" || globalThis.location.pathname === LOGIN_PATH) {
    return;
  }
  recovering = true;
  globalThis.location.assign(LOGIN_PATH);
}
