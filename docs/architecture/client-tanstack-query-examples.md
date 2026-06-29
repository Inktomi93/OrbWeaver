# TanStack Query — Official React Examples Digest (for orbweaver client foundation)

Source: shallow clone of `github.com/TanStack/query` → `examples/react/*`.
All 10 target dirs exist verbatim. Every file read end-to-end.
Version baseline across the board: **`@tanstack/react-query` `^5.101.2`**, devtools `^5.101.2`, React 19, TypeScript 5.8.3. Next.js examples on `next@^16`, Vite examples on `vite@^6`.

A standing note for the orbweaver mapping: every example here hand-writes `queryKey: [...]` literal arrays and an inline `queryFn`. **For us those literal arrays are MOOT** — the `@trpc/tanstack-react-query` proxy IS the key+fn factory (`trpc.x.y.queryOptions(input)` returns `{queryKey, queryFn}`). So when an example shows `queryOptions({queryKey, queryFn})`, read it as "this is exactly what the tRPC proxy hands us already." The *patterns wrapped around* those keys (optimistic cache surgery, invalidation, prefetch, placeholderData, suspense wiring) are what's reusable, not the key literals.

---

## 1. chat (`examples/react/chat`)

**Purpose:** Streaming chat answers token-by-token into a single query's cache using the experimental streamed-query API. The query's `data` is an array that grows as the stream yields.

**Versions/deps:** `@tanstack/react-query ^5.101.2`, devtools, react 19, tailwind v4 + `@tailwindcss/vite`, vite 6. No router, no backend — the "stream" is a local async generator.

**TanStack Query API/options inventory:**
- `queryOptions({ queryKey, queryFn, staleTime })` — `src/chat.ts`. `staleTime: Infinity` (a completed chat answer never goes stale / never re-streams on its own).
- `experimental_streamedQuery as streamedQuery` — imported from `@tanstack/react-query`. Called as `queryFn: streamedQuery({ streamFn: () => chatAnswer(question) })`.
  - `streamFn` returns an **async iterable** (object with `[Symbol.asyncIterator]` async generator that `yield`s chunks). `streamedQuery` adapts an async generator into a query whose `data` accumulates the yielded chunks into an **array** (`data` is `string[]` here — each yielded word appended).
  - While the generator is still yielding, `useQuery(...).isFetching` stays `true`; `data` is the partial array so far.
- `useQuery(chatQueryOptions(question))` — `src/index.tsx`. Destructures `{ error, data = [], isFetching }`. `data = []` default so first render before any chunk is a clean empty array.
- `new QueryClient()` default config, `QueryClientProvider`, `ReactQueryDevtools` (no props).

**Non-obvious mechanics worth copying:**
- The streaming UI state is derived purely from the query: `isFetching` → render the "…" in-progress affordance; `data.join(' ')` → the message body. There is **no separate "streaming buffer" state in React** — the cache IS the buffer. That's the whole trick.
- Each question is its own query keyed `['chat', question]`; the list view just maps questions to `<ChatMessage>` components, each owning its own streamed query. Cache key = message identity.
- `streamedQuery` default reducer is "append to array." (v5 also supports a `reducer` option in newer builds, but this example uses the default array accumulation.)

**Orbweaver mapping:**
- **Feeds:** the **chat message cache + stream lifecycle** primitive directly. This is the closest official analog to our "ghost row holds streaming tokens until commit."
- **ADOPT the principle, not the mechanism:** "the cache is the stream buffer; UI state derives from `isFetching` + accumulated `data`." Our ghost row = exactly this accumulation, but fed by **SSE → `applyChatBusEvent` reducer**, not by `streamedQuery`'s local async generator.
- **SKIP `experimental_streamedQuery` itself.** Our stream source is a server-authoritative SSE event bus reduced through a discriminated union, not a client-side async iterator over an HTTP body. `streamedQuery` is the wrong seam — it owns the reducer and the accumulation policy, which our DU reducer must own. Note it as the "what TanStack would do if you let Query own streaming" baseline, then keep our reducer authoritative.
- `staleTime: Infinity` on a settled chat turn IS worth copying — a committed message never self-refetches.

---

## 2. optimistic-updates-cache (`examples/react/optimistic-updates-cache`)

**Purpose:** The **canonical cache-surgery optimistic update**: `onMutate` writes the optimistic value into the query cache, snapshots the prior value, rolls back on error, invalidates on settle. This is the textbook pattern our `createEntityMutation` is modeled on.

**Versions/deps:** RQ `^5.101.2`, next 16, react 19. Backend = Next API route with artificial 1s latency and a **30% random failure** (`Math.random() > 0.7 → 500`) to exercise rollback.

