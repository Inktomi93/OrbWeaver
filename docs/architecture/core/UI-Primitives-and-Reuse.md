---
kind: law
status: active
updated: 2026-07-13
---

# UI-Primitives-and-Reuse

> **The client reuse-model law (§13).** Decision records: D42–D44, D52, D54 (+ the D66 amendments) in `Core-Laws-and-Precedents.md`. §-map + reading order: `UI-Architecture-and-Layout.md` header; the `@orb/ui` package build law is `ui-package-design.md`. Provenance/lineage archive: `../history/ui-primitives-archaeology-record.md`.

## 13. The reuse model — the central primitives every feature builds on (D54)

> The §11.0 thesis — *every footgun carried by STRUCTURE, never convention* — **extended from footguns to boilerplate**: a feature converges to **config + a field/row renderer**; all wiring (fetch · cache · invalidate · optimistic · error · virtualize · select · seed · dirty · lifecycle) lives in a primitive the call site **cannot bypass or get wrong**. BUILT — the `@orb/ui` primitives and the client `{data,forms,state}` factories. Evidence: the five `UI-Lib-*` mines + `../history/ui-primitives-archaeology-record.md`.

### 13.0 The litmus (what gets centralized, what stays in the feature)

- **Central (the call site cannot opt out):** wiring, lifecycle, and the footguns — fetch/cache/invalidate, optimistic+rollback, the dirty/reset/seed dance, virtualization, selection, error channels.
- **Feature-owned:** the fields, the row/card visuals, the copy, the per-field control choice.
- **The bar to centralize:** repeated **3+ times AND changing together**. A genuine one-off stays hand-composed from `@orb/ui` — premature DRY is still a cost even here.

### 13.1 The primitive catalog (BUILT — packages/client/src/{data,forms})

- **`createEntityMutation`** — bakes the canonical 4-phase optimistic flow: `onMutate` = `cancelQueries` → snapshot → `setQueryData` patch → return rollback; `onError` restores; `onSettled` invalidates **via the central seam**. Uses the `context.client` arg (provider-clean). A lightweight variables-render mode for append-only creates. **Resets the v5 sticky error on next `mutate`.** Returns ONE error slot per mutation (`{ error, clear() }`), never multiplexed.
- **`createCollectionSurface`** — one machine for every browse view. Feature supplies the (infinite) query + row renderer + filter config + bulk actions. Bakes `useInfiniteQuery` + `maxPages` + `placeholderData: keepPreviousData` gated on `isPlaceholderData`, the virtual-list seal, the selection store, empty/loading/error, and the tail-fetch guard **off the virtualizer's own range** — no `react-intersection-observer`.
- **`useGatedQuery` / `skipToken`** — a null id yields `skipToken` (never builds the key); kills the `castId("")` sentinel (gate `no-fake-disabled-id`).
- **`<QueryBoundary>`** — the `QueryErrorResetBoundary` → `ErrorBoundary onReset` handshake (a retry that actually refetches) + `useSuspenseQuery`/`useSuspenseQueries` (non-null data, Compiler-clean; queries-plural for parallel) + `useTransition` around pane switches (pairs with `<Activity>`). Every error boundary (this one, `MarkdownErrorBoundary`, sandbox-frame failures) attaches `captureOwnerStack()` in a DEV-only `onError` — owner-stack attribution for throws from deep inside sealed satellites; no-op in prod.
- **`createSavedEntityForm` / `createAutosaveEntityForm`** — the editor factories (§13.4 for the six-obligation contract + the surface map).
- **`@orb/ui/virtual-list` (generic) + `@orb/ui/message-list` (chat)** — BUILT (§11.3).
- **The central seams:** `invalidation.ts` event→`queryFilter` map (`no-inline-invalidate-outside-seam`); bus→cache `onData` = buffer-local + `invalidate(readKey)`, never a 2nd store (`bus-onData-no-store-write`); stream writes through the pure reducer (`chat-stream-writes-in-bus-only`); queryKeys 100% tRPC-proxy (`no-array-literal-querykey`).
- **`QueryClient` defaults:** §6.1 (one home).
- **State — Zustand (§5), standardized:** one `create`/file · ≤10 authored fields · no exported `set`/`getState` · `persist` with **`partialize` to the persisted key + a total/crash-proof `migrate`** (default `merge` is shallow) · `set(next, true)` **replace** for DU lifecycle transitions (a dropped field is a typecheck error) · `createEntityDraftStore` keeps the frozen `EMPTY` default-ref **and** adds `useShallow` for multi-field selectors (different jobs) · token-stream split from lifecycle (`subscribeWithSelector` + transient `subscribe`, zero renders) · dev-only `devtools`.

