# TanStack Query v5 — Full-Docs Mining for Orbweaver's Data Layer

Source: shallow clone of `TanStack/query` `docs/` (read in full). Orbweaver context this is graded against:
Vite SPA (React 19 + React Compiler ON) · Hono Node server · tRPC + TanStack Query via `@trpc/tanstack-react-query` ·
queryKeys 100% codegen-derived from the tRPC proxy (gate `no-array-literal-querykey`) · live updates from an SSE event bus

- pure reducer `applyChatBusEvent` (NOT Query) · central `invalidation.ts` event→`queryFilter()` seam (gate
  `no-inline-invalidate-outside-seam`) · per-mutation sticky error channels (gate `no-multiplexed-mutation-error`) ·
  stream writes only through the reducer (gate `no-inline-cache-surgery-in-stream`). Primitives being built:
  `createEntityMutation`, `createCollectionSurface`, `<QueryBoundary>`, prefetch-on-intent, eslint `flat/recommended-strict`.

Doc paths are relative to `docs/`.

---

## A. Best-practice / capability map (the full surface, one or two lines each)

### Query basics

- **`staleTime`** (`framework/react/guides/important-defaults.md`, `reference/useQuery.md`): `0` default → everything is stale immediately → refetches on mount/focus/reconnect. Values: ms · `Infinity` (only manual invalidation refetches) · `'static'` (NOTHING refetches, _even manual `invalidateQueries`_ is ignored). `invalidateQueries` always overrides `staleTime` (except `'static'`).
- **`gcTime`** (default `5*60_000`): timer for _unused/inactive_ queries only; does nothing while a query has an observer. Renamed from `cacheTime` in v5.
- **`enabled`**: gate auto-running; `false` → `status:'pending'`, `fetchStatus:'idle'`, ignores invalidation/refetch. `enabled` can be a function.
- **`select`** (`guides/render-optimizations.md`): transform/subscribe to a slice; runs only when `data` changes or `select` ref changes — inline `select` runs every render, so wrap in `useCallback` or hoist to a module constant. Not a place to throw.
- **`placeholderData`** (`guides/placeholder-query-data.md`): non-persisted "fake" data; query starts in `success` with `isPlaceholderData:true`. `placeholderData: keepPreviousData` (or `(prev)=>prev`) = lagged pagination.
- **`initialData`** (`guides/initial-query-data.md`): _persisted_ to cache, treated fresh unless `initialDataUpdatedAt` given. Use for real seed data, not partial/preview.
- **`structuralSharing`** (default `true`): keeps refs stable when JSON data is unchanged → fewer re-renders. JSON-only; pass a fn for non-JSON.
- **tracked properties / `notifyOnChangeProps`** (`guides/render-optimizations.md`): result is a Proxy; only _accessed_ fields trigger re-render. Object-rest destructuring defeats it (lint `no-rest-destructuring`).
- **`subscribed`** (`reference/useQuery.md`, `react-native.md`): `false` → this observer won't run the fn or receive cache updates. Useful for out-of-view screens.

### `queryOptions` / `infiniteQueryOptions` / `mutationOptions`

- (`guides/query-options.md`, `reference/queryOptions.md`, `typescript.md`) Co-locate key+fn+options; runtime no-op, huge TS win: `options().queryKey` carries the `queryFn` return type so `getQueryData`/`setQueryData` are typed. **This is exactly what the tRPC proxy generates for orbweaver** — every `trpc.x.y.queryOptions(args)` _is_ a `queryOptions` result.

### Network mode + refetch triggers

