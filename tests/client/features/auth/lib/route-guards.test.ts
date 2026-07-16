// features/auth/lib/route-guards — the `beforeLoad` gate decisions (FINAL-Auth-Modes §7 P0; the P1-a
// reachability fix). The axis is `me.authenticated`, NOT `config.requiresLogin` — so the matrix is keyed
// on the seam-resolved identity alone:
//   • single-user — the owner fallback ALWAYS resolves → authenticated:true → genuine pass-through.
//   • forward-header BROKEN proxy (unauthenticated) → authenticated:false → lands on /login (the arm the
//     surface renders is the explainer) AND is NOT reverse-gated away from it (no half-broken shell — the
//     bug this fix closes). An authed forward-header session passes through and never loops back to /login.
//   • local/oidc — unauthenticated → /login; authenticated → pass + reverse-gate.
// `fetch` is stubbed at the global boundary (the upload-asset.test.ts precedent). Deep imports, not
// barrels (node lane — a feature barrel drags browser TSX into the dom-less program).

import { afterEach, vi } from "vitest";
import type { AuthMe } from "../../../../../packages/client/src/features/auth/lib/auth-bootstrap";
import { redirectIfAuthed, requireAuthed } from "../../../../../packages/client/src/features/auth/lib/route-guards";
import { expect, test } from "../../../../support/fixtures";

const AUTHED: AuthMe = { authenticated: true, handle: "alice", role: "user" };
const ANON: AuthMe = { authenticated: false, handle: null, role: null };

/** Stub `/api/auth/me` with the given identity (the guards only read `/me` now — no `/config`). */
function stubMe(me: AuthMe): void {
  vi.stubGlobal("fetch", () => Promise.resolve(new Response(JSON.stringify(me), { status: 200 })));
}

/** Run a guard and return the thrown redirect's `to` target (fails the test on a pass-through or a
 *  non-redirect throw). A TanStack redirect is a `Response & { options: NavigateOptions }`. */
async function redirectTargetOf(guard: () => Promise<void>): Promise<string> {
  try {
    await guard();
  } catch (err) {
    if (err instanceof Response) {
      const options: unknown = Reflect.get(err, "options");
      if (typeof options === "object" && options !== null) {
        const to: unknown = Reflect.get(options, "to");
        if (typeof to === "string") {
          return to;
        }
      }
    }
    throw err;
  }
  throw new Error("expected the guard to throw a redirect");
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── requireAuthed (the `/` gate) ──

test("requireAuthed: an authenticated request passes through (covers single-user's always-resolved owner)", async () => {
  stubMe(AUTHED);
  await expect(requireAuthed()).resolves.toBeUndefined();
});

test("requireAuthed: an unauthenticated request → /login (a broken forward-header proxy lands on the explainer, not the shell)", async () => {
  stubMe(ANON);
  expect(await redirectTargetOf(requireAuthed)).toBe("/login");
});

test("requireAuthed: a bootstrap failure (server unreachable) fails toward /login, never a blank shell", async () => {
  vi.stubGlobal("fetch", () => Promise.reject(new Error("ECONNREFUSED")));
  expect(await redirectTargetOf(requireAuthed)).toBe("/login");
});

// ── redirectIfAuthed (the /login reverse-gate) ──

test("redirectIfAuthed: an authenticated caller bounces home (single-user + authed forward-header/oidc/local)", async () => {
  stubMe(AUTHED);
  expect(await redirectTargetOf(redirectIfAuthed)).toBe("/");
});

test("redirectIfAuthed: an UNauthenticated caller STAYS on /login so the surface renders its mode arm — no loop", async () => {
  stubMe(ANON);
  await expect(redirectIfAuthed()).resolves.toBeUndefined();
});

test("redirectIfAuthed: a bootstrap failure stays (the login surface renders the unreachable state)", async () => {
  vi.stubGlobal("fetch", () => Promise.reject(new Error("ECONNREFUSED")));
  await expect(redirectIfAuthed()).resolves.toBeUndefined();
});
