// E2E smoke — the bare minimum that must hold before any other spec is meaningful (neo 01/02 port).
// Three cheap, model-free proofs: (1) the server is live (healthz), (2) the SPA shell mounts + single-user
// AUTH_MODE boots with NO login form, and (3) a real owner-scoped tRPC query resolves end-to-end (the
// chat list surface renders — list OR empty-state, both prove the transport + auth resolved).
//
// Ported from neo's 01-smoke + 02-auth. Deltas vs neo, grounded in orb's real wiring:
//   • healthz lives at `/healthz` on the Hono server (entry/http/healthz.ts), NOT `/api/healthz`, and the
//     vite dev front door (the baseURL) only proxies `/api` + `/join` — so `/healthz` is hit on the backend
//     port DIRECTLY. Body is `{status:"ok", harness:…}` (no `ok`/`version` field — neo's shape differs).
//   • orb has no `app-root`/`app-shell` DOM testid stamped (the registry key is unused); the shell's ONE
//     `main` landmark (app-shell.tsx `<main className="shell-content">`) is the stable shell-mounted target.
//   • the variant-C HOME surface (home-surface.tsx) mounts a `main "Home content"` landmark, and its
//     masthead/Hearth-hero/recents ALL derive from `chat.listChats` — so the home content rendering proves
//     `chat.listChats` resolved. The chats-LIST surface (`aria-label="Chats"`) moved OFF `/` in the #102
//     rework; it now lives on the Chats SECTION (reached via the Primary rail), not the landing.

import { expect, test } from "@playwright/test";
import { E2E_DEBUG_TOKEN, SINGLE_USER } from "./support/modes.ts";

// The backend origin — healthz is server-only (not proxied through vite), so it is hit on the single-user
// project's OWN backend port (derived from modes.ts, never a literal: this lane moved off the dev :8788, and
// a hardcoded probe there would have reported the operator's dev stack's health instead of the harness's).
const HEALTHZ_URL = `${SINGLE_USER.backendUrl}/healthz`;
const LOGIN_FIELD = /password|handle|username/u;
// The app's one URL — what a section deep link must LAND on (#181).
const APP_URL = /\/$/u;
// The root route's notFound copy (`routes/__root.tsx`) — a CURLY apostrophe, as rendered.
const NOT_FOUND_COPY = "that route doesn’t exist";
const APP_READY = "html[data-app-ready]";

// `@smoke` — the fast anti-rot subset run by the pre-push lefthook gate (`pnpm e2e:smoke`). Model-free +
// data-light; proves the stack boots, auth resolves, the SPA mounts, and the drift-prone `/` landing surface
// (the variant-C HOME — masthead + Hearth Room hero, its content query-derived) still renders. If a
// selector/landing rots (the failure this whole task fixed), THIS goes red on push instead of rotting
// unnoticed.
test("the health endpoint reports ok", { tag: "@smoke" }, async ({ request }) => {
  const res = await request.get(HEALTHZ_URL);
  expect(res.ok()).toBe(true);
  expect(await res.json()).toMatchObject({ status: "ok" });
});

// AUTHFIX-2 — the ONLY assertion in the tree that proves the /api/_debug gate on a REAL BOOTED STACK, and
// the reason it lives in `@smoke` (the pre-push tier) rather than beside the unit suite: the unit suite
// (`tests/server/entry/debug-gate.suite.test.ts`) proves the seam+gate composition, but nothing there boots a
// server, so nothing there can catch a wiring, proxy or env-threading regression. Both halves matter:
//
//   • NO TOKEN → 401. This is the hole itself. Until 2026-08-07 the gate's admin arm admitted the
//     un-credentialed owner fallback, so this exact request returned 200 — under `single-user`
//     unconditionally, and under an SSO mode to anyone who could reach the port with `Host: 127.0.0.1`.
//     Behind it: whole-db reads and (with WIRE_CAPTURE=on, as this stack runs) provider request BODIES.
//   • WITH TOKEN → 200. The positive control, and simultaneously the proof that `E2E_DEBUG_TOKEN` really
//     reached the server through `modes.ts::webServerEnv` — which is what every `@live` spec's debug witness
//     (`fetchWireCaptures`/`inspectChatDb`/`fetchDebugErrors`) now depends on. Those specs are `@live`-gated
//     and never run on push, so without THIS test the threading could rot silently for weeks.
//
// A 200 on the first half is not a flake to retry — it is the hole, reopened.
test("the /api/_debug gate refuses an un-credentialed caller and admits the operator token", {
  tag: "@smoke",
}, async ({ request }) => {
  const unauthenticated = await request.get("/api/_debug/info");
  expect(unauthenticated.status(), "an un-credentialed /api/_debug read must NEVER be served").toBe(401);

  const authorized = await request.get("/api/_debug/info", { headers: { "x-debug-token": E2E_DEBUG_TOKEN } });
  expect(authorized.ok(), "the operator token must still open the debug surface").toBe(true);
});

