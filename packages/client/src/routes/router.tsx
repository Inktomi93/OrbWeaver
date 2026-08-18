import { createRoute, createRouter, lazyRouteComponent } from "@tanstack/react-router";
import { redirectIfAuthed, requireAuthed } from "#features/auth";
// Deep, not `#lib`: agent-bridge is OUT of the barrel (main.tsx imports it by path — a re-export would drag
// the dev-only introspection handle into the prod bundle). Type-only, so nothing lands in the boot chunk.
import type { RouteResolution } from "../lib/agent-bridge.ts";
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

// The readiness signal's ROUTE-RESOLUTION port (issue #145 — `lib/agent-bridge.ts` declares the shape;
// `lib/` is the floor tier and may not import this module, so the adapter lives here beside the singleton).
// `status: "pending"` covers a navigation whose beforeLoad/loader/lazy-component chunk is still landing —
// which for `/` is the ~4.9 MB `compose/authed-app.tsx` graph. `onRendered` is the LAST lifecycle event of a
// navigation (after onResolved + onBeforeRouteMount), so it is the tick at which "the component that owns
// the initial reads is mounted" first becomes true; `onBeforeNavigate` re-opens the window on every later
// navigation. Both are subscribed, because the port's contract is "tell me when resolution MAY have changed"
// and the reader re-derives the answer from `state` every time.
export const routeResolution: RouteResolution = {
  isResolving: (): boolean => router.state.status === "pending" || router.state.isLoading,
  subscribe: (onChange: () => void): (() => void) => {
    const offRendered = router.subscribe("onRendered", onChange);
    const offNavigate = router.subscribe("onBeforeNavigate", onChange);
    return (): void => {
      offRendered();
      offNavigate();
    };
  },
};

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
