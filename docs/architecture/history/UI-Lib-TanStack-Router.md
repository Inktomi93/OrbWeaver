---
kind: reference
status: active
updated: 2026-07-03
---

# UI-Lib-TanStack-Router

> **Re-homed to `history/` 2026-07-09:** an evidence/provenance MINE, not law — its distilled verdicts were promoted into the `core/UI-*.md` spec sections (see `core/UI-Architecture-and-Layout.md` §6.1 companions table). Read this file only when debugging or upgrading the library it mines; code comments citing `<this filename> §N` resolve here.

> **A lib companion of the nine-doc UI law set** — a full-read examples/deep-docs mine (evidence + provenance, NOT extra law; the distilled verdicts are folded into the spec sections of `UI-Architecture-and-Layout.md` / `UI-Gates-and-Lessons.md` / `UI-Primitives-and-Reuse.md`, cited per claim).
>
> Cross-doc `§N` references resolve via the §-map in `UI-Architecture-and-Layout.md`.

## TanStack Router — full-docs mine for orbweaver

**Question answered:** Are we using TanStack Router weirdly/wrong, and where could we do better?

**Short answer:** No, we're not fighting the grain in any way that matters. Our three load-bearing decisions
(single-route shell with no ids in the URL · hand-written code-based tree with the codegen plugin dropped ·
router owns navigation, not data) are each explicitly supported, named, and documented as first-class
options. The one place to recalibrate is **View Transitions (§4a)**: the router's VT machinery is keyed to
URL/location commits, and since our in-page pane swaps never change the URL, the router cannot drive those
transitions for us — hand-rolling `document.startViewTransition()` in the reducer is the correct call, not a
workaround. The real upgrades to steal are small: router-context DI for `queryClient`/`trpc`/`auth`, the
`beforeLoad + throw redirect` auth gate for `/login` + `/admin/*`, devtools, and `lazyRouteComponent` for the
admin split.

Doc paths below are relative to `docs/router/` in the TanStack/router repo unless noted.

### A. Capability map (what the router actually offers)

#### Route definition

- **Code-based routing** (`routing/code-based-routing.md`) — `createRootRoute()`/`createRoute({ getParentRoute, path })`,
  tree assembled by hand via `rootRoute.addChildren([...])`. The base API; file-based is sugar on top of it.
- **File-based routing** (`routing/file-based-routing.md`, `routing/file-naming-conventions.md`) — a Vite/Rspack/Webpack
  plugin (`@tanstack/router-plugin`) generates `routeTree.gen.ts` from a `src/routes/` directory + filename
  conventions. "file-based routing is really a superset of code-based routing and uses … code-generation
  abstraction on top of it" (`code-based-routing.md` L259).
- **Virtual file routes** (`routing/virtual-file-routes.md`) — programmatic mapping of a route tree to real files
  via `@tanstack/virtual-file-routes` (`rootRoute`/`route`/`index`/`layout`/`physical`). Still requires the
  plugin; it's a middle ground for keeping a custom file org, NOT a way to avoid codegen.
- **Route matching** (`routing/route-matching.md`) — routes are auto-sorted by specificity regardless of
  definition order: index → static → dynamic → splat. You never hand-order the tree to get correct matching.

#### Type-safety model

- **Inference + declaration merging** (`guide/type-safety.md`, `guide/creating-a-router.md`, `api/router/RegisterType.md`).
  All types flow from generic inference on `createRoute`/`addChildren`; the top-level exports (`Link`,
  `useNavigate`, …) are wired to your tree by ONE `declare module '@tanstack/react-router' { interface Register
  { router: typeof router } }`. **Codegen is not the source of type-safety** — inference + `Register` is.
- **Type utilities** (`guide/type-utilities.md`) — `ValidateLinkOptions`, `ValidateNavigateOptions`,
  `ValidateRedirectOptions`, `linkOptions()` for type-checking reusable nav option objects.

#### Navigation

- **`<Link>` / `useNavigate` / `<Navigate>` / `router.navigate`** (`guide/navigation.md`,
  `api/router/NavigateOptionsType.md`). One shared `ToOptions`/`NavigateOptions`/`LinkOptions` interface
  everywhere. `Link` is preferred for anything clickable; `router.navigate` for non-React contexts.
- **`redirect()` / `isRedirect()`** (`api/router/redirectFunction.md`) — throwable from `beforeLoad`/`loader`,
  takes the same options as navigate. `isRedirect(err)` distinguishes intentional redirects from real errors.
