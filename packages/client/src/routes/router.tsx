import { createRoute, createRouter } from "@tanstack/react-router";
import { redirectIfAuthed, requireAuthed } from "#features/auth";
import { rootRoute } from "./__root";
import { HomePage } from "./home-page";
import { LoginPage } from "./login-page";
import { RoutePending } from "./route-pending";

// The HAND-WRITTEN code-based route tree (UI-Arch §6.1) — 2 routes, no file-based codegen. Type-safety
// is inference + the one `declare module { Register }` below, NOT a generated routeTree
// (UI-Lib-TanStack-Router.md B#3/B#4). The URL stays effectively pinned at `/` (§5.1: entity ids never
// enter the address bar); /login is the only other navigation. Admin is a pane inside the Settings modal
// at `/` (gated by the server's adminProcedure) — there is NO standalone /admin route.
//
// AUTH GATES (FINAL-Auth-Modes §7 P0 — the steal-list #2 `beforeLoad` + thrown `redirect()` idiom; the
// guard bodies live in features/auth): `/` requires an authenticated identity in the login-capable modes
// (else → /login, gated BEFORE render — no unauthenticated flash); /login reverse-gates (already-authed /
// no-login-mode → /).

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => requireAuthed(),
  component: HomePage,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  beforeLoad: () => redirectIfAuthed(),
  component: LoginPage,
});

const routeTree = rootRoute.addChildren([homeRoute, loginRoute]);

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  scrollRestoration: true,
  // P1-b: the brand loading mark paints while a route's `beforeLoad` auth gate (`/me`) resolves — without
  // it a slow/hanging fetch shows a BLANK page (the login surface's own skeleton can't mount until
  // beforeLoad returns). `defaultPendingMs: 0` shows it immediately (no blank-page window at all); the
  // fetch is same-origin + typically sub-100ms, so a fast resolve barely flashes it (and the View
  // Transition crossfade smooths the swap).
  defaultPendingComponent: RoutePending,
  defaultPendingMs: 0,
  // A free crossfade on the only real navigations (/ ⇄ /login); a no-op where the browser
  // lacks the View Transition API (UI-Lib-TanStack-Router.md steal-list #13). In-page pane swaps hand-roll
  // their own VT (§4a) — the router can't drive those (the URL never changes).
  defaultViewTransition: true,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
