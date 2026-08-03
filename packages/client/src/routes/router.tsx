import { createRoute, createRouter } from "@tanstack/react-router";
import { redirectIfAuthed, requireAuthed } from "#features/auth";
import { rootRoute } from "./__root.tsx";
import { AppRoot } from "./app-root.tsx";
import { LoginPage } from "./login-page.tsx";
import { RoutePending } from "./route-pending.tsx";

// Hand-written code-based route tree — 2 routes, no file-based codegen. The URL stays effectively pinned
// at `/`; entity ids never enter the address bar. Admin is a pane inside the Settings modal at `/`, not a
// standalone route. Auth gates live in features/auth: `/` requires an authenticated identity (else ->
// /login, gated before render); /login reverse-gates (already-authed -> /).

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => requireAuthed(),
  component: AppRoot,
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
  // Paints while beforeLoad's auth gate resolves — without it a slow/hanging fetch shows a blank page.
  defaultPendingComponent: RoutePending,
  defaultPendingMs: 0,
  // A free crossfade on the only real navigations (/ <-> /login); no-op without the View Transition API.
  defaultViewTransition: true,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
