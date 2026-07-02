# UI-Lib-TanStack-Query

> **A lib companion of the nine-doc UI law set** — a full-read examples/deep-docs mine (evidence + provenance, NOT extra law; the distilled verdicts are folded into the spec sections of `UI-Architecture-and-Layout.md` / `UI-Gates-and-Lessons.md` / `UI-Primitives-and-Reuse.md`, cited per claim).
>
> **§-map (cross-doc `§N` references resolve here):** §0–§6.3.1 → `UI-Architecture-and-Layout.md` · §7–§11.8 → `UI-Gates-and-Lessons.md` · §12–§12.8 → `UI-Theming-and-Content.md` · §13–§13.6 → `UI-Primitives-and-Reuse.md`.

## Table of Contents

- [TanStack Query — Official React Examples Digest (for orbweaver client foundation)](#0226bfd6)
  - [1. chat (`examples/react/chat`)](#1033a19e)
  - [2. optimistic-updates-cache (`examples/react/optimistic-updates-cache`)](#536a62f3)
  - [3. optimistic-updates-ui (`examples/react/optimistic-updates-ui`)](#531ff493)
  - [4. infinite-query-with-max-pages (`examples/react/infinite-query-with-max-pages`)](#fea8f956)
  - [5. load-more-infinite-scroll (`examples/react/load-more-infinite-scroll`)](#43a75b07)
  - [6. prefetching (`examples/react/prefetching`)](#5e5afd7d)
  - [7. eslint-plugin-demo (`examples/react/eslint-plugin-demo`)](#66e8fcc8)
  - [8. suspense (`examples/react/suspense`)](#6fe139df)
  - [9. devtools-panel (`examples/react/devtools-panel`)](#ff4fe87e)
  - [10. pagination (`examples/react/pagination`)](#3f8cf6b9)
- [Master pattern / feature list (deduped across all 10)](#377d36fc)
- [Adopt-into-orbweaver shortlist](#1a114e3b)
- [TanStack Query v5 — Full-Docs Mining for Orbweaver's Data Layer](#0bf96638)
  - [A. Best-practice / capability map (the full surface, one or two lines each)](#770e82f6)
    - [Query basics](#46764855)
    - [`queryOptions` / `infiniteQueryOptions` / `mutationOptions`](#297649e7)
    - [Network mode + refetch triggers](#ebc666c3)
    - [Retries](#669fdd65)
    - [Cancellation (`signal`)](#5634f1a9)
    - [Invalidation + query-filters model](#0f40c5ab)
    - [Optimistic updates (two flavors)](#cd36dde2)
    - [Infinite + `maxPages`](#4b35c92a)
    - [Prefetching + `ensureQueryData`](#48e0c9af)
    - [Suspense + error boundaries + `throwOnError`](#e7f9f5b9)
    - [`skipToken`](#2e4f0493)
    - [Global callbacks: QueryCache / MutationCache](#133c61d4)
    - [Request waterfalls / dedup](#256276d3)
    - [`persistQueryClient` / persisters](#9f4f50eb)
    - [Devtools](#1989677d)
    - [eslint plugin](#67e324bf)
  - [B. The verdict — per area](#d4a8c6ce)
  - [C. The concrete `QueryClient` `defaultOptions` (highest-value output)](#4e65c77c)
  - [D. TypeScript best practices (`typescript.md` + reference)](#d1c27662)
  - [E. Adopt-into-primitives shortlist](#bb5e1253)
  - [F. Are we doing anything WEIRD? (blunt, doc-backed)](#ccafa6ed)
  - [G. Open forks for Nate](#1f2cc603)

---

<!-- Source: client-tanstack-query-examples.md -->

<a id='0226bfd6'></a>

## TanStack Query — Official React Examples Digest (for orbweaver client foundation)

Source: shallow clone of `github.com/TanStack/query` → `examples/react/*`.
All 10 target dirs exist verbatim. Every file read end-to-end.
Version baseline across the board: **`@tanstack/react-query` `^5.101.2`**, devtools `^5.101.2`, React 19, TypeScript 5.8.3. Next.js examples on `next@^16`, Vite examples on `vite@^6`.

A standing note for the orbweaver mapping: every example here hand-writes `queryKey: [...]` literal arrays and an inline `queryFn`. **For us those literal arrays are MOOT** — the `@trpc/tanstack-react-query` proxy IS the key+fn factory (`trpc.x.y.queryOptions(input)` returns `{queryKey, queryFn}`). So when an example shows `queryOptions({queryKey, queryFn})`, read it as "this is exactly what the tRPC proxy hands us already." The _patterns wrapped around_ those keys (optimistic cache surgery, invalidation, prefetch, placeholderData, suspense wiring) are what's reusable, not the key literals.

---

<!-- Source: client-tanstack-query-examples.md -->

<a id='1033a19e'></a>

### 1. chat (`examples/react/chat`)

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

<!-- Source: client-tanstack-query-examples.md -->

<a id='536a62f3'></a>

### 2. optimistic-updates-cache (`examples/react/optimistic-updates-cache`)

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

<!-- Source: client-tanstack-query-examples.md -->

<a id='531ff493'></a>

### 3. optimistic-updates-ui (`examples/react/optimistic-updates-ui`)

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
- This is strictly simpler than #2: no cancel, no snapshot, no rollback. Cost: the optimistic row renders _outside_ the list ordering (appended), and only works for a single in-flight item cleanly.

**Orbweaver mapping:**

- **Feeds `createEntityMutation` as the "lightweight mode."** Two optimistic strategies exist; the factory should let a call site choose **cache-surgery** (#2, for reorder/inline-edit where position matters) vs **variables-render** (#3, for append-only "create" where a ghost row at the end is fine).
- **ADOPT:** exposing `mutation.variables` + `isPending`/`isError` to the surface so a list can render a pending/failed ghost without cache writes. This maps cleanly onto a chat "sending…" bubble that isn't yet server-confirmed.
- **SKIP for chat specifically:** our chat ghost row is fed by the SSE reducer, not mutation.variables — but for non-chat entity creates (e.g. "new character"), the variables-render mode is the cheaper correct default.

---

<!-- Source: client-tanstack-query-examples.md -->

<a id='fea8f956'></a>

### 4. infinite-query-with-max-pages (`examples/react/infinite-query-with-max-pages`)

**Purpose:** Bidirectional `useInfiniteQuery` with a **sliding window** (`maxPages: 3`) so the cache never grows unbounded — old pages drop as new ones load in either direction.

**Versions/deps:** RQ `^5.101.2`, next 16. Backend returns `{ data, nextId, previousId }` with cursor math; `nextId`/`previousId` become `null` at bounds.

**TanStack Query API/options inventory (`src/pages/index.tsx`):**

- `useInfiniteQuery({ queryKey, queryFn, initialPageParam, getPreviousPageParam, getNextPageParam, maxPages })`:
  - `queryFn: async ({ pageParam }) => fetch(\`/api/projects?cursor=${pageParam}\`)`—`pageParam` is injected by Query.
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

<!-- Source: client-tanstack-query-examples.md -->

<a id='43a75b07'></a>

### 5. load-more-infinite-scroll (`examples/react/load-more-infinite-scroll`)

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

<!-- Source: client-tanstack-query-examples.md -->

<a id='5e5afd7d'></a>

### 6. prefetching (`examples/react/prefetching`)

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

<!-- Source: client-tanstack-query-examples.md -->

<a id='66e8fcc8'></a>

### 7. eslint-plugin-demo (`examples/react/eslint-plugin-demo`)

**Purpose:** Demonstrates `@tanstack/eslint-plugin-query` strict config + the two highest-value rules (`prefer-query-options`, `exhaustive-deps` with an allowlist). This is **our gate battery, off the shelf.**

**Versions/deps:** `@tanstack/eslint-plugin-query ^5.101.2`, `eslint ^9.39.0` (flat config), `typescript-eslint ^8.48.0`. Script: `"test:eslint": "eslint ./src"`.

**Config (`eslint.config.js`) — flat config:**

```js
import pluginQuery from "@tanstack/eslint-plugin-query";
import tseslint from "typescript-eslint";
export default [
  ...tseslint.configs.recommended,
  ...pluginQuery.configs["flat/recommended-strict"], // strict preset
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    rules: {
      "@tanstack/query/exhaustive-deps": [
        "error",
        {
          allowlist: { variables: ["api"], types: ["AnalyticsClient"] },
        },
      ],
    },
  },
];
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

<!-- Source: client-tanstack-query-examples.md -->

<a id='6fe139df'></a>

### 8. suspense (`examples/react/suspense`)

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

<!-- Source: client-tanstack-query-examples.md -->

<a id='ff4fe87e'></a>

### 9. devtools-panel (`examples/react/devtools-panel`)

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

<!-- Source: client-tanstack-query-examples.md -->

<a id='3f8cf6b9'></a>

### 10. pagination (`examples/react/pagination`)

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

<!-- Source: client-tanstack-query-examples.md -->

<a id='377d36fc'></a>

## Master pattern / feature list (deduped across all 10)

**Query setup**

- `new QueryClient()` / `new QueryClient({ defaultOptions: { queries: { retry: 0 } } })` — client + global defaults. _(chat, suspense, all)_
- `React.useState(() => new QueryClient())` — stable per-mount client (SSR/StrictMode-safe). _(prefetching `_app.tsx`)_
- `QueryClientProvider` / `useQueryClient()` — provide & access the client. _(all)_

**Query definition**

- `queryOptions({ queryKey, queryFn, staleTime })` — co-locate key+fn (the thing the eslint plugin enforces). _(chat, optimistic-cache, eslint-demo)_
- `useQuery(options)` — basic read; state: `status/isPending/isLoading/isSuccess/isFetching/error/data`. _(most)_
- queryFn receives `{ signal }` (AbortSignal) → forward to `fetch` for cancellation. _(optimistic-cache)_
- queryFn receives `{ pageParam }` for infinite queries. _(both infinite)_
- `select: (data) => …` — derive/narrow query output (shown in eslint-demo spread). _(eslint-demo)_

**Streaming**

- `experimental_streamedQuery({ streamFn })` — adapt an async generator into a cache-accumulating query (`data` grows as chunks yield); `isFetching` = streaming. _(chat)_

**Infinite**

- `useInfiniteQuery({ queryKey, queryFn, initialPageParam, getNextPageParam, getPreviousPageParam, maxPages })`. _(both infinite)_
- `initialPageParam` (required v5), `getNextPageParam`/`getPreviousPageParam` (`?? undefined` = stop), `maxPages` (sliding-window cache bound). _(infinite-max-pages)_
- state: `data.pages`, `fetchNextPage/fetchPreviousPage`, `hasNextPage/hasPreviousPage`, `isFetchingNextPage/isFetchingPreviousPage`. _(both infinite)_
- Intersection-observer sentinel → `fetchNextPage()` with `inView && hasNextPage && !isFetchingNextPage` guard. _(load-more)_

**Pagination / transitions**

- `placeholderData: keepPreviousData` + `isPlaceholderData` — keep prior data visible across key changes, gate forward nav. _(pagination)_
- `staleTime` per-query (5s pages / `Infinity` chat / 10s prefetch throttle) — control refetch + prefetch skipping. _(pagination, chat, prefetching)_

**Mutations**

- `useMutation({ mutationFn, onMutate, onError, onSettled })` — full optimistic lifecycle. _(optimistic-cache)_
- `onMutate`: `cancelQueries` → `getQueryData` (snapshot) → `setQueryData` (optimistic write) → `return { previous }`. _(optimistic-cache)_
- `onError`: `setQueryData(key, previous)` rollback from returned context. _(optimistic-cache)_
- `onSettled`: `invalidateQueries({ queryKey })` always reconcile. _(both optimistic)_
- `context.client` arg threaded into mutation callbacks (no closure over `useQueryClient`). _(optimistic-cache)_
- Lightweight optimistic: render `mutation.variables` while `isPending`/`isError`; retry via `mutate(mutation.variables)`. _(optimistic-ui)_
- mutation state: `isPending`, `isError`, `variables`. _(optimistic-ui)_

**Imperative cache ops**

- `cancelQueries`, `getQueryData`, `setQueryData`, `invalidateQueries({ queryKey })` (with key filter). _(optimistic-cache, eslint-demo)_
- `getQueryData(key)` truthy-probe as a "is it cached?" UI affordance. _(prefetching)_

**Prefetch**

- `queryClient.prefetchQuery({ queryKey, queryFn, staleTime })` — on hover (`onMouseEnter`), on toggle, on select, on next-page. `staleTime` self-throttles. _(prefetching, suspense, pagination)_

**Suspense / loading**

- `useSuspenseQuery` — suspends instead of `isPending`; `data` non-null; still has `isFetching`. _(suspense)_
- `React.Suspense fallback` + `react-error-boundary`'s `ErrorBoundary fallbackRender`. _(suspense)_
- `QueryErrorResetBoundary` + `ErrorBoundary onReset={reset}` — retry that actually refetches. _(suspense)_
- `useTransition` around suspending state changes — avoid fallback flash, keep stale UI + inline spinner. _(suspense)_
- `React.lazy` code-split for suspending components. _(suspense)_

**Devtools**

- `ReactQueryDevtools` (floating, `initialIsOpen`) vs `ReactQueryDevtoolsPanel` (embedded, `onClose`, app-controlled mount). _(all / devtools-panel)_

**Lint gate**

- `@tanstack/eslint-plugin-query` flat config `flat/recommended-strict`. _(eslint-demo)_
- `@tanstack/query/prefer-query-options` — forbid inline key+fn / hand-written keys. _(eslint-demo)_
- `@tanstack/query/exhaustive-deps` with `allowlist.{variables,types}` — queryKey must include closed-over deps unless allowlisted. _(eslint-demo)_

---

<!-- Source: client-tanstack-query-examples.md -->

<a id='1a114e3b'></a>

## Adopt-into-orbweaver shortlist

**`createEntityMutation`**

- [optimistic-updates-cache] The 4-phase `onMutate` recipe (cancel → snapshot → `setQueryData` → return rollback) + `onError` restore + `onSettled` invalidate — _this IS the factory's core; it's the official canonical optimistic flow._
- [optimistic-updates-cache] Use the **`context.client`** callback arg instead of closing over `useQueryClient()` — _makes the factory provider-clean._
- [optimistic-updates-ui] Offer a **lightweight "variables-render" mode** (no cache write; render `mutation.variables` while pending/error) + **retry = `mutate(variables)`** — _cheaper correct default for append-only creates; the pending row auto-clears on invalidation._
- [optimistic-updates-cache] Wire `cancelQueries` before any optimistic write — _omitting it is the #1 optimistic bug (slow GET clobbers the write)._
- (Our addition, not in examples) reset the per-mutation **sticky error** on next `mutate` — examples don't cover v5's sticky mutation error; the factory must.

**`createCollectionSurface`**

- [pagination] `placeholderData: keepPreviousData` + gate-on-`isPlaceholderData` — _no empty/skeleton flash on search/filter/page change; essential with a `TanStack Virtual` list to avoid scroll jump._
- [pagination] Per-page cache entries + `staleTime` — _instant back-nav, silent revalidate._
- [infinite-max-pages] `useInfiniteQuery` + **`maxPages`** sliding window — _bounded memory for backscroll/history feeds; pairs with TanStack Virtual windowing._
- [load-more] The `inView/hasNextPage/!isFetchingNextPage` fetch guard — _adopt the guard logic on TanStack Virtual's tail-proximity signal; SKIP `react-intersection-observer` (TanStack Virtual reports range)._

**Chat message cache + stream lifecycle**

- [chat] "The cache is the stream buffer; UI derives from `isFetching` + accumulated `data`" — _adopt the principle for the ghost row._
- [chat] `staleTime: Infinity` on a settled turn — _a committed message never self-refetches._
- SKIP `experimental_streamedQuery` — _our SSE → `applyChatBusEvent` DU reducer must own accumulation, not Query._

**Prefetch-on-intent**

- [prefetching] `prefetchQuery(...)` on `onMouseEnter`/focus with a **`staleTime` throttle** — _the literal blueprint; 0ms entity opens in the single-route shell._
- [suspense] `ensureQueryData` (suspense-friendly) / `prefetchQuery` on toggle+select — _warm before showing a suspending pane._
- [pagination] prefetch `page+1` after current page is real (`!isPlaceholderData`) — _sequential prefetch case._

**Gate battery**

- [eslint-plugin-demo] Adopt `@tanstack/eslint-plugin-query` at **`flat/recommended-strict`** into `pnpm check` — _machine-enforced "born compliant"; lowest-effort highest-leverage item here._
- [eslint-plugin-demo] `prefer-query-options` — _mechanically forbids hand-rolled `['chat', id]` keys → forces the tRPC proxy key, exactly the corner-cut CLAUDE.md warns about._
- [eslint-plugin-demo] `exhaustive-deps` + `allowlist.{variables,types}` — _allowlist our injected DI singletons by type so they needn't pollute keys._

**Loading pattern (Suspense + Activity + boundaries)**

- [suspense] The **`QueryErrorResetBoundary` → `ErrorBoundary onReset={reset}`** handshake — _bake into one `<QueryBoundary skeleton error>` so every surface gets retry-that-actually-refetches; this is the part everyone gets wrong._
- [suspense] `useSuspenseQuery` (non-null `data`, fits Compiler) behind that boundary — _clean render paths._
- [suspense] `useTransition` around pane switches — _no fallback flash; pairs with `<Activity>` keep-mounted._

**Devtools (optional tooling)**

- [devtools-panel] `ReactQueryDevtoolsPanel` + `onClose` IF we build a docked debug drawer; else floating `ReactQueryDevtools`. _No architectural weight._

---

**Output file:** this document.
**Cross-cutting tRPC caveat (applies to every example):** all literal `queryKey: [...]` arrays and inline `queryFn`s are replaced by `trpc.<router>.<proc>.queryOptions(input)` / `.infiniteQueryOptions(...)` / `.queryKey()` — the proxy is our key+fn factory, so the eslint `prefer-query-options` rule is near-auto-satisfied and the examples' manual keys are illustrative only.

<!-- Source: client-tanstack-query-notes.md -->

<a id='0bf96638'></a>

## TanStack Query v5 — Full-Docs Mining for Orbweaver's Data Layer

Source: shallow clone of `TanStack/query` `docs/` (read in full). Orbweaver context this is graded against:
Vite SPA (React 19 + React Compiler ON) · Hono Node server · tRPC + TanStack Query via `@trpc/tanstack-react-query` ·
queryKeys 100% codegen-derived from the tRPC proxy (gate `no-array-literal-querykey`) · live updates from an SSE event bus

- pure reducer `applyChatBusEvent` (NOT Query) · central `invalidation.ts` event→`queryFilter()` seam (gate
  `no-inline-invalidate-outside-seam`) · per-mutation sticky error channels (gate `no-multiplexed-mutation-error`) ·
  stream writes only through the reducer (gate `no-inline-cache-surgery-in-stream`). Primitives being built:
  `createEntityMutation`, `createCollectionSurface`, `<QueryBoundary>`, prefetch-on-intent, eslint `flat/recommended-strict`.

Doc paths are relative to `docs/`.

---

<!-- Source: client-tanstack-query-notes.md -->

<a id='770e82f6'></a>

### A. Best-practice / capability map (the full surface, one or two lines each)

<!-- Source: client-tanstack-query-notes.md -->

<a id='46764855'></a>

#### Query basics

- **`staleTime`** (`framework/react/guides/important-defaults.md`, `reference/useQuery.md`): `0` default → everything is stale immediately → refetches on mount/focus/reconnect. Values: ms · `Infinity` (only manual invalidation refetches) · `'static'` (NOTHING refetches, _even manual `invalidateQueries`_ is ignored). `invalidateQueries` always overrides `staleTime` (except `'static'`).
- **`gcTime`** (default `5*60_000`): timer for _unused/inactive_ queries only; does nothing while a query has an observer. Renamed from `cacheTime` in v5.
- **`enabled`**: gate auto-running; `false` → `status:'pending'`, `fetchStatus:'idle'`, ignores invalidation/refetch. `enabled` can be a function.
- **`select`** (`guides/render-optimizations.md`): transform/subscribe to a slice; runs only when `data` changes or `select` ref changes — inline `select` runs every render, so wrap in `useCallback` or hoist to a module constant. Not a place to throw.
- **`placeholderData`** (`guides/placeholder-query-data.md`): non-persisted "fake" data; query starts in `success` with `isPlaceholderData:true`. `placeholderData: keepPreviousData` (or `(prev)=>prev`) = lagged pagination.
- **`initialData`** (`guides/initial-query-data.md`): _persisted_ to cache, treated fresh unless `initialDataUpdatedAt` given. Use for real seed data, not partial/preview.
- **`structuralSharing`** (default `true`): keeps refs stable when JSON data is unchanged → fewer re-renders. JSON-only; pass a fn for non-JSON.
- **tracked properties / `notifyOnChangeProps`** (`guides/render-optimizations.md`): result is a Proxy; only _accessed_ fields trigger re-render. Object-rest destructuring defeats it (lint `no-rest-destructuring`).
- **`subscribed`** (`reference/useQuery.md`, `react-native.md`): `false` → this observer won't run the fn or receive cache updates. Useful for out-of-view screens.

<!-- Source: client-tanstack-query-notes.md -->

<a id='297649e7'></a>

#### `queryOptions` / `infiniteQueryOptions` / `mutationOptions`

- (`guides/query-options.md`, `reference/queryOptions.md`, `typescript.md`) Co-locate key+fn+options; runtime no-op, huge TS win: `options().queryKey` carries the `queryFn` return type so `getQueryData`/`setQueryData` are typed. **This is exactly what the tRPC proxy generates for orbweaver** — every `trpc.x.y.queryOptions(args)` _is_ a `queryOptions` result.

<!-- Source: client-tanstack-query-notes.md -->

<a id='ebc666c3'></a>

#### Network mode + refetch triggers

- **`networkMode`** (`guides/network-mode.md`): `'online'` (default — pause when offline, `fetchStatus:'paused'`), `'always'` (ignore connectivity), `'offlineFirst'` (run once then pause retries; for SW/HTTP-cache). `refetchOnReconnect` defaults `true` in `online`, `false` in `always`.
- **`refetchOnMount` / `refetchOnWindowFocus` / `refetchOnReconnect`** (default all `true`): each refetches **only if the data is stale**. `"always"` ignores staleness (blocked by `'static'`). All take `(query)=>...`.
- **`refetchInterval` / `refetchIntervalInBackground`** (`guides/polling.md`): polling, independent of `staleTime`; fn form `(query)=>ms|false`. Each observer runs its own timer; concurrent fetches dedupe at query level.

<!-- Source: client-tanstack-query-notes.md -->

<a id='669fdd65'></a>

#### Retries

- (`guides/query-retries.md`) Queries default `retry:3` w/ exponential backoff `min(1000*2**n, 30_000)`; mutations default `retry:0`. `0` on server. `retry` can be `(failureCount,error)=>bool`. `failureReason` exposes the error during retries.

<!-- Source: client-tanstack-query-notes.md -->

<a id='5634f1a9'></a>

#### Cancellation (`signal`)

- (`guides/query-cancellation.md`) Every `queryFn` gets `context.signal`; consuming it makes the query cancellable (unmount/stale/`cancelQueries` aborts the promise and reverts state). **Cancellation does NOT work with suspense hooks.** tRPC wires `signal` through automatically.

<!-- Source: client-tanstack-query-notes.md -->

<a id='0f40c5ab'></a>

#### Invalidation + query-filters model

- (`guides/query-invalidation.md`, `guides/filters.md`, `reference/QueryClient.md`) `invalidateQueries({queryKey, exact?, predicate?, refetchType?})`: marks matching stale (overrides `staleTime`) + refetches **active** by default. `refetchType: 'active'|'inactive'|'all'|'none'`. Filters also support `type`, `stale`, `fetchStatus`. Philosophy quote: prefer **targeted invalidation + background refetch + atomic updates** over manual normalized-cache maintenance.

<!-- Source: client-tanstack-query-notes.md -->

<a id='cd36dde2'></a>

#### Optimistic updates (two flavors)

- (`guides/optimistic-updates.md`) **Variables flavor**: read `mutation.variables` + `isPending` to render a pending row; no cache writes, no rollback. Best when _one_ place shows it. **Cache flavor**: `onMutate` → `cancelQueries(key)` → snapshot `getQueryData` → `setQueryData` → return snapshot → `onError` rollback → `onSettled` invalidate. Best when _multiple_ readers must reflect it.

<!-- Source: client-tanstack-query-notes.md -->

<a id='4b35c92a'></a>

#### Infinite + `maxPages`

- (`guides/infinite-queries.md`, `reference/useInfiniteQuery.md`) `data.pages`/`pageParams`, required `initialPageParam`+`getNextPageParam` (return `undefined|null` = no more). `maxPages` caps stored pages (needs both `getNextPageParam`+`getPreviousPageParam`). Refetch re-fetches pages **sequentially** from the first. `placeholderData: keepPreviousData` works here too. Single in-flight fetch per infinite query; guard `fetchNextPage` with `!isFetching`.

<!-- Source: client-tanstack-query-notes.md -->

<a id='48e0c9af'></a>

#### Prefetching + `ensureQueryData`

- (`guides/prefetching.md`, `reference/QueryClient.md`) `prefetchQuery` (never throws/returns, uses default `staleTime` unless passed) vs `fetchQuery` (throws/returns) vs `ensureQueryData` (returns cached if present, else fetch; `revalidateIfStale` opt). Prefetch on `onMouseEnter`/`onFocus`, in-component (ignored `useQuery` w/ `notifyOnChangeProps:[]`), in the `queryFn`, in effects, or via router loaders. For suspense, use `usePrefetchQuery`/`usePrefetchInfiniteQuery` _before_ the suspense boundary.

<!-- Source: client-tanstack-query-notes.md -->

<a id='e7f9f5b9'></a>

#### Suspense + error boundaries + `throwOnError`

- (`guides/suspense.md`, `reference/useSuspenseQuery.md`, `QueryErrorResetBoundary.md`) `useSuspenseQuery` → `data` always defined, no `enabled`/`placeholderData`/`throwOnError`. Suspense queries in one component run **serially** → use `useSuspenseQueries` for parallel. Default suspense throw rule: `throwOnError: (e,q)=> typeof q.state.data === 'undefined'` (stale data keeps rendering through a background error). `QueryErrorResetBoundary`/`useQueryErrorResetBoundary` `reset()` ↔ react-error-boundary `onReset` is the documented retry handshake. Wrap key changes in `startTransition` to avoid fallback flash. Cancellation off under suspense.

<!-- Source: client-tanstack-query-notes.md -->

<a id='2e4f0493'></a>

#### `skipToken`

- (`guides/disabling-queries.md`, `typescript.md`) Type-safe disable: `queryFn: cond ? () => fetch(x) : skipToken`. Behaves like `enabled:false` but keeps `data` typed and **forbids the fake-id sentinel**. Caveat: `refetch()` won't work with `skipToken` (throws "Missing queryFn") — use `enabled:false` if you need imperative `refetch`.

<!-- Source: client-tanstack-query-notes.md -->

<a id='133c61d4'></a>

#### Global callbacks: QueryCache / MutationCache

- (`reference/QueryCache.md`, `reference/MutationCache.md`) `new QueryCache({onError,onSuccess,onSettled})` + `new MutationCache({onMutate,onError,onSuccess,onSettled})`: **always fire, can't be overridden** by per-call options. The blessed home for global toasts/logging — especially since v5 **removed per-query `onSuccess`/`onError`/`onSettled`**. Carry per-query messaging via `meta`.

<!-- Source: client-tanstack-query-notes.md -->

<a id='256276d3'></a>

#### Request waterfalls / dedup

- (`guides/request-waterfalls.md`, `guides/parallel-queries.md`) Same key → shared cache entry, concurrent fetches dedupe. Avoid serial/dependent/nested/code-split waterfalls; flatten by hoisting, `useQueries`/`useSuspenseQueries`, prefetch, or API redesign. `useQueries` `combine` merges results (memoize it).

<!-- Source: client-tanstack-query-notes.md -->

<a id='9f4f50eb'></a>

#### `persistQueryClient` / persisters

- (`plugins/persistQueryClient.md`, `createPersister.md`, `createAsyncStoragePersister.md`) Whole-client persist (`PersistQueryClientProvider`, `gcTime ≥ maxAge`, `buster` on deploy) vs experimental per-query `createPersister` (wraps `queryFn`, `networkMode` → `offlineFirst`, `setQueryData` NOT persisted). `createSyncStoragePersister` is **deprecated** → use async one. `broadcastQueryClient` (experimental) syncs cache across tabs via BroadcastChannel.

<!-- Source: client-tanstack-query-notes.md -->

<a id='1989677d'></a>

#### Devtools

- (`devtools.md`) `@tanstack/react-query-devtools`, dev-only by default, lazy-loadable in prod. Floating or embedded panel; observes mutations too. Browser-extension variants exist.

<!-- Source: client-tanstack-query-notes.md -->

<a id='67e324bf'></a>

#### eslint plugin

- (`eslint/*`) `flat/recommended` + `flat/recommended-strict`. Rules: `exhaustive-deps`, `no-rest-destructuring`, `stable-query-client`, `no-unstable-deps`, `infinite-query-property-order`, `mutation-property-order`, `no-void-query-fn`, and (strict-only) `prefer-query-options`.

---

<!-- Source: client-tanstack-query-notes.md -->

<a id='d4a8c6ce'></a>

### B. The verdict — per area

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

<!-- Source: client-tanstack-query-notes.md -->

<a id='4e65c77c'></a>

### C. The concrete `QueryClient` `defaultOptions` (highest-value output)

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

<!-- Source: client-tanstack-query-notes.md -->

<a id='d1c27662'></a>

### D. TypeScript best practices (`typescript.md` + reference)

- **Let inference flow**: typed `queryFn` → typed `data` (`Group[] | undefined`). Extract fetchers to typed fns (most clients return `any`). For orbweaver the tRPC proxy already returns precise types, so this is free.
- **`queryOptions` helper** is the type backbone: `options().queryKey` knows the `queryFn` type, making `getQueryData(options().queryKey)` typed without a generic. tRPC's `*.queryKey(args)` gives orbweaver this property — use it directly in the bus invalidation seam (the same key the reader uses), which is also enforced by `prefer-query-options`'s key-reuse rule.
- **`skipToken`**: the type-safe disable. `queryFn: id ? () => api(id) : skipToken` keeps `data` typed; replaces `castId<X>("") + enabled`.
- **Register a global error** (`declare module '@tanstack/react-query' { interface Register { defaultError: AppError } }`) so `error` is your contracts-layer error type everywhere with no per-call generics. Set `defaultError: unknown` if you want to _force_ narrowing at call sites. Can also register `queryMeta`/`mutationMeta` (must extend `Record<string,unknown>`) and even global `queryKey`/`mutationKey` shapes.
- **Narrow via discriminated union**: check `isSuccess`/`status==='success'` to make `data` defined; `useSuspenseQuery` removes the need (data always defined).
- **`select` typing**: inference works on `useQuery`; on **`useQueries`/`useSuspenseQueries` inline `select` falls back to `unknown`** (TS #6556) — annotate the param or define via `queryOptions`. Relevant if `createCollectionSurface` ever fans out with `useQueries`.
- **Don't widen error generics positionally** (`useQuery<T, string>`) — it kills all other inference; prefer narrowing or `Register`.
- **`DefinedInitialDataOptions`**: when `initialData` is a non-undefined value, `data` is typed as defined (no `| undefined`). Mostly irrelevant given orbweaver seeds via prefetch/SSE, not `initialData`.

---

<!-- Source: client-tanstack-query-notes.md -->

<a id='bb5e1253'></a>

### E. Adopt-into-primitives shortlist

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

<!-- Source: client-tanstack-query-notes.md -->

<a id='ccafa6ed'></a>

### F. Are we doing anything WEIRD? (blunt, doc-backed)

1. **Hand-rolled SSE bus + `applyChatBusEvent` reducer instead of `experimental_streamedQuery`** (`reference/streamedQuery.md`). The lib now ships a first-class streaming-into-cache helper (`refetchMode: append|reset|replace`, custom `reducer`, `initialValue`) and a chat example. Orbweaver reinvents it. **Verdict: defensible, not weird** — `streamedQuery` is per-`queryFn` over an AsyncIterable and `experimental`; orbweaver's bus is cross-cutting (one stream feeds many query keys) and must stay decoupled from any single `queryFn`. _Flag it as a conscious divergence in the ledger so a future agent doesn't "simplify" toward streamedQuery and break the cross-query model._

2. **`staleTime: Infinity` global is unusual** for a typical app (most pick a finite staleTime), but **correct here** given precise bus invalidation (`important-defaults.md`). The actual risk is someone reaching for **`staleTime: 'static'`** thinking it's "more Infinity" — `'static'` _ignores `invalidateQueries`_ and would silently break the bus seam. **Recommend a gate/lint banning `'static'` on bus-backed query keys.**

3. **Invalidate-only on bus events when the event payload may already contain the new data.** `updates-from-mutation-responses.md` shows you can `setQueryData` from a server payload to skip the refetch roundtrip. Orbweaver deliberately invalidates (extra fetch) for reads and only the reducer writes stream data. **Verdict: correct trade** — `query-invalidation.md` explicitly prefers targeted-invalidate + atomic refetch over hand-maintained cache writes; just know the extra roundtrip is a _chosen_ cost, and the `no-inline-cache-surgery-in-stream` gate is what enforces it.

4. **Gate boundary risk for optimistic writes.** `no-inline-cache-surgery-in-stream` bans `setQueryData` in component/subscription bodies — but the **cache-flavor optimistic update legitimately calls `setQueryData` inside `createEntityMutation`'s `onMutate`**. Make sure the gate scopes to _stream/subscription_ bodies, not mutation `onMutate`, or the correct optimistic primitive trips the gate.

5. **Turning `refetchOnReconnect` off would be the real bug**, not a quirk. If anyone disables it "because the bus handles updates," they lose the catch-up for events missed while the SSE socket was down (`network-mode.md`). Bake `refetchOnReconnect: true` into defaults and leave a comment.

6. **`useSuspenseQuery` can't be conditionally disabled** (no `enabled`/`skipToken`). If a `<QueryBoundary>`-wrapped component ever needs a conditional/dependent query, that's a `useQuery + enabled/skipToken` case _outside_ suspense, or a restructure — don't fight it inside suspense (`suspense.md`). Also remember suspense queries in one component are **serial**; reach for `useSuspenseQueries`.

Nothing else in the plan reads as anti-pattern: codegen keys, central invalidation seam, per-mutation error slots, and the reducer-owns-stream rule all line up with documented v5 guidance.

---

<!-- Source: client-tanstack-query-notes.md -->

<a id='1f2cc603'></a>

### G. Open forks for Nate

1. **`gcTime`**: keep default 5 min, or bump (e.g. 30 min) so heavy chat/RP screens repaint instantly on back-nav? Trade-off: memory vs paint latency. Bus re-invalidates either way, so correctness is identical — purely UX/memory.
2. **`refetchOnWindowFocus`**: hard `false` (my lean — bus owns liveness) vs leave default `true` (no-op while fresh, but a cheap safety net if the SSE socket silently wedged without firing `offline`). Pick based on how much you trust SSE reconnection detection.
3. **`retry`**: `2` (tuned) vs library default `3`. Marginal; affects worst-case error latency on a flaky single host.
4. **`'static'` ban gate**: worth a dedicated lint/gate, or just a ledger note + code-review? Given the apparatus philosophy, a gate seems on-brand since misuse silently disables the bus seam.
5. **Multi-tab**: orbweaver is multi-human but is it multi-tab-per-human? If yes, the SSE bus already exists per tab so each tab self-syncs — `broadcastQueryClient` is redundant (and experimental). Confirm tabs each hold their own SSE connection; if some tabs _don't_, broadcast could matter. Likely SKIP.
6. **Offline/persistence**: confirmed deferred. When you revisit, prefer per-query `createPersister` (lazy, query-hash keyed) over whole-client persist — but note `setQueryData` (your optimistic + reducer writes) is **not** persisted, so an offline reload loses optimistic state. The SSE-truth model makes persistence a cold-start-paint feature only, not a correctness feature.
7. **Global error `Register`**: set `defaultError` to your contracts `AppError` (ergonomic) or `unknown` (forces narrowing at every call site — more rigorous, more friction). The orbweaver "boundaries are physics" ethos might favor `unknown`.