### 13.2 The standardization map — for surface X, reach for primitive Y (the cold-agent lookup)

| You are building… | Use | NOT |
| - | - | - |
| a browse/list/grid of entities | `createCollectionSurface` | a hand-wired query+list+filter |
| an entity edit/create form (≥3 fields) | a **form factory** (§13.4) | a hand-rolled `useAppForm` |
| a create/update/delete action | `createEntityMutation` | inline `useMutation` + `setQueryData` |
| a read that shows loading/error | `useGatedQuery` in `<QueryBoundary>` | bare `useQuery` + `isPending` ladders |
| a conditional/disabled query | `useGatedQuery` (`skipToken`) | `castId("")` + `enabled` |
| a search/filter box over a big collection | `useDeferredValue(query, { initialValue })` feeding the list | a debounce hack · filtering inside a transition |
| a virtualized list | `@orb/ui/virtual-list` | raw `useVirtualizer` |
| the chat message list | `@orb/ui/message-list` | a hand-rolled scroll/anchor hook |
| a virtualized media/thumbnail grid | `@orb/ui/media-grid` | a lanes hack on virtual-list |
| a chart | `@orb/ui/chart` (+ `bar-list`/`histogram`/`stat-figure`) | raw `echarts` / a `<div style=width>` |
| a 1-D magnitude bar | `@orb/ui/meter` | a hand-rolled `<span style=width>` |
| cache invalidation | `invalidate(event)` (the seam) | inline `invalidateQueries` |
| global client state | one gated Zustand store | exported `set`/`getState`, >10 fields |
| an editor draft | `createEntityDraftStore` | a bespoke persist store |
| an entity list row (chats, presets, books, docs) | `@orb/ui/list-row` (leading · title/subtitle · trailing actions · selected) | a `Card interactive` or hand-rolled row |
| a settings row | `@orb/ui/setting-row` | hand-rolled label+control Stacks |
| bulk-select mode chrome | `@orb/ui/selection-bar` | a bespoke count+actions footer |
| an editor's save/dirty bar | `@orb/ui/save-bar` | a bespoke sticky footer |
| the ⌘K palette / any picker-with-search | `@orb/ui/command` (cmdk seal) | a hand-rolled filtered list |
| a keyboard-hint chip | `@orb/ui/kbd` | inline mono spans |
| a route / auth gate | Router `beforeLoad`+`redirect` (§6.1) | `useBlocker` for an in-app pane guard |
| the editor "unsaved? leave?" guard | a **hand-rolled in-app** guard off view-state | `useBlocker` (won't fire on a pane swap) |
| single-route pane transition | hand-rolled `document.startViewTransition()` | the router's VT (won't fire; `pathChanged` is constant) |

### 13.3 The new gates (machine-enforced — added by D54)

