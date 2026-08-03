// features/auth/lib/route-guards — the `beforeLoad` gate decisions (FINAL-Auth-Modes §7 P0; the P1-a
// reachability fix). The axis is `me.authenticated`, NOT `config.requiresLogin` — so the matrix is keyed
// on the seam-resolved identity alone:
//   • single-user — the owner fallback ALWAYS resolves → authenticated:true → genuine pass-through.
//   • forward-header BROKEN proxy (unauthenticated) → authenticated:false → lands on /login (the arm the
//     surface renders is the explainer) AND is NOT reverse-gated away from it (no half-broken shell — the
//     bug this fix closes). An authed forward-header session passes through and never loops back to /login.
//   • local/oidc — unauthenticated → /login; authenticated → pass + reverse-gate.
// A RESOLVED verdict is acted on immediately; a THROWN read (server momentarily unreachable — a vite HMR
// reconnect blipping `/api/auth/me`) is RETRIED before concluding "unreachable", so an authed owner never
// strands on /login across a transient blip. A blip that recovers → the recovered verdict; a persistently
// down server → still fails toward /login. Retry tests drive fake timers so the backoff doesn't stall.
// `fetch` is stubbed at the global boundary (the upload-asset.test.ts precedent). Deep imports, not
// barrels (node lane — a feature barrel drags browser TSX into the dom-less program).

import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { afterEach, vi } from "vitest";
import type { AuthMe } from "../../../../../packages/client/src/data/auth-bootstrap.ts";
import { redirectIfAuthed, requireAuthed } from "../../../../../packages/client/src/features/auth/lib/route-guards.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const AUTHED: AuthMe = { authenticated: true, handle: castId<Handle>("alice"), role: "user" };
const ANON: AuthMe = { authenticated: false, handle: null, role: null };

/** Stub `/api/auth/me` with the given identity (the guards only read `/me` now — no `/config`). */
function stubMe(me: AuthMe): void {
  vi.stubGlobal("fetch", () => Promise.resolve(new Response(JSON.stringify(me), { status: 200 })));
}

/** Run a guard under fake timers, draining the retry backoff so a THROWN-read path resolves without a real
 *  wall-clock stall. `advanceTimersByTimeAsync` flushes the interleaved microtasks between each retry's
 *  post-await continuation and the setTimeout it schedules next, so one large advance drains the whole
 *  bounded chain. Returns the guard's settled promise. */
async function runWithDrainedTimers<T>(run: () => Promise<T>): Promise<T> {
  vi.useFakeTimers();
  const settled = run();
  await vi.advanceTimersByTimeAsync(5000);
  return settled;
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

/** A `fetch` stub that REJECTS `failures` times, then resolves with `me` — models a transient blip (an
 *  HMR reconnect) that recovers mid-retry-window. */
function stubMeAfterFailures(failures: number, me: AuthMe): void {
  let calls = 0;
  vi.stubGlobal("fetch", () => {
    calls += 1;
    return calls <= failures ? Promise.reject(new Error("ECONNREFUSED")) : Promise.resolve(new Response(JSON.stringify(me), { status: 200 }));
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
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

test("requireAuthed: a PERSISTENTLY unreachable server (retries exhausted) fails toward /login, never a blank shell", async () => {
  vi.stubGlobal("fetch", () => Promise.reject(new Error("ECONNREFUSED")));
  expect(await runWithDrainedTimers(() => redirectTargetOf(requireAuthed))).toBe("/login");
});

test("requireAuthed: a transient blip that RECOVERS (HMR reconnect) resolves to the authed verdict — the owner never strands on /login", async () => {
  stubMeAfterFailures(2, AUTHED);
  await runWithDrainedTimers(() => expect(requireAuthed()).resolves.toBeUndefined());
});

test("requireAuthed: a RESOLVED unauthenticated verdict redirects immediately — anon is NOT retried (no HMR-recovery masking a real logout)", async () => {
  stubMe(ANON);
  const spy = vi.spyOn(globalThis, "fetch");
  expect(await redirectTargetOf(requireAuthed)).toBe("/login");
  expect(spy).toHaveBeenCalledTimes(1);
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

test("redirectIfAuthed: a persistently unreachable server stays (the login surface renders the unreachable state)", async () => {
  vi.stubGlobal("fetch", () => Promise.reject(new Error("ECONNREFUSED")));
  await runWithDrainedTimers(() => expect(redirectIfAuthed()).resolves.toBeUndefined());
});
