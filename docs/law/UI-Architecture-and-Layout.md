---
kind: law
status: active
updated: 2026-09-23
---

# UI-Architecture-and-Layout

> **The UI law**, one of the docs split from the D42 spec. The ledger entries (D42–D44, D52, D54, D58) are the decision records; these docs are the expansion, and win on any conflict with another copy.
>
> **Reading order:** UI-Architecture-and-Layout (§0–§6) → UI-Gates-and-Lessons (§7–§11) → UI-Theming-and-Content (§12) → UI-Primitives-and-Reuse (§13) → `ui-package-design.md` → `motion-and-animation-guide.md`.
>
> **§-map:** §0–§4b → `UI-Architecture-and-Layout.md` · §5–§6.3.1 → `ui-architecture-state-and-stack.md` · §7–§11.8 → `UI-Gates-and-Lessons.md` · §12–§12.8 → `UI-Theming-and-Content.md` · §13–§13.10 → `UI-Primitives-and-Reuse.md`.
>
> **Build state:** code owns landed truth; this doc states the rule, not the build percentage. `packages/ui/src` is the inventory of built primitives; `packages/ui/package.json#exports` is the public surface.
>
> **Ledger D66 amends four D62-era rulings below:** the LIST gets a real `.shell-panel-header` band (A1), the list-header **New** is the panel's ONE `primary` button (A2), message-action clusters rest HIDDEN not dimmed (A3), and every editor AUTOSAVES — no Save/Set/Discard (A4). Where §4.1/§4.2/§4.3 below still read as the D62 posture, D66 WINS. The inline `> [!NOTE]` blocks flag each conflict rather than overwrite the D62 text.

> **The one-sentence thesis:** carry over neo's *structure* (feature-slice · surfaces/anchors · state-files · intent tokens · the gate battery) and *dump* neo's *component foundation* (shadcn copy-paste + Radix + the react-markdown stack). The replacement is **one headless primitive (Base UI), hand-authored components in the `@orb/ui` package, and the lint rules promoted to package physics.**

### 0.5 The primitive index

> A scannable index. Every row points to its canonical spec section — a table of contents, **NOT a second source of truth**. **Build order (§11.7 / §13.6):** tokens → `@orb/ui` primitives+seals → `@orb/client` data/forms/state primitives + the gates → features.

**`@orb/ui` primitives + seals** (each seals ONE lib behind an orbweaver API; `packages/ui/src` is the doc):

| Primitive | Seals | Spec |
| - | - | - |
| button · dialog · popover · tooltip · select · switch · slider · menu · field (+ the Wave-3 controls/disclosure/display set) | Base UI | §2 |
| command · sortable · macro-textarea | cmdk · `@dnd-kit/react` · minisearch | §2 / §11.3 |
| toast · drawer | Base UI native (D54 — dropped sonner + vaul) | §2 |
| icons | lucide-react (dep-cruiser `ui-satellite-seals`) | §2 |
| diff | `diff` (jsdiff — snapshot/edit-history diffs, D28) | §2 |
| layout (Stack/Row/Section/Toolbar/Container) | `container-type` | §4 |
| chart · bar-list · histogram · stat-figure | ECharts | §11.3 (D52) |
| meter (`linear`/`arc`/`bipolar` + milestones/dangerBelow) + SegmentedClock | plain CSS/SVG — NOT the chart lib (D52); kinds + clock per docs/plans/rpg/design.md (D58) | §11.3 (D52) |
| virtual-list (generic) + message-list (chat) + media-grid | TanStack Virtual (`directDomUpdates`) | §11.3 (D54) |
| markdown | Streamdown (two trust policies) | §6.3 / §11.6 |
| stream (smooth-text pacer · TTFT shimmer) | domain-free string-math | §6.3.1 |
| sandbox-frame · MessageMedia · ThemeScope · lightbox | iframe/CSP · img+a/v · token scope | §12 |
| code-editor | CodeMirror 6, token-themed | §12.1 |

**`@orb/client` data / forms / state primitives** (`packages/client/src/{data,forms,state}`, the §13.1 contracts):

| Primitive | Job | Spec |
| - | - | - |
| `createEntityMutation` | optimistic + rollback + sticky-error reset + invalidate + meta-toast | §13.1 |
| `createCollectionSurface` | infinite + `maxPages` + `keepPreviousData` + virtual-list + select | §13.1 |
| `<QueryBoundary>` | reset-handshake + `useSuspenseQueries` + `startTransition` | §13.1 |
| `useGatedQuery` | `skipToken` gating (kills `castId("")`) | §13.1 |
| `invalidation.ts` | event→`queryFilter` seam | §11.3 |
| bus reducer (`applyChatBusEvent`) | SSE→cache, pure + exhaustive | §11.1 |
| `createSavedEntityForm` / `createAutosaveEntityForm` | the editor factories (six-obligation) | §13.1 / §13.4 |
| `useAppForm` | the single `createFormHook` instance | §11.3 |
| `createEntityDraftStore` | gated Zustand draft (frozen `EMPTY` + `useShallow` + `persist`) | §5 / §7 / §13.1 |
| `ChatHandle` | `committed \| draft` discriminated handle | §11.3 |

**Lookups:** surface→primitive → **§13.2** · the **gate registry** → **§8** · keep/dump/wrap stack → §6 · rich-content homes → §12.5.

### 1. The cake gains a frontend branch

The backend cake (`kit ← contracts ← db ← server`) gains a parallel frontend branch:

```
kit ─┬─→ contracts ─┬─→ db ─→ server          (backend branch, unchanged)
     │              └─→ (client, type-only)
     └─→ ui ─────────────────→ client          (frontend branch)
```