- **`createLink`** (`guide/custom-link.md`) — wrap any component (design-system button/anchor) into a typed
  router link with full `to`/`params`/`search` safety + `preload`.

#### Search-param state

- **JSON-first, validated, typed URL search** (`guide/search-params.md`, `how-to/validate-search-params.md`).
  `validateSearch` accepts a Zod/Valibot/ArkType/Effect schema (Zod v4 needs no adapter; **Zod v3 needs
  `@tanstack/zod-adapter`**). Read via `useSearch`, write via `<Link search>`/`navigate`. Framed throughout as
  "useState in the URL" — the router's headline feature.
- **Search middleware** (`api/router/retainSearchParamsFunction.md`, `stripSearchParamsFunction.md`) —
  `retainSearchParams`/`stripSearchParams` to persist/strip params across navigations.
- **Custom serialization** (`guide/custom-search-param-serialization.md`) — `parseSearch`/`stringifySearch`
  (base64, query-string, JSURL2, Zipson).

#### Loaders + `beforeLoad`

- **`loader` + built-in SWR cache** (`guide/data-loading.md`) — per-route loaders keyed on path params +
  `loaderDeps`, with `staleTime`/`gcTime`/`shouldReload`. A lightweight TanStack-Query-lite for route data.
- **`beforeLoad`** (`guide/authenticated-routes.md`) — middleware that runs top-down before a route + its
  children load; the documented home for auth gating (`throw redirect(...)`) and for additively merging
  route context.
- **External data coordination** (`guide/external-data-loading.md`, `integrations/query.md`) — the router is a
  "coordinator" for TanStack Query et al. The official `@tanstack/react-router-ssr-query` integration is
  **SSR dehydration/hydration/streaming only**.

#### Router context / dependency injection

- **`createRootRouteWithContext<T>()` + `createRouter({ context })`** (`guide/router-context.md`,
  `api/router/createRootRouteWithContextFunction.md`). Hierarchical, type-safe DI: inject `queryClient`,
  data clients, auth state, services; merged + extended down the tree; available in every
  `beforeLoad`/`loader` and via `useRouteContext`. React hooks are injected at the `RouterProvider` seam.

#### Code-splitting / lazy routes

- **Code-based:** `createLazyRoute('/id')({ component })` + `route.lazy(() => import(...))`, or
  `lazyRouteComponent(() => import(...))` for a single component (`guide/code-splitting.md`,
  `api/router/createLazyRouteFunction.md`, `lazyRouteComponentFunction.md`). Works with no plugin.
- **File-based auto-splitting:** `autoCodeSplitting: true` on the plugin (`guide/automatic-code-splitting.md`)
  — **plugin-only**, unavailable without codegen.

#### Navigation blocking

- **`useBlocker` / `<Block>`** (`guide/navigation-blocking.md`, `api/router/useBlockerHook.md`, ⚠ experimental)
  — block router navigations + the browser `beforeunload` event when a form is dirty, with optional custom-UI
  resolver (`proceed`/`reset`/`status`).

#### Location masking

- **Route masking** (`guide/route-masking.md`, `api/router/createRouteMaskFunction.md`) — show a different URL
  in the bar than the one actually matched (modal-at-/photos/5 etc). Imperative `mask` prop or declarative
  `routeMasks`.

#### View transitions

- **`defaultViewTransition` (router) + per-nav `viewTransition`** (`api/router/RouterOptionsType.md`,
  `ViewTransitionOptionsType.md`, `guide/navigation.md`) — `boolean | { types }`. On navigation the router
  calls `document.startViewTransition({ update, types })`. `types` can be a function returning `false` to skip.
  **Fires only on location commits.**

#### Scroll restoration

- **`createRouter({ scrollRestoration: true })`** (`guide/scroll-restoration.md`) — multi-area scroll caching,
  `getScrollRestorationKey` (keyed on `__TSR_key` or pathname), `scrollToTopSelectors`,
  `useElementScrollRestoration` + `data-scroll-restoration-id` for virtualized lists. Per-nav opt-out via
  `resetScroll: false`. (Note: this option is documented in the guide but missing from the
  `RouterOptionsType.md` API page — the guide is authoritative.)

#### Router events

- **`router.subscribe(event, cb)`** (`guide/router-events.md`) — `onBeforeNavigate`/`onBeforeLoad`/`onLoad`/
  `onResolved`/`onRendered` for analytics, focus management, external-cache/mutation-state resets after nav.

