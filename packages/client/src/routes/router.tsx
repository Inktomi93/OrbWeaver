import { createRoute, createRouter } from "@tanstack/react-router";
import { redirectIfAuthed, requireAdminRole, requireAuthed } from "#features/auth";
import { rootRoute } from "./__root";
import { AdminPage } from "./admin-page";
import { HomePage } from "./home-page";
import { LoginPage } from "./login-page";
import { RoutePending } from "./route-pending";

// The HAND-WRITTEN code-based route tree (UI-Arch §6.1) — ~3 routes, no file-based codegen. Type-safety
// is inference + the one `declare module { Register }` below, NOT a generated routeTree
// (UI-Lib-TanStack-Router.md B#3/B#4). The URL stays effectively pinned at `/` (§5.1: entity ids never
// enter the address bar); /login + /admin/* are the only other navigations.
//
// AUTH GATES (FINAL-Auth-Modes §7 P0 — the steal-list #2 `beforeLoad` + thrown `redirect()` idiom; the
// guard bodies live in features/auth): `/` requires an authenticated identity in the login-capable modes
// (else → /login, gated BEFORE render — no unauthenticated flash); /login reverse-gates (already-authed /
// no-login-mode → /); /admin/* additionally requires owner ∪ admin (the server's adminProcedure stays the
// real gate — this is the UX hint that lands users on the right pane).

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

// /admin/* — a splat route. Plain component today (a placeholder has no bundle to split); becomes
// `lazyRouteComponent` when the real user-admin surfaces land.
const adminRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/$",
  beforeLoad: () => requireAdminRole(),
  component: AdminPage,
});

const routeTree = rootRoute.addChildren([homeRoute, loginRoute, adminRoute]);

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
  // A free crossfade on the only real navigations (/ ⇄ /login ⇄ /admin/*); a no-op where the browser
  // lacks the View Transition API (UI-Lib-TanStack-Router.md steal-list #13). In-page pane swaps hand-roll
  // their own VT (§4a) — the router can't drive those (the URL never changes).
  defaultViewTransition: true,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