- **`@orb/ui` is domain-agnostic** — it knows `Button`/`Dialog`/`Chart`, NEVER `Character`/`Chat`. Domain-aware components (a `<CharacterCard>`, a `<MessageRow>`) live in `client/features`, built FROM `@orb/ui` primitives + `@orb/contracts` *types* (type-only). This is the seam.
- **`@orb/client` imports** `@orb/ui` (runtime), `@orb/contracts` (type-only), `@orb/kit` (pure utils: ids, tokens, time).
- **`#` subpath imports intra-package, package deps cross-package, ZERO `@/` aliases** (the shadcn `@/` tax is gone).

#### 1.1 The headline win — neo's lint rules become package physics

neo enforced the UI boundaries with lint. orbweaver makes them **resolver physics** (boundaries are packages, not lint) — LIVE, enforced by the package.json dep sets + `.dependency-cruiser.cjs` (`ui-cake` · `ui-no-node-builtins` · `ui-satellite-seals`):

| neo lint rule | orbweaver |
| - | - |
| `client-ui-is-pure` (UI imports no features) | `@orb/ui` has no dep on `@orb/client` — **resolver** |
| "app imports only the UI barrel, never raw primitives" | cmdk/@dnd-kit/echarts/base-ui are NOT in `@orb/client`'s `package.json` — it physically cannot import them — **resolver** |
| "UI is domain-agnostic" | `@orb/ui` has no dep on `@orb/contracts`/domain — **resolver** |
| design-token parity check | the Tailwind theme is **codegen-derived** from `tokens.json` (§3) — drift is a failing freshness test, not a policed parity |

### 2. `@orb/ui` — the one home for components

