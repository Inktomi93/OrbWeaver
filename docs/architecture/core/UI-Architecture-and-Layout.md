# UI-Architecture-and-Layout

> **The UI law — part of the nine-doc set split from the D42 spec** (pre-split source: the former `client.md`; these nine carry the D43/D44/D52/D54/D58 corrections and WIN on any conflict with the archive). The ledger entries (D42–D44, D52, D54 in `Core-Laws-and-Precedents.md`) are the decision records; these docs are the expansion.
>
> **Reading order:** UI-Architecture-and-Layout (§0–§6) → UI-Gates-and-Lessons (§7–§11) → UI-Theming-and-Content (§12) → UI-Primitives-and-Reuse (§13) → the five lib companions (`UI-Lib-TanStack-{Query,Form,Router,Virtual}` · `UI-Lib-Zustand` — evidence/provenance mines; distilled verdicts already live in the spec sections).
>
> **§-map (cross-doc `§N` references resolve here):** §0–§6.3.1 → `UI-Architecture-and-Layout.md` · §7–§11.8 → `UI-Gates-and-Lessons.md` · §12–§12.8 → `UI-Theming-and-Content.md` · §13–§13.6 → `UI-Primitives-and-Reuse.md`.

## Table of Contents

- [0. Where this came from](#e67148ff)
- [0.5 Phase-6 build manifest (the index — read this first)](#1d6c8463)
- [1. The cake gains a frontend arm](#f34f1b00)
  - [1.1 The headline win — neo's lint rules become package physics](#4b093499)
- [2. `@orb/ui` — the one home for components](#c3985204)
  - [2.1 `@orb/client` — the feature-slice tree](#c917db6d)
- [3. Tokens — DTCG single source, derived theme](#fef216b0)
- [4. The container model — 4-tier responsiveness](#d0a45fa6)
  - [4.1 The shell — the rail + collapsible panels (D55)](#86e32c3f)
- [4a. React 19 / 19.2 — platform leverage (use these, skip those)](#90dc20c1)
- [4b. Responsive doctrine — the FOUR axes (code once; desktop · widescreen · mobile from one build)](#69d5df1f)
- [5. State](#9d8d1aae)
  - [5.1 Single-route shell + the jank-avoidance rule (the neo lesson)](#16084aa8)
- [6. The stack — keep / dump](#91c13a12)
  - [6.1 TanStack — keep, with discipline](#36683b90)
  - [6.2 Tests](#8dea06ea)
  - [6.3 Markdown + code → `@orb/ui/markdown` = Streamdown](#cf249c0d)
    - [6.3.1 The streaming-reveal stack — the three layers, and who owns each (D43; verified 2026-06)](#b5469491)

---

> **Status: authoritative spec (Phase 6 — deferred rebuild).** The single home for the client
> foundation; built against when Phase 6 lands (backend first). On any conflict with neo-tavern's
> client, THIS wins — neo's client is the source to _learn from_, not copy. Decisions here are recorded
> in `core/Core-Laws-and-Precedents.md` **D42**; this doc is the expansion, not a second authority.
>
> **The one-sentence thesis:** carry over neo's _structure_ (feature-slice · surfaces/anchors ·
> state-files · intent tokens · the gate battery) and _dump_ neo's _component foundation_ (shadcn
> copy-paste + Radix + the react-markdown stack). The replacement is **one headless primitive (Base UI),
> hand-authored components in a `@orb/ui` package, and the lint rules promoted to package physics.**

---

<!-- Source: client.md -->

<a id='e67148ff'></a>

### 0. Where this came from

Two inputs: (1) the Phase-4b audit-era client review (the neo-tavern client critique — the single-route
`this_chid` jank, the cross-lib footgun cluster); (2) the Claude-Design redesign handoff
(`~/Downloads/neo tsvern.zip` — the intent-token system, surfaces/anchors doctrine, the TanStack Form
toolkit). Both are _prior art_, not law. This doc is the law.

---

<!-- Source: client.md -->

<a id='1d6c8463'></a>

### 0.5 Phase-6 build manifest (the index — read this first)

> A scannable index for a Phase-6 builder. Every row points to its canonical spec section — this is a table
> of contents, **NOT a second source of truth** (the contract lives in the cited section). **Build order
> (§11.7 / §13.6, born-compliant):** tokens → `@orb/ui` primitives+seals → `@orb/client` data/forms/state
> primitives + the gates → features. A primitive or gate that lands _after_ a feature is the rot D43 exists to
> prevent.

**Two new packages:** `@orb/ui` (domain-agnostic components — tree §2) · `@orb/client` (flat feature-slice — tree §2.1).

**`@orb/ui` primitives + seals** (each seals ONE lib behind an orbweaver API):

| Primitive                                                                     | Seals                                                  | Spec         |
| ----------------------------------------------------------------------------- | ------------------------------------------------------ | ------------ |
| button · dialog · popover · tooltip · select · switch · slider · menu · field | Base UI                                                | §2           |
| command · sortable                                                            | cmdk · @dnd-kit (the `@dnd-kit/react` rewrite)         | §2 / §11.3   |
| toast · drawer (swipe-dismiss + virtual-keyboard)                             | **Base UI native** (D54 — dropped sonner + vaul)       | §2           |
| icons                                                                         | lucide-react (gate `icons-lucide-only`)                | §2           |
| diff                                                                          | `diff` (jsdiff v8+ — snapshot/edit-history diffs, D28) | §2           |
| layout (Stack/Row/Section/Toolbar/Container)                                  | `container-type`                                       | §4           |
| charts                                                                        | ECharts (`echarts`/`echarts-for-react`)                | §11.3 (D52)  |
| meter (`linear`/`arc`/`bipolar` + milestones/dangerBelow) + SegmentedClock    | plain CSS/SVG — NOT the chart lib (D52); kinds + clock per rpg-design/11 §2 (D58) | §11.3 (D52) · rpg-design/11 §2 |
| virtual-list (generic) + message-list (chat)                                  | TanStack Virtual (`directDomUpdates`)                  | §11.3 (D54)  |
| markdown                                                                      | Streamdown (two trust policies)                        | §6.3 / §11.6 |
| stream (smooth-text pacer · TTFT shimmer)                                     | domain-free string-math                                | §6.3.1       |
| sandbox-frame · MessageMedia · ThemeScope · lightbox                          | iframe/CSP · img+a/v · token scope                     | §12          |

**`@orb/client` data / forms / state primitives** (the §13.1 contracts):

| Primitive                                            | Job                                                                  | Spec                        |
| ---------------------------------------------------- | -------------------------------------------------------------------- | --------------------------- |
| `createEntityMutation`                               | optimistic + rollback + sticky-error reset + invalidate + meta-toast | §13.1                       |
| `createCollectionSurface`                            | infinite + `maxPages` + `keepPreviousData` + virtual-list + select   | §13.1                       |
| `<QueryBoundary>`                                    | reset-handshake + `useSuspenseQueries` + `startTransition`           | §13.1                       |
| `useGatedQuery`                                      | `skipToken` gating (kills `castId("")`)                              | §13.1                       |
| `invalidation.ts`                                    | event→`queryFilter` seam                                             | §11.3                       |
| bus reducer (`applyChatBusEvent`)                    | SSE→cache, pure + exhaustive                                         | §11.1                       |
| `createSavedEntityForm` / `createAutosaveEntityForm` | the editor factories (six-obligation)                                | §13.1 / §13.4               |
| `useAppForm`                                         | the single `createFormHook` instance                                 | §11.3                       |
| `createEntityDraftStore`                             | gated Zustand draft (frozen `EMPTY` + `useShallow` + `persist`)      | §5 / §7 / §13.1             |
| `ChatHandle`                                         | `committed                                                           | draft` discriminated handle | §11.3 |

**Lookups:** surface→primitive (what to reach for) → **§13.2** · the full **gate registry** → **§8** · the
keep/dump/wrap stack → §6 · where each rich-content piece lives → §12.5.

---

<!-- Source: client.md -->

<a id='f34f1b00'></a>

### 1. The cake gains a frontend arm

The backend cake (`kit ← contracts ← db ← server`) gains a parallel frontend arm:

```
kit ─┬─→ contracts ─┬─→ db ─→ server          (backend arm, unchanged)
     │              └─→ (client, type-only)
     └─→ ui ─────────────────→ client          (frontend arm — @orb/ui is NEW)
                                  ↑
client also imports kit + contracts(type-only) + ui
```

- **`@orb/ui` is domain-agnostic** — it knows `Button`/`Dialog`/`BarChart`, NEVER `Character`/`Chat`.
  Domain-aware components (a `<CharacterCard>`, a `<MessageRow>`) live in `client/features`, built FROM
  `@orb/ui` primitives + `@orb/contracts` _types_ (type-only). This is the seam.
- **`@orb/client` imports** `@orb/ui` (runtime), `@orb/contracts` (type-only — `client-no-backend-runtime`),
  `@orb/kit` (pure utils: ids, tokens, time).
- **`#` subpath imports intra-package, package deps cross-package, ZERO `@/` aliases** (§7.5 / structure
  §2 — the shadcn `@/` tax is gone; neo kept it, orbweaver does not).

<!-- Source: client.md -->

<a id='4b093499'></a>

#### 1.1 The headline win — neo's lint rules become package physics

neo enforced the UI boundaries with lint (`pnpm arch` + dep-cruiser rules). orbweaver makes them
**resolver physics** (the constitution: boundaries are packages, not lint):

| neo lint rule                                          | orbweaver                                                                                                                 |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `client-ui-is-pure` (UI imports no features)           | `@orb/ui` has no dep on `@orb/client` — **resolver**                                                                      |
| "app imports only the UI barrel, never raw primitives" | cmdk/@dnd-kit/echarts/base-ui are NOT in `@orb/client`'s `package.json` — it physically cannot import them — **resolver** |
| "UI is domain-agnostic"                                | `@orb/ui` has no dep on `@orb/contracts`/domain — **resolver**                                                            |
| design-token parity check                              | the Tailwind theme is **codegen-derived** from `tokens.json` (§3) — drift is structurally impossible, not policed         |

---

<!-- Source: client.md -->

<a id='c3985204'></a>

### 2. `@orb/ui` — the one home for components

A workspace package = the "one home" (no doubling, §7.4). In a monorepo this replaces shadcn's external
namespaced-registry mechanism entirely — the _package_ IS the registry. (Publish a registry only if
cross-repo reuse outside orbweaver ever becomes real — defer until then.)

```
packages/ui/
  package.json          # sealed runtime libs (the ONLY package depending on these): @base-ui/react · cmdk · @dnd-kit ·
                        #   @tanstack/react-virtual · echarts · echarts-for-react · streamdown · lucide-react · tailwind-variants · diff · codemirror (@codemirror/*)
                        #   peer/build: react (PEER — react-dom is @orb/client's, the renderer) · tailwindcss + @tailwindcss/vite ·
                        #   style-dictionary (§3 token codegen).  [D54: toast + drawer = Base UI native (no sonner, no vaul ~deprecated) ·
                        #   no react-resizable-panels · tv subsumes cva/clsx/tw-merge · @dnd-kit kept (no native DnD; use the @dnd-kit/react rewrite)]
  src/
    tokens/             # DTCG single-source (§3) — promote to @orb/tokens only on a 2nd consumer
    primitives/         # each seals ONE headless behavior behind an orbweaver API
      button/  { button.tsx · variants.ts (tailwind-variants slots/unions) · index.ts }
      dialog/ popover/ tooltip/ select/ switch/ slider/ menu/ field/ toast/ drawer/   ← Base UI behind the seam
      command/ ← cmdk   sortable/ ← @dnd-kit (the @dnd-kit/react rewrite)
      virtual-list/ ← TanStack Virtual (directDomUpdates, generic)   message-list/ ← the chat seal (§11.3, D54)
      icons/   ← lucide-react (the ONE icon set; gate icons-lucide-only)
    layout/             # Stack · Row · Section · Toolbar · Container (owns container-type — §4)
    charts/             # seals ECharts — <BarChart>/<ScatterChart> + meter/ (1-D bars). §11.3 (D52)
    markdown/           # seals Streamdown — the ONE renderer, two trust policies (§6.3 / §11.6);
                        #   + a `toPlainText` (remark `strip-markdown`, same pipeline) for previews/snippets/notifications (D54)
    stream/             # smooth-text (the pacer, domain-free) + the "Thinking…" shimmer (§6.3.1)
    content/            # sandbox-frame (untrusted iframe) · MessageMedia (img+a/v) · ThemeScope · lightbox (hand-built over Dialog+MessageMedia, §12.3)
    code-editor/        # seals CodeMirror 6 (token-themed) — the custom-CSS field (§12.1) · Tier-B card CSS/HTML · D46 script authoring
    diff/               # seals `diff` (jsdiff v8+ — modern TS/async, NOT diff-match-patch) — character-snapshot (D28) + message-edit-history diff views
    lib/   { cn.ts }    # the cn() helper (tailwind-variants' built-in merge)
    styles/ { globals.css · view-transitions }   # imports tokens/generated theme
    index.ts            # subpath exports per group ("./button", "./charts", "./markdown", …)
```

- **Base UI (`@base-ui/react`, 1.x) is THE headless primitive** (D42; ledger §3). It replaces Radix:
  the explicit `Positioner` part kills the portal weirdness, the `render` prop replaces the `asChild`/Slot
  footgun, exit-animation is built in. shadcn is NOT used (no copy-paste registry/CLI — components are
  hand-authored over Base UI; reference basecn.dev / Base UI docs as prior art only).
- **Variants are tailwind-variants union types** (`VariantProps<typeof button>`; tv's `slots` for multi-part
  primitives — D54) — the ONLY styling-variation path; a
  bad variant is a `tsc` error. Ad-hoc `className` styling on a primitive is lint-banned.
- **Radix-vs-Base-UI stays reversible** — it's an impl detail _inside_ `primitives/*`. The whole point of
  the seam: swapping the headless lib is a `@orb/ui`-internal change, app untouched. (So the Base UI
  `render`-vs-`asChild` API debate, mui/base-ui#3983, is a one-file concern.)

<!-- Source: client.md -->

<a id='c917db6d'></a>

#### 2.1 `@orb/client` — the feature-slice tree

**Provenance.** No orbweaver doc drew this tree; the intent was recorded as prose only (BUILD-PLAN Phase-6 §2:
_"carry neo's STRUCTURE — feature-slice · surfaces/anchors · `state:files`"_; `_FANOUT-BRIEF` excluded `src/client`
as "a fresh rebuild"). This IS that structure: **neo's exact shape** (verified against neo's live `src/client`),
minus the three things orbweaver kills, plus `data/`+`forms/` elevated to top-level peers — by the _same_ logic
neo used to elevate `state/` out of `lib/` (load-bearing + numerous). The current `packages/client` stub
(`app/entities/features/shared`) is a discarded FSD guess — **orbweaver is NOT FSD** (no `entities/`/`shared/`
layers), it is flat feature-slice.

```
packages/client/
  package.json          # @orb/ui · @orb/contracts (type-only) · @orb/kit · zustand · @trpc/tanstack-react-query ·
                        #   @tanstack/{react-query, react-router, react-form} · react + react-dom (the renderer) ·
                        #   workbox-window (PWA runtime).   build: vite-plugin-pwa (installable + offline shell, D54).
                        #   NO raw radix/cmdk/echarts/base-ui (§1.1 physics)
  src/
    sw.ts / manifest    # PWA: service-worker (workbox precache the app shell) + web-app-manifest (install) — D54
                        #   offline scope = the shell + last-opened chat; live data still needs the server (SSE bus)
    main.tsx            # entry / composition root (mounts providers; injects the cross-feature ops — §11.0)
    routes/             # ~3 HAND-WRITTEN routes: / · /login · /admin/* (lazyRouteComponent) — no file-based codegen (§6.1)
    data/               # the data-layer primitives (TanStack Query + tRPC) — §13.1. ELEVATED from neo's lib/, same as state/
      trpc.ts           #   the proxy = the queryKey+queryFn factory (gate no-array-literal-querykey)
      query-client.ts   #   the §6.1 QueryClient defaults
      invalidation.ts   #   event→queryFilter map (gate no-inline-invalidate-outside-seam) — §11.3
      create-entity-mutation.ts · create-collection-surface.ts · query-boundary.tsx · use-gated-query.ts
      bus/              #   applyChatBusEvent (pure exhaustive reducer, §11.1) + the thin SSE transport hook
    forms/              # the editor factories — the SINGLE createFormHook instance — §13.1/§13.4. WAS neo's _shared/form (banned)
      use-app-form.ts · create-saved-entity-form.ts · create-autosave-entity-form.tsx · bound-fields/
    state/              # ALL gated Zustand stores, FLAT (gate state:files: one create/file, ≤10 fields, no exported set/getState)
      _create-entity-draft-store.ts (frozen EMPTY + persist version/migrate) · center-pane-store.ts · <entity>-draft-store.ts …
    features/           # the slices — cross-feature reads ONLY via trpc.* (§11.0); NO _shared/ drawer
      app-shell/        #   the 4-region rail shell (§4.1): RAIL(persistent nav) | LIST | CONTENT | CONTEXT;
                        #     the ONLY viewport @media site (§4b ax2 — panel-dock breakpoint + rail→top-bar mobile);
                        #     the clamp-width overlay (§11.1) = the LIST/CONTEXT docked⇄overlay⇄collapsed mechanism;
                        #     RAIL_SLOTS ↔ MODAL_SLOTS registries (gate check:registry-pairing); the focus toggle + panel state in the shell store
      auth/ character/ chat/ corpus/ credentials/ persona/ preset/ prompt-manager/ settings/ tag/ user-admin/ workloads/ world-info/
        <feature>/      #   { surfaces/ (containment CONSUMERS, @container) · anchors/ (containment PROVIDERS) ·
                        #     components/ (leaf) · hooks/ (trpc.* reads via useGatedQuery; createEntityMutation calls) · lib/ · index.ts }
    lib/                # cross-cutting display/util seams left after elevation: message-render · time · cn re-export · download-json · notify
      time.ts           #   THE date/time seam (carry neo's pipeline): server sends **epoch-UTC numbers**; client
                        #     formats to the **browser-local tz** via memoized `Intl.DateTimeFormat`/`RelativeTimeFormat`
                        #     (Intl defaults to the browser tz+locale); `now` is INJECTED (determinism §11.5 — no
                        #     `new Date()`/`Date.now()` in render). Never store/send formatted dates or a tz; the
                        #     wire is always a UTC epoch number, localization happens ONCE here at the display edge.
    styles/ globals.css · testIds.ts (typed registry, §11.5) · vite-env.d.ts
```

- **Why not FSD:** `@orb/ui` already IS the shared-component layer, so FSD's `shared/ui` is redundant; the
  `entities/` layer overlaps the feature concept and adds ceremony neo's proven flat slice never needed.
- **Three deletions from neo:** `components/` + `components/ui/` → the `@orb/ui` package; `features/_shared/` →
  dissolved (its generic bits → `@orb/ui`, its form toolkit → `forms/`, its cross-feature reads → `trpc.*`);
  file-based `routes/` codegen → ~3 hand-written routes.

---

<!-- Source: client.md -->

<a id='fef216b0'></a>

### 3. Tokens — DTCG single source, derived theme

The highest-leverage enforcement move, and engine-agnostic:

- Design values live ONCE in **W3C DTCG `.tokens.json`** (`$value`/`$type`; first _stable_ spec 2025.10).
- **Style Dictionary v4** codegens BOTH the Tailwind v4 `@theme` block AND a typed TS token map.
- The Tailwind theme is therefore **DERIVED, never hand-authored** → "add a token" has one home, drift is
  impossible by construction (does the parity-check's job at the source).
- The token scale includes a **container-breakpoint scale** (`--cq-sm/md/lg`, §4) alongside spacing/color/
  type/height/z — so container queries also use named tokens, never raw widths.

**DEFERRED-with-a-default (token enforcement level):** the _default_ is Tailwind v4 + DTCG + the
raw-value lint gate (top-decile; sufficient). **Panda CSS** (`strictTokens` → a raw value is a `tsc`
error, the most on-philosophy "won't compile > won't pass check") is the deferred upgrade — adopt only if
lint-bypass becomes a real, observed problem. Wiring the same DTCG source into Panda's `theme.tokens` is
the migration path if so. (ledger D42 / §3.)

---

<!-- Source: client.md -->

<a id='d0a45fa6'></a>

### 4. The container model — 4-tier responsiveness

Responsiveness is **container-driven, not viewport-driven** (the 2026 model). A component adapts to the
_container it was dropped into_, not the screen — which realizes surfaces/anchors AND removes the
`compact`/`inDrawer`/`density` props neo threaded through everything. Physical constraint that drives the
shape: **a container queries its descendants, never itself** → the adapting element is always a _child_ of
the container → maps onto parent/child = anchor/surface.

```
SHELL    — the ONLY viewport-aware layer (@media lives here, nowhere else). Macro layout (§4.1):
           RAIL (persistent nav) + LIST + CONTENT + CONTEXT; side panels dock⇄overlay⇄collapse;
           desktop multi-pane ⇄ mobile single-column (rail → TOP bar). Establishes top-level named containers.
ANCHOR   — containment PROVIDER. Wraps the surface in `container-type: inline-size` + `container-name`.
           (Extends the anchor's existing job: it already CHOOSES the container; now it DECLARES it.)
SURFACE  — containment CONSUMER. Pure content; queries `@container` variants. NO layout-context props.
CARD/ROW — sub-container where it must adapt independently inside a grid/list.
```

- **`@media` is allowed ONLY in `app-shell`.** A feature surface using `@media` is RED — it queries its
  container (gate: `no-media-queries-in-features`).
- **`@orb/ui/layout` owns `container-type`** — feature code never writes raw `container-type`/`-name`; it
  uses `<Container name size>` / `<Section container>`. Default `container-type: inline-size` (querying
  both dims needs explicit height + stricter containment — avoid unless required).
- **Density is a SEPARATE axis** from container size: `data-density="comfortable|compact"` (a user/viewport
  pref, attribute-driven) vs the container query (layout space). A component reads both; neither is a prop.
- **Payoff:** "build the surface once, place it anywhere" (drawer · modal · grid cell · full pane) becomes
  literally true, with zero variants and zero layout props.

<!-- Source: client.md -->

<a id='86e32c3f'></a>

#### 4.1 The shell — the rail + collapsible panels (D55)

> **Design-seed status (read before trusting the mockup):** the `~/Downloads/neo-tavern` Claude-design handoff
> is a **stale color-palette seed**. Its `Hearth`/`Loom`/`Pocket` "modes" were aspirational and **never did the
> structural work they claimed**; the VS-Code "Work mode" (Loom tab-bar/status-bar/gutters) is **CUT** (out of
> scope). **Themes are color palettes only** (§12.1) — there is NO structural mode. Keep from the seed ONLY the
> palette: the OKLCH ramp + **Ember** accent + **Geist** (the §3 token seed). The layout below is what we
> workshopped; where it and the seed disagree, this wins.

The macro layout is the **four-region shell**, realized THROUGH the §11.1 clamp-overlay so it is BOTH the
"command-center" _and_ the "immersive-SillyTavern" layout — **one shell, panels toggled**, not two builds.

```
DESKTOP (wide):   [ RAIL | LIST | CONTENT | CONTEXT ]
  RAIL    — persistent thin icon column (~56px, fixed). Weave glyph (brand) → section icons
            (Chats · Characters · Corpus · Refinery · Analytics) → spacer → Theme · Settings · your avatar.
            Registry-as-data: RAIL_SLOTS (each = { icon, the list it shows, the content surface }),
            id-paired with MODAL_SLOTS (gate check:registry-pairing). Replaces neo's TOP_NAV_SLOTS.
  LIST    — the active section's collection (conversations / characters / corpus) + search + "new". Side panel.
  CONTENT — the fluid hero, three stacked parts: a HEADER bar (active entity · scene chip · thread actions —
            branch/bookmark/more) + the THREAD (chat/editor surface, prose capped 65–75ch) + the COMPOSER
            (pill input · attach · Send, with a mid-stream STOP, optimistic send, disabled-while-generating).
            LEFTOVER width feeds CONTEXT, NOT a wider chat.
  CONTEXT — the right detail panel (active character/entity: avatar, threads-in-play, memory note). Side panel.

MOBILE:  RAIL → TOP tab bar (workshopped — Nate's call, NOT the seed's bottom-tabs); LIST/CONTEXT →
         full-screen / sheets; single column. (Mobile is a responsive LAYOUT, never a theme.)
```

- **Refinery is a first-class rail section + feature surface** (Score→Rewrite→Analyze + iterate; the schema
  already anticipates it — `refineryScore`/`refineryAnalysis` + snapshots, D28). Its sub-parts (stage-stepper,
  assay, issue-list, **compare-diff** → `@orb/ui/diff`, guidance-bar) are app components over the primitives.
- **Each side panel (LIST, CONTEXT) has a 3-state model** in the shell store: **`docked`** (column, default wide)
  · **`overlay`** (slides over via the §11.1 clamp — zero width closed) · **`collapsed`** (hidden; edge affordance
  reopens). Per-panel, persisted, **auto-`overlay` below a width breakpoint** (the one app-shell `@media`). The
  RAIL is the always-on region (→ TOP tab bar on mobile).
- **"Immersive-ST" = both side panels collapsed** (rail + a big CONTENT chat, panels summoned on demand);
  **"command-center" = panels docked.** One persisted **focus toggle**. _The §11.1 clamp-overlay IS the `overlay`
  mechanism — the baked work powers the collapse, not a rewrite._
- **The shell is THEME-INDEPENDENT.** Themes are **color palettes** in the D44 selector (Hearth = warm-dark
  default · a cool/Mocha option · Light deferred · **+ user-authored** — §12.1/§3), NOT layout modes; rail +
  panels render identically under any palette. Density is a separate token axis (§4) a palette may pin.
- **`@media` lives ONLY here** (panel-dock breakpoint + rail→top-bar); everything inside the regions is
  container-queried (§4b axis 1). The shell is the SHELL-tier reference (§11.1).
- **A migrating ST user loses nothing:** swipes · edit-in-place · branch/fork · italics-narration · hide-from-AI
  all live in the CONTENT thread, identical regardless of chrome.

---

<!-- Source: client.md -->

<a id='90dc20c1'></a>

### 4a. React 19 / 19.2 — platform leverage (use these, skip those)

The client targets **React 19 + the React Compiler**. The platform does work you'd otherwise hand-code —
but several celebrated React-19 features are REDUNDANT with the TanStack stack and must be skipped so two
systems don't fight.

**USE:**

- **The React Compiler is ON — stop hand-writing `useMemo`/`useCallback`/`React.memo`.** It memoizes for
  you; manual memo is noise. The ONE blind spot is `useVirtualizer` (interior mutability) → sealed in
  `@orb/ui/virtual-list` with **`directDomUpdates: true` + `containerRef`** — TanStack Virtual's released,
  React-19-Compiler-E2E-tested fix (3.14+), **NOT `"use no memo"`** (§7/§11.8/D54); feature never wires it by hand.
- **`<Activity>` (19.2) for the single-route panes.** Keep a pane mounted-but-hidden when you flip away
  (chat ⇄ library) so returning is instant with scroll + form state intact — the principled realization of
  the single-route shell (§5.1). Replaces unmount/remount.
- **`useEffectEvent` (19.2) is THE fix for the effect footguns.** It separates an effect's non-reactive
  part from its deps (read latest values without re-triggering). It is the correct tool for the seam
  effects neo hand-rolled with `prevRef` bookkeeping (the right-drawer sync; the seed-clobber guard, §7) —
  prefer it over ref-juggling.
- **View Transitions API for single-route navigation.** Animate landing⇄chat / library⇄editor while
  preserving spatial context — no router needed (pairs with `<Activity>`). Transition utilities live in
  `@orb/ui` styles.
- **`ref` as a prop (no `forwardRef`).** `@orb/ui` primitives take `ref` like any prop — cleaner authoring.

**SKIP (redundant with the TanStack stack — do NOT bolt on):**

- **React 19 form Actions / `useActionState` / `useFormStatus`** — TanStack Form owns form state (§6.1).
  Two form systems fighting is worse than one.
- **`useOptimistic`** — TanStack Query's `optimisticOptions` owns optimistic updates. No second path.
- React 19 `<form action>` / server-action pattern — orbweaver is tRPC + Query, not server actions.

**BASELINE (non-negotiable):** WCAG 2.2 AA (4.5:1 body contrast · visible focus · keyboard-operable ·
persistent labels — much of it free from Base UI), and `prefers-reduced-motion` respected on every
transition/animation above.

---

<!-- Source: client.md -->

<a id='69d5df1f'></a>

### 4b. Responsive doctrine — the FOUR axes (code once; desktop · widescreen · mobile from one build)

"Mobile just works" is NOT one technique — it's using the RIGHT tool per axis instead of a `max-width`
ladder. **The code-once guarantee: a feature author writes ONLY axis 1; axes 2–4 live once in the
shell/token/primitive layer.** There is no separate mobile build — one set of placement-agnostic surfaces +
one shell that reflows + a touch-first token baseline + platform CSS in three primitives.

| Axis                      | What varies                                                                                                                                    | Tool                                                         | Where it's written                                     |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------ |
| **1 — component layout**  | a surface in a wide pane vs a narrow drawer                                                                                                    | **`@container`** + container-query units (`cqi`) + `clamp()` | **features** (the ONLY responsive thing they write)    |
| **2 — macro structure**   | rail+list+content+context desktop ⇄ single-column mobile (rail → TOP bar); side panels dock⇄overlay (the §11.1 clamp) / sheet on mobile (§4.1) | **`@media`** (viewport)                                      | **SHELL only** (~1 file; the sole legal `@media` site) |
| **3 — device capability** | touch targets; hover affordances                                                                                                               | **`@media (pointer/hover)`** + token sizing                  | **token/shell layer** (never features)                 |
| **4 — mobile platform**   | keyboard, safe-area, overscroll, viewport height                                                                                               | **CSS primitives** (`dvh`/`svh`, `env()`, viewport meta)     | **shell + composer/scroll primitives** (once)          |

**Axis 1 (the core — verified 2026 standard, 95%+ support).** A surface adapts to _its container_, not the
screen — same `<CharacterGrid>` is 4-up in a wide pane, 1-up in a drawer, automatically. No mobile variant,
no `compact`/`inDrawer` prop (`no-layout-context-props`). Fluid type/spacing INSIDE a component use container
units `cqi`+`clamp()`, not viewport units.

**Axis 2.** The one genuinely viewport-dependent reflow, in the SHELL: 3-pane ⇄ stack, drawer ⇄ sheet. Tiny
(neo: one `clamp()` width var + the overlay model, §11.2). `no-media-queries-in-features` keeps it there.

**Axis 3 — capability, NOT size (the "do it right once" inversion).** hover/pointer are media-query-only
(container queries can't see them). **Touch-first baseline:** interactive primitives meet the ≥44px touch
floor _unconditionally_ via token control-heights; `data-density="compact"` _tightens_ for fine pointers —
so there's nothing to branch (invert the usual desktop-first→bolt-on-mobile). Hover is only ever an
_enhancement_ (`@media (hover:hover)`); **every hover action has a tap-equivalent** (the kebab IS the tap
path). Base UI suppresses tooltips on touch for free. _Gate `touch-target-floor`: interactive primitives may
not set a control-height below the touch token._

**Axis 4 — mobile platform CSS, baked into 3 primitives:**

- **`dvh`/`svh` units, not `vh`** (with a `vh` fallback line) — `svh` where above-fold must stay visible,
  `dvh` for the adaptive shell. Use intentionally (dvh recalcs on toolbar expand/collapse).
- **The keyboard gotcha (verified):** `dvh`/`svh` are NOT shrunk by the virtual keyboard (it shrinks the
  _visual_ viewport, not the _layout_ viewport these units reference) → set **`interactive-widget=resizes-content`**
  in the viewport meta so the composer reflows above the keyboard (Android/Chromium); `visualViewport` API
  only for precise composer-pinning if ever needed.
- **`env(safe-area-inset-*)`** padding on shell + composer (notch / home-indicator); **`overscroll-behavior:
contain`** on every scroll region (no pull-to-refresh / scroll-chaining fighting the app); `inputmode`/
  `type=` on inputs (Base UI fields set these).

**Why no second build:** Base UI gives touch/keyboard/pointer _interaction_ correctness for free (focus,
touch-dismiss, tooltip-on-touch, ARIA); we own only _layout_ (axes 1–2) + _platform CSS_ (axis 4), and axes
2–4 are all shell/token/primitive-level. A feature writes a `@container` surface, drops it in an anchor, and
mobile works — macro reflow is the shell's, touch sizing is the token baseline, keyboard/safe-area/overscroll
are the composer/scroll primitives'. (D42 §4 + D43 §11.2; verified 2026-06.)

---

<!-- Source: client.md -->

<a id='9d8d1aae'></a>

### 5. State

- **Server state → TanStack Query** (+ tRPC via `@trpc/tanstack-react-query`). NEVER in zustand.
- **Client/UI state → Zustand** (DECIDED — D42; not Jotai/TanStack Store: gated-zustand is more
  machine-enforceable for amnesiac agents than free-form atoms; the one zustand footgun is gated, §7).
  Gated by `state:files`: one `create(` per file, ≤10 top-level fields, no exported `set`/`getState`/store
  handle, `persist({name})` namespaced. Draft stores via the `createEntityDraftStore` factory.
- **Local-state-first** — `useState`/props unless genuinely cross-tree; stores only for global concerns
  (active selection, theme, the stream buffer).
- **Lifecycle slices modeled as discriminated-union transitions**, not ad-hoc `setState` — the stream/turn
  lifecycle (`turnStarted → delta → turnCompleted|turnAborted`, the ghost slot) is a state machine; model
  it explicitly inside the store (the center-pane `{kind:landing}|{kind:chat}` is the reference). No XState.

<!-- Source: client.md -->

<a id='16084aa8'></a>

#### 5.1 Single-route shell + the jank-avoidance rule (the neo lesson)

The URL stays `/` (entity ids never in the address bar; multi-device sync is DB-is-truth + the bus, not
URL-bookmarking). This is fine — but neo's single-route jank came NOT from single-route, it came from
every surface reading one ambient "active character/chat" global and chasing it (the `this_chid` parity
sync effect). **The rule a cold agent cannot get wrong:**

> surfaces own their own state · selecting a thing ≠ a cascade of side effects · NO effect making the
> right panel chase the active chat (no `this_chid` re-coupling).

If "open the library beside a live chat without it yanking the chat" is possible, the jank is gone. If
real deep-links/back-forward ever become wanted, routes are a localized bolt-on (TanStack Router for the
chat id only) — NOT a rewrite.

---

<!-- Source: client.md -->

<a id='91c13a12'></a>

### 6. The stack — keep / dump

|          | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **DUMP** | **shadcn** (copy-paste workflow) → hand-author `@orb/ui`. **Radix** → **Base UI**. **react-markdown + rehype-sanitize + remark-gfm + rehype-raw** → **Streamdown** (§6.3). **react-syntax-highlighter / Prism** → **Shiki** (free inside Streamdown). **nivo** (the 6 `@nivo/*` corpus packages) → **ECharts** (D52 — nivo stuck at v0.99, see §11.8). The `@/` alias → `#`.                                                                                                                    |
| **KEEP** | feature-slice · surfaces/anchors · state-files · intent tokens · the gate battery · **Tailwind v4** · **tailwind-variants** (slots; subsumes cva+clsx+tailwind-merge — D54) · **lucide** · **TanStack** (Query / Router-minimal / Form / Virtual) · **Zustand** · the satellites **cmdk · @dnd-kit** · **ECharts** (replaces nivo, D52). **Base UI now native: toast + drawer** (dropped **sonner** + **vaul**, D54); **dropped react-resizable-panels** (shell uses the clamp-overlay, §11.1). |
| **WRAP** | every kept third-party lib lives behind `@orb/ui`; app imports `@orb/ui`, never the lib.                                                                                                                                                                                                                                                                                                                                                                                                        |

<!-- Source: client.md -->

<a id='36683b90'></a>

#### 6.1 TanStack — keep, with discipline

> **`QueryClient` defaults (born-compliant — from the full-docs mine, `UI-Lib-TanStack-Query.md`):**
> `staleTime: Infinity` (the SSE bus drives freshness — **NOT `'static'`**, which silently ignores
> `invalidateQueries`; a gate should ban `'static'` on bus-backed keys) · `gcTime: 5*60_000` ·
> `refetchOnWindowFocus: false` (bus owns liveness) · **`refetchOnReconnect: true`** (SSE-gap catch-up —
> disabling it is the actual bug) · `refetchOnMount: true` · `networkMode: 'online'` · `structuralSharing: true` ·
> `throwOnError: false` (the `<QueryBoundary>` opts in per-tree) · mutations `retry: 0` · global error toasts via
> `QueryCache`/`MutationCache` `onError` keyed off `meta` (coexists with per-mutation error slots). **Gate-boundary
> note:** `no-inline-cache-surgery-in-stream` must scope to stream/subscription bodies only — it must NOT trip on
> the legitimate `setQueryData` inside `createEntityMutation.onMutate`. Adopt `skipToken` (kills the
> `castId<X>("")` sentinel) and `@tanstack/eslint-plugin-query` `flat/recommended-strict`.
> **Reference companions** (this directory — full-read examples + deep-docs mines; the distilled verdicts are
> already folded into the spec sections cited, so these are evidence/provenance, not extra law):
>
> | Companion                                      | Fed into                                                                                                                    |
> | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
> | `UI-Lib-TanStack-Query.md` · `-query-notes.md` | the QueryClient defaults (above) · `createEntityMutation` · `createCollectionSurface` · `<QueryBoundary>` · §13             |
> | `UI-Lib-TanStack-Form.md` · `-form-notes.md`   | the editor-factory six-obligation contract (§13.4) · confirms Form is React-Compiler-clean, footguns #4/#5 FACTORY-ORIGINAL |
> | `UI-Lib-TanStack-Router.md`                    | the Router verdict + traps (below)                                                                                          |
> | `UI-Lib-TanStack-Virtual.md`                   | the D54 "keep TanStack Virtual" reversal (§11.8)                                                                            |
> | `UI-Lib-Zustand.md`                            | the §5/§13.1 store conventions (frozen `EMPTY` + `useShallow`; `persist` partialize/migrate)                                |

- **Query / Form / Virtual: keep** (load-bearing; dropping = reinventing worse).
- **Router: use it MINIMALLY** — single-route shell means ~3 routes (`/`, `/login`, `/admin/*`). Drop the
  file-based codegen plugin; hand-write the tiny route tree. (Don't swap for wouter — family cohesion wins
  over the marginal ceremony saving.) **Full-docs mine → `UI-Lib-TanStack-Router.md` (this directory).**
  Verdict: all three calls (single-route/no-URL-ids · hand-written code-based tree, plugin dropped · router
  owns nav not data) are explicitly supported — **type-safety survives dropping the codegen plugin** (it's
  inference + one `declare module { Register }`, not codegen). Two real traps it surfaced: (1) `useBlocker`
  will NOT fire on the in-app editor pane-switch (it's a reducer state change, not a navigation) → the editor
  dirty-guard must be **hand-rolled in-app**, not `useBlocker`; (2) the router's built-in View Transitions fire
  only on URL commits (`pathChanged` is always false in our shell) → §4a's **hand-rolled** VT is correct, not a
  workaround. Steal-list: router-context DI (forward `queryClient`/`trpc`, never construct), `beforeLoad`+
  `redirect` auth gate, `lazyRouteComponent` for `/admin/*`, `createMemoryHistory` in tests, DEV-gated devtools.
- **Form threshold rule (CORRECTED — D54; we were under-scoping it to "entity editors"):** a **form factory**
  (§13) is the home for **ANY multi-field form** — the trigger is **≥3 fields OR validation OR save/draft
  semantics**, NOT "is it an entity." That is a much larger set than the 4 entity editors: it also covers
  **settings panels, connection/credential add+edit, group-chat config, room overrides, the D44 theme-override
  editor, and user-admin create/edit** (all were Form candidates being under-served). Only **genuinely trivial**
  inputs stay plain controlled + the same Zod schema — a 1–2-field search box, a lone toggle, a single rename.
  Don't pay the toolkit tax on a single toggle; do NOT hand-roll a 6-field config panel either. **Full
  surface→factory map in §13.4.** RHF stays banned (Compiler-incompatible; §6 / D54; never coming back).

<!-- Source: client.md -->

<a id='8dea06ea'></a>

#### 6.2 Tests

Playwright CT (`.ct.tsx`) for component tests + Playwright e2e (`.spec.ts`); central `tests/` mirror.
Browser is Playwright, NOT Vitest (it hangs) — separate runners, not in `pnpm check`. Add
**visual-regression (Playwright screenshots) as a gate** — the machine substitute for "is this visually
consistent" review.

<!-- Source: client.md -->

<a id='cf249c0d'></a>

#### 6.3 Markdown + code → `@orb/ui/markdown` = Streamdown

- **Streamdown** (Vercel — a drop-in react-markdown replacement built for AI streaming) is THE markdown
  renderer, used everywhere (chat AND static descriptions → one lib). It repairs incomplete/unterminated
  markdown mid-stream (half-typed code fences, partial tables) instead of flashing, does incremental DOM
  updates (react-markdown re-parses the whole message per token → ~O(n²) → exponential lag on long
  streamed messages), and bundles **Shiki** highlighting + KaTeX + Mermaid + copy/download + security
  policies. Sealed as `@orb/ui/markdown`.
- **VERIFY-AT-BUILD (untrusted content):** Streamdown's built-in sanitization is tuned for AI output
  (semi-trusted). The app also renders UNTRUSTED markdown (user-uploaded character cards, other users'
  messages — D21 "no leaks ever"). Confirm Streamdown's security config is strict enough for the untrusted
  threat model, or layer `rehype-sanitize` behind the `@orb/ui/markdown` seam if not. (ledger D42; the
  concrete two-policy answer is §11.6.)

<!-- Source: client.md -->

<a id='b5469491'></a>

##### 6.3.1 The streaming-reveal stack — the three layers, and who owns each (D43; verified 2026-06)

neo had real **markdown-parse + streaming display bugs** (unterminated-fence flashes, partial-markdown
mis-render, an O(n²) full-reparse-per-token lag) — and the audit shows _why_: it hand-rolled the parse/repair
layer (`repairStreamingTail` + a custom `incremental` block-memoize) that is now a **solved problem**. Split
the stack into three layers with one owner each; **Streamdown replaces the layer that broke**, and we keep
only the one piece neo did better than the ecosystem:

1. **Parse · repair · incremental · fade · security → Streamdown (owns this).** Its incomplete-markdown
   repair, incremental DOM, per-word animation (`fadeIn`/`blurIn`/`slideUp`, configurable), and
   sanitize+harden are purpose-built for streaming AI markdown. **DELETE neo's `repairStreamingTail`, the
   hand-rolled `incremental` reparse, AND the `.stream-word` CSS** — Streamdown does all three, robustly.
   This is the fix for "streaming got weird," not a re-port of it.
2. **Pacing → KEEP neo's `useSmoothText`, sealed as a pure `@orb/ui` primitive.** Streamdown has **no
   pacing** (it animates whatever it's handed per render — verified at streamdown.ai/docs/animation); an
   external pacer "works seamlessly". `useSmoothText` is the genuinely best-of-best layer: adaptive
   backlog-drain (calm slow models / near-realtime fast), **grapheme-cluster safety** (no torn emoji/ZWJ —
   _no library does this_), trailing-partial-word + tag-aware hold-back, hidden-tab flush, reduced-motion
   passthrough, the dt-honesty single-loop fix. It is domain-free string-math + rAF → belongs in `@orb/ui`.
   Pipeline: tokens → `useSmoothText` (reveal cadence + cut-point) → Streamdown (repair + render + fade the
   new words). Do NOT swap it for AI SDK `smoothStream` (server-side, fixed-delay, cruder, drags in a
   transport we don't use).
3. **TTFT affordance → keep the "Thinking…" shimmer** (cheap, domain-agnostic; the pre-first-token state).

- **VERIFY-AT-BUILD:** confirm Streamdown's fade granularity (`sep:"word"`) composes with the pacer's
  word-snapping — both think in words, so newly-committed paced text should fade once, not double-animate.
- **Re-pin or retire the tag-aware hold-back** (`trailingOpenTagStart`) by whether orbweaver's chat keeps
  neo's `<speaker>`-span wire format; it exists only to stop a partial `<spea…` flashing as literal text.

**HONEST RISK — Streamdown's open bugs cluster in code-blocks-while-streaming, the SAME spot neo's did
(verified 2026-06; ~37 open issues).** Capability is complete (GFM tables/tasklists/strikethrough · Shiki
code highlighting — best-in-class, an upgrade on neo's Prism · KaTeX · Mermaid · incomplete-block repair),
but the streaming-time code-block path is its soft spot: #473 fenced blocks buffer-not-incremental, #402
Shiki re-highlight flicker per frame, #195 huge code blocks freeze the tab, #343 lazy code/mermaid chunks
crash after deploy (stale hashes + missing error boundary). So Streamdown is "trade hand-rolled bugs for a
maintained library's upstream-fixed bugs," NOT "weirdness solved." It is still the right call — the
alternative (hand-wiring react-markdown+remark+rehype+Shiki) is more code and re-inherits neo's repair
problem — but adopt with these **guards as build-gates, not assumptions:**

1. **Pin a version floor ≥ 2.5** (where the code-block + long-line + unknown-language-fallback fixes landed).
2. **The pacer mitigates the flicker (#402/#473):** feeding Streamdown word-snapped ~30fps commits (not
   raw per-token deltas) cuts the re-highlight churn — make this an explicit reason the pacer sits in front.
3. **Wrap the lazy `CodeBlock`/`Mermaid` chunks in an error boundary** inside `@orb/ui/markdown` (#343) —
   orbweaver wants this anyway; it converts a deploy-time white-screen into a graceful fallback.
4. **Large-code-block perf guard (#195):** a max-render/virtualize threshold for pathological blocks.
5. **Golden-test streaming code fences** against the #473/#402 scenarios before chat commits to it — the
   audit's "test the streaming code-block path" is a Phase-5 checkpoint, not a hope.

---
