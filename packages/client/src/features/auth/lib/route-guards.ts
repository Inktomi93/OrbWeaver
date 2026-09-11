// Route-level auth gates (beforeLoad guards): gate before render, so a protected pane never flashes
// then yanks. Thrown redirect()s, never a rendered bounce; no `next` search param, post-login always
// lands on `/`. The axis is `me.authenticated`, not `config.requiresLogin` — the latter is false for
// both single-user AND forward-header, which would make the forward-header explainer unreachable and
// let a broken forward-header proxy render the full authed shell with silently-failing queries. The
// server stays authoritative: every tRPC procedure re-gates; these exist so the UI lands on the right surface.
//
// A RESOLVED verdict (the fetch completed) is acted on immediately — `authenticated:false` (a broken
// forward-header proxy) still lands on the /login explainer with no delay. Only a THROWN read (server
// momentarily unreachable — the classic case is a vite HMR reconnect blipping `/api/auth/me`) is
// retried over a short window before we conclude "unreachable": a transient blip resolves on retry and
// an authed owner stays on their route instead of stranding on /login, while a genuinely-down server
// exhausts the retries and still fails toward /login. We never redirect on a not-yet-known session.

import { redirect } from "@tanstack/react-router";
import type { AuthMe } from "#data";
import { fetchAuthMe } from "#data";

// Only a transient blip should retry; ~600ms total comfortably covers a vite HMR reconnect without a
// perceptible stall on a truly-down server (the router paints RoutePending across this window).
const UNREACHABLE_RETRIES = 3;
const UNREACHABLE_RETRY_DELAY_MS = 200;

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** This request's auth state, or null only when the server stays unreachable across a short retry window.
 *  A completed fetch (authed OR anon) short-circuits immediately — retries cover a THROWN read only. */
async function meOrNull(retriesLeft = UNREACHABLE_RETRIES): Promise<AuthMe | null> {
  // @orb-waive caught-failure-ownership(catch): a thrown read returns null after the retry window
  // exhausts, and both callers already treat null as "unreachable" and route to /login. Ends if a caller starts
  // treating null as a resolved authed state instead of the unreachable case.
  try {
    return await fetchAuthMe();
  } catch {
    if (retriesLeft <= 0) {
      return null;
    }
    await wait(UNREACHABLE_RETRY_DELAY_MS);
    return meOrNull(retriesLeft - 1);
  }
}

/** Gate a protected route (`/`): an unauthenticated request or bootstrap failure lands on /login. */
export async function requireAuthed(): Promise<void> {
  const me = await meOrNull();
  if (me === null || !me.authenticated) {
    throw redirect({ to: "/login" });
  }
}

/** Reverse-gate `/login`: an already-authenticated caller goes home; unauthenticated/unreachable stays. */
export async function redirectIfAuthed(): Promise<void> {
  const me = await meOrNull();
  if (me?.authenticated === true) {
    throw redirect({ to: "/" });
  }
}