**TanStack Query API/options inventory (`src/pages/index.tsx`):**
- `queryOptions({ queryKey: ['todos'], queryFn: fetchTodos })` — module-level `todoListOptions`. Note `fetchTodos({ signal })` consumes the **`AbortSignal`** Query passes into the queryFn (`fetch('/api/data', { signal })`) — query cancellation is wired through to fetch.
- `useQuery(todoListOptions)` — destructures `{ isFetching, ...queryInfo }`.
- `useMutation({ mutationFn, onMutate, onError, onSettled })` — the full optimistic lifecycle:
  - `mutationFn: async (newTodo: string) => { POST; return json }`.
  - **`onMutate: async (newTodo, context)`** — note v5.101 signature passes a **`context`** object that carries `context.client` (the QueryClient). Steps, in order:
    1. `setText('')` — side effect (clear input) on mutate.
    2. `await context.client.cancelQueries(todoListOptions)` — **cancel in-flight refetches** so they can't clobber the optimistic write.
    3. `const previousTodos = context.client.getQueryData(todoListOptions.queryKey)` — **snapshot**.
    4. `if (previousTodos) context.client.setQueryData(todoListOptions.queryKey, { ...previousTodos, items: [...previousTodos.items, { id: Math.random()..., text: newTodo }] })` — **optimistic write** (append with a temp client id).
    5. `return { previousTodos }` — the snapshot becomes the mutation's onMutate-result/rollback context.
  - **`onError: (err, variables, onMutateResult, context)`** — `if (onMutateResult?.previousTodos) context.client.setQueryData<Todos>(['todos'], onMutateResult.previousTodos)` — **rollback** to snapshot.
  - **`onSettled: (data, error, variables, onMutateResult, context) => context.client.invalidateQueries({ queryKey: ['todos'] })`** — **always refetch** (success OR error) to reconcile with server truth.
- `useQueryClient()` is still called in the component but the example threads the client via the `context` arg inside callbacks (the modern v5.101 way).
- UI reads `queryInfo.isSuccess` (narrowing), `queryInfo.data.ts`, `isFetching` ("Updating in background…"), `queryInfo.isLoading`, `addTodoMutation.isPending` (disable button).
- `ReactQueryDevtools initialIsOpen`.

**Non-obvious mechanics worth copying:**
- The **strict 4-step onMutate order** (cancel → snapshot → write → return snapshot) is the load-bearing recipe. Skipping `cancelQueries` is the classic optimistic bug (a slow in-flight GET lands after your optimistic write and reverts the UI).
- Rollback reads from the **returned onMutate result**, not from a closure variable — survives concurrent mutations correctly.
- `onSettled` invalidates on both paths — never trust the optimistic value as final.
- `context.client` inside callbacks means the factory doesn't need to close over `useQueryClient()`.