#### Document head

- **`head` route option + `<HeadContent />` / `<Scripts />` / `ScriptOnce`** (`guide/document-head-management.md`)
  — works in SPAs; per-route title/meta dedupe; `ScriptOnce` for pre-hydration theme scripts.

#### Devtools + Vite plugin

- **`@tanstack/react-router-devtools`** (`devtools.md`) — visualize matches/loaders/router state; floating or
  embedded; `TanStackRouterDevtoolsInProd` for prod.
- **`@tanstack/router-plugin/vite`** (`installation/with-vite.md`) — exists ONLY to power file-based routing
  (codegen + `autoCodeSplitting`). Not required to run the router.

#### History

- **`history` option** (`guide/history-types.md`) — omit for browser history (the SPA default);
  `createHashHistory()` for no-rewrite hosting; `createMemoryHistory({ initialEntries: ['/'] })` for tests.

### B. The verdict (per feature)

Legend: ✅ doing it right · ⚠️ weird/risky/fighting the router · 🔼 should adopt · ⏭️ correctly skip.

| # | Topic | Verdict | One-line basis (doc) |
| - | - | - | - |
| 1 | Single-route shell, **no ids in URL** | ✅ CORRECT | URL-as-state is *offered, not required*; nothing forces ids into the path. `search-params.md` calls URL state a *choice*; `history-types.md` even ships `createMemoryHistory` for "when you do not want components to interact with the URL." |
| 2 | Using the router for only \~3 routes | ✅ CORRECT | `decisions-on-dx.md` pushes file-based *for scale (40-50 routes)*; for a tiny tree the boilerplate it solves doesn't exist. A 3-route tree is the trivial case, not a misuse. |
| 3 | **Hand-write tree, drop codegen plugin** | ✅ CORRECT | `installation/manual.md` documents a complete code-based app importing only `@tanstack/react-router` — no plugin, no `routeTree.gen.ts`. File-based is explicitly "a superset … code-generation abstraction on top" (`code-based-routing.md` L259). |
| 4 | **Type-safety after dropping the plugin** | ✅ CORRECT (critical) | Type-safety = inference + the one `declare module { interface Register }` (`type-safety.md`, `RegisterType.md`), NOT codegen. The plugin only writes the tree file + manages `getParentRoute` linkage for you. Hand-wiring `getParentRoute` + `Register` keeps 100% of the type-safety value prop. **Dropping codegen does NOT undermine type-safe routing.** |
| 5 | Virtual file routes as a middle ground | ⏭️ CORRECTLY SKIP | `virtual-file-routes.md` still requires the plugin; it solves "custom file org at scale," not "tiny tree." Pure overhead for 3 routes. |
| 6 | **Router loaders for data** | ⏭️ CORRECTLY SKIP | `data-loading.md` + `external-data-loading.md`: loaders coordinate fetches *on navigation*. With the URL pinned at `/`, entity changes aren't navigations, so loaders would never re-fire on entity switch. Query owning server-state is the documented "coordinate, don't store" path. |
| 7 | **`beforeLoad` for auth** | 🔼 SHOULD ADOPT | `authenticated-routes.md` + `how-to/setup-authentication.md`: `beforeLoad` + `throw redirect({ to: '/login' })` is THE documented gate, and it's the one place a route earns its keep for us — on `/login` + `/admin/*`. |
| 8 | **Router context DI (`queryClient`/`trpc`/`auth`)** | 🔼 SHOULD ADOPT (with care) | `router-context.md`: documented DI. Inject at the `RouterProvider` seam (the `InnerApp` pattern). Caveat in C/E: this is a *second* DI channel — composition root stays source of truth; the router context just forwards already-constructed singletons. |
| 9 | **Code-splitting routes** | ⏭️ MOSTLY SKIP / 🔼 split the admin pane | `code-splitting.md`: route-level splitting matters at scale. For 3 routes the win is lazy *components* inside the shell; the one real route-split worth doing is `/admin/*` via `lazyRouteComponent(() => import('./Admin'))`. |
| 10 | **View Transitions for in-page nav (§4a)** | ✅ CORRECT to hand-roll | `RouterOptionsType.md`/`ViewTransitionOptionsType.md`: router VT fires on **location commits** (`pathChanged`/`hrefChanged`). Our pane swaps don't change the URL ⇒ router VT can't fire ⇒ hand-rolled `document.startViewTransition()` in the reducer is correct, not a workaround. |
| 10b | Router VT for the 3 real route changes | 🔼 OPTIONAL ADOPT | For `/` ⇄ `/login` ⇄ `/admin/*`, `defaultViewTransition: true` (or per-`Link` `viewTransition`) is a free one-liner since those *are* navigations. |
| 11 | **`useBlocker` editor leave-guard** | ⚠️ WEIRD-FIT / partial | `useBlockerHook.md` (experimental): triggers on router navigations + `beforeunload`. Switching entity via the reducer is NOT a navigation ⇒ won't catch the in-app "leave editor." Useful only for tab-close/refresh and the 3 real routes; the in-app guard must be hand-rolled. |
| 12 | Search-param state (Zod `validateSearch`) | ⏭️ CORRECTLY SKIP (until bolt-on) | `search-params.md` etc. are the URL-as-state pattern we deliberately reject. Keep only as the recipe **if** §5.1 ever bolts on a chat-id route; then use `fallback`/`.catch` so a malformed URL never throws. |
| 13 | Route masking | ⏭️ CORRECTLY SKIP | `route-masking.md`: masks one URL as another. Our URL never changes — nothing to mask. |
| 14 | URL rewrites / basepath | ⏭️ CORRECTLY SKIP | `url-rewrites.md`: i18n/subdomain/multi-tenant URL transforms. N/A at `/`. |
| 15 | Scroll restoration | ⚠️ LIMITED VALUE | `scroll-restoration.md`: `scrollRestoration: true` keys on pathname/`__TSR_key`; with a constant pathname it can't distinguish panes. The *manual* `useElementScrollRestoration` + `data-scroll-restoration-id` is the only useful slice (chat scroll area). |
| 16 | Preloading (`defaultPreload: 'intent'`) | ⏭️ MOSTLY SKIP | `preloading.md`: preloads route deps on hover. With no loaders + 3 routes there's little to preload; Query's own prefetch is the lever. |
| 17 | Devtools | 🔼 SHOULD ADOPT | `devtools.md`: cheap insight into matches/context/nav; gate behind `import.meta.env.DEV`. |
| 18 | Router events (`router.subscribe`) | 🔼 OPTIONAL ADOPT | `router-events.md`: `onResolved` for analytics / focus / resetting transient state on the real route changes. |
| 19 | `notFoundComponent` / `notFoundMode` | 🔼 MINOR ADOPT | `not-found-errors.md`: set a root `notFoundComponent` so a stray `/admin/garbage` deep-link renders something sane. |
| 20 | SSR / Query SSR integration / streaming / deferred | ⏭️ CORRECTLY SKIP | `integrations/query.md`, `ssr.md`, `deferred-data-loading.md`: all SSR/Start-only. We're a Vite SPA. |
| 21 | Parallel routes | ⏭️ CORRECTLY SKIP | `parallel-routes.md` is an unimplemented stub; `comparison.md` marks it 🛑 for TanStack. |
| 22 | SPA history fallback to `index.html` | ✅ CORRECT | `how-to/deploy-to-production.md`: a client-routed SPA needs all paths rewritten to `/index.html`. Built: `entry/http/spa.ts` — Hono `serveStatic` + the Accept-html index.html fallback, exactly the prescribed config (and barely exercised since the URL rarely leaves `/`). |
| 23 | `linkOptions` / `createLink` for design-system links | 🔼 MINOR ADOPT | `link-options.md`, `custom-link.md`: type-checked reusable nav configs + typed wrapper around our button/anchor primitives. |
| 24 | `staticData` (e.g. `showNavbar:false` on `/admin`) | 🔼 OPTIONAL | `static-route-data.md`: clean way to flag the admin route as chrome-less vs the `/` shell. |

