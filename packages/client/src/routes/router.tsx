import { createRoute, createRouter } from "@tanstack/react-router";
import { AppShell } from "#features/app-shell";
import { rootRoute } from "./__root";
import { AdminPage } from "./admin-page";
import { LoginPage } from "./login-page";

// The HAND-WRITTEN code-based route tree (UI-Arch §6.1) — ~3 routes, no file-based codegen. Type-safety
// is inference + the one `declare module { Register }` below, NOT a generated routeTree
// (UI-Lib-TanStack-Router.md B#3/B#4). The URL stays effectively pinned at `/` (§5.1: entity ids never
// enter the address bar); /login + /admin/* are the only other navigations.

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: AppShell,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: LoginPage,
});

// /admin/* — a splat route. Plain component today (a placeholder has no bundle to split); becomes
// `lazyRouteComponent` when the real user-admin surfaces land, behind a beforeLoad requireOwner gate.
const adminRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/$",
  component: AdminPage,
});

const routeTree = rootRoute.addChildren([homeRoute, loginRoute, adminRoute]);

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  scrollRestoration: true,
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