A workspace package = the "one home"; the *package* IS the registry (shadcn's external registry mechanism is not used; components are hand-authored over Base UI).

**The code is the doc.** Tree + per-primitive structure: `packages/ui/src` (`primitives/` · `layout/` · `charts/` · `markdown/` · `stream/` · `content/` · `code-editor/` · `diff/` · `tokens/` · `lib/` · `styles/`). Public surface: the **explicit `exports` map** in `packages/ui/package.json` — one subpath per group, deliberately **no root barrel** (a flat `@orb/ui` import would defeat tree-shaking and blur the seal boundaries). Deps (the sealed satellites) live only in that package.json; structure is gate-enforced (`tooling/src/verify/gates/ui-primitive-structure.ts`, §13.7). Per-primitive file contract + authoring rules: §13.7–§13.8.

The law that survives any file-level churn:

- **Base UI (`@base-ui/react`, 1.x stable) is THE headless primitive** (D42; the `@base-ui-components/react` name is the dead rc-era package — biome-banned). It replaces Radix: the explicit `Positioner` part kills the portal weirdness, the `render` prop replaces the `asChild`/Slot footgun, exit-animation is built in.
- **`react` AND `react-dom` are peers** — Base UI requires the react-dom peer. The client remains the renderer; ui never bundles React.
- **Variants are tailwind-variants union types** (`VariantProps<typeof xVariants>`; tv `slots` for multi-part primitives) — the ONLY styling-variation path; a bad variant is a `tsc` error. Ad-hoc `className` styling on a primitive is gate-banned. `cn` = tailwind-variants' merge, re-exported from `@orb/ui/lib`.
- **Base-UI-vs-anything stays reversible** — the headless lib is an impl detail *inside* each primitive dir; swapping it is a `@orb/ui`-internal change, app untouched.
- **tokens/ promotes to `@orb/tokens` only on a 2nd consumer.**

#### 2.1 `@orb/client` — the feature-slice tree

The tree below is committed law: gate `client-structure` enforces the per-feature shape the moment a slice gets real code; `data/`, `forms/`, `state/` are populated per the §13.1 contracts. **orbweaver is NOT FSD** (no `entities/`/`shared/` layers) — flat feature-slice, plus `data/`+`forms/` elevated to top-level peers of `state/`.

```
packages/client/
  package.json          # @orb/ui · @orb/contracts (type-only) · @orb/kit · @tanstack/react-router · react(-dom)
                        #   · zustand · @trpc/tanstack-react-query · @tanstack/{react-query,react-form} ·
                        #   workbox-window + vite-plugin-pwa. NO raw radix/cmdk/echarts/base-ui (§1.1 physics)
  src/
    sw.ts / manifest    # PWA: workbox precache of the app shell + web-app-manifest.
                        #   offline scope = the shell + last-opened chat; live data still needs the server (SSE bus)
    main.tsx            # entry / composition root + THE REGISTRATION DOOR: the one place feature
                        #   definitions + contributors are imported and assembled (lockdown §7, gate G8)
    agent-nav/ agent-seed/
                        # dev-only agent-bridge impls that compose feature FRONT DOORS + #state actions.
                        #   main.tsx is their ONLY importer (dep-cruiser client-composition-tier-door-only)
    routes/             # HAND-WRITTEN routes: / (app-root.tsx) · /login — no file-based codegen; admin
                        #   is a group in the Settings SECTION at /, NOT a standalone route (§6.1)
    components/         # tier 2 — domain-AWARE cross-feature composites with no single feature owner
                        #   (ConfirmDialog · LibraryRow · CharacterPicker · QueryBoundary · WeaveGlyph …);
                        #   composition-tier DIRECTORY MODULES (lockdown §3), gate G5
    data/               # the data-layer primitives (TanStack Query + tRPC) — §13.1
      trpc.ts · query-client.ts · invalidation.ts · create-entity-mutation.ts ·
      create-collection-surface.ts · use-gated-query.ts · bus/
    forms/              # Node-safe models, draft/store helpers and save-status seams — #forms
      editor/           # browser editor composition — #forms/editor — §13.1/§13.4
        use-app-form.ts · create-saved-entity-form.ts · create-autosave-entity-form.tsx · bound-fields/
    state/              # ALL gated Zustand stores, FLAT (gate `state-files`: one create/file, ≤10 fields, no exported set/getState)
    features/           # the slices — NO _shared/ drawer. The cross-feature channel is CHANNEL-SPECIFIC:
                        #   the decision table is client-architecture-state-and-gates.md §12 (the old blanket
                        #   "reads ONLY via trpc.*" is superseded — it is wrong for ephemeral state)
      app-shell/        #   the 4-region rail shell (§4.1); the ONLY viewport @media site (§4b ax2);
                        #     the clamp-width overlay (§11.1); the chrome registry over CHROME_ZONES (gate chrome-registry-completeness)
                        # THE ROSTER IS THE TREE — `ls packages/client/src/features`. A list here rots.
                        #   A section id is not its owner's dir name — `corpus` →
                        #   `discovery/lib/corpus-section.tsx`, `analytics` → `stats`, `chats` → `chat`
        <feature>/      #   { surfaces/ (REGION bodies, containment CONSUMERS, @container) · anchors/
                        #     (containment PROVIDERS) · components/ (everything mounted INSIDE a region) ·
                        #     hooks/ · lib/ (helpers, view-models, the registered DEFINITIONS) · index.ts }
                        #   Bucket nesting is legal — the same per-file contracts RECURSE (lockdown §3);
                        #     per-slice card: packages/client/src/features/README.md
    lib/                # cross-cutting display/util seams: message-render · time · cn re-export · download-json · notify
      time.ts           #   THE date/time seam: server sends epoch-UTC numbers; client formats to browser-local tz
                        #     via memoized Intl.*; `now` is INJECTED (determinism §11.5). Never store/send formatted
                        #     dates or a tz; localization happens ONCE here at the display edge.
    styles/ globals.css · testIds.ts (typed registry, §11.5)
```

- **Why not FSD:** `@orb/ui` already IS the shared-component layer; the `entities/` layer overlaps the feature concept and adds ceremony neo's flat slice never needed.
- **Three deletions from neo:** `components/`+`components/ui/` → the `@orb/ui` package; `features/_shared/` → dissolved (generic bits → `@orb/ui`, form toolkit → `forms/`, cross-feature reads of SERVER state → `trpc.*`; ephemeral state follows the client-architecture-state-and-gates.md §12 table instead); file-based `routes/` codegen → 2 hand-written routes.

### 3. Tokens — DTCG single source, derived theme

BUILT. The highest-leverage enforcement move, engine-agnostic:

- Design values live ONCE in **W3C DTCG `packages/ui/src/tokens/tokens.json`** (`$value`/`$type`).
- **Style Dictionary v5** codegen (`packages/ui/tokens.build.ts`) emits BOTH the Tailwind v4 `@theme` block (`src/styles/theme.css`) AND the typed TS map (`src/tokens/index.ts`) — committed, generated, DO-NOT-EDIT artifacts.
- The Tailwind theme is therefore **DERIVED, never hand-authored**; "add a token" has one home. **Freshness is machine-enforced:** `tests/ui/tokens/index.test.ts` re-runs the codegen and diffs the committed artifacts — hand-edits and drift FAIL `pnpm test`.
- The scale includes a **container-breakpoint scale** (`--cq-sm/md/lg`, §4), the **`--scrim`** token (§11.4), **control heights** with the ≥44px touch floor (§4b axis 3), and the D44 prose/bubble semantics (§12.1 ThemeScope targets) — the full set is `tokens.json` itself.
- **STACKING ORDER lives in the `z` block of `tokens.json` and NOWHERE ELSE.** No other doc defines an ordering; the values are the law — `base 0 < raised 10 < overlay 40 < modal 50 < popover 65 < toast 68 < tooltip 70` — with each non-obvious rank carrying its reason in that token's own `$description` (see `z.toast`). Re-ranking a tier is a `tokens.json` edit + `pnpm --filter @orb/ui tokens:build`, never a per-component z override.
- **STACKING SCOPE — where a tier may be used — is the second fact, and it is also data:** `packages/ui/src/tokens/z-scope.ts` (`Z_TOKEN_SCOPES`, total by `satisfies` so a new z token cannot skip declaring one). Order and scope are different questions. `base`/`raised` are `in-context` tiers, `overlay` is the `app-frame` tier, and `modal`/`popover`/`toast`/`tooltip` are `portal-float` — legal ONLY at a surface that leaves its subtree by mount position. A `portal-float` token named inside an isolated scope claims a reach that scope cannot grant. Enforcers: the `satisfies` type, `tests/ui/styles/css-structure.suite.test.ts` (the CSS half — shell.css), and the TSX half is a written gate SPEC in that module's header, not a built gate. `no-raw-z-index` governs the token vocabulary only and is green either way.

**DEFERRED-with-a-default (token enforcement level):** default = Tailwind v4 + DTCG + the raw-value gates (sufficient). **Panda CSS `strictTokens`** (raw value = `tsc` error) is the deferred upgrade — adopt only if gate-bypass becomes a real, observed problem; the same DTCG source wires into Panda `theme.tokens`. (ledger D42.)

### 4. The container model — 4-tier responsiveness

Responsiveness is **container-driven, not viewport-driven**. A component adapts to the *container it was dropped into*, not the screen — which realizes surfaces/anchors AND removes the `compact`/`inDrawer`/`density` props neo threaded through everything. Physical constraint that drives the shape: **a container queries its descendants, never itself** → the adapting element is always a *child* of the container → maps onto parent/child = anchor/surface.

```
SHELL    — the ONLY viewport-aware layer (@media lives here, nowhere else). Macro layout (§4.1):
           RAIL (persistent nav) + LIST + CONTENT + CONTEXT; side panels dock⇄overlay⇄collapse;
           desktop multi-pane ⇄ mobile single-column (rail → bottom bar, §4.1). Establishes top-level named containers.
ANCHOR   — containment PROVIDER. Wraps the surface in `container-type: inline-size` + `container-name`.
SURFACE  — containment CONSUMER. Pure content; queries `@container` variants. NO layout-context props.
CARD/ROW — sub-container where it must adapt independently inside a grid/list.
```

- **`@media` is allowed ONLY in `app-shell`** (gate `no-media-queries-in-features`).
- **`@orb/ui/layout` owns `container-type`** (BUILT) — feature code never writes raw `container-type`/`-name`; it uses `<Container name size>` / `<Section container>`. Default `container-type: inline-size`.
- **Density is a SEPARATE axis** from container size: `data-density="comfortable|compact"` (a user pref, attribute-driven) vs the container query (layout space). A component reads both; neither is a prop.
- **Payoff:** "build the surface once, place it anywhere" (drawer · modal · grid cell · full pane), with zero variants and zero layout props.

#### 4.1 The shell — the rail + collapsible panels (D55)

> **Themes are color palettes only** (§12.1) — there is NO structural mode; the rail + panels render identically under any palette. Where any design-seed mockup and the layout below disagree, this wins.

The macro layout is the **four-region shell**, realized THROUGH the §11.1 clamp-overlay so it is BOTH the "command-center" *and* the "immersive-SillyTavern" layout — **one shell, panels toggled**, not two builds. (`RegionAnchor` names three CONTAINMENT regions — LIST/CONTENT/CONTEXT; RAIL is a non-containment nav strip and hosts no surface. "Four regions" stays as the anatomy name — `client-architecture-state-and-gates.md` §15.)

```
DESKTOP (wide):   [ RAIL | LIST | CONTENT | CONTEXT ]
  RAIL    — persistent thin icon column (~56px, `--dimension-rail`).
            `SECTION_IDS` (`client/src/state/section-ids.ts`, re-exported by `shell-store.ts`) is the
            truth for which sections exist, and its ORDER is the rail's:
            Home (the Weave glyph IS its affordance — the brand cell is a real named button; below
            48rem the cell hides and home rides the mobile bar as its FIRST tab) | grouped by
            --spacing-section dividers: Chats · Characters ·
            Corpus (primary; `corpus` is the SECTION/feature name — the owning DOMAIN is `discovery`)
            | Configuration · Extensions · Databank · Presets · Refinery (authoring group — Configuration
            is the roster of the LIBRARIES the others are built from; Extensions is ONE entry for the
            whole plugin platform, never one per plugin — it ships rail-VISIBLE with a teaching empty
            rather than hidden-until-populated, because a hidden entry makes the platform undiscoverable;
            per-plugin promotion is a recorded owner knob, not built (the impersonation surface); Databank
            is the other library you author INTO — files/pages/pasted text, indexed for retrieval; the
            section↔collection question that R2's demotion reopens is recorded, unclosed, in
            `features/databank/lib/databank-section.tsx`) | Analytics (insight) → spacer →
            Theme · Settings · persona Identity. The CEILING is a rule about KIND, not a count (D121): a
            rail section owns a top-level workspace with its own LIST/CONTENT/CONTEXT grid; dialogs,
            preferences and one-shots go to modals/settings.
            The rail renders ONE assembled chrome registry
            (`assembleChrome` at the main.tsx door → `CHROME_ZONES`, zones-as-data off `RAIL_ZONES` in
            `section-registry.ts`): `rail.nav` = section entries derived from each `SectionDefinition.rail`,
            `rail.end` (`rail.zone: "rail.end"`) = the SETTINGS SECTION (`config`, label "Settings") + the persona Identity widget
            (`personaChrome`) — one flat DOM list, CSS-reflowed to the mobile bar (§C), never a hand
            map (gate `no-parallel-section-map`; `chrome-registry-completeness`). Modal triggers derive
            by placement (`ModalTriggerPlacement` in `modal-registry.ts`); every modal is `surface`,
            `topbar.trail` (⌘K) or `mobile-tab` (the You sheet); none is `rail.end`.
  LIST    — the active section's collection: header row (micro-caps title + create "+") → search →
            ListRow rows. Side panel. Per-section DEFAULTS (user toggle wins thereafter):
            docked for Chats/Characters/Configuration/Databank/Presets AND Corpus (the built Corpus LIST
            IS the search omnibox — the section's primary entry point — so a collapsed default would
            hide the only way in);
            collapsed for the content-first hubs (Refinery/Analytics) — each section's `panelDefaults`
            on its `SectionDefinition`.
  CONTENT — the fluid hero: HEADER bar (active entity · scene chip · thread actions) + the THREAD
            (chat/editor surface, prose capped 65–75ch) + the COMPOSER (pill input · attach · Send,
            mid-stream STOP, optimistic send). With NOTHING selected the Chats section renders the
            LANDING surface (welcome hero + recent chats + character quick-picks, {kind:landing}),
            never an empty room. Leftover width feeds the centered CONTENT gutter
            (`--width-shell-content` clamp) — CONTEXT is a fixed `--dimension-panel` column, not a
            width recipient (`client-architecture-state-and-gates.md` §15).
  CONTEXT — the right detail panel (active artifact's detail + config; tabs). Side panel. Every
            section defaults collapsed (each `SectionDefinition.panelDefaults`); the persisted
            per-panel override wins thereafter.

MOBILE:  RAIL → BOTTOM tab bar: Chats · Characters ·
         Corpus · You. You is the mobile PROJECTION of shell chrome (§B) over the SAME resolved chrome
         list: `mobile:"sheet"` rail entries + the `rail.end` chrome (incl. the persona Identity
         widget's `body("sheet")` view, so mobile persona switching lives here). Containment chain: You ⊃ Identity ⊃ Account
         (the account leaf modal). Everything is also reachable via ⌘K.
         LIST/CONTEXT → full-screen / sheets; single column; land on CONTENT, never on an open list sheet.
         (Mobile is a responsive LAYOUT, never a theme.)
```

- **Refinery is a first-class rail section + feature surface** (Score→Rewrite→Analyze — D28). Its sub-parts (stage-stepper, assay, issue-list, compare-diff → `@orb/ui/diff`, guidance-bar) are app components over the primitives.
- **Each side panel has a 3-state model** in the shell store: **`docked`** · **`overlay`** (slides over via the §11.1 clamp — zero width closed) · **`collapsed`**. Per-panel, persisted, auto-`overlay` below a width breakpoint (the one app-shell `@media`).
- **"Immersive-ST" = both side panels collapsed; "command-center" = panels docked.** One persisted **focus toggle**; the §11.1 clamp-overlay is the `overlay` mechanism.
- **A migrating ST user loses nothing:** swipes · edit-in-place · branch/fork · italics-narration · hide-from-AI all live in the CONTENT thread, identical regardless of chrome.

##### 4.1a The shell's stacking contract — three things, and only one of them is a paint order

This subsection defines no ORDER (that is the `z` scale, §3) and no SCOPE VOCABULARY (that is `Z_TOKEN_SCOPES`, §3) — only which of the three a given thing is.

1. **The PROVIDER layer is not a paint layer.** `TooltipProvider` and `PortalContainerContext` wrap the shell and render no element; `ThemeScope` renders one at `display: contents`; `RegionAnchor`'s dev `RenderProfiler` renders none. None generates a box, so none appears in the paint order — never draw a provider or a profiler into a z diagram.
2. **The SHELL scope is isolated.** `.shell-grid` carries `isolation: isolate`, so every z-index written in `shell.css` orders that box's own children (rail · CONTENT · scrim · panels) and nothing outside it. The shell may therefore use only `in-context` and `app-frame` tiers; naming a `portal-float` token there mis-states the reach.
3. **The PORTAL-FLOAT scope is where cross-boundary order is decided.** Dialogs, the ⌘K palette, menus, tooltips and toasts portal to `[data-slot="portal-root"]` — the grid's `display: contents` SIBLING — and paint in the document's own stacking context, above the whole shell. **A float escapes by MOUNT POSITION, never by z-index escalation.** The carrier stays box-less deliberately: giving it isolation or a z-index would mint a context the floats must then escape in turn. Its ordering-among-themselves is the token scale, and the reason the scale exists is that DOM/mount order alone does not survive a mount-order change — that is the mechanism to reach for when something must cover the frame.

Enforcers: `isolation: isolate` + the portal carrier are pinned by `tests/client/features/app-shell/surfaces/app-shell.ct.tsx` (`"MOBILE: the CONTEXT sheet rides the shell's OWN overlay rung…"` — rendered `elementFromPoint`, both scopes); the shell's token vocabulary by `tests/ui/styles/css-structure.suite.test.ts`; the map's totality by `tsc`.

#### 4.2 The region map — what lives where (ledger D62)

The shell is Discord's anatomy with different nouns; the mapping is LAW so no lane invents geography. The difference that matters: rail items are **facets of one world**, not separate servers — cross-section jumps (character card → start chat) are common and route through store actions (`setActiveSection` + a seed), never stranding the user.

| Discord | Orbweaver | Owns |
| - | - | - |
| Server rail | RAIL | which facet — sections (`rail.nav`) + theme · the Settings SECTION · persona-Identity at the foot (`rail.end` chrome) |
| Channel sidebar | LIST | the section's collection: header row (micro-caps title + create `+`) → search → `ListRow`s. Finding. |
| Chat pane | CONTENT | the artifact you're in: identity header + working surface. Doing. |
| Members panel | CONTEXT | detail + config of CONTENT's active artifact. Closable; never navigation. |
| Quick switcher | `command` modal (⌘K) | jump to any thread/section/create action |
| User settings overlay | the `config` SECTION (rail foot, label "Settings"): a LIST of four shelves + CONTENT (+ CONTEXT collapsed); the `settings` modal is gone | USER shelf (Personas · Appearance · Chat behavior · Jobs · Backup & Restore) + APP shelf (Connections · Automation · Admin) + COLLECTIONS shelf (Tags · Regex scripts · World Info · **Rosters** — the ruled word for the saved seats+knobs+rules template; `ROSTER_COLLECTION_ID = "rosterPreset"`) + EXTENSIONS shelf (Plugins). Generation config is the Presets section, not settings. (No Account PANE — Account is the leaf modal below.) |
| Identity widget | persona `rail.end` chrome (`personaChrome`) → `account` leaf modal | the persona switcher + Account strip; the account card (handle · role · sign-out) is a leaf MODAL reached from inside Identity, NOT a settings pane (§B, You ⊃ Identity ⊃ Account) |

Every non-collection group in the `config` SECTION is a `sections` SKIMMER over the D120 contribution seam.

> \[!NOTE]
> LIST-header rulings AMENDED by ledger D66 (A1/A2): the LIST "header row" is now the shared
> `.shell-panel-header` band on the `--dimension-chrome-row` baseline (A1), and its create affordance
> is the panel's ONE `primary` **New** button, not a ghost `+` (A2). The D62 text below stands as the
> standing law; D66 wins on the conflict. **D66 A1/A2 are COMMITTED-not-built** (`PanelChrome`'s header
> is optional and the LIST passes none today) — do not read this §4.2 as as-built (`client-architecture-state-and-gates.md` §15).

Per-section grid (end-state; the D62 program builds toward it):

| Section | LIST | CONTENT — none selected | CONTENT — selected | CONTEXT |
| - | - | - | - | - |
| Chats | conversation rows · search · star/archive chips · `+` → new-chat picker | LANDING (hero + recents + quick-picks) | chat room (header · thread · composer) | tabs: Members(group) · Overrides · Group(host) · Preview(host) · Injections — REGISTRY-owned via `defineContextTabs` (`ContextTabsPanel`, built M3; `client-architecture-lockdown.md` §6b), not a bespoke `<Tabs>` |
| Characters | character rows · search · `+` create/import | teaching state | detail card → editor | activity (chats with them) + actions |
| Configuration | one COLLAPSED group per registered `CollectionContribution` (band = icon · kicker · count · optional import · create `+`); expanded groups get a count-driven filter and windowed rows — World Info's book rows scented "entries · attached ×N" | the welcome (a launcher card per collection) | the selected member's OWN editor, mounted (never a dialog) — for a book, its entry list + entry editor | the selected collection's own CONTEXT variant (a book's activation scopes), or its own `{kind:"none"}` copy |
| Extensions | the PAGE SWITCHER: one plugin-labelled row per registered `ui.page` surface across the caller's granted-and-enabled plugins — never in the rail (title + the plugin's name as subtitle AND accessible-name disambiguator) | the teaching empty, naming WHICH emptiness (nothing installed · awaiting consent · switched off · no page) or "pick a page" — each case names a different fact, with its own next step and its own config anchor, deliberately different copy, so the LIST and CONTENT panes cannot disagree, resolved once in `useExtensionsEmpty` | the selected page inside the PAGE-SCALE plugin shell: a pinned band (plugin name · glyph · "Extension" kicker, no opt-out) above the scrollable DSL body | `{kind:"none"}` — a plugin page owns its whole CONTENT region |
| Databank | document rows (name · phase chip when NOT ready · origin/size/chunks) + search; band = DATABANK · count · Add · a maintenance kebab | teaching state | the document detail (Details · Maintenance · the source-text reveal) | the activation panel: Everywhere · Active in · the retrieval-knobs pointer |
| Presets | preset rows + CRUD toolbar | teaching state | tabbed editor (Sampling · Output · Quality · Reasoning · Templates · Post-process · Compaction · Prompt) | usage/bindings (default-collapsed) |
| Corpus | the search omnibox + target picker + results (default-docked) | overview home (coverage · insights · keywords) | selected character's dossier | corpus-global analysis tabs (Archetypes/Visuals/Map/Similarity/Compare) |
| Refinery | past sessions (default-collapsed) | pick-a-character | pipeline (stepper · assay · issues · compare) | collapsed |
| Analytics | default-collapsed | dashboard | drill-in in CONTENT | dimension detail |