test("single-user mode: an owner-scoped tRPC query succeeds with no login", {
  tag: "@smoke",
}, async ({ request }) => {
  // `chat.listChats` is authed + owner-scoped; in single-user AUTH_MODE the resolver auto-grants the owner
  // with no session cookie, so this 200s (proxied through vite's `/api`). tRPC GET query input is an empty
  // batch — the call resolving at all is the proof (auth + transport + DB all answered). Build the query
  // string from params (not a literal) so the base64-shaped batch input doesn't trip the secret scanner.
  const input = encodeURIComponent(JSON.stringify({ 0: {} }));
  const res = await request.get(`/api/trpc/chat.listChats?batch=1&input=${input}`);
  expect(res.ok()).toBe(true);
});

test("the SPA shell mounts and single-user boots with no login form", {
  tag: "@smoke",
}, async ({ page }) => {
  await page.goto("/");
  // The shell's one `main` landmark appears once the router + shell mount (single-user resolves the owner
  // with no redirect — a login form would mean the boot went sideways).
  await expect(page.getByRole("main")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("login-page")).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: LOGIN_FIELD })).toHaveCount(0);
});

// #181 — the SECTION DEEP LINK. A rail section is client state, so `/chats` is an ALIAS route
// (`routes/router.tsx`): it selects the section and hands the visitor to `/`, which is the app's one URL.
// Before the alias existed, a direct load of `/chats` rendered the root's notFound surface — probed on the
// isolated stage at 94636b0ed, so this was never a regression, just a deep link nobody had built. It lives in
// `@smoke` because it is a BOOT contract: every `snap /<section>` probe and every bookmarked section link
// depends on it, and a silent 404 here reads as "the app is broken" to whoever hits it next.
test("a section deep link boots the app and lands on the one app URL", { tag: "@smoke" }, async ({ page }) => {
  await page.goto("/chats");
  await expect(page.getByRole("main")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(NOT_FOUND_COPY)).toHaveCount(0);
  // The address bar is where in-app rail navigation leaves it — one URL story for both entrances.
  await expect(page).toHaveURL(APP_URL);
});

test("a path that is NOT a section still renders the not-found surface", { tag: "@smoke" }, async ({ page }) => {
  await page.goto("/definitely-not-a-section");
  // The alias resolves the segment against the SECTION vocabulary and throws notFound on a miss — a typo
  // must never be silently absorbed into the app (that is how a dead link looks like a working one).
  await expect(page.getByText(NOT_FOUND_COPY)).toBeVisible({ timeout: 30_000 });
});

test("the home page renders the home surface (tRPC query works)", {
  tag: "@smoke",
}, async ({ page }) => {
  await page.goto("/");
  // Wait for the app to reach cache-idle (the agent-bridge signal), then assert the variant-C HOME surface
  // (program #102) actually MOUNTED: its `main "Home content"` landmark. The Hearth Room hero, the "Pick up
  // where you left off" region and the "Other rooms" recents ALL derive from `chat.listChats`, so the home
  // content rendering at all is the end-to-end proof the owner-scoped query resolved (auth + transport + DB
  // all answered). A transport/auth failure would render an ErrorState instead of the surface — assert none.
  // (The chats-LIST surface — `getByRole("list", { name: "Chats" })` — moved to the Chats SECTION in this
  // rework; it no longer lives on `/`, which is exactly the stale coupling this test used to carry.)
  await expect(page.locator(APP_READY)).toBeAttached({ timeout: 30_000 });
  await expect(page.getByRole("main", { name: "Home content" })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Couldn't load your chats")).toHaveCount(0);
});