- **`networkMode`** (`guides/network-mode.md`): `'online'` (default — pause when offline, `fetchStatus:'paused'`), `'always'` (ignore connectivity), `'offlineFirst'` (run once then pause retries; for SW/HTTP-cache). `refetchOnReconnect` defaults `true` in `online`, `false` in `always`.
- **`refetchOnMount` / `refetchOnWindowFocus` / `refetchOnReconnect`** (default all `true`): each refetches **only if the data is stale**. `"always"` ignores staleness (blocked by `'static'`). All take `(query)=>...`.
- **`refetchInterval` / `refetchIntervalInBackground`** (`guides/polling.md`): polling, independent of `staleTime`; fn form `(query)=>ms|false`. Each observer runs its own timer; concurrent fetches dedupe at query level.

### Retries

- (`guides/query-retries.md`) Queries default `retry:3` w/ exponential backoff `min(1000*2**n, 30_000)`; mutations default `retry:0`. `0` on server. `retry` can be `(failureCount,error)=>bool`. `failureReason` exposes the error during retries.

### Cancellation (`signal`)

- (`guides/query-cancellation.md`) Every `queryFn` gets `context.signal`; consuming it makes the query cancellable (unmount/stale/`cancelQueries` aborts the promise and reverts state). **Cancellation does NOT work with suspense hooks.** tRPC wires `signal` through automatically.

### Invalidation + query-filters model

- (`guides/query-invalidation.md`, `guides/filters.md`, `reference/QueryClient.md`) `invalidateQueries({queryKey, exact?, predicate?, refetchType?})`: marks matching stale (overrides `staleTime`) + refetches **active** by default. `refetchType: 'active'|'inactive'|'all'|'none'`. Filters also support `type`, `stale`, `fetchStatus`. Philosophy quote: prefer **targeted invalidation + background refetch + atomic updates** over manual normalized-cache maintenance.

### Optimistic updates (two flavors)

- (`guides/optimistic-updates.md`) **Variables flavor**: read `mutation.variables` + `isPending` to render a pending row; no cache writes, no rollback. Best when _one_ place shows it. **Cache flavor**: `onMutate` → `cancelQueries(key)` → snapshot `getQueryData` → `setQueryData` → return snapshot → `onError` rollback → `onSettled` invalidate. Best when _multiple_ readers must reflect it.

### Infinite + `maxPages`

- (`guides/infinite-queries.md`, `reference/useInfiniteQuery.md`) `data.pages`/`pageParams`, required `initialPageParam`+`getNextPageParam` (return `undefined|null` = no more). `maxPages` caps stored pages (needs both `getNextPageParam`+`getPreviousPageParam`). Refetch re-fetches pages **sequentially** from the first. `placeholderData: keepPreviousData` works here too. Single in-flight fetch per infinite query; guard `fetchNextPage` with `!isFetching`.

### Prefetching + `ensureQueryData`

- (`guides/prefetching.md`, `reference/QueryClient.md`) `prefetchQuery` (never throws/returns, uses default `staleTime` unless passed) vs `fetchQuery` (throws/returns) vs `ensureQueryData` (returns cached if present, else fetch; `revalidateIfStale` opt). Prefetch on `onMouseEnter`/`onFocus`, in-component (ignored `useQuery` w/ `notifyOnChangeProps:[]`), in the `queryFn`, in effects, or via router loaders. For suspense, use `usePrefetchQuery`/`usePrefetchInfiniteQuery` _before_ the suspense boundary.

### Suspense + error boundaries + `throwOnError`

- (`guides/suspense.md`, `reference/useSuspenseQuery.md`, `QueryErrorResetBoundary.md`) `useSuspenseQuery` → `data` always defined, no `enabled`/`placeholderData`/`throwOnError`. Suspense queries in one component run **serially** → use `useSuspenseQueries` for parallel. Default suspense throw rule: `throwOnError: (e,q)=> typeof q.state.data === 'undefined'` (stale data keeps rendering through a background error). `QueryErrorResetBoundary`/`useQueryErrorResetBoundary` `reset()` ↔ react-error-boundary `onReset` is the documented retry handshake. Wrap key changes in `startTransition` to avoid fallback flash. Cancellation off under suspense.

### `skipToken`