### C. Are we doing anything WEIRD? — the blunt answer

Mostly no. Going feature by feature against what the docs assume:

1. **"Single-route, no ids in the URL" is NOT fighting the router — but it does opt out of the router's
   single biggest selling point.** The docs lean *hard* on URL search params as "the OG state manager"
   (`overview.md`, `search-params.md`) and the how-to search series uniformly recommends putting filter/view/
   modal/theme/pagination state in the URL (`how-to/share-search-params-across-routes.md` literally lists
   "modal visibility, drawer state, view modes" as things to store in the URL). We reject all of that. That's
   not unsupported — `history-types.md` ships `createMemoryHistory` for exactly "when you do not want
   components to interact with the URL" — but be clear-eyed: **we're using maybe 15% of what TanStack Router
   is *for*.** The justification (family cohesion + type-safety, §6.1) is sound, but it's worth saying out loud
   that wouter/no-router would cover our actual usage. *Fix: none needed — just don't let anyone "use search
   params because the router's so good at them" creep ids into the bar and break multi-device DB-is-truth.*

2. **`useBlocker` for the editor leave-guard will quietly not fire.** This is the sharpest real trap.
   `useBlockerHook.md` is keyed to router navigation + `beforeunload`. Our "leaving the editor" is a reducer
   state swap at a stable `/`, which is not a navigation — so `useBlocker` catches tab-close/refresh and the 3
   real routes, but **not** the in-app pane switch you actually want to guard. *Fix: hand-roll the in-app
   dirty-guard against our own view/reducer transition; optionally add `useBlocker` purely for the
   `beforeunload` (tab-close) belt-and-suspenders.* The hook is also flagged **experimental** — another reason
   not to lean on it.

