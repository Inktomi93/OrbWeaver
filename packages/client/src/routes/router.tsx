import { createRoute, createRouter, lazyRouteComponent } from "@tanstack/react-router";
import { redirectIfAuthed, requireAuthed } from "#features/auth";
import { rootRoute } from "./__root.tsx";
import { LoginPage } from "./login-page.tsx";
import { RoutePending } from "./route-pending.tsx";

// Hand-written code-based route tree — 2 routes, no file-based codegen. The URL stays effectively pinned
// at `/`; entity ids never enter the address bar. Admin is a pane inside the Settings modal at `/`, not a
// standalone route. Auth gates live in features/auth: `/` requires an authenticated identity (else ->
// /login, gated before render); /login reverse-gates (already-authed -> /).
//
// THE `/` COMPONENT IS LAZY (#43, the boot code-split). `compose/authed-app.tsx` is the door's authed half:
// it assembles every registry, so it statically imports every feature front door — the whole 4.9 MB app.
// Behind `lazyRouteComponent` that graph becomes its own chunk, fetched during the route's load phase
// (RoutePending paints under the boot veil) and ONLY after `requireAuthed` has passed, so an
// unauthenticated client never downloads or parses the authed surface. /login stays eager: it is the one
// thing an anonymous visitor is here for. The import specifier must stay STATICALLY ANALYSABLE — a
// computed path would defeat the bundler's chunking and hand the whole feature graph back to the entry.

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => requireAuthed(),
  component: lazyRouteComponent(() => import("../compose/authed-app.tsx"), "AuthedApp"),
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