**Interaction physics (all six apply):**

1. LIST selection drives CONTENT; CONTEXT follows CONTENT. CONTEXT holds actions ON the artifact, never navigation (§5.1 writer-only).
2. Per-section selection is REMEMBERED — rail-switching away and back restores the section exactly (selection stores + `<Activity>` pane-keeping, §4a).
3. Per-section panel DEFAULTS, user override wins (each `SectionDefinition.panelDefaults` sets only the initial value; the persisted per-panel mode wins thereafter).
4. Cross-section actions carry their subject in ONE action path (`startNewChat({characterIds})` + `setActiveSection`) — the user lands ready to act.
5. Modals are for interrupts and pickers ONLY (new-chat picker, add-member, theme, settings, account, ⌘K). Section content NEVER lives in a modal — it is a CONTEXT tab or a CONTENT state.
6. Focus mode = both side panels collapsed (`toggleFocus`); the topbar reopen affordances are the way back.

#### 4.3 Interaction & visual grammar — the ten UX rules (ledger D62)

Testable law; enforcement tiering per gate lives in `UI-Gates-and-Lessons.md` §8. When a build instinct conflicts with a rule, the rule wins.

1. **No dead ends.** Every reachable state renders ≥1 enabled next-step affordance (empty teaches, error retries, draft offers a character).
2. **Character-first entry.** Every "new chat" affordance goes through choosing/confirming a character; a characterless draft is an explicit "Blank chat" pick, never the default.
3. **One primary action per view.** Exactly one `intent="primary"` control visible per region at rest (composer Send counts for CONTENT).
4. **Progressive disclosure.** Rest state shows the reading surface; management chrome appears on hover AND `:focus-within` (keyboard parity), always-visible at `pointer: coarse`, or lives one click away (CONTEXT tab, options menu).
5. **LIST finds; CONTENT does.** Every LIST panel composes header row → search → `ListRow`s.
6. **Keyboard first.** ⌘K reaches every section/recent/create; Esc closes the top layer; focus is visible everywhere and lands correctly on open.
7. **Perceived performance.** Optimistic send, shape-matched skeletons, streaming text as the arrival motion. Never a centered spinner; never layout shift on data arrival.
8. **Empty, loading, error are designed states** — every surface ships all three (the `QueryBoundary` battery forces the slots; D62 makes them worth looking at).
9. **Chrome is quiet; content is loud.** Micro-caps muted section labels; mono data accents; the accent color on ≤10% of any viewport. If a screenshot's loudest element is chrome, the hierarchy is inverted.
10. **Same action, same home** — this rule is the ONE HOME of the more-than-one-door IA class. One store action / verb per action regardless of entry point; identical label + icon everywhere (icon home = the registry). The structural half: one tRPC mutation invoked from more than one component inside a SINGLE rail section is the same verb wearing N doors on a plane the user sees whole — `duplicate-action-doors` reds it, and a deliberately-multi-door set is an exact reviewed grant naming that door set. Cite THIS rule for the class; `client-architecture-state-and-gates.md` §13 is the event/sync spine, not this rule's home.