- (`guides/disabling-queries.md`, `typescript.md`) Type-safe disable: `queryFn: cond ? () => fetch(x) : skipToken`. Behaves like `enabled:false` but keeps `data` typed and **forbids the fake-id sentinel**. Caveat: `refetch()` won't work with `skipToken` (throws "Missing queryFn") — use `enabled:false` if you need imperative `refetch`.

### Global callbacks: QueryCache / MutationCache

- (`reference/QueryCache.md`, `reference/MutationCache.md`) `new QueryCache({onError,onSuccess,onSettled})` + `new MutationCache({onMutate,onError,onSuccess,onSettled})`: **always fire, can't be overridden** by per-call options. The blessed home for global toasts/logging — especially since v5 **removed per-query `onSuccess`/`onError`/`onSettled`**. Carry per-query messaging via `meta`.

### Request waterfalls / dedup

- (`guides/request-waterfalls.md`, `guides/parallel-queries.md`) Same key → shared cache entry, concurrent fetches dedupe. Avoid serial/dependent/nested/code-split waterfalls; flatten by hoisting, `useQueries`/`useSuspenseQueries`, prefetch, or API redesign. `useQueries` `combine` merges results (memoize it).

### `persistQueryClient` / persisters

- (`plugins/persistQueryClient.md`, `createPersister.md`, `createAsyncStoragePersister.md`) Whole-client persist (`PersistQueryClientProvider`, `gcTime ≥ maxAge`, `buster` on deploy) vs experimental per-query `createPersister` (wraps `queryFn`, `networkMode` → `offlineFirst`, `setQueryData` NOT persisted). `createSyncStoragePersister` is **deprecated** → use async one. `broadcastQueryClient` (experimental) syncs cache across tabs via BroadcastChannel.

### Devtools

- (`devtools.md`) `@tanstack/react-query-devtools`, dev-only by default, lazy-loadable in prod. Floating or embedded panel; observes mutations too. Browser-extension variants exist.

### eslint plugin

- (`eslint/*`) `flat/recommended` + `flat/recommended-strict`. Rules: `exhaustive-deps`, `no-rest-destructuring`, `stable-query-client`, `no-unstable-deps`, `infinite-query-property-order`, `mutation-property-order`, `no-void-query-fn`, and (strict-only) `prefer-query-options`.

---

## B. The verdict — per area

