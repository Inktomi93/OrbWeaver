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
//     `chat.listChats` resolved. The chats-LIST surface (`aria-label="Chats list"`) moved OFF `/` in the #102
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
// The not-found boundary's FAILURE-SURFACE DECLARE (`lib/app-failure-surface.tsx`) — what design-audit
// reads to refuse a route that resolved to nothing (#1081).
const NOT_FOUND_DECLARE = '[data-app-failure="not-found"]';

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

// THE /api/_debug GATE on a REAL BOOTED STACK — the only place a wiring, proxy or env-threading regression
// can be caught (the unit suite, `tests/server/entry/debug-gate.suite.test.ts`, proves the seam+gate
// composition but boots no server). Which QUESTION this asks changed on 2026-09-02 (#1193); read the
// re-premise before "restoring" the old number.
//
// ⚠ DO NOT CHANGE THE FIRST ASSERTION BACK TO 401. It used to assert that an un-credentialed caller is
// refused (AUTHFIX-2). On THIS harness that assertion has stopped being about the gate at all: this project's
// `webServerEnv` (support/modes.ts) sets no NODE_ENV and no AUTH_FALLBACK, so the stack runs
// `NODE_ENV=development` + `AUTH_FALLBACK=owner`, and every request here arrives on a LOOPBACK socket (vite
// proxies `/api` to 127.0.0.1). That caller IS the box operator — `sessions.me` answers `globalRole:"owner"`
// for it, and #1193 stopped the diagnostics door from being the one surface that pretended otherwise. A 401
// here would now mean the OPERATOR ARM IS BROKEN, i.e. the dev bug-report button is 401ing again.
//
// WHAT THIS CAN AND CANNOT PROVE, stated so nobody reads more into a green run than is there:
//   • CAN: the door is reachable and its admin arm admits the box operator (regression pin for #1193), and
//     the operator TOKEN still opens it — the latter is simultaneously the proof that `E2E_DEBUG_TOKEN`
//     really reached the server through `modes.ts::webServerEnv`, which every `@live` spec's debug witness
//     (`fetchWireCaptures`/`inspectChatDb`/`fetchDebugErrors`) depends on. Those are `@live`-gated and never
//     run on push, so without THIS the threading could rot silently for weeks.
//   • CANNOT: that an UN-CREDENTIALED (anonymous) caller is refused. No dev-posture stack can construct one —
//     a loopback peer is the operator by construction, and `AUTH_FALLBACK=deny` is not available here because
//     globalSetup seeds every booted mode through that same un-credentialed loopback seam
//     (`support/global-setup.ts::seedMode`). The anonymous/PRODUCTION-posture refusal is proven by
//     `tests/server/entry/debug-gate.suite.test.ts` ("the PRODUCTION posture refuses the same loopback
//     owner, single-user included") and the ROLE refusal end-to-end by `auth-smoke.local.spec.ts`
//     (a logged-in non-admin → 401). Neither proof was deleted; both moved to where they are real.
test("the /api/_debug gate admits the box operator's loopback session and the operator token", {
  tag: "@smoke",
}, async ({ request }) => {
  const operator = await request.get("/api/_debug/info");
  expect(operator.status(), "the dev posture must admit the box operator's own loopback session (#1193)").toBe(200);

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
// isolated stage at 6f266ea6cf, so this was never a regression, just a deep link nobody had built. It lives in
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
  // …AND IT DECLARES ITSELF (#1081). `data-app-failure` is the app telling an instrument that this is not
  // one of its surfaces: design-audit reads it and refuses (`tooling/src/ui-audit/lib/evidence.ts`
  // `failureSurfaceGap`), because before the declare existed `design-audit /__no-such-route__` printed a
  // full population table over this boundary and exited 0. The stamp is a cross-tree contract with no
  // compiler between its halves, so this is the assertion that keeps them from drifting apart.
  await expect(page.locator(NOT_FOUND_DECLARE)).toBeVisible();
});

test("the home page renders the home surface (tRPC query works)", {
  tag: "@smoke",
}, async ({ page }) => {
  await page.goto("/");
  // Wait for the app to reach cache-idle (the app-ready signal), then assert the variant-C HOME surface
  // (program #102) actually MOUNTED: its `main "Home content"` landmark. The Hearth Room hero, the "Pick up
  // where you left off" region and the "Other rooms" recents ALL derive from `chat.listChats`, so the home
  // content rendering at all is the end-to-end proof the owner-scoped query resolved (auth + transport + DB
  // all answered). A transport/auth failure would render an ErrorState instead of the surface — assert none.
  // (The chats-LIST surface — `getByRole("list", { name: "Chats list" })` — moved to the Chats SECTION in this
  // rework; it no longer lives on `/`, which is exactly the stale coupling this test used to carry.)
  await expect(page.locator(APP_READY)).toBeAttached({ timeout: 30_000 });
  await expect(page.getByRole("main", { name: "Home content" })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Couldn't load your chats")).toHaveCount(0);
});
