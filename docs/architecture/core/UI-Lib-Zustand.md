---
kind: reference
status: active
updated: 2026-07-03
---

# UI-Lib-Zustand

> **A lib companion of the nine-doc UI law set** — a full-read examples/deep-docs mine (evidence + provenance, NOT extra law; the distilled verdicts are folded into the spec sections of `UI-Architecture-and-Layout.md` / `UI-Gates-and-Lessons.md` / `UI-Primitives-and-Reuse.md`, cited per claim).
>
> Cross-doc `§N` references resolve via the §-map in `UI-Architecture-and-Layout.md`.

## Zustand v5 — full-docs mining + orbweaver verdict

Source: shallow clone of `pmndrs/zustand` `docs/` (current `main`, v5.x line; latest published v5.0.14). Every `.md`/`.mdx` under `learn/`, `reference/` read in full. Doc paths below are relative to `docs/`.

Orbweaver context recap (the thing being judged): Vite SPA, React 19 + React Compiler ON; Zustand for client/UI state only (server state = TanStack Query). Gates (`state:files`): one `create(` per file, ≤10 top-level fields, no exported `set`/`getState`/store-handle, `persist({name})` namespaced. Lifecycle slices as discriminated-union transitions. `createEntityDraftStore` factory: `persist` w/ `version:1`+`migrate`, frozen `EMPTY = Object.freeze({})` returned by `useDraft(id)` when no draft, `drafts: Record<id, Partial<TInput>>`, setField/clearField/clearDraft/hasDraft.

### A. Best-practice / capability map (v5)

**`create` (React)** — `reference/apis/create.md`. `create<T>()(stateCreatorFn)` returns a hook with `setState`/`getState`/`getInitialState`/`subscribe` attached. The hook takes a selector. v5 default equality is `Object.is` — NO built-in shallow/equality-fn argument anymore (that moved to `zustand/traditional`). `set` shallow-merges one level by default; pass `replace:true` to overwrite.

**`createStore` (vanilla)** — `reference/apis/create-store.md`. `createStore<T>()(fn)` returns a bare `StoreApi` (no hook). Use for DI/per-instance/scoped stores, then read with `useStore(store, selector)`. Has `getInitialState()` (used by reset + the testing mock).

**`useStore`** — `reference/hooks/use-store.md`. `useStore(vanillaStore, selectorFn)` binds a vanilla store into React. Same `Object.is` default. This is the bridge for context-scoped stores.

**Selectors + equality** — default `Object.is` (`reference/apis/create-with-equality-fn.md` confirms default). Subscribe to the narrowest slice; one value per selector call is cheapest. For derived/multi-value reads use:

- **`useShallow(selector)`** — `reference/hooks/use-shallow.md` + `learn/guides/prevent-rerenders-with-use-shallow.md`. React hook, memoizes selector output via shallow compare of its top-level props. THE v5 idiom for "selector returns a new object/array". Import `zustand/react/shallow` (or `zustand/shallow`).
- **`shallow(a,b)`** — `reference/apis/shallow.md`. The raw top-level comparator. Handles objects/Sets/Maps; does NOT recurse; also returns false on differing prototypes (`Object.create({})` vs `{}`). Building block; you rarely call it directly in components.
- **`createWithEqualityFn` / `useStoreWithEqualityFn`** — `zustand/traditional`, requires `use-sync-external-store` peer dep. The v4-compatibility path: bakes a default equality fn into the store/hook so you can pass a 2nd equality arg at the call site. v5 ships this OUT of the core to keep core lean.

**Slices pattern** — `learn/guides/slices-pattern.md` + `learn/guides/advanced-typescript.md#slices-pattern`. Split one bounded store into `createXSlice = (set,get,store) => ({...})` factories, compose `create((...a) => ({ ...createA(...a), ...createB(...a) }))`. Cross-slice calls via `get().otherAction()`. **Middleware only on the combined store, never inside a slice.** Still ONE store.