| Area                                                                                                         | Verdict                                                | Doc basis                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| tRPC proxy = key+fn factory (`queryOptions` everywhere)                                                      | ✅ CORRECT                                             | `typescript.md` "Typing Query Options", `eslint/prefer-query-options.md` — codegen `queryOptions` IS the recommended shape; the `no-array-literal-querykey` gate is stricter than but aligned with `prefer-query-options`. |
| `staleTime: Infinity` globally, bus drives freshness                                                         | ✅ CORRECT (use `Infinity`, never `'static'`)          | `important-defaults.md` (Infinity → only manual invalidation refetches; `'static'` blocks even invalidation), `query-invalidation.md` (invalidate overrides staleTime).                                                    |
| `refetchOnReconnect` ON                                                                                      | 🔼 SHOULD-ADOPT / KEEP ON                              | `network-mode.md` + `important-defaults.md` — SSE drops while offline; reconnect refetch is the catch-up for events the bus missed. Turning it OFF is the real mistake.                                                    |
| `refetchOnWindowFocus`                                                                                       | ✅ CORRECT either way (lean OFF)                       | `window-focus-refetching.md` — with a live SSE bus + `staleTime:Infinity` it's a no-op unless invalidated, so harmless; turn OFF to kill redundant churn.                                                                  |
| `refetchInterval` polling                                                                                    | ⏭️ CORRECTLY-SKIP                                      | `polling.md` — the SSE bus replaces polling; don't reintroduce per-observer timers.                                                                                                                                        |
| bus `onData` → buffer local + `invalidateQueries(readKey)`, never a 2nd store                                | ✅ CORRECT (this is the documented model)              | `query-invalidation.md` "targeted invalidation, background-refetching, atomic updates"; caveats below.                                                                                                                     |
| central `invalidation.ts` event→`queryFilter` seam                                                           | ✅ CORRECT                                             | `guides/filters.md` + `invalidations-from-mutations.md` — single mapping, precise filters; matches the prescribed pattern.                                                                                                 |
| stream writes only through reducer (no `setQueryData` in subscription body)                                  | ✅ CORRECT (conscious divergence from `streamedQuery`) | `reference/streamedQuery.md` exists but is per-`queryFn` AsyncIterable; doesn't fit a cross-query SSE bus. See F.                                                                                                          |
| `skipToken` replaces fake-disabled-id                                                                        | 🔼 SHOULD-ADOPT                                        | `disabling-queries.md`, `typescript.md` — exact replacement; mind the `refetch()` caveat.                                                                                                                                  |
| `<QueryBoundary>` = `QueryErrorResetBoundary`↔`ErrorBoundary onReset` + `useSuspenseQuery` + `useTransition` | ✅ CORRECT (documented verbatim)                       | `suspense.md`, `QueryErrorResetBoundary.md`. Gotchas: serial suspense, default throw rule, no cancellation.                                                                                                                |
| `createEntityMutation` optimistic = **cache flavor**                                                         | ✅ CORRECT for multi-reader                            | `optimistic-updates.md` "multiple places → manipulate cache". Variables flavor only if single render site.                                                                                                                 |
| per-mutation sticky single error slot                                                                        | ✅ CORRECT                                             | `mutations.md` + `migrating-to-v5.md` — v5 mutation errors persist until next `mutate`/`reset`; one slot avoids multiplex.                                                                                                 |
| `persistQueryClient` for offline                                                                             | ⏭️ CORRECTLY-SKIP (for now)                            | `persistQueryClient.md`, `createPersister.md` — bus is source of truth; persisted cache is stale-on-load and `setQueryData` isn't persisted. Revisit only for cold-start paint.                                            |
| Global toasts via QueryCache/MutationCache `onError`                                                         | 🔼 SHOULD-ADOPT (coexists with per-mutation slot)      | `QueryCache.md`, `MutationCache.md`, `migrating-to-v5.md` (per-query callbacks removed).                                                                                                                                   |
| `maxPages` + `keepPreviousData` + virtualization in `createCollectionSurface`                                | ✅ CORRECT                                             | `infinite-queries.md`, `paginated-queries.md`.                                                                                                                                                                             |
| `flat/recommended-strict` into the gate battery                                                              | 🔼 SHOULD-ADOPT                                        | `eslint/eslint-plugin-query.md` + rule pages.                                                                                                                                                                              |
| SSR / hydration / Server Components                                                                          | ⏭️ CORRECTLY-SKIP                                      | `ssr.md`, `advanced-ssr.md` — Vite SPA; no SSR seam. (Note: advanced-ssr explicitly recommends tRPC for client fetching and warns against Server Actions in `queryFn`.)                                                    |

---

## C. The concrete `QueryClient` `defaultOptions` (highest-value output)