**Voice table:** section labels = `Text` micro-caps (10.5px equiv token, weight 600, tracked) · data accents (scores, counts, timestamps, kbd) = mono · labels sentence-case · placeholder copy per-section from the ONE registry map (distinct per `SectionId` — gate `placeholder-copy-registry`). The Weave glyph appears at most ONCE per screen (DESIGN.md restraint rule), only in empty states / loading / corpus.

### 4a. React 19 / 19.2 — platform leverage (use these, skip those)

The client targets **React 19 + the React Compiler** (the compiler runs full-compile in `packages/client/vite.config.ts`; `@orb/ui` is source-consumed via `optimizeDeps.exclude` so the compiler sees it). Several React-19 features are REDUNDANT with the TanStack stack and must be skipped so two systems don't fight.

**USE:**

- **The React Compiler is ON — stop hand-writing `useMemo`/`useCallback`/`React.memo`.** The ONE blind spot is `useVirtualizer` (interior mutability) → sealed in `@orb/ui/virtual-list` with **`directDomUpdates: true` + `containerRef`** (TanStack Virtual 3.14+, **NOT `"use no memo"`**); features never wire it by hand.
- **`<Activity>` for the single-route panes.** Keep a pane mounted-but-hidden on flip-away (chat ⇄ library) so returning is instant with scroll + form state intact (§5.1), replacing unmount/remount. Two companion rules: (1) on `hidden→visible` restore focus to the pane's stable anchor (its header) — a WCAG obligation, since focus dies silently on hide; (2) hide-coupled DOM work (scroll-position capture, media pause) runs in `useLayoutEffect`, not a passive `useEffect` cleanup, which runs too late.
- **`useEffectEvent` is THE fix for the effect footguns** — separates an effect's non-reactive part from its deps. Prefer it over ref-juggling.
- **`useDeferredValue` for every search/filter-over-collection surface** (library grid · corpus search · tag/world-info filters): the input stays responsive while the filtered list lags a frame behind. Pass `initialValue`. `startTransition` wraps pane *switches*; `useDeferredValue` absorbs derived-*list* churn; neither is a debounce hack. (§13.2 row.)
- **View Transitions API for single-route navigation** — hand-rolled `document.startViewTransition()` (the router's built-in VT fires only on the `/`↔`/login` commit, never on in-app section switches — §6.1 trap 2). Pairs with `<Activity>`; utilities live in `@orb/ui` styles. A dynamic `view-transition-name` must be a valid CSS custom-ident: `useId` output is safe (`_r_` prefix); an entity-id-derived name must be sanitized.
- **`ref` as a prop (no `forwardRef`)** — biome-enforced (`noReactForwardRef`).
- **Resource preloading (`preload`/`preinit`) where the need is predictable** — preinit the palette CSS on theme switch (kills the FOUC), preload the code-editor/Shiki chunk when a code block is likely. Measured wins only, never speculative sprays.
- **Chrome Performance Tracks (Scheduler + Components lanes) are the verification tool for this doc's priority claims** — confirm a pane switch renders in the Transition lane (not Blocking) and Stop stays responsive mid-stream.

**The View-Transition CONTRACT — what is captured, what stays live, and how long a float lives.**

- **CONTENT-ONLY CAPTURE.** The document root opts OUT and `.shell-content` is the single named region (`features/app-shell/surfaces/shell.css`'s `THE VIEW TRANSITION IS SCOPED TO THE CONTENT PANE` block is that ruling's one home). During a swap the rail, the topbar, the panels and **every portalled float** — dialogs, drawers, popovers, menus, tooltips, toasts — are neither snapshotted nor hidden: they paint LIVE and stay hit-testable, because the shell's portal root is a SIBLING of `.shell-grid`, not a child of the captured region.
- **THE LIFETIME RULE.** A float whose SUBJECT is the content being left (an image lightbox for a message in this room) is CONTENT-SCOPED and does not outlive the swap. A float reachable from — and about — anywhere (the ⌘K palette, the You sheet, an ingest or creation ceremony, a plugin round-trip's outcome, a session-recovery prompt) is GLOBAL and survives it. For the shell's modal slots this is DECLARED, never remembered: `MODAL_CONTENT_LIFETIME` (`packages/client/src/state/modal-slot-ids.ts`) is a `Record<ModalSlotId, …>`, so a new slot fails `tsc` until it says which it is, and it is APPLIED in exactly one place, `withContentSwap` (`state/shell-store.ts`) — every content-swapping action (`setActiveSection` · `selectChat`/`enterCreatedChat`/`goToLanding` · `selectCharacter`/`clearCharacterSelection`) runs its write through it instead of calling `withViewTransition` itself, so the float's removal and the new content land in one commit.
- **WHO ACTUALLY STRANDS A FLOAT.** A house modal inerts and `aria-hidden`s the whole background, so the swap that strands a float is always a PROGRAMMATIC one — the `__orb.nav` bridge, an async mutation completion, a slash/plugin command runner, the session-recovery resume.
- **A FEATURE-OWNED FLOAT CLOSES ITSELF.** A popover/menu is not a modal slot, so `withContentSwap` does not reach it, and Base UI's outside-press close does not fire when the navigation was raised by a control INSIDE the float. It closes in the same handler that navigates. A hidden `<Activity>` pane stays MOUNTED, so a float anchored in it keeps painting from the portal root while its anchor is `display:none`.
- **Enforcer tiers:** compile-time for the classification (the mapped `Record`), test-time for the behaviour — `tests/client/state/shell-store.ct.tsx`, three cases (rail swap · room swap · the door alone), each asserting the rendered dialog's accessible name.

**SKIP (redundant with TanStack — do NOT bolt on):**

- **React 19 form Actions / `useActionState` / `useFormStatus`** — TanStack Form owns form state (§6.1).
- **`useOptimistic`** — TanStack Query's optimistic flow owns it (§13.1). No second path.
- **`<form action>` / server actions** — orbweaver is tRPC + Query.
- **`use()` on raw promises** — `useSuspenseQuery`/`useSuspenseQueries` (§13.1) own suspend-on-async; `use()` over a hand-made fetch promise reinvents Query's cache with none of its invalidation. (Conditional `use(Context)` is legal React but rarely needed here.)

**BASELINE (non-negotiable):** WCAG 2.2 AA (4.5:1 body contrast · visible focus · keyboard-operable · persistent labels — much of it free from Base UI), and `prefers-reduced-motion` respected on every transition/animation.

### 4b. Responsive doctrine — the FOUR axes (code once; desktop · widescreen · mobile from one build)

"Mobile just works" is NOT one technique — it's the RIGHT tool per axis instead of a `max-width` ladder. **The code-once guarantee: a feature author writes ONLY axis 1; axes 2–4 live once in the shell/token/primitive layer.** There is no separate mobile build.

| Axis | What varies | Tool | Where it's written |
| - | - | - | - |
| **1 — component layout** | a surface in a wide pane vs a narrow drawer | container utilities and variants (`@container` at the `@orb/ui` primitive boundary) + container-query units (`cqi`) + `clamp()` | **`@orb/ui` primitives**; features compose their variants and never author CSS ([paint law §4](client-architecture-lockdown.md#4-the-paint-law--who-may-write-css-and-why)) |
| **2 — macro structure** | rail+list+content+context desktop ⇄ single-column mobile; panels dock⇄overlay (the §11.1 clamp) | **`@media`** (viewport) | **the shell tier + the styles tier's exact complement** — `shell.css`'s `@media (max-width: 48rem)` and `client/styles/globals.css`'s `@media (width > 48rem)` glass block are one ruling in two order-proof halves, sync-enforced by `tests/ui/styles/css-structure.suite.test.ts`; never a feature ([paint law §4](client-architecture-lockdown.md#4-the-paint-law--who-may-write-css-and-why)) |
| **3 — device capability** | touch targets; hover affordances | **`@media (pointer/hover)`** + token sizing | **token/shell layer** (never features) |
| **4 — mobile platform** | keyboard, safe-area, overscroll, viewport height | **CSS primitives** (`dvh`/`svh`, `env()`, viewport meta) | **shell + composer/scroll primitives** (once) |

**Axis 1 (the core).** A surface adapts to *its container* — the same `<CharacterGrid>` is 4-up in a wide pane, 1-up in a drawer, automatically. No mobile variant, no `compact`/`inDrawer` prop (`no-layout-context-props`). Fluid type/spacing inside a component use `cqi`+`clamp()`, not viewport units.

**Axis 2.** The one genuinely viewport-dependent reflow, in the SHELL: 3-pane ⇄ stack, drawer ⇄ sheet. Tiny (neo: one `clamp()` width var + the overlay model, §11.2). `no-media-queries-in-features` keeps it there.

**Axis 3 — capability, NOT size.** hover/pointer are media-query-only (container queries can't see them). **Pointer-conditional floor:** interactive primitives meet the ≥44px touch floor at `@media (pointer: coarse)` via token control-heights; fine pointers get the desktop scale — `control-sm` 32px · `control-md` 34px · `control-lg` 40px · icon 34px — emitted as a token-layer `pointer: fine` override (THIS layer, never features). An interactive element with a sub-44px visual box on coarse pointers wraps in a ≥44px hit area. `data-density="compact"` remains the separate spacing axis (ship COMFORTABLE; never build a parallel compact path). Hover is only ever an *enhancement* (`@media (hover:hover)`); **every hover action has a tap-equivalent** (and a `:focus-within` keyboard equivalent, §4.3 rule 4). Base UI suppresses tooltips on touch for free. Enforced as CT — `tests/ui/touch-target-floor.suite.ct.tsx` — asserting the floor per-pointer.

The same rule binds the Tailwind capability variants themselves: `pointer-coarse:`/`pointer-fine:` (and the `any-pointer-*` twins, and any raw `[@media(pointer|hover:…)]:` arbitrary variant) are `@media (pointer/hover)` queries wearing a utility spelling, so they belong at the **token/shell layer, never in a feature className**, exactly as viewport width variants do (axis 2, `no-media-queries-in-features`). A feature composes a pointer-conditional TOKEN (`min-w-touch-target`/`min-h-touch-target`, so the call site carries NO variant) or a shared component-layer const from `#components` (`packages/client/src/components/pointer-variants.ts`: `HIDE_AT_COARSE`, `REVEAL_AT_COARSE`, `FINE_INERT_UNTIL_HOVER`). The `:hover` pseudo-class (`hover:bg-accent`) is an interaction STATE, not a capability query, and stays legal in features. Enforced by **`no-pointer-variants-in-features`** (features/\*\* minus the shell tier `app-shell/`).

**Axis 4 — mobile platform CSS, baked into 3 primitives:**

- **`dvh`/`svh` units, not `vh`** (with a `vh` fallback line) — `svh` where above-fold must stay visible, `dvh` for the adaptive shell.
- **The keyboard gotcha (verified):** `dvh`/`svh` are NOT shrunk by the virtual keyboard → set **`interactive-widget=resizes-content`** in the viewport meta so the composer reflows above the keyboard; `visualViewport` API only for precise composer-pinning if ever needed.
- **`env(safe-area-inset-*)`** padding on shell + composer; **`overscroll-behavior: contain`** on every scroll region; `inputmode`/`type=` on inputs (Base UI fields set these).

**Why no second build:** Base UI gives touch/keyboard/pointer *interaction* correctness for free; we own only *layout* (axes 1–2) + *platform CSS* (axis 4), and axes 2–4 are all shell/token/primitive-level. (D42 §4 + D43 §11.2.)

Split off [ui-architecture-state-and-stack.md](ui-architecture-state-and-stack.md) for the 48 KiB law cap (§5 State, §6 the stack keep/dump).