Enforcement state per gate: §8 (LIVE vs PARKED). The D54 set (plan-time names; as-built in parens): `no-static-staletime-on-bus-keys` (built `no-static-staletime`) · `no-inline-cache-surgery-in-stream` (built `chat-stream-writes-in-bus-only`; scoped to subscription/stream bodies — must NOT flag `createEntityMutation.onMutate`) · `persist-partialize-and-total-migrate` · `form-factory-for-multifield` · `virtualizer-only-in-seal` (LIVE — dep-cruiser `ui-satellite-seals`) · the upstream linters `@tanstack/eslint-plugin-query` + `eslint-plugin-react-hooks` (LIVE — `eslint.config.js`; the Compiler's Rules-of-React enforcement is load-bearing, not optional).

The Form factory bakes: pill off `!isDefaultValue` · **no hand-rolled `fieldValuesEqual`** (lib does deep compare) · post-submit-effect `reset(saved)` · version-locked `dontUpdateMeta` + a guard test · `useSelector` (not `useStore`).

### 13.4 Where to use Form — the surface map (the under-use correction)

The §6.1 rule applied. **Trigger = ≥3 fields OR validation OR save/draft semantics** — *Form is for forms, not for "entities."* The six obligations the factories bake (verified FACTORY-ORIGINAL — no example or doc fixes them): seed-on-load · `key`-remount on id change · post-submit `reset(saved)` · the `seededRef + persistent-isDirty` reseed guard · the Zustand-`persist` draft mirror (autosave; OPTIONAL on saved, see the obligation-5 doctrine below) · `dontUpdateMeta` on non-user writes.

Factory column = the factory each surface uses TODAY (code is the truth). D66 A4 (autosave everywhere) + the north-star §6 rollout flip the button-gated entity editors to autosave as they land — marked **COMMITTED, not yet built** where the code still gates on a button.

| Surface | Factory (today) | Why |
| - | - | - |
| Character card editor | `createSavedEntityForm` (+ optional `draft` mirror) | long authored text; button-gated (save-bar + DirtyPill still live). D66 A4 flips to autosave — COMMITTED, not yet built |
| Preset editor | `createSavedEntityForm` | many fields; button-gated. D66 A4 flips to autosave (`Save preset` removed) — COMMITTED, not yet built |
| World-info / lorebook entry | `createSavedEntityForm` | multi-field; button-gated. North-star §6 flips to autosave — COMMITTED, not yet built |
| Persona editor | `createAutosaveEntityForm` | multi-field |
| Group-chat create + config | `createAutosaveEntityForm` | immediate-commit chat law (no save-bar); the whole-object DU rebuild lives in the save fn |
| Room overrides (per-chat) | `createAutosaveEntityForm` | flip-and-it-saves |
| Settings panels (appearance / system / connection config) | `createAutosaveEntityForm` | many grouped toggles, save-on-change |
| Connection / credential add+edit | `createSavedEntityForm` | multi-field + validation (never autosave a half-typed credential) |
| User-admin create / edit user | `createSavedEntityForm` | multi-field + validation |
| D44 theme editor | `createSavedEntityForm` | the token subset (§12.1) |
| — stays controlled + Zod — | | search box · lone toggle · single rename · login (2-field): trivial, no toolkit tax |

**The under-use correction:** Form is for ANY multi-field / validation / save-or-draft surface — settings, connections, group config, theme, and user-admin all belong in a factory, not just the four entity editors.

**Obligation-5 — the crash-mirror `draft` slot, when it earns its keep:** on an AUTOSAVE form the server row IS the crash mirror (a confirmed save lands within the debounce window), so the `draft` slot is OMITTED — a local mirror would duplicate synced truth (§12.1; the `use-appearance-form` / `use-persona-form` precedent). It earns its keep only for offline-heavy or long-invalid-mid-edit autosave panels. On a SAVED (button-gated) form `createSavedEntityForm` takes an OPTIONAL `draft` crash mirror: it seeds `defaultValues` from the SERVER row ONLY (so `isDefaultValue` still compares against server truth), then PROMOTES any surviving draft after mount as user-intent writes so `!isDefaultValue` lights the pill honestly (a restored draft that read "clean" would silently drop the work on the next navigation); a `draftSeededRef` makes the promotion mount-once so a background refetch can't re-apply it, a debounced form-level listener mirrors every real change (skipping the untouched seed so an open never mints a draft), and the slot clears on a confirmed save AND on `discard()`. Omitting `draft` is byte-identical to plain button-gated behavior. Required for editors whose fields carry long authored text (the character card editor is the founding consumer). Every `createEntityDraftStore` name registers in the `persistence-boundary` gate's DEVICE\_LOCAL\_REGISTRY. (Codification trail: `../history/ui-primitives-archaeology-record.md`.)

### 13.5 Deferred-with-a-committed-default forks (D54)

- **Editor draft layer** — DEFAULT: TanStack Form + the Zustand-`persist` draft store + the factory seed/dirty guards. Deferred upgrade: **TanStack DB** local-storage-collection + manual transactions would dissolve the dirty/reset/seed dance — revisit when TanStack DB hits 1.0 + a proven Form-editor recipe. **The factory IS the swap seam.**
- **Token enforcement** — DEFAULT Tailwind v4 + DTCG + gates; deferred **Panda `strictTokens`** (§3/§10).

### 13.6 The primitive-or-flag rule (non-negotiable)

The §13.2 map is the cold-agent contract: a surface not using its primitive is the review flag. The primitives + their gates shipped BEFORE the feature lanes (born-compliant) precisely so a feature can never land ahead of the belt that enforces it — the sequencing history is in `../history/ui-primitives-archaeology-record.md`.

### 13.7 The `@orb/ui` primitive & CT structural contract (BUILT — gate `ui-primitive-structure`)

`@orb/ui` drifted into competing micro-conventions across parallel builds; this contract is the reconciled canonical shape, **machine-enforced by `scripts/check/gates/ui-primitive-structure.ts`** (8 clauses — the gate file is the enforcer; this § is the WHY a clause exists). `ui-package-design.md` points here as the canonical home of the structural contract — the §-numbering is load-bearing, do not renumber.

- **The primitive trio.** `primitives/<name>/` = `<name>.tsx` (named export, no default) + `index.ts` (the ONLY consumer import) + `variants.ts`, plus optional `handle.ts` (imperative `createHandle`). Variants-exempt allowlist: `icons`, `virtual-list`, `message-list`, `aria-announcer`, `file-trigger` (sealed satellites/barrels with no skin of their own); `code-editor`/`content/*`/`markdown`/`lib` live outside `primitives/`; `layout/` shares one `variants.ts` for the kit.
- **Variants naming:** exactly one `tv()` export named **`{camelName}Variants`** (greppable, reserved-word-safe — `switch` forced the suffix anyway).
- **Variants are INTERNAL:** `index.ts` never re-exports `./variants` — re-exporting the tv config lets a feature compose raw variants and bypass the component skin, the exact "config leaks out of its owner" vector that rotted neo. A sibling primitive composing another's variants imports the **relative path**, never the public subpath.
- **Component internals:** props `extends {BaseUIProps | ComponentProps<"tag">}, VariantProps<typeof xVariants>`; class composition `cn(xVariants({…}), className)` — `className` last so callers can override; the raw Base UI component never escapes the seal; slots carry `data-slot="<name>-<part>"` (the CT locator surface).
- **Icons:** `@orb/ui/icons` is the ONE icon home (curated lucide re-export + `<Icon>` sizing wrapper, `ICON_XS/SM/MD/LG` = 12/16/20/24). **No inline `<svg>` glyphs in primitives** — control glyphs (checkmark, steppers, chevrons) render the lucide glyph inside the Base UI `Indicator` slot. `<svg>` is legal ONLY in the data-viz allowlist (`charts/meter`, `segmented-clock` — geometry, not icons).
- **CT contract (`tests/ui/**`):** every styled primitive has a co-located `<name>.ct.tsx` (exempt: `icons`). Token color assertions use **`toHaveCSS(prop, TOKENS[path].value)`** against the generated map — never a hardcoded `oklch()`/hex literal (token values are generated and non-unique; a literal silently keeps passing against the OLD value after a `tokens.json` tweak). Global providers stack once in `tests/support/ct/ct-providers.tsx` via `beforeMount` — no inline `<*Provider>` in a `.ct.tsx` (fail-closed; drawer-local providers are the sole allowlist). `ThemeScope` applies per-case only when a theme override is supplied (it renders a real wrapper `<div>` that would shift the mount root). Overlay/surface primitives keep a co-located `<name>.fixtures.tsx` story — do NOT centralize fixtures, only providers.
- **Overlay anatomy (two sub-families — a naive "all overlays need a Positioner" false-fires):** anchored floats (popover/menu/select/autocomplete/tooltip) = Portal→`Positioner`→`Popup`; modals (dialog/alert-dialog/drawer) = `Backdrop`+`Popup`, correctly NO Positioner.
- **The dead package:** `@base-ui-components/react` (rc-era) is biome-banned (`noRestrictedImports`); the live package is `@base-ui/react`.

### 13.8 Primitive authoring rules (BINDING — the recurring-mistake preamble for every `@orb/ui` build/extension)

Codified after a full seal review found the same miss-class across agents: thin wraps that under-use Base UI, hand-roll what the lib ships, pick the wrong primitive, and theorize instead of test. **YAGNI is OFF for primitives — a committed primitive gets the FULL cold-read treatment; a missing native capability is a DEFECT, not a deferral.**

- **R1 — Read the shipped `.d.ts` FIRST, never memory or runtime probing.** `node_modules/@base-ui/react/<component>/**/*.d.ts`: the parts list, the Root props, the generics. The wrap is written against THAT surface, not a training-data recollection.
- **R2 — Expose the FULL native part + prop surface.** If Base UI ships it, the seal surfaces it (`Toast.Action`, `Field.Control`, `Menu.CheckboxItem`, `Select multiple`, `Slider` range, `Tabs.Indicator`, `Collapsible keepMounted`, …). A part may be omitted ONLY when a design decision makes it meaningless, documented inline with the reason.
- **R3 — Native-part-first: never hand-roll what the lib ships.** A hand-rolled checkmark, spinner SVG, chip, or dismiss button when Base UI/lucide has it is the seal failing its purpose. Grep the parts list before writing any `<svg>`/`<span>`/`<button>` inside a seal.
- **R4 — Pick the RIGHT primitive by VALUE TYPE:** multi-select / object-items / chips → **Combobox** (never Autocomplete); free-text + suggestions → **Autocomplete**; single-select fixed list → **Select**; confirm/destructive → **AlertDialog** (never Dialog); pressable on/off → **Toggle**; bound on/off state → **Switch**.
- **R5 — Extend the Base props type for passthrough** (`interface XProps extends BaseXRootProps` or a deliberate `Omit`). Never hand-pick a prop subset that silently drops the rest.
- **R6 — Empirical over theory: no root-cause claim without a failing test.** An "X breaks under Y" claim not backed by a red test is banned from the codebase.
- **R7 — Mandatory acceptance-test shapes:** a collection-prop primitive gets a CT where the parent re-renders passing a freshly-derived array; a Field-composable control gets a CT asserting label association + `aria-describedby` inside `<Field>`; every interactive primitive gets the 8 states (default · hover · focus-visible · active · disabled · loading · error · success) + keyboard operation + the a11y contract.
- **R8 — Verify LIVE-doc behavior the `.d.ts` can't show** (keyboard, animation data-attrs) at `base-ui.com/react/components/<name>`; record any API delta in the component doc-comment, factually.

### 13.9 Homing + the parked list

**The homing rule:** a factory that touches tRPC/Query/Form/Zustand types is CLIENT-side (`packages/client`); a pure component/DOM/string-math primitive is UI-side. The `@orb/ui` inclusion litmus: **domain-agnostic** (a `Button`, never a `CharacterCardTile`) AND ≥1 committed consumer. Domain components live in `client/features`.

**Deliberately NOT `@orb/ui` (adjudicated app-level — do not re-carve):** `resizable`/split panes (D54 dropped `react-resizable-panels`; the shell uses the §11.1 clamp-overlay — reopening it is a ledger decision) · `sheet` (folded into drawer side variants) · `label` (folded into `field`) · app-splash / route-error-fallback / dialog-state-gate (app-shell chrome) · **weave-glyph — RE-HOMED by D62 to `packages/client/src/lib/` (the cross-cutting display seam): features cannot import app-shell, and D62's empty-state decorations need the glyph across features; still NOT `@orb/ui` (brand, not a domain-agnostic primitive)** · proposal-diff, reasoning-block, swipe-strip, composer internals (feature components over the primitives) · CapabilityGrantList (no committed consumer/design yet — compose at feature level when one appears).

**Primitive deltas land under the §13.7 contract + §13.8 rules — one governance home.** The D62 delta set (new `kbd`; `Text` `micro`/`caps`; decoupled `Avatar` size tokens `avatar-sm/md/lg`/`avatar-hero` + per-entity fallback hue; `Dialog` width variants `sm/md/lg/xl` + `full`; `EmptyState` `action`/`decoration` slots; `Skeleton` shimmer; `Button` `secondary` bordered + muted `ghost`) is BUILT — the code + `tokens.json` are the doc; the delta narrative is in `../history/ui-primitives-archaeology-record.md`. **`table` IS an `@orb/ui` primitive** (built + exported `./table`): a data/analytics consumer is anticipated, so it is NOT re-carved to feature level. `component-size-ui` stays DORMANT until that consumer lands and `table.tsx` naturally splits under the 450-line cap.