```ts
import { QueryClient, QueryCache, MutationCache } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Bus drives freshness. invalidate() always overrides staleTime, so the SSE
      // seam still forces refetches exactly when the server changed.
      // Infinity (NOT 'static'): 'static' would make invalidateQueries() a no-op and
      // silently break the bus->cache seam. important-defaults.md is explicit on this.
      staleTime: Infinity,

      // Unused screens GC after 5 min (default). Cheap; on return either cache is
      // still valid or the bus already invalidated it -> refetch on remount.
      // Bump to e.g. 30*60_000 only if you want instant back-nav paint on big screens.
      gcTime: 5 * 60 * 1000,

      // Single tRPC host. 2 retries swallows transient blips without a long error tail.
      // (Library default 3 is also fine; 2 is a mild latency tuning.)
      retry: 2,
      // default exponential backoff is good; leave retryDelay unset.

      // SSE bus already pushes server changes -> focus refetch is redundant noise.
      // (Harmless with staleTime:Infinity, but off keeps Network tab clean.)
      refetchOnWindowFocus: false,

      // KEEP ON. While offline the SSE stream is dead and bus events are missed;
      // reconnect is the catch-up. networkMode:'online' makes reconnect meaningful.
      refetchOnReconnect: true,

      // Default true. With staleTime:Infinity this only fetches when there is NO cached
      // data (first mount) OR the bus invalidated the key -> correct.
      refetchOnMount: true,

      networkMode: "online", // default; real single-host network dependency
      structuralSharing: true, // default; stable refs play well with React Compiler
      throwOnError: false, // plain useQuery returns errors as state; <QueryBoundary>
      // uses useSuspenseQuery which has its own throw rule.
    },
    mutations: {
      retry: 0, // default; never auto-retry writes (idempotency risk)
      networkMode: "online",
      // throwOnError stays false: the per-mutation error channel renders inline;
      // global side-effects go through MutationCache.onError below.
    },
  },
  queryCache: new QueryCache({
    // Global query-failure toasts; read message off query.meta (per-query callbacks
    // were removed in v5, meta is the sanctioned carrier).
    onError: (error, query) => {
      /* toastFromMeta(query.meta, error) */
    },
  }),
  mutationCache: new MutationCache({
    // Always-fires global write-failure toast; coexists with the per-mutation slot.
    onError: (error, _vars, _ctx, mutation) => {
      /* toast(error, mutation.meta) */
    },
  }),
});
```

Reasoning recap of the load-bearing knobs:

- **`staleTime: Infinity` not `'static'`** — `'static'` is documented as stricter and _ignores `invalidateQueries`_; that would silently neuter your entire bus→cache seam.
- **`refetchOnReconnect: true`** — the one default you must NOT flip off; it's the SSE-gap closer.
- **`refetchOnWindowFocus: false`** — pure noise reduction; the bus owns liveness.
- **`gcTime` stays finite** — the bus re-invalidates on return, so you don't need `Infinity`; finite GC keeps the chat/RP cache from ballooning.

---

## D. TypeScript best practices (`typescript.md` + reference)

