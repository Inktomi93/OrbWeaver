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
//   • the chat list surface (chat-list-surface.tsx) owns an `aria-label="Chats"` region OR an empty-state —
//     either proves `chat.listChats` resolved. Reached via the rail's exact "Characters"→no; the Chats
//     section is the default CONTENT+LIST on `/`, so the list panel is present from first paint.

import { expect, test } from "@playwright/test";
import { SINGLE_USER } from "./support/modes.ts";

// The backend origin — healthz is server-only (not proxied through vite), so it is hit on the single-user
// project's OWN backend port (derived from modes.ts, never a literal: this lane moved off the dev :8788, and
// a hardcoded probe there would have reported the operator's dev stack's health instead of the harness's).
const HEALTHZ_URL = `${SINGLE_USER.backendUrl}/healthz`;
const LOGIN_FIELD = /password|handle|username/u;
const APP_READY = "html[data-app-ready]";

// `@smoke` — the fast anti-rot subset run by the pre-push lefthook gate (`pnpm e2e:smoke`). Model-free +
// data-light; proves the stack boots, auth resolves, the SPA mounts, and the drift-prone `/` landing surface
// (the Chats list) still renders. If a selector/landing rots (the failure this whole task fixed), THIS goes
// red on push instead of rotting unnoticed.
test("the health endpoint reports ok", { tag: "@smoke" }, async ({ request }) => {
  const res = await request.get(HEALTHZ_URL);
  expect(res.ok()).toBe(true);
  expect(await res.json()).toMatchObject({ status: "ok" });
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

test("the home page renders the chat list surface (tRPC query works)", {
  tag: "@smoke",
}, async ({ page }) => {
  await page.goto("/");
  // Wait for the app to reach cache-idle (the agent-bridge signal) so the suspense-loaded list has resolved
  // to EITHER its `aria-label="Chats"` region or the "No chats yet" empty-state — both prove the query
  // succeeded (a transport/auth failure would render the surface's ErrorState "Couldn't load your chats").
  await expect(page.locator(APP_READY)).toBeAttached({ timeout: 30_000 });
  const chatsList = page.getByRole("list", { name: "Chats" });
  const emptyState = page.getByText("No chats yet");
  await expect(chatsList.or(emptyState).first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Couldn't load your chats")).toHaveCount(0);
});
