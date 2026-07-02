# `@orb/ui` — the package design (structure · scaffold · factories · build order)

> **Status: prescriptive build design (2026-07-02).** The build plan for the `@orb/ui` package — the
> frontend cake leaf (`kit ← contracts ← ui ← client`, D42). The law this doc executes is the nine
> `core/UI-*.md` docs + ledger D42/D43/D44/D52/D54 (+ D58 for the meter/clock kinds); **those win on
> any conflict with this doc** — this doc adds only (a) the concrete scaffold decisions the law
> leaves open, (b) the factory inventory with homes/signatures/obligations, (c) the build order, and
> (d) the recorded doc-vs-current-API deltas from the 2026-07 registry verification.
>
> **Why `@orb/ui` is buildable NOW (mid-Phase-5):** per D42 physics it depends on NOTHING in flight —
> no `@orb/contracts`, no `@orb/server`, no `@orb/db`, no domain code. Its deps are Base UI + the
> sealed satellite libs + `@orb/kit` (isomorphic-pure only). Every primitive here is
> domain-agnostic (`Button`/`Meter`/`MessageMedia`, never `Character`/`Chat`).

---

## 1. Position in the cake + the physics

```
kit ─┬─→ contracts ─┬─→ db ─→ server           (backend arm)
     │              └─→ (client, type-only)
     └─→ ui ─────────────────→ client           (frontend arm — @orb/ui)
```

- **`@orb/ui` deps:** `@orb/kit` (workspace) + the sealed satellites (§3). **NEVER**
  `@orb/contracts` / `@orb/db` / `@orb/server` / `@orb/client`. Enforced at three tiers:
  1. **resolver** — those packages are not in `packages/ui/package.json` (an import cannot resolve);
  2. **lint** — biome `noUndeclaredDependencies` (an undeclared import is an error);
  3. **dep-cruiser** — the `ui-cake` rule (backstop for deep `../../` escapes), plus
     `ui-no-node-builtins` (ui is browser code; `node:*` is banned, same as kit).