- **Let inference flow**: typed `queryFn` → typed `data` (`Group[] | undefined`). Extract fetchers to typed fns (most clients return `any`). For orbweaver the tRPC proxy already returns precise types, so this is free.
- **`queryOptions` helper** is the type backbone: `options().queryKey` knows the `queryFn` type, making `getQueryData(options().queryKey)` typed without a generic. tRPC's `*.queryKey(args)` gives orbweaver this property — use it directly in the bus invalidation seam (the same key the reader uses), which is also enforced by `prefer-query-options`'s key-reuse rule.
- **`skipToken`**: the type-safe disable. `queryFn: id ? () => api(id) : skipToken` keeps `data` typed; replaces `castId<X>("") + enabled`.
- **Register a global error** (`declare module '@tanstack/react-query' { interface Register { defaultError: AppError } }`) so `error` is your contracts-layer error type everywhere with no per-call generics. Set `defaultError: unknown` if you want to _force_ narrowing at call sites. Can also register `queryMeta`/`mutationMeta` (must extend `Record<string,unknown>`) and even global `queryKey`/`mutationKey` shapes.
- **Narrow via discriminated union**: check `isSuccess`/`status==='success'` to make `data` defined; `useSuspenseQuery` removes the need (data always defined).
- **`select` typing**: inference works on `useQuery`; on **`useQueries`/`useSuspenseQueries` inline `select` falls back to `unknown`** (TS #6556) — annotate the param or define via `queryOptions`. Relevant if `createCollectionSurface` ever fans out with `useQueries`.
- **Don't widen error generics positionally** (`useQuery<T, string>`) — it kills all other inference; prefer narrowing or `Register`.
- **`DefinedInitialDataOptions`**: when `initialData` is a non-undefined value, `data` is typed as defined (no `| undefined`). Mostly irrelevant given orbweaver seeds via prefetch/SSE, not `initialData`.

---

## E. Adopt-into-primitives shortlist

1. **`createEntityMutation` → cache-flavor optimistic** (`optimistic-updates.md`): `onMutate` cancel `readKey` → snapshot → `setQueryData` → return ctx; `onError` rollback from ctx; `onSettled` → `invalidate(event)` through the central seam. _Why: multiple readers must reflect the change; rollback + invalidate is the documented multi-reader recipe._
2. **`createEntityMutation` error reset** (`mutations.md`): expose/auto-call `reset()` on next `mutate` — v5 errors are sticky. _Why: one clean error slot, satisfies `no-multiplexed-mutation-error`._
3. **`createEntityMutation` property order** (`eslint/mutation-property-order.md`): emit `onMutate → onError → onSettled` order (inference-sensitive). _Why: free correctness + matches strict lint._
4. **`createCollectionSurface`**: `infiniteQueryOptions` + `maxPages` (bi-directional `getNext/PreviousPageParam`) + `placeholderData: keepPreviousData` + guard `fetchNextPage` with `hasNextPage && !isFetching`; property order `queryFn → getPreviousPageParam → getNextPageParam` (`eslint/infinite-query-property-order.md`). _Why: memory + sequential-refetch cost control; jump-free pagination; lint-clean._
5. **`<QueryBoundary>`**: `QueryErrorResetBoundary` `reset` → `ErrorBoundary onReset`, children use `useSuspenseQuery`, wrap key transitions in `useTransition`/`startTransition`; use `useSuspenseQueries` when a boundary needs >1 query (avoid serial waterfall). _Why: verbatim documented handshake + the parallel-suspense fix._
6. **prefetch-on-intent**: `queryClient.prefetchQuery(options)` on `onMouseEnter`/`onFocus` (set a `staleTime` on the prefetch call), or `usePrefetchQuery` before a suspense boundary. Use `ensureQueryData` when you need the value and want to skip refetch if cached. _Why: documented render-as-you-fetch._
7. **Global toasts** via `QueryCache.onError` + `MutationCache.onError`, message carried in `meta` (typed via `Register.queryMeta/mutationMeta`). _Why: only sanctioned global hook after v5 removed per-query callbacks; keeps per-mutation slot for inline UI._
8. **`skipToken`** baked into the disabled-query helper. _Why: type-safe, kills the fake-id sentinel; document the `refetch()` caveat so nobody reaches for it on a skipToken query._
9. **Gate battery**: adopt `flat/recommended-strict` (adds `prefer-query-options`) plus keep `no-rest-destructuring` (tracked-properties), `no-unstable-deps`, `stable-query-client`, `no-void-query-fn`. _Why: machine-enforces the render-optimization + key-reuse rules orbweaver already wants._

---

## F. Are we doing anything WEIRD? (blunt, doc-backed)

1. **Hand-rolled SSE bus + `applyChatBusEvent` reducer instead of `experimental_streamedQuery`** (`reference/streamedQuery.md`). The lib now ships a first-class streaming-into-cache helper (`refetchMode: append|reset|replace`, custom `reducer`, `initialValue`) and a chat example. Orbweaver reinvents it. **Verdict: defensible, not weird** — `streamedQuery` is per-`queryFn` over an AsyncIterable and `experimental`; orbweaver's bus is cross-cutting (one stream feeds many query keys) and must stay decoupled from any single `queryFn`. _Flag it as a conscious divergence in the ledger so a future agent doesn't "simplify" toward streamedQuery and break the cross-query model._

2. **`staleTime: Infinity` global is unusual** for a typical app (most pick a finite staleTime), but **correct here** given precise bus invalidation (`important-defaults.md`). The actual risk is someone reaching for **`staleTime: 'static'`** thinking it's "more Infinity" — `'static'` _ignores `invalidateQueries`_ and would silently break the bus seam. **Recommend a gate/lint banning `'static'` on bus-backed query keys.**

3. **Invalidate-only on bus events when the event payload may already contain the new data.** `updates-from-mutation-responses.md` shows you can `setQueryData` from a server payload to skip the refetch roundtrip. Orbweaver deliberately invalidates (extra fetch) for reads and only the reducer writes stream data. **Verdict: correct trade** — `query-invalidation.md` explicitly prefers targeted-invalidate + atomic refetch over hand-maintained cache writes; just know the extra roundtrip is a _chosen_ cost, and the `no-inline-cache-surgery-in-stream` gate is what enforces it.

4. **Gate boundary risk for optimistic writes.** `no-inline-cache-surgery-in-stream` bans `setQueryData` in component/subscription bodies — but the **cache-flavor optimistic update legitimately calls `setQueryData` inside `createEntityMutation`'s `onMutate`**. Make sure the gate scopes to _stream/subscription_ bodies, not mutation `onMutate`, or the correct optimistic primitive trips the gate.

5. **Turning `refetchOnReconnect` off would be the real bug**, not a quirk. If anyone disables it "because the bus handles updates," they lose the catch-up for events missed while the SSE socket was down (`network-mode.md`). Bake `refetchOnReconnect: true` into defaults and leave a comment.

6. **`useSuspenseQuery` can't be conditionally disabled** (no `enabled`/`skipToken`). If a `<QueryBoundary>`-wrapped component ever needs a conditional/dependent query, that's a `useQuery + enabled/skipToken` case _outside_ suspense, or a restructure — don't fight it inside suspense (`suspense.md`). Also remember suspense queries in one component are **serial**; reach for `useSuspenseQueries`.

Nothing else in the plan reads as anti-pattern: codegen keys, central invalidation seam, per-mutation error slots, and the reducer-owns-stream rule all line up with documented v5 guidance.

---

## G. Open forks for Nate

1. **`gcTime`**: keep default 5 min, or bump (e.g. 30 min) so heavy chat/RP screens repaint instantly on back-nav? Trade-off: memory vs paint latency. Bus re-invalidates either way, so correctness is identical — purely UX/memory.
2. **`refetchOnWindowFocus`**: hard `false` (my lean — bus owns liveness) vs leave default `true` (no-op while fresh, but a cheap safety net if the SSE socket silently wedged without firing `offline`). Pick based on how much you trust SSE reconnection detection.
3. **`retry`**: `2` (tuned) vs library default `3`. Marginal; affects worst-case error latency on a flaky single host.
4. **`'static'` ban gate**: worth a dedicated lint/gate, or just a ledger note + code-review? Given the apparatus philosophy, a gate seems on-brand since misuse silently disables the bus seam.
5. **Multi-tab**: orbweaver is multi-human but is it multi-tab-per-human? If yes, the SSE bus already exists per tab so each tab self-syncs — `broadcastQueryClient` is redundant (and experimental). Confirm tabs each hold their own SSE connection; if some tabs _don't_, broadcast could matter. Likely SKIP.
6. **Offline/persistence**: confirmed deferred. When you revisit, prefer per-query `createPersister` (lazy, query-hash keyed) over whole-client persist — but note `setQueryData` (your optimistic + reducer writes) is **not** persisted, so an offline reload loses optimistic state. The SSE-truth model makes persistence a cold-start-paint feature only, not a correctness feature.
7. **Global error `Register`**: set `defaultError` to your contracts `AppError` (ergonomic) or `unknown` (forces narrowing at every call site — more rigorous, more friction). The orbweaver "boundaries are physics" ethos might favor `unknown`.