3. **View Transitions (§4a) via the router won't fire for pane swaps.** Same root cause as #2:
   `ViewTransitionOptions.types` receives `pathChanged`/`hrefChanged`, both always false for us, and the router
   only calls `startViewTransition` on a location commit. *Fix: §4a's plan to hand-roll
   `document.startViewTransition()` in the reducer is correct — confirmed, not a smell. Don't wire
   `AnimatePresence`/router VT to `location.pathname` (it's constant); key transitions off our view state.*
   (`how-to/integrate-framer-motion.md` makes the same mistake-to-avoid explicit.)

4. **Router context DI overlaps our composition-root DI.** `router-context.md` says "inject data fetching and
   mutation implementations themselves! In fact, this is highly recommended." If we follow that literally we
   end up with two DI systems. *Fix: keep the composition root as the one home (per CLAUDE.md); the router
   context should only *forward* already-constructed singletons (`queryClient`, `trpc`, `auth` snapshot) so
   `beforeLoad` can reach them — not *construct* anything. Inject at the `RouterProvider` seam, matching the
   `InnerApp`/`context={{ auth }}` pattern in `authenticated-routes.md`.*

5. **The auth redirect search-param is dead weight for us.** Every auth recipe stores the post-login target in
   a `?redirect=` search param (`authenticated-routes.md`, `how-to/setup-authentication.md`). With a
   single-`/` shell the post-login destination is always `/`. *Fix: hardcode the destination, drop the
   `redirect` search param and its `validateSearch`.*

Nothing else qualifies as weird. The hand-written tree, the no-loaders stance, the SPA index.html fallback,
and the 3-route count are all squarely within documented, intended usage.

### D. What we should STEAL (concrete adopt list)

1. **Router-context DI for `queryClient` + `trpc` + `auth`** — `guide/router-context.md`,
   `api/router/createRootRouteWithContextFunction.md`. `createRootRouteWithContext<{ queryClient; trpc; auth }>()`
   then `createRouter({ context })`, injected at the `RouterProvider` seam. *Why: gives `beforeLoad` typed
   access to auth/services without sideways imports — and it's the only clean way to make the auth gate work.*
2. **`beforeLoad` + `throw redirect({ to: '/login' })` auth gate** — `guide/authenticated-routes.md`,
   `api/router/redirectFunction.md`, `how-to/setup-authentication.md`. Put it on `/admin/*` (and reverse-gate
   `/login`). Use `isRedirect(err)` in catch blocks. *Why: the one job a route genuinely does for us; drop the
   `?redirect=` param.*
3. **`createMemoryHistory({ initialEntries: ['/'] })` for router tests** — `guide/history-types.md`,
   `how-to/setup-testing.md`. *Why: deterministic, no jsdom history quirks; the documented way to test
   `beforeLoad` gates with a mocked auth context.*
4. **`lazyRouteComponent(() => import('./Admin'))` for the `/admin/*` split** — `guide/code-splitting.md`,
   `api/router/lazyRouteComponentFunction.md`. *Why: keeps the admin bundle out of the main chat shell, no
   plugin required.*
5. **Devtools (`@tanstack/react-router-devtools`), DEV-gated** — `devtools.md`. *Why: free visibility into
   matches/context/nav; `import.meta.env.DEV` gate.*
6. **Root `notFoundComponent` + `notFoundMode: 'root'`** — `guide/not-found-errors.md`. *Why: a stray
   `/admin/garbage` deep-link renders a real page, not the bare `<p>Not Found</p>`.*
7. **`router.subscribe('onResolved', …)`** — `guide/router-events.md`. *Why: analytics + focus-management +
   resetting transient state on the real route changes, without polluting components.*
8. **`createLink` around the design-system anchor/button** — `guide/custom-link.md`. *Why: typed `to`/`params`
   for the few real links (login/admin/back-to-app) with our own styling.*
9. **`linkOptions([...])`** — `guide/link-options.md`. *Why: eager type-checking of reusable nav configs
   (admin nav items) instead of object literals that only fail when spread into `<Link>`.*
10. **`staticData: { showNavbar: false }` on `/admin`** — `guide/static-route-data.md`. *Why: declarative way
    for the root shell to know admin is chrome-less vs the chat `/` surface.*
11. **`useElementScrollRestoration` + `data-scroll-restoration-id` on the chat scroll area** —
    `guide/scroll-restoration.md`. *Why: the only slice of scroll-restoration that survives a constant
    pathname; pairs with TanStack Virtual if the message list virtualizes.*
12. **(Conditional) Zod `validateSearch` with `fallback`/`.catch`** — `guide/search-params.md`,
    `how-to/validate-search-params.md`. *Why: the right recipe IF §5.1's localized deep-link bolt-on (a route
    for the chat id only) ever ships — never throw on a malformed shared URL.*
