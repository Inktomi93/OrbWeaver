// The route-level auth gates (FINAL-Auth-Modes §7 P0 — the `beforeLoad` guards; the TanStack idiom:
// gate BEFORE render, so a protected pane never flashes then yanks). Thrown `redirect()`s — never a
// rendered bounce. The URL discipline stays intact (UI-Arch §5.1): no `next` search param is carried —
// the app's only real destination is `/`, and post-login always lands on `/`.
//
// THE AXIS IS `me.authenticated`, NOT `config.requiresLogin` (P1-a fix). `requiresLogin` is false for
// BOTH single-user AND forward-header, so gating on it made the forward-header explainer unreachable
// (/login always bounced home) AND — worse — let a BROKEN forward-header proxy (unauthenticated request)
// render the full authed shell with silently-failing data queries instead of bouncing to a diagnosis.
// Keying on `me.authenticated` collapses every mode to one rule: the seam already resolved this request's
// identity (single-user's owner-fallback always resolves → authenticated:true → genuine pass-through;
// a broken forward-header proxy resolves nobody → authenticated:false → land on /login and render the
// explainer). No mode is special-cased; the login SURFACE (useAuthConfig) picks which arm to render.
//
// Guards are plain async fns over the `/me` fetcher (no router-context DI — the public GET is cheap and
// navigations are rare in the pinned-URL shell). The server stays authoritative: every tRPC procedure
// re-gates; these exist so the UI lands on the right surface.

import { redirect } from "@tanstack/react-router";
import type { AuthMe } from "./auth-bootstrap";
import { fetchAuthMe } from "./auth-bootstrap";

/** THIS request's auth state, or null when the server is unreachable (the guards branch on it — a
 *  redirect is a control-flow throw, so a fetch failure must never be conflated with one). */
async function meOrNull(): Promise<AuthMe | null> {
  try {
    return await fetchAuthMe();
  } catch {
    return null;
  }
}

/** Gate a protected route (`/`): an unauthenticated request → `/login` (which renders the mode's arm —
 *  the forward-header explainer, the OIDC button, or the local form). A BOOTSTRAP FAILURE (server
 *  unreachable) also lands on /login — the login surface owns the "couldn't reach the server" rendering
 *  (the only route with no data requirements of its own, so it can't itself fail to load). */
export async function requireAuthed(): Promise<void> {
  const me = await meOrNull();
  if (me === null || !me.authenticated) {
    throw redirect({ to: "/login" });
  }
}

/** Reverse-gate `/login`: an already-authenticated caller goes home — covering single-user (owner
 *  fallback always resolves, so /login never shows a form) AND an authenticated forward-header/oidc/local
 *  session (no redirect loop: authed forward-header lands home, never bouncing back here). An
 *  UNauthenticated caller STAYS so the surface renders its mode arm; a bootstrap failure also stays so the
 *  surface can render the server-unreachable state. */
export async function redirectIfAuthed(): Promise<void> {
  const me = await meOrNull();
  if (me?.authenticated === true) {
    throw redirect({ to: "/" });
  }
}