- **`react` + `react-dom` are PEERS.** D54 said "peer `react` ONLY"; **recorded delta:**
  `@base-ui/react@1.6.0` itself declares `react-dom` as a required peer, so `@orb/ui` peers BOTH.
  The intent is preserved — the client remains the renderer/provider; ui never bundles React.
  (`@date-fns/tz`/`date-fns` are OPTIONAL Base UI peers for date components we don't wrap — not installed.)
- **Contracts-adjacent primitives use ui-local STRUCTURAL props, never a contracts import.**
  `MessageMedia` takes `{ src: MessageMediaSource; … }` where `MessageMediaSource` is a ui-local
  discriminated union structurally compatible with the D44 `MessageContentBlock.media` fields;
  `ThemeScope` takes a ui-local `ThemeScopeTokens` shape matching the D44 §12.1 subset. The
  contracts↔ui structural pairing is asserted by a **type-level test in the client phase** (tests
  may import both packages; the packages never import each other). This is the same discipline as
  the server's injected-op contract types.

## 2. Package layout (the D42 §2 tree, D54-corrected — this is the shipped shape)

```
packages/ui/
  package.json          # §3 — the ONLY package depending on the sealed satellites
  tsconfig.json         # extends ../../tsconfig.base.json + dom libs + react-jsx (mirrors client)
  tokens.build.ts       # the DTCG → (@theme CSS + TS map) codegen entry (style-dictionary v5, §4)
  src/
    tokens/             # tokens.json (DTCG source) · index.ts (GENERATED typed map) — promote to
                        #   @orb/tokens only on a 2nd consumer
    primitives/         # each dir seals ONE headless behavior behind an orbweaver API
      button/  { button.tsx · variants.ts · index.ts }        ← Base UI
      dialog/ popover/ tooltip/ tabs/ select/ switch/ slider/ menu/ field/ input/
      number-field/ avatar/                                    ← Base UI (avatar/number-field: D54)
      toast/ drawer/                                           ← Base UI NATIVE (D54 — no sonner, no vaul)
      command/            ← cmdk (deferred chunk)
      sortable/           ← @dnd-kit/react (deferred chunk)
      virtual-list/       ← TanStack Virtual, directDomUpdates (D54)
      message-list/       ← the chat seal (deferred to the chat client chunk; same lib)
      icons/              ← lucide-react (the ONE icon set; gate icons-lucide-only)
    layout/             # Stack · Row · Section · Toolbar · Container (owns container-type — §4-tier
                        #   model; Toolbar = Base UI Toolbar for roving-tabindex + our layout skin)
    charts/             # seals ECharts (deferred to the corpus client chunk — D52)
      meter/            # Meter (linear/arc/bipolar + milestones/dangerBelow) + SegmentedClock —
                        #   plain CSS/SVG, NOT the chart lib (D52/D58; rpg-design/11 §2); exported ./meter
    markdown/           # seals Streamdown — TWO trust policies (UI-Gates §11.6) + toPlainText
                        #   (remark strip-markdown, D54) — the Tier-A allowlist lives HERE (D44 §12.2)
    stream/             # useSmoothText pacer + TTFT shimmer (deferred; §6.3.1 — pure string-math)
    content/            # sandbox-frame · MessageMedia · ThemeScope · lightbox (D44 — the security trio)
    code-editor/        # seals CodeMirror 6, token-themed (custom-CSS field · Tier-B card CSS · D46)
    diff/               # seals `diff` (jsdiff) — snapshot/edit-history diff views (D28/D54)
    lib/   { cn.ts }    # tailwind-variants' built-in merge, re-exported
    styles/ { globals.css · theme.css (GENERATED @theme) }
  (no src/index.ts barrel — subpath exports only, one per group; see below)
```

- **Subpath exports, explicit map.** The sibling `"./*": "./src/*/index.ts"` pattern would force
  every primitive to the src root; the D42 tree nests them. So `package.json#exports` is an
  **explicit map** (`"./button": "./src/primitives/button/index.ts"`, `"./meter":
  "./src/charts/meter/index.ts"`, `"./markdown": "./src/markdown/index.ts"`, …) grown per chunk.
  There is deliberately **no root barrel** — importing `@orb/ui` flat would defeat tree-shaking and
  blur the seal boundaries. `styles` are exported as `"./styles/globals.css"` (the client's one CSS
  import) — the generated `@theme` rides inside it.
- **`package-layout` gate:** `ui` is added to `scripts/check/gates/package-layout.ts` (no loose
  `.ts` at `src/` root except nothing — even `index.ts` doesn't exist here) and `test-layout.ts`
  gains the `tests/ui` mirror.

## 3. Dependencies (verified against the live registry, 2026-07-02)

| Dep | Version | Role | Doc-vs-current delta |
| --- | --- | --- | --- |
| `@base-ui/react` | ^1.6.0 | THE headless primitive (D42) | ✅ as documented (1.6.x; the `@base-ui-components/react` name is the DEAD rc-era package — never install it). v1 broke RC-era APIs: **every wrap is written against the live per-component docs (base-ui.com), never memory.** |
| `tailwind-variants` | ^3.2.2 | variants + slots + `cn` (subsumes cva/clsx/tw-merge — D54) | ⚠️ docs said "v1"; current major is **3.x**. API verified at build: `tv()`, `slots`, `VariantProps` all present; deltas recorded in the variants convention (§5) if any surface. |
| `lucide-react` | ^1.23.0 | icons (gate `icons-lucide-only`) | ✅ |
| `@tanstack/react-virtual` | ^3.14.5 | virtual-list/message-list seals | ✅ ≥3.14.3 (`directDomUpdates` fix) + core ≥3.16 chat APIs per D54 |
| `streamdown` | ^2.5.0 | markdown seal | ✅ meets the D43 "floor ≥2.5" build-gate |
| `codemirror` + `@codemirror/lang-css` | ^6.0.2 / ^6.3.1 | code-editor seal | ✅ CM6 |
| `diff` | ^9.0.0 | diff seal | ⚠️ docs said "v8+"; current is **9.x** — same modern TS/async surface, ^9 pinned |
| `zod` | catalog (^4.4.3) | the `ThemeScope` ui-local clamp (§7) | isomorphic-pure; already a kit dep — legal everywhere |
| `remark` + `strip-markdown` | ^15 / ^6 | `toPlainText` (D54 — previews/snippets) | ✅ same unified pipeline as Streamdown |
| `cmdk` | ^1.1.1 | command seal | deferred chunk — added to `package.json` WHEN the seal builds (deps grow per chunk; no dead deps) |
| `@dnd-kit/react` | ^0.5.0 | sortable seal | deferred chunk (the rewrite — still 0.x; re-verify API at build) |
| `echarts` + `echarts-for-react` | ^6.1.0 / ^3.0.6 | charts seal (D52) | deferred chunk (corpus client) |
| **peer** `react` / `react-dom` | ^19 | the renderer stays the client's | see §1 — react-dom peer is a Base UI requirement (recorded delta vs D54's "react only") |
| **dev** `@types/react`(-dom), `react`, `react-dom`, `tailwindcss`, `@tailwindcss/vite`, `style-dictionary` | catalog | typecheck + token codegen + CT | `style-dictionary` current major is **5.x** (docs said v4) — v5 is ESM/async; DTCG support intact. Recorded delta. |

**DROPPED (D54 — do not re-add without a ledger decision):** `sonner` (→ Base UI Toast),
`vaul` (→ Base UI Drawer — verified present as `@base-ui/react/drawer` in 1.6.0),
`react-resizable-panels` (the shell uses the §11.1 clamp-overlay), `cva`/`clsx`/`tailwind-merge`
(→ tailwind-variants), DOMPurify (sanitize is native inside Streamdown — D54).

## 4. Tokens — the DTCG pipeline (concrete)

- **Source:** `src/tokens/tokens.json` — W3C DTCG (`$value`/`$type`). Seeded from the design seed
  (the DESIGN.md OKLCH Hearth ramp + Ember accent + Geist + the radius/spacing/motion scales —
  UI-Arch §4.1 keeps ONLY the palette from that seed) plus the scales the law mandates:
  - **color** — the Hearth ramp (`background`/`foreground`/`card`/`popover`/`primary`(Ember)/
    `secondary`/`muted`/`accent`/`destructive`/`success`/`border`/`input`/`ring`/`sidebar` set), the
    **`--scrim`** token (D43 §11.4 — theme-aware overlay; never `bg-black/50`), the chart ramp
    (`--chart-1..5`), and the **prose/bubble semantics** (`--user-bubble`/`--user-bubble-fg`/
    `--ai-bubble`/`--ai-bubble-fg`/`--dialogue`/`--narration`/`--body`/`--speaker-name`) — the D44
    §12.1 ThemeScope override TARGETS, defaulting to ramp values.
  - **spacing** — the 4px scale + the intent tokens (`gap-field/row/block/section/gutter`,
    `p-row/block/section/gutter`) the grit gates point at.
  - **control heights** — `--control-sm/md/lg` with the **≥44px touch floor** (gate
    `touch-target-floor`, §4b axis 3; `data-density="compact"` tightens for fine pointers).
  - **container breakpoints** — `--cq-sm/md/lg` (§3 — container queries use named tokens).
  - **type** — the Geist scale (display/headline/title/body/label/mono per the seed table);
    **radius** (`base/control/card/full`); **z** scale; **motion** (`--motion-fast/base/layout` +
    `--ease-out-expo`, reduced-motion floor unlayered in globals.css per D43 §11.4e).
- **Codegen:** `tokens.build.ts` (style-dictionary **v5** — recorded delta from the doc's v4; ESM
  API) emits BOTH `src/styles/theme.css` (the Tailwind v4 `@theme` block → utility namespaces) and
  `src/tokens/index.ts` (the typed TS map). Both are **committed, generated artifacts** with a
  DO-NOT-EDIT header.
- **Freshness is machine-enforced:** `tests/ui/tokens/freshness.test.ts` re-runs the codegen
  in-memory and diffs against the committed artifacts — hand-editing the theme or letting it drift
  from `tokens.json` FAILS `pnpm test`. ("Derived, never hand-authored" as a test, not a hope.)
- **Themes are value-sets over these names** (D44 §12.1): Hearth is `:root`; Mocha (the cool ramp)
  lands as a second value-set when the theme selector builds. NO structural mode exists.

## 5. Variants — the tailwind-variants conventions

- Every styled primitive has a `variants.ts` exporting a `tv()` config; multi-part primitives use
  **`slots`** (D54). Component props extend `VariantProps<typeof x>` — **a bad variant is a `tsc`
  error**; ad-hoc `className` styling on a primitive is lint-flagged (the token grit gates now
  cover `packages/ui/src` — §8).
- Class values reference THEME tokens only (`bg-primary`, `text-foreground`, `h-control-md`,
  `gap-row`, `rounded-control`, `z-overlay`) — raw values (`bg-[#…]`, `gap-[13px]`, `z-50`,
  `bg-black/50`) are gate-RED in ui exactly as in features (D43: **no `components/ui/` exemption**).
- `cn` = tailwind-variants' merge, re-exported from `@orb/ui/lib` — the one class-merge home.
- **Interaction states:** every interactive primitive defines the 8 states (default · hover ·
  focus-visible ring `--ring` 2px offset 2 · active · disabled · loading · error · success) in its
  variants — Base UI supplies the behavior/ARIA; the variants supply the skin.

## 6. THE FACTORY INVENTORY (the reusable machines — home · signature · obligations · tests)

The homing rule (one line): **a factory that touches tRPC/Query/Form/Zustand types is CLIENT-side
(`packages/client`, Phase 6); a pure component/DOM/string-math factory is UI-side.** The client
factories are inventoried here because this package is their substrate and their contracts are law
(UI-Primitives §13.1/§13.4) — a Phase-6 agent builds them against THIS table.

### 6.1 UI-side (this package)

| Factory / primitive | Signature (shape) | Obligations it bakes | Test story |
| --- | --- | --- | --- |
| `tv()` variant configs (per primitive) | `variants.ts` per §5 | tokens-only classes; union-typed variants; slots for multi-part | CT: variant renders; `tsc`: bad variant fails `test:types` |
| `createVirtualList` seal → `<VirtualList>` | `{ count, getItemKey (REQUIRED, id-based), estimateSize, overscan?, lanes?, rangeExtractor?, renderItem }` | `directDomUpdates: true` + `containerRef` (Compiler fix, 3.14+); `useFlushSync: false` (React 19); the unbounded-window tripwire as a **thrown error** (not a warn); `measureElement` + `data-index` wiring; `directDomUpdatesMode: 'position'` for iframe/portal rows | CT: renders windowed; tripwire throws on unbounded parent; scroll updates ≤2 re-renders (the upstream E2E assertion) |
| `<MessageList>` seal (chat) — DEFERRED to the chat-client chunk | adds `anchorTo:'end'`, `followOnAppend`, `isAtEnd`/`scrollToEnd` ("jump to latest"), no-recycle window for Tier-B iframe rows | stick-to-bottom-without-yank; prepend stability (id keys); hoisted row state | CT: append-while-pinned follows; scrolled-up reader never yanked |
| `<Meter kind>` + `<SegmentedClock>` | `Meter: { kind: 'linear'\|'arc'\|'bipolar', value, max?, milestones?: number[], dangerBelow?: number, label }` · `SegmentedClock: { segments: int ≥2, filled, size?, completed? }` | hand-rolled ARIA (`role="meter"` + value semantics) — ONE rendering mechanism across kinds (Base UI's Meter is linear-DOM-shaped; arc/bipolar need SVG); `dangerBelow` swaps the danger INTENT token (never a color calc); bipolar is center-origin −/+ | CT: 0/partial/full/completed clock; bipolar ticks; danger token swap; ARIA values (rpg-design/11 §13 — the fixtures come from `RpgHudView`-SHAPED plain objects, no contracts import) |
| `@orb/ui/markdown` (Streamdown seal) | `<Markdown trust="trusted"\|"untrusted">` + `toPlainText(md)` | the TWO trust policies (§11.6): `trusted` = Streamdown defaults; `untrusted` = link/image prefix allowlists + `allowDataImages:false` + protocols `http/https/mailto` + the D44 §12.2 Tier-A element allowlist; `remark-gfm {singleTilde:false}`; error-boundary around lazy CodeBlock/Mermaid (#343); large-block guard (#195) | CT: `<script>` stripped; `on*` stripped; data-URI image blocked under `untrusted`; `~10~20°C` not struck through |
| `<ThemeScope>` | `{ tokens: ThemeScopeTokens, children }` — ui-local Zod-clamped subset (D44 §12.1) | values parsed+clamped at the boundary (colors must parse as colors — reject `url()`/`expression()`; dims snap to token scale; font from allowlist); applies ONLY scoped CSS custom props on a wrapper; NEVER raw style passthrough (gate `theme-override-only-via-scope`) | CT: hostile values (`url(//x)`, `expression(...)`, `;injection`) are rejected/dropped; legal overrides land as `--token` custom props on the scope node only |
| `<MessageMedia>` | `{ src: { kind:'asset', url } \| { kind:'external', url }, media: 'image'\|'audio'\|'video', alt, dims?, allowExternal: boolean }` | asset-vs-external dispatch; `forbidExternalMedia`-style click-to-load placeholder when `!allowExternal`; **autoplay FORCED OFF + `controls` required on untrusted A/V (non-overridable)**; lazy-load; aspect reservation (no layout shift); broken-media fallback; lightbox hook | CT: external img does NOT hit the network un-gated (placeholder first); untrusted `<video>` has `controls` and never `autoplay`; aspect box reserved pre-load |
| `<SandboxFrame>` | `{ html, css?, themeTokens?, title }` | sandboxed `<iframe sandbox="allow-...">` **minus `allow-same-origin`, minus `allow-scripts` (v1)**; per-frame CSP attr (`connect-src 'none'`, gated `img-src`/`media-src`) owned in THIS ONE file; render-on-complete (no partial-stream mount); postMessage auto-height (origin-checked); theme-token injection so `var(--accent)` tracks | CT: `sandbox`/`csp` attrs EXACT (string-asserted); script inside the doc does not execute; height message resizes; a hostile postMessage from another origin is ignored |
| `<Lightbox>` | hand-built over Dialog + MessageMedia (D54 — no lib) | zoom view for image/video; focus trap + Esc from Base UI Dialog | CT: opens/closes; media renders through MessageMedia (gates compose) |
| `code-editor` seal | `<CodeEditor lang="css"\|…, value, onChange, readOnly?>` | CM6 behind the seam; token-themed via an editor theme built FROM the TS token map (one mapping site); no raw CodeMirror import outside the dir (dep-cruiser) | CT: mounts, edits, theme vars applied |
| `diff` seal | `<DiffView before after mode="chars"\|"lines">` | jsdiff v9 behind the seam; add/remove intent tokens | CT: known before/after renders adds/dels |
| `useSmoothText` pacer + shimmer (stream/) — DEFERRED to the chat-client chunk | `(text, opts) => paced` | grapheme-cluster safety; adaptive backlog drain; hidden-tab flush; reduced-motion passthrough (§6.3.1) | node tests (pure string-math) + CT compose check with Markdown fade |
| `icons` seal | re-export of the lucide set actually used + `<Icon>` sizing wrapper | one icon lib (gate `icons-lucide-only`); token-driven sizes | CT smoke |
| layout primitives | `<Stack> <Row> <Section> <Toolbar> <Container name size>` | `Container` owns `container-type/-name` (features never write raw containment); intent-token gaps/padding as variant unions; Toolbar = Base UI Toolbar (roving tabindex) + layout skin | CT: containment established (a `@container` child query resolves); gap variants map to intent tokens |

### 6.2 Client-side (Phase 6 — inventoried so the homes are pre-decided; DO NOT build in ui)

| Factory | Home | Why client-side | Signature + the baked obligations (canonical spec cite) |
| --- | --- | --- | --- |
| `createSavedEntityForm` | `client/forms` | TanStack Form + Query + Zustand types | `({ formOptions, seedQuery, saveMutation, draftStore? }) → { useEditorForm, bound chrome }`. Bakes the SIX editor obligations (§13.4): seed-on-load · `key`-remount on id change · post-submit `reset(saved)` **in a post-submit effect keyed on `isSubmitSuccessful`, never inside `onSubmit`** (footgun #2) · the `seededRef + persistent-isDirty` reseed guard (footgun #4 — `isDirty`, NOT `!isDefaultValue`, for the guard) · the Zustand-persist draft mirror · `dontUpdateMeta` on non-user writes (version-locked + guard-tested — the flag is typed-but-undocumented). DirtyPill drives off **`!isDefaultValue`** (lib deep-compare; the hand-rolled `fieldValuesEqual` is DELETED — D54). `revalidateLogic() + onDynamic(zodSchema)` is the validation default. ONE `createFormHook` instance repo-wide (gate `tanstack-form-only-in-shared`). |
| `createAutosaveEntityForm` | `client/forms` | same | listener-debounced (`listeners.onChange + onChangeDebounceMs`, the documented autosave backbone) + `onFieldUnmount` flush; **`reset` REMOVED from its returned type** (calling it is the autosave infinite loop — gate `no-form-reset-in-autosave`). |
| `useAppForm` (the one `createFormHook`) | `client/forms` | Form context | single instance + bound field set (controlled `value=`, never `defaultValue=`; `useSelector`, not the deprecated `useStore`; error rendering standardized on `{message}` objects). |
| `createEntityMutation` | `client/data` | Query/tRPC types | the canonical 4-phase optimistic flow (`onMutate`: cancel → snapshot → `setQueryData` → return rollback; `onError` restore; `onSettled` → `invalidate(event)` through the seam); the **`context.client`** arg (provider-clean); a variables-render lightweight mode; **v5 sticky-error reset on next `mutate`**; ONE error slot per mutation (gate `no-multiplexed-mutation-error`); callback order `onMutate → onError → onSettled` (lint `mutation-property-order`). |
| `createCollectionSurface` | `client/data` | Query + the virtual-list seal | `useInfiniteQuery` + `maxPages` + `placeholderData: keepPreviousData` gated on `isPlaceholderData`; tail-fetch off the VIRTUALIZER's range (no `react-intersection-observer`); selection store; empty/loading/error. |
| `useGatedQuery` | `client/data` | Query types | null id → `skipToken` (kills `castId("")` — gate `no-fake-disabled-id`); documents the `refetch()`-with-skipToken caveat. |
| `<QueryBoundary>` | `client/data` | Query + Suspense | the `QueryErrorResetBoundary` → `ErrorBoundary onReset={reset}` handshake (retry that actually refetches); `useSuspenseQueries` for parallel; `startTransition` around pane switches (pairs `<Activity>`). |
| `invalidation.ts` (the seam) | `client/data` | tRPC queryFilters | ONE domain-event → `queryFilter()` map; mutations' `onSettled` + bus handlers call `invalidate(event)` (gate `no-inline-invalidate-outside-seam`); keys are always `trpc.*.queryKey(args)` — the same key the reader uses. |
| bus reducer (`applyChatBusEvent`) | `client/data/bus` | contracts DU + QueryClient | pure exhaustive switch over the server-authoritative event union; slot lifecycle owned by terminal turn events; `onData` = buffer-local + invalidate, NEVER a second store (gates `bus-onData-no-store-write`, `no-inline-cache-surgery-in-stream` — scoped to subscription bodies so `onMutate` doesn't trip). |
| `createEntityDraftStore` | `client/state` | Zustand persist | frozen `EMPTY` stable default (the v5 `?? CONSTANT` pattern) + `useShallow` for multi-field selectors (different jobs — keep both); `persist` with `partialize: (s)=>({drafts:s.drafts})` + `version` + a **total, crash-proof `migrate`** (gate `persist-partialize-and-total-migrate`); DU lifecycle transitions via `set(next, true)` replace. |
| the panel-store shape | `client/state` | Zustand | one `create` per file · ≤10 authored fields · no exported `set`/`getState` · persisted device-local ONLY for device state (dock/collapse/focus toggle) — synced prefs go in the server `UserSettings` blob (D44 §12.1). |
| registry-slot pattern (`RAIL_SLOTS`↔`MODAL_SLOTS`, `CHAT_SURFACE_SLOTS`, `TOOL_RENDERERS`) | `client` features + `main.tsx` | feature wiring | registry-as-data wired at the composition root; id-pairing asserted by `check:registry-pairing`; mapped-type Records so a missing member is a `tsc` error. |
| `ChatHandle` | `client` | domain-shaped | the `{kind:'committed';id} \| {kind:'draft';id;meta}` discriminated handle threaded from the root — the typed `this_chid`/`isOptimistic` successor. |
| `lib/time.ts` seam | `client/lib` | Intl + injected now | epoch-UTC wire → browser-local display, memoized `Intl.*`, injected `now` (snapshot-testable). |

**Under-specified factories, now SPECCED (the "figuring out" half):**
1. `createSavedEntityForm`'s **group-submit obligation** (the mission's sixth): sections that
   save independently use `form.FormGroup` + per-group `onDynamic` schemas (the multi-step-wizard
   pattern) — the factory exposes `SectionGroup` so a preset's "sampling"/"prompt" tabs or the
   wizard's steps validate + submit per-group while ONE form owns all state.
2. `createEntityMutation`'s error-slot SHAPE: it returns `{ mutate, mutation, errorSlot }` where
   `errorSlot` is `{ error: E | null, clear(): void }`, auto-cleared on next `mutate` — the
   dialog/banner binds to `errorSlot`, never to a `??`-multiplexed pair.
3. The virtual-list tripwire: "unbounded window" = the scroll element measures taller than
   `visualViewport.height * 3` at mount → **throw** with the fix instruction (the neo 200ms-commit
   lesson, D43 §11.3).

## 7. Security primitives — the D44 trio (exact-spec, comment-cited)

Built in Wave 2 (§9). Each implementation carries `// D44 §12.x:` cites at the load-bearing lines,
and the CT tests assert the CONTAINMENT properties, not just rendering:

- **Tier-A markdown/HTML** = Streamdown configured to OUR explicit allowlist (D44 §12.2:
  structural + text + tables + `details/summary` + lucide-mapped icons + gated links/images;
  forbidden: `script`, `on*`, `style`, inline `style=`, `iframe/object/embed/form/input`).
- **Tier-B HTML** = `<SandboxFrame>` — the iframe IS the boundary (never sanitize-into-main-DOM;
  gate `no-untrusted-html-in-main-dom`). `allow-scripts` stays OFF in v1 (doored, not walled).
- **Media** = `<MessageMedia>` — the D44 §12.3 rules (external gated default-safe;
  autoplay-off/controls-on non-overridable for untrusted; data-URI images off for untrusted).
- **Theming** = `<ThemeScope>` — the ui-local Zod clamp (§1 note); CSP headers + the
  `forbidExternalMedia` resolution are SERVER/entry concerns (D44 §12.5), not ui's.

## 8. The gate story for ui

| Tier | Gate | Status |
| --- | --- | --- |
| resolver | ui's `package.json` omits contracts/db/server/client + client's omits the satellites | scaffold (done at package birth) |
| lint (biome) | `noUndeclaredDependencies` / `noUnresolvedImports` on ui | free (repo-wide already) |
| dep-cruiser | `ui-cake` (ui ⇏ contracts/db/server/client) · `ui-no-node-builtins` · `ui-satellite-seals` (echarts→`charts/` only; react-virtual→`virtual-list\|message-list` only; codemirror→`code-editor/`; streamdown/remark→`markdown/`; cmdk→`command/`; @dnd-kit→`sortable/`; diff→`diff/`; lucide→`icons/`) · `client-no-raw-satellites` (pre-wired backstop for Phase 6) | scaffold |
| grit (token gates) | `no-color-literals` / `no-raw-z-index` / `no-raw-spacing` / `no-raw-typography` **extended to `packages/ui/src`** (D43: no `components/ui/` exemption). Allowlisted INSIDE ui: `src/layout/` + `src/styles/` + `src/tokens/` (they DEFINE the tokens — the exact `features/_shared/layout/` precedent) | scaffold |
| test | tokens **freshness** test (§4) — the derived-theme invariant; the CT containment tests (§7) | per chunk |
| runner split | Playwright CT (`.ct.tsx` under `tests/ui/**` mirror) on its OWN runner (`pnpm test:ct`) — **NOT in `pnpm check`** (browser tests never gate check; Spine-Testing §7) | scaffold |
| deferred | `no-media-queries-in-features` as a grit rule (viewport-variant `sm:`/`md:`… prefixes + `@media` outside app-shell) — lands with the client-foundation wave where app-shell exists to allowlist; ui ships ZERO `@media` meanwhile (reviewable by grep until then) | Phase 6 |

**CT wiring:** the root `playwright-ct.config.ts` gains `testDir: "tests"` (covers `tests/ui` +
`tests/client`) and the real `ctViteConfig` (react plugin + `@tailwindcss/vite` + a CT-side css
entry importing `@orb/ui/styles/globals.css` so token utilities resolve in-browser).

## 9. Build order (waves; green-to-commit per chunk)

- **Wave 0 — scaffold** (this doc + the package skeleton): `package.json` · tsconfig · the token
  pipeline + seed `tokens.json` + generated theme + freshness test · gates (§8) · CT wiring ·
  `tests/ui` mirror. **Checkpoint:** workspace `pnpm check` green with the empty-but-real package;
  an illegal `@orb/ui → @orb/contracts` import FAILS (biome undeclared-dep + depcruise).
- **Wave 1 — pure primitives** (subagent-parallel, disjoint dirs): Base UI wraps (controls:
  button/field/input/select/switch/slider/number-field/tabs · overlays: dialog/popover/tooltip/
  menu/toast/drawer · identity: avatar) · layout (Stack/Row/Section/Toolbar/Container) · icons ·
  **Meter + SegmentedClock** (rpg-design/11 §2 U1 — exact spec) · virtual-list seal · code-editor
  seal · diff seal. Every component: tv variant unions · tokens-only · a `.ct.tsx` · a usage
  doc-comment · APIs verified against live Base UI docs (never memory).
- **Wave 2 — the security primitives** (D44 trio + markdown, sequenced after Wave 1 since
  lightbox/media compose Dialog): ThemeScope · MessageMedia · sandbox-frame · `@orb/ui/markdown`
  two-policy pipeline + `toPlainText`. CT asserts containment (§7).
- **Deferred (named, with reasons):**
  - `message-list` — the chat seal configures against the chat client's ghost-row/stream model;
    built with the chat client chunk (same lib, seal dir reserved).
  - `stream/` pacer + shimmer — pure, but its cut-point contract co-designs with the chat
    stream store; built with the chat client chunk (§6.3.1 verify-at-build items live there).
  - `command` (cmdk) · `sortable` (@dnd-kit) · `charts` (ECharts, D52 — corpus-only footprint) —
    each lands with its first consumer's chunk; deps enter `package.json` then (no dead deps).
  - ALL §6.2 client factories — Phase 6 (they need tRPC/Query/contracts).

## 10. Recorded deltas + flags for Nate (decision-level, not resolved unilaterally)

1. **Task-prompt vs law:** the mission brief listed `vaul`/`sonner`/`react-resizable-panels` seals
   and "toast via sonner" — **D54 dropped all three** (Base UI native toast + drawer; clamp-overlay
   shell). The law wins; built accordingly.
2. **`react-dom` peer** (§1) — Base UI requires it; D54's "peer react ONLY" is amended in intent-
   preserving form. Ledger touch-up suggested (one clause in D54's dependency-refinements tail).
3. **Version majors moved** since the docs: tailwind-variants 1→3, style-dictionary 4→5, diff 8→9,
   echarts 5→6 era, `@dnd-kit/react` still 0.x. APIs verified at build; any behavioral divergence
   from a doc claim gets recorded HERE when hit.
4. **`Meter` does not wrap Base UI's `meter`** — one hand-rolled ARIA mechanism across
   linear/arc/bipolar (Base UI's is linear-DOM-shaped; arc/bipolar need SVG). Deliberate,
   documented in the component.
5. **`ThemeOverride` one-home tension** (§1): the Zod clamp exists twice by design — the WIRE
   schema in `@orb/contracts/theme` (D44 §12.5) and the ui-local RENDER clamp in `<ThemeScope>`
   (ui cannot import contracts). Pairing is asserted by a client-phase type test. If Nate prefers,
   the alternative is contracts importing a ui-exported shape — rejected here because it inverts
   the cake (ui is a LEAF of client, contracts must not know ui).
6. **`Toolbar` double-listing** resolved: D42 §2 lists Toolbar under `layout/`; D54 adds Base UI
   Toolbar. Merged — `layout/toolbar` wraps Base UI Toolbar (roving tabindex) with layout skin.
7. **`tabs` added** to the Base UI wrap set (not in the D42 §2 primitive list, but required by the
   committed game-panel/crew-panel designs and native to Base UI). Additive; flag for the ledger.

## 11. Gate-coverage inventory (UI-Gates §8 registry vs what is LIVE — audited 2026-07-02)

Nate's flag ("a lot of our ui grit/custom rules aren't present or wired") audited. Verdict: **nothing
wired is dark** — all grit files on disk are registered in `biome.json` AND pinned by
`tests/tooling/grit-plugins.int.test.ts` (a plugin that compiles-but-matches-nothing FAILS there);
same for dep-cruiser rules (`dependency-cruiser.int.test.ts` derives the rule set from the config and
fires each on a fixture). The gaps are the D43/D54 belts that were correctly PARKED for the
client-foundation wave (the `archive/ENFORCEMENT.md` backlog table names them with their
"waiting on" triggers). Status per §8 registry entry:

| Gate (§8 registry) | Status | Where / when |
| --- | --- | --- |
| ui/client package physics | ✅ LIVE | resolver + biome `noUndeclaredDependencies` + depcruise `ui-cake` (this scaffold) |
| `virtualizer-only-in-seal` · echarts/codemirror/streamdown/cmdk/dnd-kit/diff/lucide seals | ✅ LIVE | depcruise `ui-satellite-seals` (this scaffold) |
| `no-raw-value` family (`no-color-literals` incl. arbitrary hex, `no-raw-spacing`, `no-raw-typography`, `no-raw-z-index`) | ✅ LIVE, ui-covered | grit; widened to `packages/ui/src` + `tv()` arms (this scaffold — they previously scoped to client-only and could not see tailwind-variants call sites) |
| named non-token color ban (`bg-black/50` → `--scrim`) | ✅ LIVE | new arm in `no-color-literals` (this scaffold) |
| `no-layout-context-props` | ✅ LIVE | new grit (this scaffold) |
| `design-token-parity` | ✅ SUPERSEDED-BY-CONSTRUCTION | the codegen + freshness test (§4) — drift is a failing test, not a parity check |
| `touch-target-floor` | ◐ PARTIAL | the token floor is test-locked (tests/ui/tokens); the per-component "no control below the token" half rides review + the CT computed-height assertions until a grit for h-* under the floor is worth writing |
| `no-direct-useform` / `no-form-state-in-useeffect` / `no-chat-trpc-in-surface` / `no-inline-optimistic-in-surface` (the neo client four) | ✅ LIVE (dormant) | grit — wired since Phase 0; fire when client code lands |
| `tanstack-form-only-in-shared` | ◐ PARTIAL | `no-direct-useform` covers the "no raw useForm" half; the single-`createFormHook` half lands with `client/forms` |
| `no-media-queries-in-features` / `no-raw-container-widths` / `surface-in-a-container` | ⏸ PARKED (named) | need the app-shell/anchor structure to exist to allowlist against — client-foundation wave; until then ui ships zero `@media` (reviewable by grep) |
| `no-array-literal-querykey` · `no-inline-invalidate-outside-seam` · `no-inline-cache-surgery-in-stream` · `no-multiplexed-mutation-error` · `bus-onData-no-store-write` · `no-form-reset-in-autosave` · `no-client-wire-redeclare` · `no-fake-disabled-id` · `no-static-staletime-on-bus-keys` · `form-factory-for-multifield` · `persist-shape-needs-version`/`persist-partialize-and-total-migrate` · zustand-selector · `state:files` · `check:registry-pairing` · typed-`testId` · client-determinism (client render scope) · `client-feature-front-door`/`client-features-no-cross` | ⏸ PARKED (correct) | the D43/D54 client-foundation belts — they gate constructs (`trpc.*`, stores, factories, features/) that do not exist yet; MUST land in the client-foundation wave BEFORE feature agents (§11.7/§13.6) — this is the ENFORCEMENT.md backlog's `optimistic-chat`/`client-structure` cluster |
| D44 quartet (`no-untrusted-html-in-main-dom` · `no-external-media-without-gate` · `theme-override-only-via-scope` · CSP-headers-present) | ◐ Wave-2/Phase-6 | the ui half ships as Wave-2 CT containment tests; the lint/route halves need message-render + entry/http code to exist |
| `@tanstack/eslint-plugin-query` + `eslint-plugin-react-hooks` | ⚠ DECISION NEEDED | orbweaver is biome-only — adopting these means adding an eslint lane to `check` (scoped to packages/client) at the client-foundation wave. Biome already carries `useExhaustiveDependencies`/`useHookAtTopLevel` (partial hooks coverage), but the Compiler's Rules-of-React enforcement + `prefer-query-options` have no biome twin. Flagged for Nate. |
| visual-regression screenshots (D42 §8) | ⏸ PARKED | Playwright screenshot gate — adopt when the first themed surfaces stabilize (HUD named the highest-drift surface, rpg-design/11 §13) |