**Orbweaver mapping:**
- **THE blueprint for `createEntityMutation`.** Bake all four phases in: `onMutate`(cancel+snapshot+apply updater+return rollback), `onError`(restore snapshot + push the per-mutation error to our error channel + toast), `onSettled`(central invalidation). 
- **ADOPT:** cancel-before-write; snapshot/rollback via returned context; settle-always-invalidate. Use the **`context.client`** arg form (don't close over the client) so the factory is provider-agnostic.
- **tRPC adaptation:** replace `['todos']` literals with `trpc.todos.list.queryKey()` / `queryOptions()`. `setQueryData` updater stays identical. Our invalidation target is `trpc.todos.list.queryKey()` (or a broader `trpc.todos.queryKey()` filter).
- **Sticky-error note:** this example only surfaces error via rollback; it doesn't show the v5 "mutation error is sticky" gotcha. Our factory must expose a **per-mutation error channel** that's reset on the next `mutate` — that's our addition, the example doesn't cover reset.
- **SKIP:** `Math.random()` temp ids in prod — fine for demo; we should mint deterministic temp ids (injected id generator, per our determinism gate). `setText('')` in onMutate is form glue, not a Query pattern.

---

## 3. optimistic-updates-ui (`examples/react/optimistic-updates-ui`)

**Purpose:** The **lighter optimistic variant** — DON'T touch the cache; instead render `mutation.variables` directly in the list while `isPending`, and show a retry affordance while `isError`. No `onMutate`, no snapshot, no rollback.

**Versions/deps:** identical to optimistic-updates-cache (RQ `^5.101.2`, next 16). Same flaky 30% backend.

**TanStack Query API/options inventory (`src/pages/index.tsx`):**
- `useQuery({ queryKey: ['todos'], queryFn: fetchTodos })` wrapped in a `useTodos()` hook.
- `useMutation({ mutationFn, onSettled })` — **only** `onSettled: () => queryClient.invalidateQueries({ queryKey: ['todos'] })`. mutationFn throws on `!response.ok` so the mutation enters error state.
- **The pattern is the read side, not callbacks:** the component reads mutation state directly:
  - `addTodoMutation.isPending && <li style={{opacity:0.5}}>{addTodoMutation.variables}</li>` — render the **in-flight variable** as a ghost row (greyed).
  - `addTodoMutation.isError && <li style={{color:'red'}}>{addTodoMutation.variables} <button onClick={() => addTodoMutation.mutate(addTodoMutation.variables)}>Retry</button></li>` — error row with **retry by re-mutating `.variables`**.
- `useQuery` state reads: `isSuccess`, `data.ts`, `isFetching`, `isPending`.

**Non-obvious mechanics worth copying:**
- `mutation.variables` is a first-class render source: you don't need to write to the cache to show an optimistic row. The pending item lives entirely in mutation state and **vanishes automatically** when `onSettled` invalidation brings the real row.
- Retry = `mutate(mutation.variables)` — no extra state.
- This is strictly simpler than #2: no cancel, no snapshot, no rollback. Cost: the optimistic row renders *outside* the list ordering (appended), and only works for a single in-flight item cleanly.

**Orbweaver mapping:**
- **Feeds `createEntityMutation` as the "lightweight mode."** Two optimistic strategies exist; the factory should let a call site choose **cache-surgery** (#2, for reorder/inline-edit where position matters) vs **variables-render** (#3, for append-only "create" where a ghost row at the end is fine).
- **ADOPT:** exposing `mutation.variables` + `isPending`/`isError` to the surface so a list can render a pending/failed ghost without cache writes. This maps cleanly onto a chat "sending…" bubble that isn't yet server-confirmed.
- **SKIP for chat specifically:** our chat ghost row is fed by the SSE reducer, not mutation.variables — but for non-chat entity creates (e.g. "new character"), the variables-render mode is the cheaper correct default.

---

## 4. infinite-query-with-max-pages (`examples/react/infinite-query-with-max-pages`)

**Purpose:** Bidirectional `useInfiniteQuery` with a **sliding window** (`maxPages: 3`) so the cache never grows unbounded — old pages drop as new ones load in either direction.

**Versions/deps:** RQ `^5.101.2`, next 16. Backend returns `{ data, nextId, previousId }` with cursor math; `nextId`/`previousId` become `null` at bounds.

**TanStack Query API/options inventory (`src/pages/index.tsx`):**
- `useInfiniteQuery({ queryKey, queryFn, initialPageParam, getPreviousPageParam, getNextPageParam, maxPages })`:
  - `queryFn: async ({ pageParam }) => fetch(\`/api/projects?cursor=${pageParam}\`)` — `pageParam` is injected by Query.
  - `initialPageParam: 0` — **required in v5** (the starting cursor).
  - `getNextPageParam: (lastPage) => lastPage.nextId ?? undefined` — return `undefined` to signal "no next page" (`hasNextPage = false`).
  - `getPreviousPageParam: (firstPage) => firstPage.previousId ?? undefined` — bidirectional.
  - **`maxPages: 3`** — the cache keeps at most 3 pages; fetching a 4th drops the far one. Requires BOTH `getNextPageParam` and `getPreviousPageParam` so it can re-fetch dropped pages on demand.
- Returned state used: `status` (`'pending'|'error'|'success'`), `data.pages` (array of page objects), `error`, `isFetching`, `isFetchingNextPage`, `isFetchingPreviousPage`, `fetchNextPage`, `fetchPreviousPage`, `hasNextPage`, `hasPreviousPage`.
- Render: `data.pages.map(page => page.data.map(project => ...))` — nested map over pages then items. Buttons disabled on `!hasNextPage || isFetchingNextPage`. Background-update indicator: `isFetching && !isFetchingNextPage`.

**Non-obvious mechanics worth copying:**
- `?? undefined` (not `?? null`) is the correct "stop" sentinel for `getNextPageParam` — Query checks for `undefined` (actually `null | undefined` both stop, but `undefined` is canonical).
- `maxPages` bounds memory for long feeds; the trade is you MUST supply both direction param-getters.
- `isFetching && !isFetchingNextPage` distinguishes a background refetch of existing pages from a new-page append.

**Orbweaver mapping:**
- **Feeds `createCollectionSurface`** — but with a strong caveat. Our list virtualization is sealed via **`TanStack Virtual`**, and our live updates come from **SSE, not pagination/refetch**. `useInfiniteQuery` is the right tool ONLY for genuinely paginated server collections (e.g. message history backscroll, large browse lists).
- **ADOPT `maxPages`** as the memory bound for any infinite browse surface (character/chat-history backscroll) so the cache window stays bounded — pairs naturally with `TanStack Virtual`'s windowed rendering.
- **tRPC adaptation:** tRPC exposes `trpc.x.list.infiniteQueryOptions(input, { getNextPageParam, initialPageParam })` — the `getNextPageParam`/`maxPages` go in the options arg; the key/fn come from the proxy.
- **SKIP:** the manual `queryKey`/`queryFn` and the cursor-in-URL plumbing — tRPC + our cursor contract own that.

---

## 5. load-more-infinite-scroll (`examples/react/load-more-infinite-scroll`)

**Purpose:** Same `useInfiniteQuery`, but auto-fetch the next page when a sentinel scrolls into view (`react-intersection-observer`) instead of a manual button. **No `maxPages`** (unbounded growth).

**Versions/deps:** RQ `^5.101.2`, next 16, **`react-intersection-observer ^9.16.0`**.

**TanStack Query API/options inventory (`src/pages/index.tsx`):**
- `useInfiniteQuery({ queryKey:['projects'], queryFn, initialPageParam:0, getPreviousPageParam:(firstPage)=>firstPage.previousId, getNextPageParam:(lastPage)=>lastPage.nextId })` — note: here the param-getters return the raw value (no `?? undefined`), relying on the API returning `null` at bounds. queryFn has an inline return type annotation.
- Same destructured state set as #4.
- **The new bit (not a Query API):** `const { ref, inView } = useInView()` from `react-intersection-observer`, attached to the load-more button: `<button ref={ref} ...>`. Then:
  ```
  React.useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) fetchNextPage()
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage])
  ```
- `about.tsx` is a trivial back-link page (router demo), no Query.

**Non-obvious mechanics worth copying:**
- Intersection-observer sentinel → `fetchNextPage()` is the clean "infinite scroll" trigger; the guard `inView && hasNextPage && !isFetchingNextPage` prevents duplicate fetches.
- Effect deps include `fetchNextPage` (stable identity from Query) — safe.

**Orbweaver mapping:**
- **Feeds `createCollectionSurface`'s scroll trigger.** But we use **`TanStack Virtual`** for virtualization — TanStack Virtual emits its own range/visible-index signals, so we likely DON'T need `react-intersection-observer`. The trigger becomes "TanStack Virtual's last-rendered index ≥ items.length - threshold → `fetchNextPage()`."
- **ADOPT the guard logic** (`hasNextPage && !isFetchingNextPage` before fetching) verbatim, wherever the trigger lives.
- **SKIP `react-intersection-observer`** as a dependency — TanStack Virtual's range callback supersedes it. One fewer dep (matches our "every dep is a liability" instinct even under the rigor regime, since it's our seal not the architecture). Note it only if TanStack Virtual can't cheaply report tail-proximity.
- React Compiler note: the `useEffect` dep array stays — Compiler doesn't remove effect deps, only memoization.

---

## 6. prefetching (`examples/react/prefetching`)

**Purpose:** **Prefetch-on-hover** (`onMouseEnter`) + prefetch-on-select, with a `staleTime` guard so hovering doesn't spam the network; a prefetched item is visually marked by reading `getQueryData`.

**Versions/deps:** RQ `^5.101.2`, next 16. Uses the public Rick & Morty API. `_app.tsx` creates the client via `React.useState(() => new QueryClient())` (stable per-mount client — the SSR-safe idiom).

**TanStack Query API/options inventory (`src/pages/index.tsx`):**
- `useQuery({ queryKey:['characters'], queryFn:getCharacters })` and `useQuery({ queryKey:['character', selectedChar], queryFn:()=>getCharacter(selectedChar) })`.
- **`queryClient.prefetchQuery({ queryKey:['character', char.id], queryFn:()=>getCharacter(char.id), staleTime: 10*1000 })`** in `onMouseEnter` — **`staleTime` here means "skip the prefetch if cached data is younger than 10s."** This is the key knob: prefetch is a no-op when fresh.
- `queryClient.getQueryData(['character', char.id])` — used to check "is it already cached?" to render the item **bold** (prefetched affordance).
- `_app.tsx`: `const [queryClient] = React.useState(() => new QueryClient())`.
- `[user]/[repo].tsx`: a plain `useQuery({ queryKey:['team', id], queryFn })` detail page (uses `usePathname()` as the id) — the navigation target.

**Non-obvious mechanics worth copying:**
- `prefetchQuery` + `staleTime` is the self-throttling prefetch: repeated hovers within the window don't refetch.
- `getQueryData(key)` (truthy check) is a cheap "already have it?" probe for UI affordances — no extra query, no subscription.
- The `rerender({})` hack after prefetch is just to re-evaluate the bold state in this demo; with a real subscription/Compiler you wouldn't need it.

**Orbweaver mapping:**
- **THE blueprint for our `prefetch-on-intent` primitive.** Hover/focus → `queryClient.prefetchQuery(trpc.x.detail.queryOptions(id))` with a `staleTime` guard. For a single-route SPA where opening an entity is instant, this is exactly "warm the cache on intent so the open is 0ms."
- **ADOPT:** `staleTime` on the prefetch as the throttle (pick a window, e.g. 30s); `ensureQueryData` is the better primitive when you also want the value (see below) but `prefetchQuery` (fire-and-forget) is right for hover-warm.
- **tRPC adaptation:** `queryClient.prefetchQuery(trpc.x.detail.queryOptions(id))` — proxy supplies key+fn; we only add `staleTime`.
- **SKIP:** the `rerender({})` manual-invalidation hack (React Compiler + real query subscriptions make it unnecessary); `getQueryData` truthy-probe for a "prefetched" badge is optional polish, adopt only if we want the affordance.

---

## 7. eslint-plugin-demo (`examples/react/eslint-plugin-demo`)

**Purpose:** Demonstrates `@tanstack/eslint-plugin-query` strict config + the two highest-value rules (`prefer-query-options`, `exhaustive-deps` with an allowlist). This is **our gate battery, off the shelf.**

**Versions/deps:** `@tanstack/eslint-plugin-query ^5.101.2`, `eslint ^9.39.0` (flat config), `typescript-eslint ^8.48.0`. Script: `"test:eslint": "eslint ./src"`.

**Config (`eslint.config.js`) — flat config:**
```js
import pluginQuery from '@tanstack/eslint-plugin-query'
import tseslint from 'typescript-eslint'
export default [
  ...tseslint.configs.recommended,
  ...pluginQuery.configs['flat/recommended-strict'],   // strict preset
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    rules: {
      '@tanstack/query/exhaustive-deps': ['error', {
        allowlist: { variables: ['api'], types: ['AnalyticsClient'] },
      }],
    },
  },
]
```
Note the **`flat/recommended-strict`** preset (not just `recommended`) and that `exhaustive-deps` is re-declared to add an **`allowlist`**.

**Rules demonstrated + what each catches:**
- **`@tanstack/query/prefer-query-options`** (`prefer-query-options-demo.tsx`): flags an **inline `{queryKey, queryFn}`** passed to `useQuery`/`useInfiniteQuery`/`queryClient.invalidateQueries`/`getQueryData` and tells you to use `queryOptions()` (co-locate key+fn) and to **reference the key from a `queryOptions()` result** rather than re-typing `['todos']` by hand. Passing cases: `useQuery(todosOptions)`, `useQuery({ ...todoOptions(id), select })`, `invalidateQueries({ queryKey: todosOptions.queryKey })`. Failing cases: inline literal key+fn; inline `['todos']` in `invalidateQueries`/`getQueryData`.
- **`@tanstack/query/exhaustive-deps`** (`queries.tsx` + `allowlist-demo.tsx`): flags a `queryFn` that **closes over a variable not present in the `queryKey`** (the React-Query analog of react-hooks exhaustive-deps). The **`allowlist`** suppresses it for chosen variable names (`variables: ['api']`) or chosen parameter types (`types: ['AnalyticsClient']`):
  - PASS: queryFn uses `api` (name allowlisted) or `tracker: AnalyticsClient` (type allowlisted).
  - FAIL: same code but the var is `todoApi` (name not allowlisted) or typed `ApiClient` (type not allowlisted) → "The following dependencies are missing in your queryKey: …".
- The strict preset also brings the rest of the plugin's rules (e.g. `no-rest-destructuring`, `stable-query-client`, `no-unstable-deps`) implicitly via `flat/recommended-strict`.

**Orbweaver mapping:**
- **DIRECTLY feeds the gate battery.** Adopt `@tanstack/eslint-plugin-query` at **`flat/recommended-strict`** and wire it into `pnpm check`'s lint stage. This is a machine-enforced "born compliant" gate — exactly our philosophy.
- **`exhaustive-deps` `allowlist`** is the escape hatch for injected-but-stable deps (e.g. an injected client/clock). We'll likely allowlist our DI'd singletons by type so they don't have to pollute query keys.
- **Caveat for tRPC:** since our keys are 100% proxy-derived, `prefer-query-options` largely auto-satisfies (we never hand-write keys). But the rule still earns its keep: it catches the one-off agent who reaches for a literal `['chat', id]` instead of `trpc.chat.x.queryKey()`. **Keep it on as the "no hand-rolled key" enforcer** — it mechanically forbids the exact corner-cut our CLAUDE.md warns about.
- **ADOPT verbatim.** This is the lowest-effort, highest-leverage item in the whole digest.

---

## 8. suspense (`examples/react/suspense`)

**Purpose:** `useSuspenseQuery` + React `<Suspense>` + `react-error-boundary` + `QueryErrorResetBoundary` + `useTransition` + prefetch-on-intent + `React.lazy`. The full **Suspense loading pattern** wired correctly.

**Versions/deps:** RQ `^5.101.2`, **`react-error-boundary ^4.1.2`**, vite 6, react 19. QueryClient configured with `defaultOptions: { queries: { retry: 0 } }`.

**TanStack Query API/options inventory:**
- `new QueryClient({ defaultOptions: { queries: { retry: 0 } } })` — disable retries so errors surface immediately to the boundary (demo-friendly; real apps tune this).
- **`useSuspenseQuery({ queryKey, queryFn })`** (`Projects.tsx`, `Project.tsx`) — like `useQuery` but: no `isPending` (component suspends instead); `data` is **always defined** (non-nullable) in the render path; still exposes `isFetching` for background-refetch spinners. Used as `const { data, isFetching } = useSuspenseQuery(...)`.
- **`QueryErrorResetBoundary`** (`index.tsx`) — render-prop `{({ reset }) => ...}`; `reset` is handed to the ErrorBoundary's `onReset` so "Try again" clears BOTH the error boundary AND the query error state (so the retried query actually refetches instead of re-throwing the cached error).
- **`ErrorBoundary`** from `react-error-boundary` with `fallbackRender={({ error, resetErrorBoundary }) => ...}` and `onReset={reset}`.
- **`React.Suspense fallback={<h1>Loading projects...</h1>}`** wrapping the suspending children.
- **`queryClient.prefetchQuery({ queryKey, queryFn })`** — fired on the toggle button (warm `['projects']` before showing) and on each project's "Load" button (warm `['project', full_name]` before navigating), so the suspense fallback is short/skipped.
- **`useTransition`** (`Button.tsx`) — `const [isPending, startTransition] = React.useTransition()`; clicks wrapped in `startTransition(() => onClick(e))` so navigating into a suspending view doesn't blow away the current UI with a fallback (keeps old content, shows inline spinner). 
- `React.lazy(() => import('./components/Projects'))` — code-split the suspending components.

**Non-obvious mechanics worth copying:**
- The **`QueryErrorResetBoundary` + `ErrorBoundary.onReset` handshake** is the non-obvious correct wiring — without it, "Try again" re-renders, the query is still in error state, and it throws again. `reset` clears the query error so the retry truly refetches.
- `useTransition` around a state change that mounts a suspending child = "don't flash the fallback, keep the stale UI + inline spinner." This is the smooth-transition pattern.
- `useSuspenseQuery`'s `data` is non-null → no `?.` noise in the render path. `isFetching` still available for a subtle background spinner even though loading is handled by Suspense.
- `retry: 0` makes the error path deterministic for the demo.

**Orbweaver mapping:**
- **Feeds the loading pattern (under evaluation) directly.** The triad **`useSuspenseQuery` + `<Suspense fallback={skeleton}>` + `ErrorBoundary` + `QueryErrorResetBoundary`** is the candidate. With **React 19 + Compiler + `<Activity>`**, this is a strong fit: `<Activity>` keeps a pane mounted (preserving its suspense/query state) while hidden, and Suspense handles first-load skeletons.
- **ADOPT:** the **reset handshake** (`QueryErrorResetBoundary` → `ErrorBoundary onReset`) — this is the part everyone gets wrong; bake it into our shared `<QueryBoundary>` wrapper so every surface gets correct retry-refetch for free.
- **ADOPT:** `useTransition` to avoid fallback-flash when switching the single-route shell's active pane (pairs with `<Activity>`).
- **tRPC adaptation:** `useSuspenseQuery(trpc.x.detail.queryOptions(id))`; tRPC exposes `useSuspenseQuery` on the proxy. Prefetch via `queryClient.ensureQueryData(trpc...queryOptions())` is the suspense-friendly warm (resolves the value; prefetchQuery is fire-and-forget).
- **Decision input:** Suspense gives non-null `data` (cleaner code, fits Compiler), at the cost of needing the boundary battery. Recommend adopting it behind a single `<QueryBoundary skeleton error>` primitive so call sites stay clean. 
- **SKIP:** `retry: 0` globally (that's a demo choice to force errors); `React.lazy` is orthogonal to Query (use as needed for code-split).

---

## 9. devtools-panel (`examples/react/devtools-panel`)

**Purpose:** Embed the devtools as a **controlled, manually-mounted panel** (`ReactQueryDevtoolsPanel`) toggled by app state — instead of the floating `ReactQueryDevtools` button.

**Versions/deps:** RQ `^5.101.2`, devtools `^5.101.2`, vite 6, react 19.

**TanStack Query API/options inventory (`src/index.tsx`):**
- **`ReactQueryDevtoolsPanel`** (from `@tanstack/react-query-devtools`) — the embeddable panel component (vs `ReactQueryDevtools` which is the floating launcher). Rendered conditionally: `{isOpen && <ReactQueryDevtoolsPanel onClose={() => setIsOpen(false)} />}`. Takes an **`onClose`** callback; mount/unmount is your own state (`const [isOpen, setIsOpen] = React.useState(false)`).
- A plain `useQuery({ queryKey:['repoData'], queryFn })` for content; reads `isPending`, `error`, `data`, `isFetching`.

**Non-obvious mechanics worth copying:**
- `ReactQueryDevtoolsPanel` lets you dock devtools into your OWN UI chrome (a drawer, a tab) and control visibility with app state, rather than the default corner button. `onClose` integrates with your toggle.

**Orbweaver mapping:**
- **Minor / dev-tooling.** Adopt `ReactQueryDevtoolsPanel` IF we want devtools docked into our own dev drawer (e.g. a debug pane in the single-route shell) rather than the floating button. Under our global YAGNI-for-tooling carve-out, the floating `ReactQueryDevtools` is fine unless we specifically want it embedded.
- **ADOPT only if** we build a unified debug drawer; otherwise default floating devtools. No architectural weight either way.

---

## 10. pagination (`examples/react/pagination`)

**Purpose:** Classic page-number pagination where **`placeholderData: keepPreviousData`** keeps the prior page visible (no spinner flash) while the next page loads, plus **prefetch-the-next-page** on success.

**Versions/deps:** RQ `^5.101.2`, next 16. Backend: `{ projects, hasMore }`, 1s latency.

**TanStack Query API/options inventory (`src/pages/index.tsx`):**
- **`useQuery({ queryKey:['projects', page], queryFn:()=>fetchProjects(page), placeholderData: keepPreviousData, staleTime: 5000 })`**:
  - **`placeholderData: keepPreviousData`** (imported helper) — while the new `['projects', page]` query loads, `data` shows the **previous page's data** instead of going to `pending`. Exposes **`isPlaceholderData: true`** during that window.
  - `staleTime: 5000` — each page stays fresh 5s, so paging back is instant + silent background refetch.
- **`isPlaceholderData`** drives UX: the "Next Page" button is `disabled={isPlaceholderData || !data?.hasMore}` — can't skip ahead until the real (non-placeholder) page with a known cursor has arrived.
- **Prefetch next page on success:**
  ```
  React.useEffect(() => {
    if (!isPlaceholderData && data?.hasMore) {
      queryClient.prefetchQuery({ queryKey:['projects', page+1], queryFn:()=>fetchProjects(page+1) })
    }
  }, [data, isPlaceholderData, page, queryClient])
  ```
- State reads: `status`, `data.projects`, `error`, `isFetching` (background "Loading…" since `status==='pending'` won't fire when placeholder data is shown).

**Non-obvious mechanics worth copying:**
- `keepPreviousData` + `isPlaceholderData` = "no layout thrash on page change." The old page stays put; you gate forward navigation on `!isPlaceholderData`.
- Each page is its own cache entry (`['projects', page]`), so back-navigation is instantaneous (cached) + silently revalidated.
- Prefetching `page+1` only after the current page is real (`!isPlaceholderData`) avoids prefetching off a stale cursor.
- Because placeholder data suppresses the `pending` status, you must use `isFetching` for the background indicator — `status` alone won't show loading.

**Orbweaver mapping:**
- **Feeds `createCollectionSurface`** for any **page-number** (vs infinite-scroll) browse view. `placeholderData: keepPreviousData` is the seal for "filter/search/page changes shouldn't flash empty."
- **ADOPT `keepPreviousData`** as the default for our search/filter surface: when the user types and the query key changes, keep showing the prior results (greyed/`isPlaceholderData`) instead of an empty/skeleton flash — critical with a virtualized (`TanStack Virtual`) list to avoid scroll jump.
- **ADOPT the prefetch-next-page-on-success** idiom for our prefetch primitive's "sequential" case.
- **tRPC adaptation:** `useQuery({ ...trpc.x.list.queryOptions({ page }), placeholderData: keepPreviousData, staleTime })` — spread the proxy options, add `placeholderData`/`staleTime`. (Our SSE bus, not `refetchInterval`, handles liveness.)
- **SKIP:** nothing here is moot — this is one of the most directly applicable examples for the collection surface.

---

# Master pattern / feature list (deduped across all 10)

**Query setup**
- `new QueryClient()` / `new QueryClient({ defaultOptions: { queries: { retry: 0 } } })` — client + global defaults. *(chat, suspense, all)*
- `React.useState(() => new QueryClient())` — stable per-mount client (SSR/StrictMode-safe). *(prefetching `_app.tsx`)*
- `QueryClientProvider` / `useQueryClient()` — provide & access the client. *(all)*

**Query definition**
- `queryOptions({ queryKey, queryFn, staleTime })` — co-locate key+fn (the thing the eslint plugin enforces). *(chat, optimistic-cache, eslint-demo)*
- `useQuery(options)` — basic read; state: `status/isPending/isLoading/isSuccess/isFetching/error/data`. *(most)*
- queryFn receives `{ signal }` (AbortSignal) → forward to `fetch` for cancellation. *(optimistic-cache)*
- queryFn receives `{ pageParam }` for infinite queries. *(both infinite)*
- `select: (data) => …` — derive/narrow query output (shown in eslint-demo spread). *(eslint-demo)*

**Streaming**
- `experimental_streamedQuery({ streamFn })` — adapt an async generator into a cache-accumulating query (`data` grows as chunks yield); `isFetching` = streaming. *(chat)*

**Infinite**
- `useInfiniteQuery({ queryKey, queryFn, initialPageParam, getNextPageParam, getPreviousPageParam, maxPages })`. *(both infinite)*
- `initialPageParam` (required v5), `getNextPageParam`/`getPreviousPageParam` (`?? undefined` = stop), `maxPages` (sliding-window cache bound). *(infinite-max-pages)*
- state: `data.pages`, `fetchNextPage/fetchPreviousPage`, `hasNextPage/hasPreviousPage`, `isFetchingNextPage/isFetchingPreviousPage`. *(both infinite)*
- Intersection-observer sentinel → `fetchNextPage()` with `inView && hasNextPage && !isFetchingNextPage` guard. *(load-more)*

**Pagination / transitions**
- `placeholderData: keepPreviousData` + `isPlaceholderData` — keep prior data visible across key changes, gate forward nav. *(pagination)*
- `staleTime` per-query (5s pages / `Infinity` chat / 10s prefetch throttle) — control refetch + prefetch skipping. *(pagination, chat, prefetching)*

**Mutations**
- `useMutation({ mutationFn, onMutate, onError, onSettled })` — full optimistic lifecycle. *(optimistic-cache)*
- `onMutate`: `cancelQueries` → `getQueryData` (snapshot) → `setQueryData` (optimistic write) → `return { previous }`. *(optimistic-cache)*
- `onError`: `setQueryData(key, previous)` rollback from returned context. *(optimistic-cache)*
- `onSettled`: `invalidateQueries({ queryKey })` always reconcile. *(both optimistic)*
- `context.client` arg threaded into mutation callbacks (no closure over `useQueryClient`). *(optimistic-cache)*
- Lightweight optimistic: render `mutation.variables` while `isPending`/`isError`; retry via `mutate(mutation.variables)`. *(optimistic-ui)*
- mutation state: `isPending`, `isError`, `variables`. *(optimistic-ui)*

**Imperative cache ops**
- `cancelQueries`, `getQueryData`, `setQueryData`, `invalidateQueries({ queryKey })` (with key filter). *(optimistic-cache, eslint-demo)*
- `getQueryData(key)` truthy-probe as a "is it cached?" UI affordance. *(prefetching)*

**Prefetch**
- `queryClient.prefetchQuery({ queryKey, queryFn, staleTime })` — on hover (`onMouseEnter`), on toggle, on select, on next-page. `staleTime` self-throttles. *(prefetching, suspense, pagination)*

**Suspense / loading**
- `useSuspenseQuery` — suspends instead of `isPending`; `data` non-null; still has `isFetching`. *(suspense)*
- `React.Suspense fallback` + `react-error-boundary`'s `ErrorBoundary fallbackRender`. *(suspense)*
- `QueryErrorResetBoundary` + `ErrorBoundary onReset={reset}` — retry that actually refetches. *(suspense)*
- `useTransition` around suspending state changes — avoid fallback flash, keep stale UI + inline spinner. *(suspense)*
- `React.lazy` code-split for suspending components. *(suspense)*

**Devtools**
- `ReactQueryDevtools` (floating, `initialIsOpen`) vs `ReactQueryDevtoolsPanel` (embedded, `onClose`, app-controlled mount). *(all / devtools-panel)*

**Lint gate**
- `@tanstack/eslint-plugin-query` flat config `flat/recommended-strict`. *(eslint-demo)*
- `@tanstack/query/prefer-query-options` — forbid inline key+fn / hand-written keys. *(eslint-demo)*
- `@tanstack/query/exhaustive-deps` with `allowlist.{variables,types}` — queryKey must include closed-over deps unless allowlisted. *(eslint-demo)*

---

# Adopt-into-orbweaver shortlist

**`createEntityMutation`**
- [optimistic-updates-cache] The 4-phase `onMutate` recipe (cancel → snapshot → `setQueryData` → return rollback) + `onError` restore + `onSettled` invalidate — *this IS the factory's core; it's the official canonical optimistic flow.*
- [optimistic-updates-cache] Use the **`context.client`** callback arg instead of closing over `useQueryClient()` — *makes the factory provider-clean.*
- [optimistic-updates-ui] Offer a **lightweight "variables-render" mode** (no cache write; render `mutation.variables` while pending/error) + **retry = `mutate(variables)`** — *cheaper correct default for append-only creates; the pending row auto-clears on invalidation.*
- [optimistic-updates-cache] Wire `cancelQueries` before any optimistic write — *omitting it is the #1 optimistic bug (slow GET clobbers the write).*
- (Our addition, not in examples) reset the per-mutation **sticky error** on next `mutate` — examples don't cover v5's sticky mutation error; the factory must.

**`createCollectionSurface`**
- [pagination] `placeholderData: keepPreviousData` + gate-on-`isPlaceholderData` — *no empty/skeleton flash on search/filter/page change; essential with a `TanStack Virtual` list to avoid scroll jump.*
- [pagination] Per-page cache entries + `staleTime` — *instant back-nav, silent revalidate.*
- [infinite-max-pages] `useInfiniteQuery` + **`maxPages`** sliding window — *bounded memory for backscroll/history feeds; pairs with TanStack Virtual windowing.*
- [load-more] The `inView/hasNextPage/!isFetchingNextPage` fetch guard — *adopt the guard logic on TanStack Virtual's tail-proximity signal; SKIP `react-intersection-observer` (TanStack Virtual reports range).*

**Chat message cache + stream lifecycle**
- [chat] "The cache is the stream buffer; UI derives from `isFetching` + accumulated `data`" — *adopt the principle for the ghost row.*
- [chat] `staleTime: Infinity` on a settled turn — *a committed message never self-refetches.*
- SKIP `experimental_streamedQuery` — *our SSE → `applyChatBusEvent` DU reducer must own accumulation, not Query.*

**Prefetch-on-intent**
- [prefetching] `prefetchQuery(...)` on `onMouseEnter`/focus with a **`staleTime` throttle** — *the literal blueprint; 0ms entity opens in the single-route shell.*
- [suspense] `ensureQueryData` (suspense-friendly) / `prefetchQuery` on toggle+select — *warm before showing a suspending pane.*
- [pagination] prefetch `page+1` after current page is real (`!isPlaceholderData`) — *sequential prefetch case.*

**Gate battery**
- [eslint-plugin-demo] Adopt `@tanstack/eslint-plugin-query` at **`flat/recommended-strict`** into `pnpm check` — *machine-enforced "born compliant"; lowest-effort highest-leverage item here.*
- [eslint-plugin-demo] `prefer-query-options` — *mechanically forbids hand-rolled `['chat', id]` keys → forces the tRPC proxy key, exactly the corner-cut CLAUDE.md warns about.*
- [eslint-plugin-demo] `exhaustive-deps` + `allowlist.{variables,types}` — *allowlist our injected DI singletons by type so they needn't pollute keys.*

**Loading pattern (Suspense + Activity + boundaries)**
- [suspense] The **`QueryErrorResetBoundary` → `ErrorBoundary onReset={reset}`** handshake — *bake into one `<QueryBoundary skeleton error>` so every surface gets retry-that-actually-refetches; this is the part everyone gets wrong.*
- [suspense] `useSuspenseQuery` (non-null `data`, fits Compiler) behind that boundary — *clean render paths.*
- [suspense] `useTransition` around pane switches — *no fallback flash; pairs with `<Activity>` keep-mounted.*

**Devtools (optional tooling)**
- [devtools-panel] `ReactQueryDevtoolsPanel` + `onClose` IF we build a docked debug drawer; else floating `ReactQueryDevtools`. *No architectural weight.*

---

**Output file:** this document.
**Cross-cutting tRPC caveat (applies to every example):** all literal `queryKey: [...]` arrays and inline `queryFn`s are replaced by `trpc.<router>.<proc>.queryOptions(input)` / `.infiniteQueryOptions(...)` / `.queryKey()` — the proxy is our key+fn factory, so the eslint `prefer-query-options` rule is near-auto-satisfied and the examples' manual keys are illustrative only.
