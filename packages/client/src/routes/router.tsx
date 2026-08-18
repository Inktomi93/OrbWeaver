import { createRoute, createRouter, lazyRouteComponent, notFound, redirect } from "@tanstack/react-router";
import { redirectIfAuthed, requireAuthed } from "#features/auth";
import { resolveSectionPath, setActiveSection } from "#state";
// Deep, not `#lib`: agent-bridge is OUT of the barrel (main.tsx imports it by path — a re-export would drag
// the dev-only introspection handle into the prod bundle). Type-only, so nothing lands in the boot chunk.
import type { RouteResolution } from "../lib/agent-bridge.ts";
import { rootRoute } from "./__root.tsx";
import { LoginPage } from "./login-page.tsx";
import { RoutePending } from "./route-pending.tsx";

// Hand-written code-based route tree — 2 rendered routes + 1 section ALIAS, no file-based codegen. The URL
// stays effectively pinned at `/`; entity ids never enter the address bar. Admin is a pane inside the
// Settings modal at `/`, not a standalone route. Auth gates live in features/auth: `/` requires an
// authenticated identity (else -> /login, gated before render); /login reverse-gates (already-authed -> /).
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

// THE SECTION DEEP LINK (#181). `/chats`, `/characters`, `/corpus`, … are ALIASES of `/`, not surfaces of
// their own: they select the rail section and hand the visitor to the one rendered app route. Two facts make
// that the right shape rather than nine real routes:
//
//   • a section is CLIENT STATE, not a route — in-app rail navigation deliberately never touches the address
//     bar, so a `/chats` that STAYED in the address bar would start lying the moment the user clicked
//     Characters. Landing back on `/` keeps ONE URL story for both entrances;
//   • the path spelling IS the `SectionId` (`resolveSectionPath`, `state/section-ids.ts`) — no second
//     path→section map to half-edit when the vocabulary changes, and a retired id heals exactly as a stored
//     one does. A segment that is not a section falls through to the root's `notFoundComponent`, so a genuine
//     typo still reads "that route doesn't exist" instead of silently teleporting home.
//
// It carries NO auth gate of its own: it renders nothing, and `/` re-gates before render — a `requireAuthed()`
// here would only buy a second `/api/auth/me` round-trip on every deep link. Static routes out-rank dynamic
// ones in TanStack's matcher, so `/login` is never swallowed by this.
//
// NOT A REGRESSION FIX: `/chats` never resolved. Probed on the isolated stage at 94636b0ed (the pre-merge-train
// floor), a direct load of `/chats` rendered the same 404 — the deep link had simply never existed.
const sectionAliasRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/$section",
  beforeLoad: ({ params }): never => {
    const section = resolveSectionPath(params.section);
    if (section === null) {
      throw notFound();
    }
    setActiveSection(section);
    throw redirect({ to: "/" });
  },
});

const routeTree = rootRoute.addChildren([homeRoute, loginRoute, sectionAliasRoute]);

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