13. **`defaultViewTransition: true`** — `api/router/RouterOptionsType.md`. *Why: free crossfade on the 3 real
    route changes (the only navigations we make); harmless no-op where unsupported.*

### E. Open questions / forks for Nate

1. **Keep TanStack Router at all, or is this wouter's job?** Honest read of the docs: we use \~15% of the
   router (3 routes, no URL state, no loaders, no masking, no search params). §6.1 already decided "keep for
   family cohesion + type-safety" — this mine *confirms* that's a values call, not a technical necessity, since
   wouter would cover the actual surface. **Decision stands; just acknowledging the cost honestly.** (Basis: the
   entire `search-params.md`/loaders apparatus is what justifies TanStack over alternatives, and we opt out of
   it.)

2. **One DI channel or two?** Do we forward `queryClient`/`trpc`/`auth` into router context (needed for the
   `beforeLoad` gate), and if so, how do we keep the composition root as the single home per CLAUDE.md? Proposed
   default: router context **forwards** singletons, never constructs them. Confirm.

3. **Where does the editor dirty-guard live?** `useBlocker` won't catch the reducer-driven pane switch (C#2).
   Fork: (a) hand-roll the in-app guard against view state + use `useBlocker` only for `beforeunload`, or
   (b) skip `useBlocker` entirely and hand-roll both. Default: (a).

4. **View Transitions — two mechanisms or one?** In-page swaps must hand-roll `startViewTransition` (§4a). Do
   we *also* turn on `defaultViewTransition: true` for the 3 real route changes, or keep a single hand-rolled VT
   path for consistency? Default: turn it on (free, no extra code).

5. **`/admin/*` shape: splat vs pathless layout vs lazy.** Code-based gives three knobs: a splat route
   (`path: '$'`), a pathless `id` layout for the auth gate, and `lazyRouteComponent` for the bundle split.
   Likely all three (pathless gate → splat child → lazy component). Confirm the exact tree before building.

6. **If deep-links ever get bolted on (§5.1):** when a single chat-id route appears, do we validate it as a
   **path param** (`/c/$chatId`) or a **search param** (`/?c=...`)? Path param is cleaner and keeps the rest of
   the shell stateless; search param drags in the whole `validateSearch` apparatus. Default: path param, and
   only that one route.

#### Coverage note

Read in full: all of `routing/` (7), all of `guide/` (33), `integrations/query.md`, `installation/with-vite.md` + `manual.md` + migration files, all of `how-to/` (23 incl. drafts), the load-bearing `api/router/` pages
(`RouterOptionsType`, `ViewTransitionOptionsType`, `useBlockerHook`, `createRouteFunction`/`RouteOptionsType`,
lazy-route + redirect + mask + register + getRouteApi + nav-options pages), and all top-level docs
(`overview`, `quick-start`, `faq`, `decisions-on-dx`, `devtools`, `comparison`). One discrepancy surfaced:
`scrollRestoration` is documented in `guide/scroll-restoration.md` but absent from `api/router/RouterOptionsType.md`
— the guide is authoritative.
