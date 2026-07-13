// Route-level auth gates (beforeLoad guards): gate before render, so a protected pane never flashes
// then yanks. Thrown redirect()s, never a rendered bounce; no `next` search param, post-login always
// lands on `/`. The axis is `me.authenticated`, not `config.requiresLogin` — the latter is false for
// both single-user AND forward-header, which would make the forward-header explainer unreachable and
// let a broken forward-header proxy render the full authed shell with silently-failing queries. The
// server stays authoritative: every tRPC procedure re-gates; these exist so the UI lands on the right surface.

import { redirect } from "@tanstack/react-router";
import type { AuthMe } from "./auth-bootstrap";
import { fetchAuthMe } from "./auth-bootstrap";

/** This request's auth state, or null when the server is unreachable. */
async function meOrNull(): Promise<AuthMe | null> {
  try {
    return await fetchAuthMe();
  } catch {
    return null;
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