**`combine`** — `reference/middlewares/combine.md`. `combine(initialState, (set,get,store)=>actions)` merges state+actions and INFERS the type, so you skip `create<T>()` annotation and the curry. No store mutator. Trade-off (`advanced-typescript.md`): `set`/`get`/`Object.keys` are "lied to" — they only see the first arg's shape; `set(x,true)` replace and `Object.keys(get())` are the footguns.

**Actions: in-store vs outside-store** — `learn/guides/practice-with-no-store-actions.md` + `create.md#updating-state-with-no-store-actions` + `learn/guides/flux-inspired-practice.md`. **Recommended = colocate actions inside the store.** Module-level actions calling `store.setState(...)` are an explicitly-blessed ALTERNATIVE ("this pattern doesn't offer any downsides") — advantages: no hook needed to call, better code-splitting. Flux guide: single store, always update via `set`/`setState`.

**`persist`** — `reference/middlewares/persist.md` + `reference/integrations/persisting-store-data.md`. Options: `name` (required, storage key), `storage` (default `createJSONStorage(()=>localStorage)`), `partialize` (pick fields to persist), `version` (default 0) + `migrate(persisted, version)` (returns latest-shape state; mismatch w/o migrate → stored value discarded), `merge(persisted, current)` (default SHALLOW merge), `onRehydrateStorage` (pre/post hook), `skipHydration` (manual `rehydrate()`). API surface on `store.persist`: `getOptions/setOptions/clearStorage/rehydrate/hasHydrated/onHydrate/onFinishHydration`. `createJSONStorage(getStorage, {reviver, replacer})` for custom (de)serialization (Date/Map/Set/RegExp need superjson or hand-rolled storage). **v5 behavioral change: `persist` no longer writes initial state at store creation** (`migrating-to-v5.md` + v4.5.5).

**`immer`** — `reference/middlewares/immer.md` + `reference/integrations/immer-middleware.md`. `immer((set)=>...)` lets `set` take a mutating recipe (`state.x = y`). Needs `immer` installed. Gotcha: class objects need `[immerable]=true` or Zustand's reference-equality check skips subscriptions.

**`devtools`** — `reference/middlewares/devtools.md`. Redux DevTools bridge. Options: `name/enabled(default dev only)/anonymousActionType/store/actionsDenylist`. Name actions via the 3rd `set` arg (`set(partial, false|undefined, 'domain/action')`). **Put `devtools` OUTERMOST** (`devtools(immer(...))`) — it mutates `setState` and must wrap last. `store.devtools.cleanup()` for dynamic stores.

**`subscribeWithSelector`** — `reference/middlewares/subscribe-with-selector.md`. Upgrades `store.subscribe` to `subscribe(selector, listener, {equalityFn, fireImmediately})` — fire a callback only when a selected slice changes, WITHOUT a React render. The transient-update primitive.

**Transient updates** — `create.md#subscribing-to-state-updates`. Plain `store.subscribe(cb)` (or with `subscribeWithSelector`) inside a `useEffect` to react to changes outside the render cycle (e.g. write to a DOM node / ref). No re-render. Ideal for high-frequency streams.

**Auto-generating selectors** — `learn/guides/auto-generating-selectors.md`. `createSelectors(store)` attaches `store.use.field()` typed accessors so you skip writing `(s)=>s.field` everywhere. Pure DX sugar; not required.

**Reset state** — `learn/guides/how-to-reset-state.md`. `reset: () => set(store.getInitialState())` (action form), or `store.setState(store.getInitialState(), true)` (replace). Multi-store reset via a `Set<resetFn>` registry.

**Maps/Sets** — `learn/guides/maps-and-sets-usage.md`. Always replace the instance (`new Map(state.foo).set(k,v)`); mutating keeps the same ref → no re-render. Init empties with type hints (`new Set([] as string[])`) or TS infers `never[]`.

**Updating state** — `learn/guides/updating-state.md` + `immutable-state-and-merging.md`. Top-level `set` auto-merges (skip `...state`); nested objects need manual spread or immer/optics/ramda. Prefer immutable array ops (`map/filter/toSorted/...`).

