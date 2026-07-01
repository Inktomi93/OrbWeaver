# UI-Primitives-and-Reuse

> Auto-generated UI architecture doc.

## Table of Contents

- [13. The reuse model — the central primitives every feature builds on (D54)](#4608bdbd)
  - [13.0 The litmus (what gets centralized, what stays in the feature)](#f2f2ccd7)
  - [13.1 The primitive catalog (contracts — born before Phase 6)](#a8276c86)
  - [13.2 The standardization map — for surface X, reach for primitive Y (the cold-agent lookup)](#5caf4968)
  - [13.3 The new gates (machine-enforced — added by D54)](#e4a3669e)
  - [13.4 Where to use Form — the surface map (the under-use correction)](#b918a398)
  - [13.5 Deferred-with-a-committed-default forks (D54)](#4f279585)
  - [13.6 Sequencing (born-compliant — non-negotiable)](#d882b291)

---

<!-- Source: client.md -->

<a id='4608bdbd'></a>

## 13. The reuse model — the central primitives every feature builds on (D54)

> **Status: authoritative (D54, 2026-06-29).** Synthesis of the full client-foundation research sweep — the
> Query/Form/Router/Virtual examples + the Query/Form/Router/Virtual/Zustand deep-docs mines (the seven
> `client-tanstack-*` / `client-zustand-notes` companions in this directory; cite them for any specific claim).
> The §11.0 thesis — _every footgun carried by STRUCTURE, never convention_ — **extended from footguns to
> boilerplate**: a feature converges to **config + a field/row renderer**; all wiring (fetch · cache · invalidate ·
> optimistic · error · virtualize · select · seed · dirty · lifecycle) lives in a primitive the call site
> **cannot bypass or get wrong**. Ships in the `@orb/ui` + client-foundation wave **BEFORE any feature agent runs**
> (§11.7).

<!-- Source: client.md -->

<a id='f2f2ccd7'></a>

### 13.0 The litmus (what gets centralized, what stays in the feature)

- **Central (the call site cannot opt out):** wiring, lifecycle, and the footguns — fetch/cache/invalidate,
  optimistic+rollback, the dirty/reset/seed dance, virtualization, selection, error channels.
- **Feature-owned:** the fields, the row/card visuals, the copy, the per-field control choice.
- **The bar to centralize:** repeated **3+ times AND changing together** (the chart tooltip ×5, the meter ×5, the
  editors ×4, the collection surfaces ×8 all clear it). A genuine one-off stays hand-composed from `@orb/ui` —
  premature DRY is still a cost even here.

<!-- Source: client.md -->

<a id='a8276c86'></a>

### 13.1 The primitive catalog (contracts — born before Phase 6)

- **`createEntityMutation`** — bakes the canonical 4-phase optimistic flow (Query `optimistic-updates-cache`):
  `onMutate` = `cancelQueries` → `getQueryData` snapshot → `setQueryData` patch → return rollback; `onError`
  restores; `onSettled` invalidates **via the central seam**. Uses the **`context.client`** arg (provider-clean).
  A lightweight **variables-render mode** for append-only creates. **Resets the v5 sticky error on next `mutate`**
  (examples don't cover it — ours). One error slot per mutation, never multiplexed.
- **`createCollectionSurface`** — one machine for every browse view. Feature supplies the (infinite) query + the
  row renderer + the filter config + bulk actions. Bakes `useInfiniteQuery` + **`maxPages`** + **`placeholderData:
keepPreviousData`** gated on `isPlaceholderData` (no flash / no scroll-jump), the virtual-list seal, the selection
  store, empty/loading/error, and the tail-fetch guard **off the virtualizer's own range** — **no
  `react-intersection-observer`**.
- **`useGatedQuery` / `skipToken`** — a null id yields `skipToken` (never builds the key); kills the `castId("")`
  sentinel (gate `no-fake-disabled-id`).
- **`<QueryBoundary>`** — the `QueryErrorResetBoundary` → `ErrorBoundary onReset` handshake (a retry that actually
  refetches) + `useSuspenseQuery`/`useSuspenseQueries` (non-null data, Compiler-clean; queries-plural for parallel,
  no waterfall) + `useTransition` around pane switches (no fallback flash; pairs with `<Activity>`).
- **`createSavedEntityForm` / `createAutosaveEntityForm`** — the editor factories (§13.4 for the six-obligation
  contract + the surface map).
- **`@orb/ui/virtual-list` (generic) + `@orb/ui/message-list` (chat)** — TanStack Virtual sealed with
  `directDomUpdates` + the native chat APIs (§11.3, corrected D54).
- **The central seams (ratified, re-stated as the standard):** `invalidation.ts` event→`queryFilter` map
  (`no-inline-invalidate-outside-seam`); bus→cache `onData` = buffer-local + `invalidate(readKey)`, never a 2nd
  store (`bus-onData-no-store-write`); stream writes through the pure reducer (`no-inline-cache-surgery-in-stream`);
  queryKeys 100% tRPC-proxy (`no-array-literal-querykey`).
- **`QueryClient` defaults (§6.1):** `staleTime: Infinity` (bus drives freshness; **never `'static'`**) ·
  `refetchOnWindowFocus:false` · **`refetchOnReconnect:true`** · `gcTime:5min` · `structuralSharing:true` ·
  `throwOnError:false` · mutations `retry:0` · global `meta`-toasts via `QueryCache`/`MutationCache.onError`.
- **State — Zustand (§5), standardized:** one `create`/file · ≤10 authored fields · no exported `set`/`getState` ·
  `persist` with **`partialize` to the persisted key + a total/crash-proof `migrate`** (default `merge` is shallow) ·
  `set(next, true)` **replace** for DU lifecycle transitions (a dropped field is a typecheck error) ·
  `createEntityDraftStore` keeps the frozen `EMPTY` default-ref **and** adds `useShallow` for multi-field draft
  selectors (not redundant — different jobs) · token-stream split from lifecycle (`subscribeWithSelector` + transient
  `subscribe`, zero renders) · dev-only `devtools`.

<!-- Source: client.md -->

<a id='5caf4968'></a>

### 13.2 The standardization map — for surface X, reach for primitive Y (the cold-agent lookup)

| You are building…                      | Use                                           | NOT                                                     |
| -------------------------------------- | --------------------------------------------- | ------------------------------------------------------- |
| a browse/list/grid of entities         | `createCollectionSurface`                     | a hand-wired query+list+filter                          |
| an entity edit/create form (≥3 fields) | a **form factory** (§13.4)                    | a hand-rolled `useAppForm`                              |
| a create/update/delete action          | `createEntityMutation`                        | inline `useMutation` + `setQueryData`                   |
| a read that shows loading/error        | `useGatedQuery` in `<QueryBoundary>`          | bare `useQuery` + `isPending` ladders                   |
| a conditional/disabled query           | `useGatedQuery` (`skipToken`)                 | `castId("")` + `enabled`                                |
| a virtualized list                     | `@orb/ui/virtual-list`                        | raw `useVirtualizer`                                    |
| the chat message list                  | `@orb/ui/message-list`                        | a hand-rolled scroll/anchor hook                        |
| a chart                                | `@orb/ui/charts` (ECharts)                    | raw `echarts` / a `<div style=width>`                   |
| a 1-D magnitude bar                    | `@orb/ui/meter`                               | a hand-rolled `<span style=width>`                      |
| cache invalidation                     | `invalidate(event)` (the seam)                | inline `invalidateQueries`                              |
| global client state                    | one gated Zustand store                       | exported `set`/`getState`, >10 fields                   |
| an editor draft                        | `createEntityDraftStore`                      | a bespoke persist store                                 |
| a route / auth gate                    | Router `beforeLoad`+`redirect` (§6.1)         | `useBlocker` for an in-app pane guard                   |
| the editor "unsaved? leave?" guard     | a **hand-rolled in-app** guard off view-state | `useBlocker` (won't fire on a pane swap)                |
| single-route pane transition           | hand-rolled `document.startViewTransition()`  | the router's VT (won't fire; `pathChanged` is constant) |

<!-- Source: client.md -->

<a id='e4a3669e'></a>

### 13.3 The new gates (machine-enforced — added by D54)

- `no-static-staletime-on-bus-keys` — `staleTime:'static'` silently ignores `invalidateQueries`; ban it on bus keys.
- `no-inline-cache-surgery-in-stream` **scoped to subscription/stream bodies** — must NOT flag
  `createEntityMutation`'s legitimate `onMutate setQueryData`.
- `persist-partialize-and-total-migrate` — non-primitive `persist()` needs `partialize` to its key + a total `migrate`.
- `form-factory-for-multifield` — a ≥3-field `useAppForm`/controlled form outside a factory is flagged.
- `virtualizer-only-in-seal` — `@tanstack/react-virtual` only inside the two `@orb/ui` seals (dep-cruiser).
- adopt **`@tanstack/eslint-plugin-query` `flat/recommended-strict`** (`prefer-query-options` forces the proxy key)
  - **`eslint-plugin-react-hooks` `recommended-latest`** (the Compiler's Rules-of-React enforcement — load-bearing,
    not optional: an undetected violation = a silent mis-memoization).
- the Form factory bakes: pill off `!isDefaultValue` · **no hand-rolled `fieldValuesEqual`** (lib does deep compare) ·
  post-submit-effect `reset(saved)` · version-locked `dontUpdateMeta` + a guard test · `useSelector` (not `useStore`).

<!-- Source: client.md -->

<a id='b918a398'></a>

### 13.4 Where to use Form — the surface map (the under-use correction)

The §6.1 rule applied. **Trigger = ≥3 fields OR validation OR save/draft semantics** — _Form is for forms, not for
"entities."_ The six obligations the factories bake (verified FACTORY-ORIGINAL — no example or doc fixes them):
seed-on-load · `key`-remount on id change · post-submit `reset(saved)` · the `seededRef + persistent-isDirty` reseed
guard · the Zustand-`persist` draft mirror (autosave) · `dontUpdateMeta` on non-user writes.

| Surface                              | Factory                    | Why (and why it was under-served)                                                   |
| ------------------------------------ | -------------------------- | ----------------------------------------------------------------------------------- |
| Character card editor                | `createSavedEntityForm`    | many fields, draft, explicit save                                                   |
| Persona editor                       | `createSavedEntityForm`    | multi-field, draft                                                                  |
| Preset editor                        | `createSavedEntityForm`    | many fields                                                                         |
| Prompt-manager                       | `createSavedEntityForm`    | multi-field                                                                         |
| **Connection / credential add+edit** | `createSavedEntityForm`    | multi-field **+ validation** — was hand-rolled                                      |
| **Group-chat create + config**       | `createSavedEntityForm`    | roster + overrides                                                                  |
| **User-admin create / edit user**    | `createSavedEntityForm`    | multi-field + validation                                                            |
| **D44 theme-override editor**        | `createSavedEntityForm`    | the token subset (color/font/bubble/radius/…)                                       |
| World-info / lorebook entry          | `createAutosaveEntityForm` | neo autosaved these; debounced draft                                                |
| Room overrides (per-chat)            | `createAutosaveEntityForm` | flip-and-it-saves                                                                   |
| **Settings panels (AppSettings)**    | `createAutosaveEntityForm` | many grouped toggles, save-on-change                                                |
| — stays controlled + Zod —           |                            | search box · lone toggle · single rename · login (2-field): trivial, no toolkit tax |

**The correction in one line:** treating Form as "the 4 entity editors" (neo's framing) under-used it — settings,
connections, group config, theme, and user-admin are all multi-field forms that belong in a factory. **Bolded rows
above are the newly-claimed surfaces.**

<!-- Source: client.md -->

<a id='4f279585'></a>

### 13.5 Deferred-with-a-committed-default forks (D54)

- **Editor draft layer** — DEFAULT: TanStack Form + the Zustand-`persist` draft store + the factory seed/dirty guards
  (the seed/clobber + persistence are FACTORY-ORIGINAL — no lib does them). Deferred upgrade: **TanStack DB**
  local-storage-collection + manual transactions (`tx.mutate`/`rollback`/`commit` = edit/discard/save) would
  _dissolve_ the dirty/reset/seed dance. Revisit when TanStack DB hits 1.0 + a proven Form-editor recipe (alpha
  today; not for a born-compliant build). **The factory IS the swap seam.**
- **Token enforcement** — DEFAULT Tailwind v4 + DTCG + lint; deferred **Panda `strictTokens`** (§3/§10).

<!-- Source: client.md -->

<a id='d882b291'></a>

### 13.6 Sequencing (born-compliant — non-negotiable)

Every §13.1 primitive + the §13.3 gates ship in the `@orb/ui` + client-foundation wave **before any feature agent
runs** (§11.7). The §13.2 map is the cold-agent contract: a surface not using its primitive is the review flag.
