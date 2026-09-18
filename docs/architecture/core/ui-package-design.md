---
kind: law
status: active
updated: 2026-09-18
---

<!-- Promoted proposed/ → core/ under D66 (2026-07-13): this is the @orb/ui law. §-numbers are
     load-bearing history; do not renumber. -->

# `@orb/ui` — the package design (structure · factories · seals · tokens)

> **AS-BUILT LAW.** `@orb/ui` is fully built (`packages/ui/src` is the inventory;
> `packages/ui/package.json#exports` is the public surface); the §6.2 client factories are built too
> (`packages/client/src/{forms,data,state}`). The frontend cake leaf (`kit ← contracts ← ui ← client`,
> D42). **The law this doc executes is `core/UI-*.md` + ledger D42/D43/D44/D52/D54/D58/D62/D66; those
> win on any conflict.** This doc owns the concrete package decisions the law leaves open + the factory
> inventory with homes/signatures/obligations. **For anything built, the code is the doc**
> (`packages/ui/src` + the CT suite) — this doc carries only the cross-cutting WHY. Code file headers
> cite these §-numbers as spec provenance: the numbering is load-bearing, never renumber, never move
> this file. The structural contract graduated to `core/UI-Primitives-and-Reuse.md` §13.7–§13.9. The
> build journey + resolved deltas: `../history/ui-package-design-archaeology-record.md`.

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
- **`react` + `react-dom` are PEERS** (both — `@base-ui/react` declares `react-dom` a required peer,
  amending D54's "peer react ONLY" in intent-preserving form: the client stays the renderer/provider,
  ui never bundles React).
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
      command/            ← cmdk (BUILT)
      sortable/           ← @dnd-kit/react (BUILT)
      macro-textarea/     ← minisearch (BUILT — carve-out item 18)
      virtual-list/       ← TanStack Virtual, directDomUpdates (D54)
      message-list/       ← the chat seal (BUILT; same lib)   media-grid/ ← lanes grid (same lib)
      icons/              ← lucide-react (the ONE icon set; dep-cruiser `ui-satellite-seals`)
      + the Wave-3/carve-out set (checkbox · radio-group · toggle(-group) · textarea · autocomplete ·
        combobox · separator · collapsible · accordion · scroll-area · alert-dialog · progress ·
        badge · skeleton · spinner · empty-state · card · list-row · selection-bar ·
        save-bar · status-chip · compare-blocks · avatar-stack · file-dropzone · file-trigger ·
        highlighted-text · log-viewer · color-field · tool-call-block · crossfade-image · reveal-gate)
      + aria-announcer/ · fieldset/ · kbd/ · table/ · text/  (BUILT — the small hand-authored
        primitives; no lib, tv() over semantic HTML/ARIA)
    fuzzy-search/       # minisearch's second sealed home (BUILT) — the generic browse-search hook,
                        #   sibling to primitives/macro-textarea/ (same lib, two sanctioned homes,
                        #   dep-cruiser `ui-satellite-seals`)
    layout/             # Stack · Row · Section · Toolbar · Container · Grid (owns container-type —
                        #   §4-tier model; Toolbar = Base UI Toolbar for roving-tabindex + our layout
                        #   skin; Grid = fill-and-sort grid, BUILT)
    charts/             # seals ECharts (D52) — BUILT: chart/ + bar-list/ + histogram/ + heatmap/ +
                        #   scatter/ + stat-figure/
      labeled-chart-frame/ # the shared label/empty-state chart frame — layout only, NOT an ECharts
                        #   seal; exported ./labeled-chart-frame
      meter/            # Meter (linear/arc/bipolar + milestones/dangerBelow) + SegmentedClock —
                        #   plain CSS/SVG, NOT the chart lib (D52/D58; rpg-design/11 §2); exported ./meter
    markdown/           # seals Streamdown — TWO trust policies (UI-Gates §11.6)
                        #   + math.ts (KaTeX) + shiki-plugin.ts (Shiki code highlight —
                        #   Streamdown 2.5 dropped its bundled Shiki) + mermaid.tsx (token-styled Mermaid
                        #   theme + error component — Mermaid ships inside Streamdown) — Tier-A allowlist
                        #   lives HERE (D44 §12.2)
    stream/             # useSmoothText pacer + TTFT shimmer (BUILT; §6.3.1 — pure string-math)
    content/            # sandbox-frame/ · message-media/ · theme-scope/ · lightbox/ — each a sealed
                        #   dir (D44 — the security trio + lightbox)
    code-editor/        # seals CodeMirror 6, token-themed (custom-CSS field · Tier-B card CSS · D46)
    diff/               # seals `diff` (jsdiff) — snapshot/edit-history diff views (D28/D54)
    lib/                # cross-cutting seams: `cn` (tailwind-variants merge, re-exported) + the
                        #   configured `tv` factory (§5) + focus-ring/overlay-motion/portal-container/
                        #   reduced-motion/result-count helpers. Primitives import from here, never a raw lib.
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
- **`package-layout` gate:** `ui` is added to `tooling/src/verify/gates/package-layout.ts` (no loose
  `.ts` at `src/` root except nothing — even `index.ts` doesn't exist here) and `test-layout.ts`
  gains the `tests/ui` mirror.

## 3. Dependencies — the sealed satellites (each lib seals ONE dir)

Versions live in the pnpm **catalog** (`catalog:` in `package.json`), not this table — the catalog is
the one home for the number. `@base-ui/react` v1 broke its RC-era APIs, so **every wrap is written
against the live per-component docs (base-ui.com), never memory** (the DEAD rc-era package
`@base-ui-components/react` must never be installed). The dep-cruiser `ui-satellite-seals` rule (§8)
enforces the seal column: a lib may only be imported from its sealed dir.

| Dep(s) | Seals | Notes |
| - | - | - |
| `@base-ui/react` | every Base UI wrap (`primitives/`, `layout/toolbar`) | THE headless primitive (D42); react + react-dom peers ride it (§1) |
| `tailwind-variants` (+ `tailwind-merge`) | `lib/` — the `cn` merge + configured `tv` (§5) | subsumes cva/clsx as the styling primitive; `tailwind-merge` is a direct dep only so `createTV`'s `twMergeConfig` can register the custom `--text-*` size classGroup (§5) |
| `lucide-react` | `primitives/icons/` (dep-cruiser `ui-satellite-seals`) | the ONE icon set |
| `@tanstack/react-virtual` | `primitives/virtual-list/` + `primitives/message-list/` + `primitives/media-grid/` | `directDomUpdates` + core chat APIs (D54) |
| `streamdown` + `remark-gfm` | `markdown/` | two trust policies |
| `katex` + `rehype-katex` + `remark-math` | `markdown/math.ts` | Streamdown bundles Mermaid but not KaTeX — this seal supplies the whole `$…$`/`$$…$$` stack + stylesheet |
| `@shikijs/core` + `@shikijs/engine-javascript` + `@shikijs/langs` | `markdown/shiki-plugin.ts` | Streamdown 2.5 dropped its bundled Shiki — the seal re-supplies code highlighting via `plugins.code` (lazy JS-regex engine, both mode literals baked) |
| `codemirror` + `@codemirror/{lang-css,autocomplete,lint,state}` | `code-editor/` | CM6 |
| `diff` (jsdiff) | `diff/` | snapshot/edit-history diff views (D28/D54) |
| `cmdk` | `primitives/command/` | — |
| `@dnd-kit/react` (+`/dom`+`/helpers`) | `primitives/sortable/` | the rewrite package; the legacy `@dnd-kit/core`/`sortable`/`utilities` stack is dead — never install |
| `echarts` + `echarts-for-react` | `charts/` (D52) | — |
| `minisearch` | `primitives/macro-textarea/` + `fuzzy-search/` | two sanctioned homes (the lib's second is the generic browse-search hook) |
| `zod` | `content/theme-scope/` clamp (§7) | isomorphic-pure; already a kit dep |
| **dev** `style-dictionary` (v5, ESM/async) + `tailwindcss` + `tsx` + `@types/react`(-dom) | token codegen (§4) + typecheck | — |

**DROPPED at D54 (do not re-add without a ledger decision):** `sonner` (→ Base UI Toast), `vaul`
(→ Base UI Drawer), `react-resizable-panels` (→ the §11.1 clamp-overlay shell), `cva`/`clsx`
(→ tailwind-variants), DOMPurify (sanitize is native inside Streamdown). Version-migration archaeology
(the majors that moved past the original brief): the history record.

## 4. Tokens — the DTCG pipeline (concrete)

- **Source:** `src/tokens/tokens.json` — W3C DTCG (`$value`/`$type`). Seeded from the design seed
  (the DESIGN.md OKLCH Hearth ramp + Ember accent + Geist + the radius/spacing/motion scales —
  UI-Arch §4.1 keeps ONLY the palette from that seed) plus the scales the law mandates:
  - **color** — the Hearth ramp + intents (`background`/`foreground`/`card`/`surface-raised`/`popover`/
    `primary`(Ember)/`secondary`/`muted`/`accent`/`destructive`/`success`/`warning`/`info`/`highlight`/
    `border`/`input`/`ring`/`sidebar`), the **`--scrim`** token (D43 §11.4 — theme-aware overlay; never
    `bg-black/50`), the chart ramp (`--chart-1..5`), and the **prose/bubble semantics**
    (`--user-bubble`/`--ai-bubble`/`--system-bubble` + `-foreground`, `--dialogue`/`--narration`/
    `--prose-body`/`--speaker`) — the D44 §12.1 ThemeScope override TARGETS, defaulting to ramp values.
    `tokens.json` is the truth for the full set (it also carries shadow/blur/immersive/reading token
    families the appearance system drives) — this list names the load-bearing override targets, not the
    whole tree.
  - **spacing** — the 4px scale + the intent tokens (`gap-field/row/block/section/gutter`,
    `p-row/block/section/gutter`) the token gates point at.
  - **control heights** — `--control-sm/md/lg`, **POINTER-CONDITIONAL per D62 P1**: 44/48/56px at
    coarse (meets the touch floor), narrowing to 32/34/40px at `@media(pointer:fine)` via the token's
    `orb.pointerFine` extension. FLAG\[registry]: `Core-Path-Registry.md` D62 P1 is the authority on the
    per-pointer floor (the fine floor was raised 28→32 after side-eye/design-audit passes; the
    per-pointer tap-target CHECK lives in the design-audit probe, not the `pnpm check` battery — see §8
    `touch-target-floor`). `data-density="compact"` tightens orthogonally to pointer. Avatar/switch
    display sizes are pointer-INDEPENDENT (never narrow — §13.9 D62 delta).
  - **container breakpoints** — `--cq-sm/md/lg` (§3 — container queries use named tokens).
  - **type** — the Geist scale (display/headline/title/body/label/mono per the seed table);
    **radius** (`base/control/card/full`); **z** scale; **motion** (`--motion-fast/base/layout` +
    `--ease-out-expo`, reduced-motion floor unlayered in globals.css per D43 §11.4e).
- **Codegen:** `tokens.build.ts` (style-dictionary **v5** — recorded delta from the doc's v4; ESM
  API) emits BOTH `src/styles/theme.css` (the Tailwind v4 `@theme` block → utility namespaces) and
  `src/tokens/index.ts` (the typed TS map). Both are **committed, generated artifacts** with a
  DO-NOT-EDIT header.
- **Freshness is machine-enforced:** `tests/ui/tokens/index.test.ts` re-runs the codegen
  in-memory and diffs against the committed artifacts — hand-editing the theme or letting it drift
  from `tokens.json` FAILS `pnpm test`. ("Derived, never hand-authored" as a test, not a hope.)
- **Themes are value-sets over these names** (D44 §12.1): Hearth is `:root`. NO structural mode exists.
  FLAG\[registry]: the shipped theme SET is **Hearth · Mocha · Light** (`Core-Path-Registry.md` §Placement
  is the authority; never the seed mockup's Catppuccin/Loom names) — built as `owner_id IS NULL` seed
  rows (`server/domain/settings/seed-themes.ts`) AND generated `[data-theme]` value-sets in `theme.css`.
  Custom themes ride the `<ThemeScope>` override API.

## 5. Variants — the tailwind-variants conventions

> **Button defaults to `intent="primary"`** (`defaultVariants`) — a bare `<Button>` renders ember. Every accent audit must sweep `<Button $$$>` structurally (ast-grep / `pnpm ast jsx Button`), never text-grep `intent="primary"`. (D66.)

- Every styled primitive has a `variants.ts` exporting a `tv()` config; multi-part primitives use
  **`slots`** (D54). Component props extend `VariantProps<typeof x>` — **a bad variant is a `tsc`
  error**; ad-hoc `className` styling on a primitive is lint-flagged (the token gates now
  cover `packages/ui/src` — §8).
- Class values reference THEME tokens only (`bg-primary`, `text-foreground`, `h-control-md`,
  `gap-row`, `rounded-control`, `z-overlay`) — raw values (`bg-[#…]`, `gap-[13px]`, `z-50`,
  `bg-black/50`) are gate-RED in ui exactly as in features (D43: **no `components/ui/` exemption**).
- `cn` = tailwind-variants' merge, re-exported from `@orb/ui/lib` — the one class-merge home.
- `lib/index.ts` ALSO exports `tv` — a `createTV`-CONFIGURED factory (NOT the raw `tailwind-variants`
  export). Every primitive MUST import `tv` from `@orb/ui/lib`, never straight from the package:
  the DTCG type-scale utilities (`text-display`…`text-micro`) are custom `--text-*` tokens
  tailwind-merge doesn't know about by default, so an unconfigured `tv()` silently drops the size
  when it collides with a color class. This is required by repo law, not a style preference.
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
| - | - | - | - |
| `tv()` variant configs (per primitive) | `variants.ts` per §5 | tokens-only classes; union-typed variants; slots for multi-part | CT: variant renders; `tsc`: bad variant fails `test:types` |
| `createVirtualList` seal → `<VirtualList>` | `{ count, getItemKey (REQUIRED, id-based), estimateSize, overscan?, lanes?, rangeExtractor?, renderItem }` | `directDomUpdates: true` + `containerRef` (Compiler fix, 3.14+); `useFlushSync: false` (React 19); the unbounded-window tripwire as a **thrown error** (not a warn); `measureElement` + `data-index` wiring; `directDomUpdatesMode: 'position'` for iframe/portal rows | CT: renders windowed; tripwire throws on unbounded parent; scroll updates ≤2 re-renders (the upstream E2E assertion) |
| `<MessageList>` seal (chat) | adds `anchorTo:'end'`, `followOnAppend`, `isAtEnd`/`scrollToEnd` ("jump to latest"), no-recycle window for Tier-B iframe rows (the `keepMounted` predicate — PD-119 DONE) | stick-to-bottom-without-yank; prepend stability (id keys); hoisted row state | CT: append-while-pinned follows; scrolled-up reader never yanked |
| `<Meter kind>` + `<SegmentedClock>` | `Meter: { kind: 'linear'\|'arc'\|'bipolar', value, max?, milestones?: number[], dangerBelow?: number, label }` · `SegmentedClock: { segments: int ≥2, filled, size?, completed? }` | hand-rolled ARIA (`role="meter"` + value semantics) — ONE rendering mechanism across kinds (Base UI's Meter is linear-DOM-shaped; arc/bipolar need SVG); `dangerBelow` swaps the danger INTENT token (never a color calc); bipolar is center-origin −/+ | CT: 0/partial/full/completed clock; bipolar ticks; danger token swap; ARIA values (rpg-design/11 §13 — the fixtures come from `RpgHudView`-SHAPED plain objects, no contracts import) |
| `@orb/ui/markdown` (Streamdown seal) | `<Markdown trust="trusted"\|"untrusted">` | the TWO trust policies (§11.6), built against the VERIFIED Streamdown 2.5 API — `allowedElements`/`disallowedElements` + `urlTransform` (the docs-assumed `allowedImagePrefixes`/`allowDataImages` API does NOT exist — recorded delta, §10): `trusted` = Streamdown's permissive defaults (rehype-sanitize + rehype-harden) plus the D44 §12.2 Tier-A element allowlist; `untrusted` = the Tier-A allowlist MINUS `img` + the `untrustedUrlTransform` protocol/host gate (`http`/`https`/`mailto` only, `data:` blocked); `remark-gfm {singleTilde:false}`; the `shiki-plugin.ts` `CodeHighlighterPlugin` supplied via `plugins.code` (Streamdown 2.5 ships no bundled Shiki); error-boundary around lazy CodeBlock/Mermaid (#343); large-block guard (#195) | CT: `<script>` stripped; `on*` stripped; data-URI image blocked under `untrusted`; `~10~20°C` not struck through |
| `<ThemeScope>` | `{ tokens: ThemeScopeTokens, children }` — ui-local Zod-clamped subset (D44 §12.1) | values parsed+clamped at the boundary (colors must parse as colors — reject `url()`/`expression()`; dims snap to token scale; font from allowlist); applies ONLY scoped CSS custom props on a wrapper; NEVER raw style passthrough (gate `theme-override-only-via-scope`) | CT: hostile values (`url(//x)`, `expression(...)`, `;injection`) are rejected/dropped; legal overrides land as `--token` custom props on the scope node only |
| `<MessageMedia>` | `{ src: { kind:'asset', url } \| { kind:'external', url }, media: 'image'\|'audio'\|'video', alt, dims?, allowExternal: boolean }` | asset-vs-external dispatch; `forbidExternalMedia`-style click-to-load placeholder when `!allowExternal`; **autoplay FORCED OFF + `controls` required on untrusted A/V (non-overridable)**; lazy-load; aspect reservation (no layout shift); broken-media fallback; lightbox hook | CT: external img does NOT hit the network un-gated (placeholder first); untrusted `<video>` has `controls` and never `autoplay`; aspect box reserved pre-load |
| `<SandboxFrame>` | `{ html, css?, themeTokens?, title, complete?, heightPx? }` | sandboxed `<iframe sandbox="allow-...">` **minus `allow-same-origin`, minus `allow-scripts` (v1)**; per-frame CSP attr (`connect-src 'none'`, gated `img-src`/`media-src`) owned in THIS ONE file; render-on-complete (no partial-stream mount); caller-controlled `heightPx` sizing (default `320`) — postMessage auto-height is IMPOSSIBLE in v1 (requires a script inside the frame, and `allow-scripts` is OFF); auto-height is explicitly DEFERRED to a future `allow-scripts`-enabled version (origin-checked listener), not before; theme-token injection so `var(--accent)` tracks | CT: `sandbox`/`csp` attrs EXACT (string-asserted); script inside the doc does not execute |
| `<Lightbox>` | hand-built over Dialog + MessageMedia (D54 — no lib) | zoom view for image/video; focus trap + Esc from Base UI Dialog | CT: opens/closes; media renders through MessageMedia (gates compose) |
| `code-editor` seal | `<CodeEditor lang="css"\|…, value, onChange, readOnly?>` | CM6 behind the seam; token-themed via an editor theme built FROM the TS token map (one mapping site); no raw CodeMirror import outside the dir (dep-cruiser) | CT: mounts, edits, theme vars applied |
| `diff` seal | `<DiffView before after mode="chars"\|"lines">` | jsdiff v9 behind the seam; add/remove intent tokens | CT: known before/after renders adds/dels |
| `useSmoothText` pacer + shimmer (stream/) | `(text, opts) => paced` | grapheme-cluster safety; adaptive backlog drain; hidden-tab flush; reduced-motion passthrough (§6.3.1) | node tests (pure string-math) + CT compose check with Markdown fade |
| `icons` seal | re-export of the lucide set actually used + `<Icon>` sizing wrapper | one icon lib (dep-cruiser `ui-satellite-seals`); token-driven sizes | CT smoke |
| layout primitives | `<Stack> <Row> <Section> <Toolbar> <Container name size>` | `Container` owns `container-type/-name` (features never write raw containment); intent-token gaps/padding as variant unions; Toolbar = Base UI Toolbar (roving tabindex) + layout skin | CT: containment established (a `@container` child query resolves); gap variants map to intent tokens |

### 6.2 Client-side (Phase 6 — inventoried so the homes are pre-decided; DO NOT build in ui)

> **BUILT.** Every factory below exists at its pre-decided home (`client/src/{forms,data,state,lib}` —
> the code is now the doc for the built shapes). The table stays as the obligations spec the builds were
> verified against; some obligation belts hold by construction+review, not yet by gate (the active-gate
> registry, `Core-Enforcement-Active-Gates.md`, is the truth for which are wired).

| Factory | Home | Why client-side | Signature + the baked obligations (canonical spec cite) |
| - | - | - | - |
| `createSavedEntityForm` | `client/forms` | TanStack Form + Query + Zustand types | `({ formOptions, seedQuery, saveMutation, draftStore? }) → { useEditorForm, bound chrome }`. Bakes the SIX editor obligations (§13.4): seed-on-load · `key`-remount on id change · post-submit `reset(saved)` **in a post-submit effect keyed on `isSubmitSuccessful`, never inside `onSubmit`** (footgun #2) · the `seededRef + persistent-isDirty` reseed guard (footgun #4 — `isDirty`, NOT `!isDefaultValue`, for the guard) · the Zustand-persist draft mirror · `dontUpdateMeta` on non-user writes (version-locked + guard-tested — the flag is typed-but-undocumented). DirtyPill drives off **`!isDefaultValue`** (lib deep-compare; the hand-rolled `fieldValuesEqual` is DELETED — D54). `revalidateLogic() + onDynamic(zodSchema)` is the validation default. ONE `createFormHook` instance repo-wide (gate `tanstack-form-only-in-shared`). |
| `createAutosaveEntityForm` | `client/forms` | same | listener-debounced (`listeners.onChange + onChangeDebounceMs`, the documented autosave backbone) + `onFieldUnmount` flush; **`reset` REMOVED from its returned type** (calling it is the autosave infinite loop — gate `no-form-reset-in-autosave`). |
| `useAppForm` (the one `createFormHook`) | `client/forms` | Form context | single instance + bound field set (controlled `value=`, never `defaultValue=`; `useSelector`, not the deprecated `useStore`; error rendering standardized on `{message}` objects). |
| `createEntityMutation` | `client/data` | Query/tRPC types | the canonical 4-phase optimistic flow (`onMutate`: cancel → snapshot → `setQueryData` → return rollback; `onError` restore; `onSettled` → `invalidate(event)` through the seam); the **`context.client`** arg (provider-clean); a variables-render lightweight mode; **v5 sticky-error reset on next `mutate`**; ONE error slot per mutation (gate `no-multiplexed-mutation-error`); callback order `onMutate → onError → onSettled` (lint `mutation-property-order`). |
| `createCollectionSurface` | `client/data` | Query + the virtual-list seal | `useInfiniteQuery` + `maxPages` + `placeholderData: keepPreviousData` gated on `isPlaceholderData`; tail-fetch off the VIRTUALIZER's range (no `react-intersection-observer`); selection store; empty/loading/error. |
| `useGatedQuery` | `client/data` | Query types | null id → `skipToken` (kills `castId("")` — gate `no-fake-disabled-id`); documents the `refetch()`-with-skipToken caveat. |
| `<QueryBoundary>` | `client/components` | Query + Suspense | the `QueryErrorResetBoundary` → `ErrorBoundary onReset={reset}` handshake (retry that actually refetches); `useSuspenseQueries` for parallel; `startTransition` around pane switches (pairs `<Activity>`). |
| `invalidation.ts` (the seam) | `client/data` | tRPC queryFilters | ONE domain-event → `queryFilter()` map; mutations' `onSettled` + bus handlers call `invalidate(event)` (gate `no-inline-invalidate-outside-seam`); keys are always `trpc.*.queryKey(args)` — the same key the reader uses. |
| bus reducer (`applyChatBusEvent`) | `client/data/bus` | contracts DU + QueryClient | pure exhaustive switch over the server-authoritative event union; slot lifecycle owned by terminal turn events; `onData` = buffer-local + invalidate, NEVER a second store (gates `bus-on-data-no-store-write`, `chat-stream-writes-in-bus-only` (plan-time `no-inline-cache-surgery-in-stream`) — scoped to subscription bodies so `onMutate` doesn't trip). |
| `createEntityDraftStore` | `client/state` | Zustand persist | frozen `EMPTY` stable default (the v5 `?? CONSTANT` pattern) + `useShallow` for multi-field selectors (different jobs — keep both); `persist` with `partialize: (s)=>({drafts:s.drafts})` + `version` + a **total, crash-proof `migrate`** (gate `persist-partialize-and-total-migrate`); DU lifecycle transitions via `set(next, true)` replace. |
| the panel-store shape | `client/state` | Zustand | one `create` per file · ≤10 authored fields · no exported `set`/`getState` · persisted device-local ONLY for device state (dock/collapse/focus toggle) — synced prefs go in the server `UserSettings` blob (D44 §12.1). |
| the registry pattern (sections/modals/panes/chrome via `createRegistry`/`createContributorRegistry` — D70/D73; the former `RAIL_SLOTS`/`MODAL_SLOTS` static maps and the `check:registry-pairing` script are DEAD, truth-audit 2026-08-03) | `client` features + `main.tsx` | feature wiring | registry-as-data wired at the composition root; walls carried by the `*-registry-completeness` gates + total door Records so a missing member is a `tsc` error. |
| `ChatHandle` | `client` | domain-shaped | the `{kind:'committed';id} \| {kind:'draft';id;meta}` discriminated handle threaded from the root — the typed `this_chid`/`isOptimistic` successor. |
| `lib/time.ts` seam | `client/lib` | Intl + injected now | epoch-UTC wire → browser-local display, memoized `Intl.*`, injected `now` (snapshot-testable). |

The as-built shapes are the code (`client/src/{forms,data}`); the three factories that needed
figuring-out during the build (`createSavedEntityForm`'s `SectionGroup` group-submit, the FLAT
`createEntityMutation` error slot, the virtual-list unbounded-window tripwire threshold) are recorded
in the history record.

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
| - | - | - |
| resolver | ui's `package.json` omits contracts/db/server/client + client's omits the satellites | scaffold (done at package birth) |
| lint (biome) | `noUndeclaredDependencies` / `noUnresolvedImports` on ui | free (repo-wide already) |
| dep-cruiser | `ui-cake` (ui ⇏ contracts/db/server/client) · `ui-no-node-builtins` · `ui-satellite-seals` (echarts→`charts/` only; react-virtual→`virtual-list\|message-list\|media-grid` only; codemirror→`code-editor/`; streamdown/remark→`markdown/`; cmdk→`command/`; @dnd-kit→`sortable/`; diff→`diff/`; lucide→`icons/`). Client's "no raw satellites" is a DELIBERATE non-rule (resolver physics + biome `noUndeclaredDependencies` — a dep-cruiser twin would be unfireable-by-construction), not a wired rule. | scaffold |
| token gates (ts-morph, `tooling/src/verify/gates/`) | `no-color-literals` / `no-raw-z-index` / `no-raw-spacing-in-features` / `no-raw-typography-in-features` **extended to `packages/ui/src`** (D43: no `components/ui/` exemption). Allowlisted INSIDE ui: `src/layout/` + `src/markdown/` (they DEFINE the tokens / are the prose carve-out — the exact `features/_shared/layout/` precedent) | scaffold |
| test | tokens **freshness** test (§4) — the derived-theme invariant; the CT containment tests (§7) | per chunk |
| runner split | Playwright CT (`.ct.tsx` under `tests/ui/**` mirror) on its OWN runner (`pnpm test:ct`) — **NOT in `pnpm check`** (browser tests never gate check; Spine-Testing §7) | scaffold |
| deferred | `no-media-queries-in-features` as a gate (viewport-variant `sm:`/`md:`… prefixes + `@media` outside app-shell) — lands with the client-foundation wave where app-shell exists to allowlist; ui ships ZERO `@media` meanwhile (reviewable by grep until then) | Phase 6 |

**CT wiring:** the root `playwright-ct.config.ts` gains `testDir: "tests"` (covers `tests/ui` +
`tests/client`) and the real `ctViteConfig` (react plugin + `@tailwindcss/vite` + a CT-side css
entry importing `@orb/ui/styles/globals.css` so token utilities resolve in-browser).

## 9. Build order (DONE — historical)

Built green-to-commit per chunk in waves 0 (scaffold) → 1 (pure primitives) → 2 (security trio +
markdown) → 3 (the display/form gap), then the un-parked carve-out (message-list · stream · command ·
sortable · charts · macro-textarea + the carve-out set) and the §6.2 client factories. All done
(2026-07). The wave contents + checkpoints: `../history/ui-package-design-archaeology-record.md`.
Standing bar for any NEW primitive is §13, not this wave list.

## 10. Recorded deltas (live WHYs; the resolved list is history)

The build's decision-level deltas were resolved and moved to
`../history/ui-package-design-archaeology-record.md`. Two WHYs stay live because they still constrain
the code:

- **`Meter` is a HYBRID over Base UI's `meter`:** `Meter.Root` supplies the a11y shell (`role="meter"`
  - `aria-value*` + `Intl.NumberFormat` `aria-valuetext`); the custom SVG geometry (arc/bipolar/ticks/
    `dangerBelow` swap) rides as its **children**, NOT the `render` prop — replacing the Root would nest
    its visually-hidden `<span>` inside an `<svg>` (invalid). `MeterIndicator` hardcodes `width:%`
    (linear-only), which is why arc/bipolar are hand-drawn.
- **`ThemeOverride` clamp lives in two homes by design:** the WIRE schema in `@orb/contracts/theme`
  (D44 §12.5) and the ui-local RENDER clamp in `<ThemeScope>` (ui cannot import contracts). A
  client-phase type test asserts the pairing. Contracts importing a ui shape was rejected — it inverts
  the cake (ui is a LEAF of client).

The Streamdown security-API gotcha (the real surface is `allowedElements`/`disallowedElements` +
`urlTransform`, not the assumed `allowedImagePrefixes`/`allowDataImages`) now self-documents at the top
of `markdown/policy.ts` — no doc copy needed.

## 11. Gate coverage — the active-gate registry is the truth

The LIVE gate set (which grit/dep-cruiser/`tooling/src/verify/gates` rules are wired) is standing law in
`../core/Core-Enforcement-Active-Gates.md` — read it there, not here (one home). The load-bearing
ui-side belts: the cake/seal rules of §8; the `no-raw-value` token family widened to `packages/ui/src`

- `tv()` arms; `design-token-parity` is SUPERSEDED-BY-CONSTRUCTION (the §4 codegen + freshness test);
  `touch-target-floor` is ◐ PARTIAL (token floor test-locked; the per-pointer per-component check rides
  the design-audit probe, D62 P1). The dated 2026-07-02 coverage audit ("nothing wired is dark") is
  `../history/ui-package-design-archaeology-record.md`.

## 12. Neo-parity primitive coverage — DONE

The domain-agnostic primitive set `@orb/ui` had to cover was derived from neo's `components/ui/` (the
shadcn layer being replaced) + a grep of committed designs. It is fully built — the current inventory
is `packages/ui/package.json#exports` (the truth), not a list here. Inclusion rule (still binding for
any new primitive): **domain-agnostic** (a `Button`/`Badge`/`Card`, never a `CharacterCard`) AND
referenced by ≥1 committed design; domain components live in `client/features`. The **proposal-diff**
pattern (chat-crew 07) is a FEATURE over `@orb/ui/diff`, not a ui primitive; `weave-glyph` is
app-level (`client/src/components/weave-glyph.tsx`, §13.9) and enters through the `#components`
public door. The derivation table + the deliberately-excluded
list (`resizable`/`sheet`/`label`/…) are in `../history/ui-package-design-archaeology-record.md`.

## 13. Primitive authoring rules (the recurring-mistake gates — BINDING)

Codified after a full 27-seal review found the same class of miss across agents: **thin wraps that
under-use Base UI, hand-roll what the lib ships, pick the wrong primitive, and theorize instead of
test.** These rules are law for every primitive build/extension; they are the standing preamble of
every `@orb/ui` agent brief. **YAGNI is OFF for primitives — a committed primitive gets the FULL
cold-read treatment; a missing native capability is a DEFECT, not a deferral.**

**R1 — Read the shipped `.d.ts` FIRST, never memory or runtime probing.** Before writing a wrap,
read `node_modules/@base-ui/react/<component>/**/*.d.ts`: the parts list (`index.parts.d.ts`), the
Root props, the generics. The wrap is written against THAT surface, not a training-data recollection
of an older API.

**R2 — Expose the FULL native part + prop surface.** If Base UI ships it, the seal surfaces it:
`Toast.Action` · `Field.Control` (native-control registration — a plain element does NOT auto-associate)
· `Autocomplete.Status`/`Clear`/`Group` · `Menu.CheckboxItem`/`RadioItem`/`SubmenuRoot`/`LinkItem` ·
`Combobox.Chips`/`Chip`/`ChipRemove` · `Select multiple`+`Group`+scroll-arrows · `Slider` range
(array value, N thumbs)+`Value`/`Label` · `Progress.Value`/`Label` · `Tabs.Indicator` ·
`NumberField.ScrubArea` · `Popover`/`Dialog` `Arrow`/`Close`/`Backdrop`/`createHandle` ·
`Collapsible` `keepMounted`/`hiddenUntilFound` · `ScrollArea.Corner`. A seal may omit a part ONLY
when a design decision makes it meaningless (a cut structural mode), and the omission is documented
with the reason inline.

**R3 — Native-part-first: never hand-roll what the lib ships.** A hand-rolled checkmark, spinner
SVG, chip, or dismiss button when Base UI has `Indicator`/`Chip`/`Close` is the seal failing its
purpose. Grep the parts list before writing any `<svg>`/`<span>`/`<button>` inside a seal.

**R4 — Pick the RIGHT primitive; do not bolt features onto the wrong one.** Choose by the VALUE
TYPE: multi-select / object-items / chips → **Combobox** (never Autocomplete); free-text-input +
suggestions → **Autocomplete**; single-select from a fixed list → **Select**; confirm/destructive →
**AlertDialog** (never Dialog); pressable on/off button → **Toggle**; bound on/off state → **Switch**.
When unsure, read both `.d.ts` and decide by whether the value must be an object or an array.

**R5 — Extend the Base props type for passthrough.** `interface XProps extends BaseXRootProps` (or
`Omit<…>` only the props you deliberately re-shape) so every Root-level Base UI feature flows through
without re-declaration. Never hand-pick a prop subset that silently drops the rest.

**R6 — Empirical over theory: no root-cause claim without a failing test.** A wrap that misbehaves
gets the minimal reproducing test, then a fix or a VERIFIED cause — never a narrowed API plus an
inline doc theorizing the reason. A "X breaks under Y" claim not backed by a red test is banned from
the codebase.

**R7 — The mandatory acceptance tests (the shapes that caught real bugs):**

- a collection-prop primitive → a CT where the PARENT RE-RENDERS passing a freshly-derived (filtered/
  mapped) array — the real consumer shape (falsified the "pre-render-stable" claim).
- a Field-composable control → a CT asserting label association + `aria-describedby` INSIDE `<Field>`
  (caught the plain-`<textarea>` non-registration).
- every interactive primitive → the 8 states + keyboard operation + the a11y contract (role,
  `aria-live` where stateful, non-color state signals).

**R8 — Verify LIVE-doc behavior the `.d.ts` can't show** (keyboard, animation data-attrs, interaction):
WebFetch `https://base-ui.com/react/components/<name>`. Record any API delta in the component
doc-comment — factually, no theories.

> **Enforcement:** R1/R3/R4/R6 are review-caught (a hand-rolled part or an untested claim is a
> reject); R2 is the per-seal completion checklist (below); R5 is grep-checkable (`extends Base…`);
> R7 is CT-enforced. The `no-color-literals`/token gates + `no-inline-union-redecl` already catch the
> styling/type classes machine-side.

**R9 — DERIVE, NEVER RE-SPELL, any prop that shadows a Base UI prop name.** A sealed prop that reuses
a Base UI prop's NAME must take its TYPE from Base UI — `extends` / `Pick<>` / `Omit<>` /
`Parameters<NonNullable<BaseXProps["onYChange"]>>[N]` — never a hand-written signature. The failure
mode is silent and permanent: hand-spelling `onValueChange?: (value: string) => void` drops the
second `ChangeEventDetails` argument (`reason` · `cancel()` · `allowPropagation()` · `isCanceled`),
so a caller can never veto a change, and a Base UI minor that adds a new change `reason` (1.7 added
`input-press` and `cancel-open`) reaches a DERIVED seal for free and never reaches a re-spelled one.
The derivation is also the reason the class of bug is FIXED rather than merely fixed-today. This
applies to open/close arms too, including on COMPOSITE primitives that merely forward one
(`ColorField.onOpenChange` derives from `Popover.Root`'s). It does NOT apply to a composite's own
invented callback that forwards nothing (`ColorField.onValueChange` is a clamp-gated commit, not a
passthrough) — say so inline where it is not obvious.

## 14. The Base UI anatomy ledger (every part: exposed · sealed-away · n/a)

**Standing law from the 1.7 alignment pass (2026-08-07).** Base UI is the foundation of every
interactive surface, so `@orb/ui` carries ZERO accidental narrowness: every part Base UI ships is
either reachable through the seal or sealed away here WITH A REASON. Rows are keyed on the verbatim
`<Namespace>.<Part>` string from the component's own `index.parts.d.ts` export alias — the same key
the machine half (the `baseui-anatomy` surface manifest + gate) joins on, so the two halves cannot
drift. **A new part on a version bump is a ROW, not a shrug:** add it with a disposition, or the gate
reds.

Dispositions: **exposed** = reachable from a consumer (rendered by the seal, or exported as its own
part) · **sealed-away** = deliberately not reachable, reason stated · **n/a** = not anatomy (a type
alias, a hook, a handle factory covered elsewhere) or meaningless under a structural decision we made.

`Accordion` · `AlertDialog` · `Avatar` · `Checkbox` · `Collapsible` · `Dialog` · `Drawer` ·
`Fieldset` · `NumberField` · `ScrollArea` · `Select` · `Slider` · `Switch` · `Tabs` · `Menu` ·
`Popover` · `Tooltip` · `Toolbar` expose their FULL part list; only their exceptions are tabled below.
`Button` · `Input` · `Separator` · `Toggle` · `ToggleGroup` · `RadioGroup` are single-export
components with no part list.

| Part | Disposition | Why |
| - | - | - |
| `Autocomplete.Value` | sealed-away | The seal's value IS the input's text (`value`/`onValueChange` on the Root); a separate Value display element has nothing to show that the input isn't already showing. |
| `Autocomplete.Trigger` | sealed-away | This seal opens on focus/typing, not on a chevron press — a trigger button beside a text input reads as a Select and invites the wrong primitive (R4). Pick `Select` for a button-opened fixed list. |
| `Autocomplete.Icon` | sealed-away | Pairs with `Trigger` (the chevron inside it); meaningless without one. |
| `Autocomplete.Backdrop` | sealed-away | A suggestion popup is non-modal by design — it must not dim or `aria-hidden` the form it sits in. The `inline` arm exists for the case where even an overlay is too much; a backdrop is the opposite direction. |
| `Autocomplete.Row` | sealed-away | Grid/column item layout. This seal's items are plain display strings (one line each) — a row wrapper has nothing to lay out. |
| `Autocomplete.Separator` | sealed-away | Group boundaries here are the `GroupLabel` headers, and the Combobox seal renders groups IDENTICALLY on purpose (the two listbox popups must not drift into two looks). `Select` does add a rule because its grouped popup is a dense single-line row list with no header spacing. Re-implemented per-component in 1.7 (#5399) — revisit as ONE decision across all three seals if a review rules the header boundary too weak. |
| `Autocomplete.useFilter` | n/a | A filter FACTORY, reachable as the `filter` passthrough prop on the seal. |
| `Combobox.Label` | sealed-away | Labeling is `<Field>`'s job repo-wide (the settings/forms migration) or `aria-label`; a second label mechanism inside the seal is a second home for the same concept. |
| `Combobox.Trigger` / `Combobox.Icon` | sealed-away | Same as Autocomplete's: this is a chips-and-typing surface, not a button-opened list. |
| `Combobox.Backdrop` | sealed-away | Same as Autocomplete's — non-modal by design. |
| `Combobox.ItemIndicator` | sealed-away | Selection is shown as CHIPS in the input, which is the stronger signal and always visible; a check mark in the list would state the same fact twice. |
| `Combobox.Clear` | sealed-away | The per-chip `ChipRemove` (exposed) is the removal affordance; a clear-all button that silently drops N committed chips has no undo at this seam. Add it WITH a confirmation story, not as a bare part. |
| `Combobox.Row` / `Combobox.Separator` | sealed-away | Same reasons as the Autocomplete rows above. |
| `Combobox.useFilter` | n/a | Reachable as the `filter` passthrough prop. |
| `Meter.Track` / `Meter.Indicator` | sealed-away | THE §10 hybrid: `MeterIndicator` hardcodes `width:%` (linear only), so the arc/bipolar geometry is hand-drawn SVG riding as `Meter.Root`'s children. Using the native pair would forbid two of the three kinds. |
| `Progress.Status` | n/a | A TYPE alias (`'indeterminate' \| 'progressing' \| 'complete'`), not a part; it surfaces as Base UI's own `data-*` on the root. |
| `Toast.Positioner` / `Toast.Arrow` | sealed-away | Every toast shares ONE bottom-right stack (`Toaster` bundles Portal → Viewport); Positioner/Arrow are for per-toast ANCHORED placement, which that single-stack decision cuts. |
| `Field.Control` | exposed (indirectly) | Not rendered by the `Field` seal itself — the CONTROLS render through it (`Textarea`, `Select`, `ColorField`, `FileDropzone`), which is what makes native registration work. The Field seal's own use of it is lane NAVFORM's territory. |
| `Field.Item` / `Field.ValidityData` | sealed-away / n/a | `Item` is the multi-control-per-field grouping we have no surface for; `ValidityData` is a type. |
| `ScrollArea.Scrollbar` keepMounted | sealed-away | Base UI's default is `keepMounted: false`, so a non-scrollable axis' scrollbar UNMOUNTS on its own — the seal mounting both orientations costs nothing. Reserving a permanent gutter is `scrollbar-gutter`'s job, not a mounted-but-hidden bar. |
| `ContextMenu.*` | sealed-away | There is no context-menu seal in `packages/ui/src/primitives/`; right-click is shimmed at the call site onto the canonical `Menu`. **This shim is LOSSY — see §16.** |
| `CheckboxGroup.*` | sealed-away | Multi-select bounded fields ride `<ToggleGroup multiple>` (one home for the shape). |
| `Menubar.*` · `NavigationMenu.*` · `PreviewCard.*` · `OTPField.*` | sealed-away | No product surface: the app has one command bar (not a menubar), routes through TanStack Router links (not a navigation menu), no link-hover previews, and no one-time-code entry. Each becomes a real seal the day its surface exists — none is a "we couldn't". |
| `@base-ui/react/floating-ui-react` | n/a | 1.7 removed `FloatingPortal`/`FloatingFocusManager`/`FloatingTree`/`FloatingNode`/`FloatingDelayGroup` + 4 hooks from the public surface. Verified zero imports in this tree; never re-add. |

**Multi-trigger `Viewport` (Menu · Popover · Tooltip — plus Dialog/AlertDialog/Drawer, already wired):**
exposed as an OPT-IN part (`MenuViewport`/`PopoverViewport`/`TooltipViewport`), not baked into the
bundled anatomy. It is only meaningful when ONE popup serves several triggers and its content changes
per trigger — the `createHandle` shape, which all six seals support — and forcing the wrapper on every
popup would add a DOM layer and a transition contract that the single-trigger 99% never asked for.

**Detached `createHandle` (one popup, N sources)** is exposed for all six popup seals — Dialog,
AlertDialog, Drawer, Popover, Tooltip and (added in the 1.7 pass) **Menu**, whose seal was the lone
gap. `Menu`/`MenuTrigger` are generic over `Payload` for the same reason Popover/Tooltip are: a
non-generic wrap types the active trigger's payload `unknown` at every call site, which makes the
render-function `children` arm unusable. Drawer's handle was already sealed; 1.7 only gave it its own
`DrawerHandle` class in place of the dialog alias it used to re-export, which the seal picks up for
free because it derives (`BaseDrawer.Handle<Payload>`).

**`Avatar.Fallback` `delay` — verified across the bump, no action.** 1.6 gated on
`useState(delay === undefined)` with NO default; 1.7 defaults `delay = 0` and gates on
`useState(delay === 0)`. The seal's default (`fallbackDelay` omitted → `delay={undefined}`) shows the
fallback on the first commit in BOTH versions, so nothing changed for the default. The only delta is
for a site passing `fallbackDelay={0}` EXPLICITLY: 1.6 deferred one effect tick, 1.7 paints
immediately — the documented fix, and imperceptible. The seal's `@defaultValue 0` doc-comment is now
literally true rather than true-by-coincidence.

## 15. `className` and `style` — the seal narrows one and passes the other (RATIFIED?)

**Base UI documents BOTH props as `T | ((state) => T)`** (handbook `styling.md` §"CSS classes" /
§"Style prop"). This package resolves them DIFFERENTLY, and the asymmetry is deliberate:

- **`className` is narrowed to `string`** on every seal (`Omit<BaseXProps, "className"> & { className?: string }`).
  A seal's job is to MERGE the caller's classes with its own `tv()` slot output through `cn()`
  (tailwind-merge), and tailwind-merge resolves conflicts over class STRINGS — it cannot take a
  function, and there is no state to call one with at the point the seal composes its slot. Accepting
  the function form would mean either calling it with a state the seal doesn't have, or passing it
  through un-merged so the caller's classes silently stop beating the seal's (the exact failure the
  configured `tv` factory exists to prevent, §5). **The state-driven styling channel here is Base UI's
  own DATA ATTRIBUTES** (`data-highlighted:`, `data-disabled:`, `group-data-[panel-open]:` …), which
  are strictly more capable in this codebase: they compose with variants, survive the merge, and are
  what the token gates can see.
- **`style` is NOT narrowed** — measured, not assumed: `Omit<…, "className">` leaves
  `style?: React.CSSProperties | ((state) => React.CSSProperties | undefined)` intact, and every seal
  spreads `{...rest}` onto its Base part, so the function form works TODAY on every seal that spreads.
  There is no merge layer on `style` for it to break, so there is nothing to narrow for.

**Ruling (owner ratifies): keep the asymmetry.** `className: string` is SEAL LAW — a seal that widens
it re-opens the merge hole. `style`'s native function form stays reachable. A caller who genuinely
needs state-driven classes uses data attributes, or drops to the Base UI part directly inside its own
primitive dir. Recorded because it looks like an oversight and is not.

## 16. Known LOSSY seams (report, not rot)

- **The context-menu shim.** `packages/client/src/features/chat/components/member-row.tsx` maps
  `onContextMenu` → `preventDefault()` + a synthetic click on the row, opening the canonical `Menu`.
  Two capabilities of real `ContextMenu.Root` are absent: (1) **pointer-position anchoring** — the
  menu opens against the ROW, not where the user actually clicked; (2) **long-press** — on touch there
  is no context-menu gesture at all, so the whole affordance is desktop-only. Base UI's own guidance
  is that a context menu must only ever SUPPLEMENT a visible control (`components/context-menu.md`
  §"Usage guidelines"), which this site satisfies — so the shim is a reduced enhancement, not a broken
  requirement. A proper context-menu seal (a new `primitives/context-menu/` trio + the
  package.json exports row) is a ~1-day build (Root/Trigger/Backdrop/Portal/
  Positioner/Popup/Arrow/Item/LinkItem/Separator/Group/GroupLabel/Submenu\*/Checkbox\*/Radio\* — Menu's
  part list plus a trigger AREA — reusing `menuVariants` wholesale) plus its CT. Owner decides.