**SSR/hydration** — `learn/guides/ssr-and-hydration.md`, `initialize-state-with-props.md`, persist `skipHydration`. Mostly Next.js concerns. For a Vite CSR SPA: largely N/A, but the `skipHydration`/`hasHydrated`/`onRehydrateStorage` machinery still matters for "don't flash default before localStorage loads".

**Initialize-with-props / scoped stores** — `initialize-state-with-props.md` + `use-store.md`. Per-instance state → vanilla `createStore` in `useState(()=>createX(props))` behind a React context, read via `useStore`. The blessed pattern for "store seeded by component props" or "N independent instances".

**`redux` middleware** — `reference/middlewares/redux.md`. Reducer+dispatch on a store. Niche; only if you genuinely want reducer ergonomics.

**TS minimums (v5):** TS ≥4.5, React ≥18 (for `useSyncExternalStore`), `use-sync-external-store` is a PEER dep needed only for `zustand/traditional`.

### B. The verdict (per area)

| # | Area | Verdict | Doc basis |
| - | - | - | - |
| 1 | Zustand for client state, TanStack Query for server state | ✅ CORRECT | `comparison.md` frames Zustand as immutable client store; selectors are the render-opt model. Nothing in docs wants it owning server cache. |
| 2 | `Object.is` default + footgun gate on fresh `{}`/`[]` from selectors | ✅ CORRECT, and the gate is MORE necessary in v5 | `migrating-to-v5.md#requiring-stable-selector-outputs`; `use-shallow.md` Troubleshooting. v5 removed v4's implicit shallow; new-ref selectors now infinite-loop. |
| 3 | Frozen `EMPTY = Object.freeze({})` default from `useDraft(id)` | ✅ CORRECT — and NOT redundant with `useShallow` (different problems; see C-1) | `migrating-to-v5.md` shows the exact `FALLBACK_ACTION` stable-ref pattern for `?? default`. |
| 4 | No exported `set`/`getState`/store-handle gate | ✅ CORRECT, compatible with docs (see C-2 reconciliation) | `practice-with-no-store-actions.md` blesses colocated actions; module-level `setState` is an *option*, not a mandate. |
| 5 | `persist` w/ `version:1`+`migrate` on draft factory | ✅ CORRECT, but tighten `merge`/`partialize`/hydration (see C-4) | `persist.md`, `persisting-store-data.md`: default `merge` is SHALLOW → drops nested keys. |
| 6 | `≤10 top-level fields`, one `create` per file | ⚠️ MILD TENSION with slices — fine if counted post-compose, risky if it blocks slicing (see C-5) | `slices-pattern.md`: the whole point is the bounded store grows; ≤10 must mean per-file authored fields, not per-composed-store. |
| 7 | Split per-token stream fields from lifecycle fields | ✅ CORRECT, strongly endorsed | `subscribe-with-selector.md` + transient-update pattern; chrome subscribes to lifecycle, token churn goes through a narrow selector or transient subscribe. |
| 8 | Lifecycle modeled as discriminated-union transitions in a store | ✅ CORRECT / well-supported, no native "machine" primitive | `flux-inspired-practice.md` (single store, `set`-only) + `redux.md` reducer option. Docs neither bless nor forbid; DU-in-store is idiomatic immutable updating. (See C-7.) |
| 9 | React 19 + React Compiler | ✅ CLEAN — no accommodation needed | Zustand uses `useSyncExternalStore`; nothing in v5 migration needs `"use no memo"`. (See C-6.) |
| 10 | `createWithEqualityFn`/`zustand/traditional` | ⏭️ CORRECTLY SKIP | `migrating-to-v5.md`: it's the v4-compat escape hatch + extra peer dep. `useShallow` covers our needs. Don't add it. |
| 11 | `immer` middleware | ⏭️ CORRECTLY SKIP (default), unless DU transitions get spread-heavy | `immutable-state-and-merging.md` calls spreads "very long" for deep nests; but draft `setField` on `Record<id,Partial>` is one-level → no immer needed. |
| 12 | `devtools` middleware | 🔼 SHOULD-ADOPT in dev | `devtools.md`; cheap observability for the DU lifecycle transitions. Gate it `enabled: dev only` (default) and put it OUTERMOST. |
| 13 | Auto-generating selectors (`createSelectors`) | ⏭️ CORRECTLY SKIP | DX sugar; adds a magic layer an amnesiac agent must learn. Explicit selectors are more gate-legible. |
| 14 | `combine` for inference | ⚠️ OPTIONAL — convenience vs the `Object.keys`/`replace` lie | `advanced-typescript.md` "Be a little careful". Given orbweaver's rigor + curried `create<T>()`, prefer explicit types over `combine`'s inference shortcut. |

### C. Are we doing anything WEIRD?

**C-1 — Frozen `EMPTY` vs `useShallow`: NOT redundant. They solve different problems. Keep BOTH, for different reasons.**

- `useShallow` (`use-shallow.md`): memoizes a selector that DERIVES/COMPUTES a new object/array every render (`Object.keys(state)`, `{a,b}` bundles). It shallow-compares this render's output to last render's and returns the previous ref if equal. It is about *derived* outputs changing identity on every call.
- Frozen `EMPTY` (`migrating-to-v5.md` `FALLBACK_ACTION` pattern): provides ONE stable reference for the "no draft exists" DEFAULT branch of a selector — `drafts[id] ?? EMPTY`. The danger is `drafts[id] ?? {}` minting a fresh `{}` each render → infinite loop. A constant fixes it. `useShallow` would ALSO mask this, but it's the heavier hammer (runs a shallow compare every render) for a case a frozen constant solves for free with zero per-render work.
- **Verdict:** the frozen `EMPTY` is the textbook-correct tool for a stable default; it is exactly the pattern the v5 migration guide prescribes. It is NOT made unnecessary by `useShallow`. The `Object.freeze` is a nice belt-and-suspenders (prevents a consumer mutating the shared default) but is not what fixes the loop — the *stable identity* (module-level constant) is. **However** `EMPTY` only covers the "missing draft" path. The moment `useDraft` returns a *populated* derived shape (e.g. selecting multiple draft fields into an object, or `Object.values(drafts)`), you need `useShallow` on TOP. So: frozen `EMPTY` for the default branch, `useShallow` for any multi-field/derived draft selector. Recommend the factory expose both correctly (see D).

**C-2 — "No exported `set`/`getState`" gate vs the "actions-outside-store" guidance: reconcilable, no contradiction.**
The docs' module-level-actions pattern (`practice-with-no-store-actions.md`) does `useStore.setState(...)` from a module function in the SAME file as the store. Orbweaver's gate bans *exporting* the raw `set`/`getState`/handle across module boundaries. These don't conflict: the doc pattern keeps `setState` private to the store's module and exposes named action functions — which is exactly "colocate, expose intent, hide the primitive." Our gate enforces the stronger half of the doc's OWN recommendation ("recommended way is to colocate actions"). The only thing to make explicit in the gate doc: module-level action fns that close over the store and call `setState` *internally* are allowed; what's banned is leaking the store handle/`setState`/`getState` to callers. That's a sharpening, not a conflict.

**C-3 — Nothing weird about one-store-per-concept.** `flux-inspired-practice.md` says "global state in a single store, split via slices if large" — but orbweaver runs MULTIPLE small stores (active selection / theme / stream buffer / drafts). The docs' "single store" advice is about not scattering ONE app's global state into many uncoordinated stores; multiple *domain-scoped* stores is fine and the multi-store examples (`beginner-typescript.md#multiple-stores`) endorse it. No issue.

**C-4 — Real risk we may be under-gating: the `persist` `merge`/hydration trio on the draft factory.**

- `persist` default `merge` is SHALLOW (`persisting-store-data.md#merge`). `drafts: Record<id, Partial<TInput>>` is a nested map. On rehydrate, default shallow merge REPLACES the whole `drafts` object with the persisted one (top-level key) — actually fine for a single `drafts` key, BUT if the store ALSO holds non-persisted sibling fields and `partialize` isn't set, the shallow merge can clobber. **Gate/ensure `partialize` returns ONLY `{drafts}`** so transient fields never hit storage (and never resurrect stale). This is the bigger, partly-irreversible risk you flagged.
- `version`+`migrate` ✅ present. Make `migrate` total over all known prior versions and default-safe for unknown (return a fresh empty `{drafts:{}}` rather than throwing).
- Consider whether draft writes should hit localStorage on EVERY keystroke (persist writes synchronously on each `set`). For a fast editor that's a lot of `JSON.stringify`. Not a correctness bug, a perf note.
- `onRehydrateStorage`/`hasHydrated`: only needed if UI must wait for hydration before showing a draft. In a CSR SPA with sync localStorage, the store is hydrated at creation (`persisting-store-data.md` "synchronous hydration… already hydrated at creation") — so for orbweaver you likely DON'T need `skipHydration`/`hasHydrated`. Correctly skippable unless you see a default-flash.

**C-5 — `≤10 fields` vs slices: make the gate count AUTHORED fields per file, not composed fields.**
`slices-pattern.md` deliberately grows the bounded store by composing slices, each in its own file. If `≤10` is measured on the final composed store object it will fight legitimate slicing; if measured per-`create`-file's directly-authored top-level keys it's a sane "keep each store small" rule. Confirm the gate's intent. For a slice-composed store the natural reading is "≤10 per slice file."

**C-6 — React 19 + Compiler: confirmed clean, nothing to hand-roll.** No `"use no memo"` directive anywhere in v5 docs; Zustand's reactivity is `useSyncExternalStore`, which the Compiler does not interfere with (it's an external-store subscription, not memoizable render state). The migration's only React note is "React 18 minimum." No accommodation. Don't add Compiler escape hatches around stores.

**C-7 — DU-as-state-machine in a store: idiomatic, but the docs give you NO machine primitive — so the gate IS the safety.** Docs only offer `set`-merges + optional `redux` reducer. A discriminated-union (`turnStarted→delta→turnCompleted|turnAborted`) modeled as `set(replace:true)` transitions is just immutable updating — fully supported. Watch the v5 `replace:true` strictness: `setState(x, true)` now requires a COMPLETE state object (`migrating-to-v5.md`), which actually HELPS — a DU transition that forgets a field won't type-check. Lean into `replace:true` for transitions so partial-merge can't leave a stale field from a previous phase.

**C-8 — Things we are NOT hand-rolling that we could be tempted to:** we correctly are NOT reaching for `combine`, `createWithEqualityFn`, `redux`, auto-selectors, or immer by default. Good — each is a layer of magic an amnesiac agent would have to re-learn. The only native thing worth ADOPTING that we're currently not using is `devtools` (dev-only) and `subscribeWithSelector` for the stream (see D).

### D. Adopt / sharpen shortlist

1. **Keep frozen `EMPTY` for the default branch; ADD `useShallow` for any multi-field/derived draft selector.** (`use-shallow.md`, `migrating-to-v5.md`) — they cover different cases; the factory's `useDraft(id)` returning `drafts[id] ?? EMPTY` is single-ref-safe, but a `useDraftFields(id, keys)` style selector that builds an object needs `useShallow`.

2. **In `createEntityDraftStore`, set `partialize: (s) => ({ drafts: s.drafts })`.** (`persist.md#partialize`, `persisting-store-data.md`) — guarantees only the draft map persists; no transient/derived field can leak stale data into localStorage (your "partly-irreversible" footgun #2). Gate this.

3. **Make `migrate` total + crash-proof: handle every known prior version and return `{drafts:{}}` for unrecognized.** (`persist.md#migrate`) — a throwing/partial migrate bricks the editor on a shape change.

4. **Default `merge` is shallow — explicitly accept it (since `drafts` is one top-level key) OR document why no deep-merge.** (`persisting-store-data.md#merge`) — if any persisted store ever holds nested-partial state, default merge silently drops sibling keys; the draft store is safe ONLY because `drafts` is the single persisted key. Write that assumption down.

5. **Use `replace:true` for lifecycle DU transitions.** (`migrating-to-v5.md` stricter-replace) — forces a complete next-state object per phase; prevents a stale field bleeding across `turnStarted→turnCompleted`. v5's stricter `replace` typing makes this safe and self-checking. (CHANGES plan: transitions should be `set(nextPhaseState, true)`, not partial `set`.)

6. **Stream buffer: split token churn behind `subscribeWithSelector` + transient `subscribe`, NOT a rendering selector, for the hot path.** (`subscribe-with-selector.md`, `create.md#subscribing-to-state-updates`) — chrome subscribes to lifecycle slice; the high-frequency token append writes to a ref/DOM via transient `subscribe` so per-token deltas don't trigger React renders. This operationalizes your "split per-token from lifecycle" rule with the native primitive.

7. **Add `devtools` (dev-only, outermost) to the lifecycle stores.** (`devtools.md`, `advanced-typescript.md` "devtools last") — name each transition (`set(next, true, 'turn/delta')`) so the DU timeline is inspectable. `enabled` already defaults to dev-only; ensure prod-stripped.

8. **For props-seeded / per-instance editor stores (if any draft store needs per-editor isolation), use vanilla `createStore` in `useState(()=>create(props))` behind context + `useStore`.** (`initialize-state-with-props.md`, `use-store.md`) — the blessed DI pattern; avoids a global store when a draft is scoped to one editor instance. Only if you actually need instance isolation.

9. **Test infra: adopt the `getInitialState()`-based reset registry for deterministic store resets between tests.** (`Spine-Testing.md`, `how-to-reset-state.md`) — `store.setState(store.getInitialState(), true)` in `afterEach`. Fits orbweaver's determinism gate; no `Date.now`/random in initial state.

10. **Keep curried `create<T>()(...)`; do NOT switch to `combine` for inference.** (`advanced-typescript.md`) — the rigor/one-home bar wants explicit state types; `combine`'s inference trades away `Object.keys`/`replace` soundness. (Confirms current plan; flagging because `combine` is tempting.)

### E. TypeScript best practices (v5)

- **Always curry: `create<T>()(stateCreatorFn)`** — the extra `()` is a workaround for TS#10571 so `T` is annotated while middleware mutators stay inferred (`advanced-typescript.md`, `beginner-typescript.md`). State generic `T` is invariant → can't be inferred from initial state, hence the manual annotation.
- **EXCEPTION: when a middleware CREATES the state (`combine`, `redux`, custom), drop the curry** — `create(combine(...))`, `create(redux(...))`. The state is now inferable (`advanced-typescript.md` final note).
- **Middlewares need no special typing if used immediately inside `create`** — `create<T>()(devtools(persist((set)=>..., {name})))` just works via contextual inference. Wrapping middlewares in a helper fn (`myMiddlewares`) breaks inference and needs the higher-kinded-mutator types (`advanced-typescript.md`).
- **Order matters for types: `devtools` OUTERMOST** (`devtools(immer(...))`) — it adds a type param to `setState`; inner middlewares mutating `setState` after it lose it.
- **Slice typing:** `const createXSlice: StateCreator<FullStore, [], [], XSlice> = (set,get) => ({...})`. With middleware, replace the 2nd param with the mutator tuple, e.g. `StateCreator<Full, [['zustand/devtools', never]], [], XSlice>` (`advanced-typescript.md#slices-pattern`, `devtools.md`). Mutator reference list: `devtools`=`['zustand/devtools',never]`, `persist`=`['zustand/persist', PersistedShape]`, `immer`=`['zustand/immer',never]`, `subscribeWithSelector`=`['zustand/subscribeWithSelector',never]`, `redux`=`['zustand/redux',Action]`, `combine`=none.
- **`persist` mutator generic = the PERSISTED shape** (return type of `partialize`, else `Partial<State>`); if it won't resolve, fall back to `unknown` (`advanced-typescript.md`). For `createEntityDraftStore`, the persisted shape is `{ drafts: Record<id, Partial<TInput>> }`.
- **`combine` inference** is structural and "lies" that `set`/`get` see only the first arg → `Object.keys(get())` returns MORE than the typed keys, and `set({},true)` deletes actions. Avoid `combine` where you do reflective/`replace` work (`advanced-typescript.md` "Be a little careful").
- **Typing selectors / `ExtractState`:** `type S = ExtractState<typeof useStore>` (built-in, `beginner-typescript.md`) for tests/utilities/props instead of re-declaring. Bounded vanilla-store hook: write the overloaded `useBearStore(): T / <U>(sel)=>U` wrapper or `createBoundedUseStore` (`advanced-typescript.md`).
- **`setState(partial, replace)` v5 strict typing:** `replace:true` overload demands a COMPLETE `T` (`migrating-to-v5.md`). Dynamic replace flag → cast `as Parameters<typeof store.setState>`.
- **Strict mode:** all examples assume `strict`. `create<T>()` + slice `StateCreator` typing are strict-clean. The one unsound spot is calling `get()` synchronously during initial-state creation (returns `undefined` though typed `T`) — never read `get()` while building initial state (`advanced-typescript.md` proof).
- **Maps/Sets typing:** init with hints (`new Set([] as string[])`) or you get `never[]` (`maps-and-sets-usage.md`).

### F. Open forks for Nate

1. **`Object.freeze` on `EMPTY` — keep or drop?** The stability fix is the module-level constant identity; `freeze` only adds mutation-protection. Keep it (cheap, prevents a consumer mutating the shared default) or drop as ceremony? My call: keep — it's a one-time cost and documents intent. (Confirms your plan; it's not the loop-fixer though — make sure the gate's rationale says "stable identity," not "freeze," fixes the infinite loop.)

2. **Draft persistence cadence.** `persist` writes to localStorage on every `set` → every keystroke `JSON.stringify`s the whole `drafts` map. Acceptable, or debounce writes via a custom `storage` wrapper? Probably fine at orbweaver's scale; flag only if profiling shows jank.

3. **`devtools` adoption — in or out?** It's the one native capability you're not using that materially helps debugging the DU lifecycle. Dev-only, zero prod cost. Recommend in. Your call given "no magic layers for amnesiac agents."

4. **Stream buffer transport: transient `subscribe` (no render) vs a tightly-scoped `useShallow` selector.** Transient is strictly faster (zero renders) but moves token rendering outside React's model (manual DOM/ref writes). Is the token stream a DOM-direct write (transient) or a React-rendered list (then narrow selector + virtualization)? Decides which native tool.

5. **Does any draft store need PER-INSTANCE isolation?** If two editors can be open on the same entity type simultaneously with independent drafts, the global `Record<id,...>` keyed by id already handles it — but if drafts must be scoped to an editor instance (not an entity id), switch to the vanilla-`createStore`-in-context DI pattern (`initialize-state-with-props.md`). Confirm the keying model.

6. **`≤10 fields` gate semantics:** authored-per-file or composed-per-store? (See C-5.) Needs a one-line decision in the gate doc so slicing isn't accidentally blocked.

#### One-screen TL;DR

- Frozen `EMPTY` is **correct and doc-prescribed**, **not** redundant with `useShallow` — they fix different things (stable default ref vs memoized derived output). Keep both; use `useShallow` for multi-field draft selectors.
- v5 dropped v4's implicit shallow equality (default is now `Object.is`), so the fresh-`{}`/`[]`-from-selector gate is **more** necessary now, not less.
- "No exported `set`/`getState`" **aligns** with the docs' own "colocate actions" recommendation; it just enforces the stronger half. No conflict.
- Biggest under-gated risk: `persist` default `merge` is shallow → **add `partialize:{drafts}`** and make `migrate` total/crash-proof.
- Adopt: `replace:true` for DU transitions (v5 makes it self-checking), `subscribeWithSelector`/transient `subscribe` for the token stream, dev-only `devtools`. Skip: `combine`, `createWithEqualityFn`, `redux`, auto-selectors, immer (by default).
- React 19 + Compiler: **clean**, no `"use no memo"` needed (it's `useSyncExternalStore`).
