---
kind: law
status: active
updated: 2026-07-09
---

# UI-Architecture-and-Layout

> **The UI law — part of the nine-doc set split from the D42 spec** (pre-split source: a deleted `client.md`; these nine carry the D43/D44/D52/D54/D58 corrections and WIN on any conflict with any archive copy). The ledger entries (D42–D44, D52, D54 in `Core-Laws-and-Precedents.md`) are the decision records; these docs are the expansion.
>
> **Reading order:** UI-Architecture-and-Layout (§0–§6) → UI-Gates-and-Lessons (§7–§11) → UI-Theming-and-Content (§12) → UI-Primitives-and-Reuse (§13) → the five lib companions (`../history/UI-Lib-TanStack-{Query,Form,Router,Virtual}.md` · `../history/UI-Lib-Zustand.md` — evidence/provenance mines; distilled verdicts already live in the spec sections).
>
> **§-map (cross-doc `§N` references resolve here):** §0–§6.3.1 → `UI-Architecture-and-Layout.md` · §7–§11.8 → `UI-Gates-and-Lessons.md` · §12–§12.8 → `UI-Theming-and-Content.md` · §13–§13.9 → `UI-Primitives-and-Reuse.md`.
>
> **Build state (2026-07-09):** `@orb/ui` is BUILT (the primitive fleet: Base UI wraps, layout kit, charts/meter, markdown/stream, the D44 security trio, the carve-out set — `packages/ui/src` is the inventory; `packages/ui/package.json#exports` is the public surface). The client data/forms/state primitives are BUILT (`packages/client/src/{data,forms,state}` is the inventory); feature slices are largely built (D62 lanes; 125+ files across 12 of 14 features — `credentials` + `user-admin` remain `.gitkeep` stubs). Remaining Phase 6 = PWA + the outstanding feature surfaces (current lane: the FINAL-Character doc). Build design + per-primitive decisions: `proposed/ui-package-design.md`.

> **The one-sentence thesis:** carry over neo's *structure* (feature-slice · surfaces/anchors · state-files · intent tokens · the gate battery) and *dump* neo's *component foundation* (shadcn copy-paste + Radix + the react-markdown stack). The replacement is **one headless primitive (Base UI), hand-authored components in the `@orb/ui` package, and the lint rules promoted to package physics.**

### 0. Where this came from

Two inputs, both *prior art*, not law: (1) the Phase-4b neo-tavern client critique (the single-route `this_chid` jank, the cross-lib footgun cluster); (2) the Claude-Design redesign handoff (the intent-token system, surfaces/anchors doctrine). This doc is the law.

### 0.5 Phase-6 build manifest (the index)

> A scannable index. Every row points to its canonical spec section — a table of contents, **NOT a second source of truth**. **Build order (§11.7 / §13.6, born-compliant):** tokens → `@orb/ui` primitives+seals → `@orb/client` data/forms/state primitives + the gates → features. The client primitive stages are DONE; the remaining feature surfaces build per lane.

**`@orb/ui` primitives + seals — BUILT** (each seals ONE lib behind an orbweaver API; `packages/ui/src` is the doc):

| Primitive | Seals | Spec |
| - | - | - |
| button · dialog · popover · tooltip · select · switch · slider · menu · field (+ the Wave-3 controls/disclosure/display set) | Base UI | §2 |
| command · sortable · macro-textarea | cmdk · `@dnd-kit/react` · minisearch | §2 / §11.3 |
| toast · drawer | Base UI native (D54 — dropped sonner + vaul) | §2 |
| icons | lucide-react (gate `icons-lucide-only`) | §2 |
| diff | `diff` (jsdiff — snapshot/edit-history diffs, D28) | §2 |
| layout (Stack/Row/Section/Toolbar/Container) | `container-type` | §4 |
| chart · bar-list · histogram · stat-figure | ECharts | §11.3 (D52) |
| meter (`linear`/`arc`/`bipolar` + milestones/dangerBelow) + SegmentedClock | plain CSS/SVG — NOT the chart lib (D52); kinds + clock per rpg-design/11 §2 (D58) | §11.3 (D52) |
| virtual-list (generic) + message-list (chat) + media-grid | TanStack Virtual (`directDomUpdates`) | §11.3 (D54) |
| markdown | Streamdown (two trust policies) | §6.3 / §11.6 |
| stream (smooth-text pacer · TTFT shimmer) | domain-free string-math | §6.3.1 |
| sandbox-frame · MessageMedia · ThemeScope · lightbox | iframe/CSP · img+a/v · token scope | §12 |
| code-editor | CodeMirror 6, token-themed | §12.1 |

**`@orb/client` data / forms / state primitives — BUILT (packages/client/src/{data,forms,state})** (the §13.1 contracts):

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

### 1. The cake gains a frontend arm

The backend cake (`kit ← contracts ← db ← server`) gains a parallel frontend arm:

```
kit ─┬─→ contracts ─┬─→ db ─→ server          (backend arm, unchanged)
     │              └─→ (client, type-only)
     └─→ ui ─────────────────→ client          (frontend arm)
```

- **`@orb/ui` is domain-agnostic** — it knows `Button`/`Dialog`/`Chart`, NEVER `Character`/`Chat`. Domain-aware components (a `<CharacterCard>`, a `<MessageRow>`) live in `client/features`, built FROM `@orb/ui` primitives + `@orb/contracts` *types* (type-only). This is the seam.
- **`@orb/client` imports** `@orb/ui` (runtime), `@orb/contracts` (type-only), `@orb/kit` (pure utils: ids, tokens, time).
- **`#` subpath imports intra-package, package deps cross-package, ZERO `@/` aliases** (the shadcn `@/` tax is gone).

#### 1.1 The headline win — neo's lint rules become package physics

neo enforced the UI boundaries with lint. orbweaver makes them **resolver physics** (boundaries are packages, not lint) — LIVE, enforced by the package.json dep sets + `.dependency-cruiser.cjs` (`ui-cake` · `ui-no-node-builtins` · `ui-satellite-seals` · `client-no-raw-satellites`):

| neo lint rule | orbweaver |
| - | - |
| `client-ui-is-pure` (UI imports no features) | `@orb/ui` has no dep on `@orb/client` — **resolver** |
| "app imports only the UI barrel, never raw primitives" | cmdk/@dnd-kit/echarts/base-ui are NOT in `@orb/client`'s `package.json` — it physically cannot import them — **resolver** |
| "UI is domain-agnostic" | `@orb/ui` has no dep on `@orb/contracts`/domain — **resolver** |
| design-token parity check | the Tailwind theme is **codegen-derived** from `tokens.json` (§3) — drift is a failing freshness test, not a policed parity |

### 2. `@orb/ui` — the one home for components

A workspace package = the "one home"; the *package* IS the registry (shadcn's external registry mechanism is not used; components are hand-authored over Base UI).

**BUILT — the code is the doc.** Tree + per-primitive structure: `packages/ui/src` (`primitives/` · `layout/` · `charts/` · `markdown/` · `stream/` · `content/` · `code-editor/` · `diff/` · `tokens/` · `lib/` · `styles/`). Public surface: the **explicit `exports` map** in `packages/ui/package.json` — one subpath per group, deliberately **no root barrel** (a flat `@orb/ui` import would defeat tree-shaking and blur the seal boundaries). Deps (the sealed satellites) live only in that package.json; structure is gate-enforced (`scripts/check/gates/ui-primitive-structure.ts`, §13.7). Per-primitive file contract + authoring rules: §13.7–§13.8.

The law that survives any file-level churn:

- **Base UI (`@base-ui/react`, 1.x stable) is THE headless primitive** (D42; the `@base-ui-components/react` name is the dead rc-era package — biome-banned). It replaces Radix: the explicit `Positioner` part kills the portal weirdness, the `render` prop replaces the `asChild`/Slot footgun, exit-animation is built in.
- **`react` AND `react-dom` are peers** (recorded delta from D54's "peer react only": Base UI itself requires the react-dom peer). The client remains the renderer; ui never bundles React.
- **Variants are tailwind-variants union types** (`VariantProps<typeof xVariants>`; tv `slots` for multi-part primitives — D54) — the ONLY styling-variation path; a bad variant is a `tsc` error. Ad-hoc `className` styling on a primitive is gate-banned. `cn` = tailwind-variants' merge, re-exported from `@orb/ui/lib` (tv subsumes cva/clsx/tailwind-merge).
- **Base-UI-vs-anything stays reversible** — the headless lib is an impl detail *inside* each primitive dir; swapping it is a `@orb/ui`-internal change, app untouched.
- **tokens/ promotes to `@orb/tokens` only on a 2nd consumer.**

#### 2.1 `@orb/client` — the feature-slice tree

**State: BUILT.** The tree below is committed law (gate `client-structure` enforces the per-feature shape the moment a slice gets real code); `data/`, `forms/`, `state/` are populated per the §13.1 contracts, 12 of 14 features have real code, and `credentials`/`user-admin` remain reserved `.gitkeep` stubs. **orbweaver is NOT FSD** (no `entities/`/`shared/` layers) — flat feature-slice, neo's proven shape minus the three §-noted deletions, plus `data/`+`forms/` elevated to top-level peers of `state/`.

```
packages/client/
  package.json          # @orb/ui · @orb/contracts (type-only) · @orb/kit · @tanstack/react-router · react(-dom).
                        #   Phase 6 adds: zustand · @trpc/tanstack-react-query · @tanstack/{react-query,react-form} ·
                        #   workbox-window + vite-plugin-pwa (installable + offline shell, D54).
                        #   NO raw radix/cmdk/echarts/base-ui (§1.1 physics)
  src/
    sw.ts / manifest    # PWA (Phase 6): workbox precache of the app shell + web-app-manifest — D54.
                        #   offline scope = the shell + last-opened chat; live data still needs the server (SSE bus)
    main.tsx            # entry / composition root (mounts providers; injects the cross-feature ops — §11.0)
    routes/             # ~3 HAND-WRITTEN routes: / · /login · /admin/* (lazyRouteComponent) — no file-based codegen (§6.1)
    data/               # the data-layer primitives (TanStack Query + tRPC) — §13.1
      trpc.ts · query-client.ts · invalidation.ts · create-entity-mutation.ts ·
      create-collection-surface.ts · query-boundary.tsx · use-gated-query.ts · bus/
    forms/              # the editor factories — the SINGLE createFormHook instance — §13.1/§13.4
      use-app-form.ts · create-saved-entity-form.ts · create-autosave-entity-form.tsx · bound-fields/
    state/              # ALL gated Zustand stores, FLAT (gate state:files: one create/file, ≤10 fields, no exported set/getState)
    features/           # the slices — cross-feature reads ONLY via trpc.* (§11.0); NO _shared/ drawer
      app-shell/        #   the 4-region rail shell (§4.1); the ONLY viewport @media site (§4b ax2);
                        #     the clamp-width overlay (§11.1); RAIL_SLOTS ↔ MODAL_SLOTS registries (gate check:registry-pairing)
      auth/ character/ chat/ corpus/ credentials/ persona/ preset/ prompt-manager/ settings/ tag/ user-admin/ workloads/ world-info/
        <feature>/      #   { surfaces/ (containment CONSUMERS, @container) · anchors/ (containment PROVIDERS) ·
                        #     components/ (leaf) · hooks/ · lib/ · index.ts (the front door) }
    lib/                # cross-cutting display/util seams: message-render · time · cn re-export · download-json · notify
      time.ts           #   THE date/time seam: server sends epoch-UTC numbers; client formats to browser-local tz
                        #     via memoized Intl.*; `now` is INJECTED (determinism §11.5). Never store/send formatted
                        #     dates or a tz; localization happens ONCE here at the display edge.
    styles/ globals.css · testIds.ts (typed registry, §11.5)
```

- **Why not FSD:** `@orb/ui` already IS the shared-component layer; the `entities/` layer overlaps the feature concept and adds ceremony neo's flat slice never needed.
- **Three deletions from neo:** `components/`+`components/ui/` → the `@orb/ui` package; `features/_shared/` → dissolved (generic bits → `@orb/ui`, form toolkit → `forms/`, cross-feature reads → `trpc.*`); file-based `routes/` codegen → \~3 hand-written routes.

### 3. Tokens — DTCG single source, derived theme

BUILT. The highest-leverage enforcement move, engine-agnostic:

- Design values live ONCE in **W3C DTCG `packages/ui/src/tokens/tokens.json`** (`$value`/`$type`).
- **Style Dictionary v5** codegen (`packages/ui/tokens.build.ts`) emits BOTH the Tailwind v4 `@theme` block (`src/styles/theme.css`) AND the typed TS map (`src/tokens/index.ts`) — committed, generated, DO-NOT-EDIT artifacts.
- The Tailwind theme is therefore **DERIVED, never hand-authored**; "add a token" has one home. **Freshness is machine-enforced:** `tests/ui/tokens/index.test.ts` re-runs the codegen and diffs the committed artifacts — hand-edits and drift FAIL `pnpm test`.
- The scale includes a **container-breakpoint scale** (`--cq-sm/md/lg`, §4), the **`--scrim`** token (§11.4), **control heights** with the ≥44px touch floor (§4b axis 3), and the D44 prose/bubble semantics (§12.1 ThemeScope targets) — the full set is `tokens.json` itself.

**DEFERRED-with-a-default (token enforcement level):** default = Tailwind v4 + DTCG + the raw-value gates (sufficient). **Panda CSS `strictTokens`** (raw value = `tsc` error) is the deferred upgrade — adopt only if gate-bypass becomes a real, observed problem; the same DTCG source wires into Panda `theme.tokens`. (ledger D42.)

### 4. The container model — 4-tier responsiveness

Responsiveness is **container-driven, not viewport-driven**. A component adapts to the *container it was dropped into*, not the screen — which realizes surfaces/anchors AND removes the `compact`/`inDrawer`/`density` props neo threaded through everything. Physical constraint that drives the shape: **a container queries its descendants, never itself** → the adapting element is always a *child* of the container → maps onto parent/child = anchor/surface.

```
SHELL    — the ONLY viewport-aware layer (@media lives here, nowhere else). Macro layout (§4.1):
           RAIL (persistent nav) + LIST + CONTENT + CONTEXT; side panels dock⇄overlay⇄collapse;
           desktop multi-pane ⇄ mobile single-column (rail → TOP bar). Establishes top-level named containers.
ANCHOR   — containment PROVIDER. Wraps the surface in `container-type: inline-size` + `container-name`.
SURFACE  — containment CONSUMER. Pure content; queries `@container` variants. NO layout-context props.
CARD/ROW — sub-container where it must adapt independently inside a grid/list.
```

- **`@media` is allowed ONLY in `app-shell`** (gate `no-media-queries-in-features`).
- **`@orb/ui/layout` owns `container-type`** (BUILT) — feature code never writes raw `container-type`/`-name`; it uses `<Container name size>` / `<Section container>`. Default `container-type: inline-size`.
- **Density is a SEPARATE axis** from container size: `data-density="comfortable|compact"` (a user pref, attribute-driven) vs the container query (layout space). A component reads both; neither is a prop.
- **Payoff:** "build the surface once, place it anywhere" (drawer · modal · grid cell · full pane), with zero variants and zero layout props.

#### 4.1 The shell — the rail + collapsible panels (D55)

> **Design-seed status (amended D62):** the Claude-design handoff's `Hearth`/`Loom`/`Pocket` "modes" never did the structural work they claimed; the VS-Code "Work mode" stays **CUT**. **Themes are color palettes only** (§12.1) — there is NO structural mode. From the seed corpus (`reference/design/`), keep the palette (OKLCH ramp + **Ember** + **Geist**, the §3 token seed) AND — added by D62 — its **visual grammar as reference** (control metrics, popover chrome, micro-caps/mono voice, empty-state style; the D62 program docs cite it file-by-file). Where the layout below and the seed disagree, this wins.

The macro layout is the **four-region shell**, realized THROUGH the §11.1 clamp-overlay so it is BOTH the "command-center" *and* the "immersive-SillyTavern" layout — **one shell, panels toggled**, not two builds.

```
DESKTOP (wide):   [ RAIL | LIST | CONTENT | CONTEXT ]
  RAIL    — persistent thin icon column (~56px, fixed). Weave glyph → section icons, SEVEN at
            end-state (D62 P6 — the World Info/Presets additions are PENDING an owner re-decision
            2026-07-09: presets→settings candidate; needs a ledger amendment before either section
            is built), grouped by --spacing-section dividers:
            Chats · Characters · Corpus (primary) | World Info · Presets · Refinery (authoring)
            | Analytics (insight) → spacer → Theme · Settings · avatar. Seven is the CEILING —
            anything further goes to modals/settings. Sections exist only as RAIL_SLOTS entries,
            id-paired with MODAL_SLOTS (gate check:registry-pairing).
  LIST    — the active section's collection: header row (micro-caps title + create "+") → search →
            ListRow rows. Side panel. Per-section DEFAULTS (user toggle wins thereafter):
            docked for Chats/Characters/World Info/Presets; collapsed for the content-first hubs
            (Corpus/Refinery/Analytics) — a SECTION_PANEL_DEFAULTS map beside RAIL_SECTIONS.
  CONTENT — the fluid hero: HEADER bar (active entity · scene chip · thread actions) + the THREAD
            (chat/editor surface, prose capped 65–75ch) + the COMPOSER (pill input · attach · Send,
            mid-stream STOP, optimistic send). With NOTHING selected the Chats section renders the
            LANDING surface (welcome hero + recent chats + character quick-picks — the committed
            {kind:landing} pane), never an empty room. LEFTOVER width feeds CONTEXT, NOT a wider chat.
  CONTEXT — the right detail panel (active artifact's detail + config; tabs). Side panel. Defaults
            collapsed except Chats-with-active-chat.

MOBILE:  RAIL → BOTTOM tab bar (D62 P3, supersedes the earlier top-bar note): Chats · Characters ·
         Corpus · You (You = account/settings sheet + overflow sections; everything also reachable
         via ⌘K). LIST/CONTEXT → full-screen / sheets; single column; land on CONTENT, never on an
         open list sheet. (Mobile is a responsive LAYOUT, never a theme.)
```

- **Refinery is a first-class rail section + feature surface** (Score→Rewrite→Analyze; schema anticipates it — D28). Its sub-parts (stage-stepper, assay, issue-list, compare-diff → `@orb/ui/diff`, guidance-bar) are app components over the primitives.
- **Each side panel has a 3-state model** in the shell store: **`docked`** · **`overlay`** (slides over via the §11.1 clamp — zero width closed) · **`collapsed`**. Per-panel, persisted, auto-`overlay` below a width breakpoint (the one app-shell `@media`).
- **"Immersive-ST" = both side panels collapsed; "command-center" = panels docked.** One persisted **focus toggle**. *The §11.1 clamp-overlay IS the `overlay` mechanism — the baked work powers the collapse, not a rewrite.*
- **The shell is THEME-INDEPENDENT.** Themes are color palettes in the D44 selector (§12.1), NOT layout modes; rail + panels render identically under any palette.
- **A migrating ST user loses nothing:** swipes · edit-in-place · branch/fork · italics-narration · hide-from-AI all live in the CONTENT thread, identical regardless of chrome.

#### 4.2 The region map — what lives where (ledger D62)

The shell is Discord's anatomy with different nouns; the mapping is LAW so no lane invents geography. The difference that matters: rail items are **facets of one world**, not separate servers — cross-section jumps (character card → start chat) are common and route through store actions (`setActiveSection` + a seed), never stranding the user.

| Discord | Orbweaver | Owns |
| - | - | - |
| Server rail | RAIL | which facet — sections + theme/settings/avatar at the foot |
| Channel sidebar | LIST | the section's collection: header row (micro-caps title + create `+`) → search → `ListRow`s. Finding. |
| Chat pane | CONTENT | the artifact you're in: identity header + working surface. Doing. |
| Members panel | CONTEXT | detail + config of CONTENT's active artifact. Closable; never navigation. |
| Quick switcher | `command` modal (⌘K) | jump to any thread/section/create action |
| User settings overlay | `settings` modal, full-bleed variant | USER group (Account · Personas · Appearance · Chat behavior) + APP group (Connections · Automation · System · Admin). Generation config is NOT settings — it is the Presets section. |
| Avatar chip | rail-foot avatar → `account` modal | quick identity card; links into Settings |

Per-section grid (end-state; the D62 program builds toward it):

| Section | LIST | CONTENT — none selected | CONTENT — selected | CONTEXT |
| - | - | - | - | - |
| Chats | conversation rows · search · star/archive chips · `+` → new-chat picker | LANDING (hero + recents + quick-picks) | chat room (header · thread · composer) | tabs: Overrides · Preview · Injections · Roster(group) |
| Characters | character rows · search · `+` create/import | teaching state | detail card → editor | activity (chats with them) + actions |
| World Info | book rows | teaching state | entries table + editor | book config + activation scope |
| Presets | preset rows + CRUD toolbar | teaching state | tabbed editor (Sampling · Output · Quality · Reasoning · Templates · Post-process · Compaction · Prompt) | usage/bindings (default-collapsed) |
| Corpus | recent searches/lenses (default-collapsed) | search-first hub | results in CONTENT (list + graph) | selected result's dossier |
| Refinery | past sessions (default-collapsed) | pick-a-character | pipeline (stepper · assay · issues · compare) | collapsed |
| Analytics | default-collapsed | dashboard | drill-in in CONTENT | dimension detail |

**Interaction physics (all six are load-bearing):**

1. LIST selection drives CONTENT; CONTEXT follows CONTENT. CONTEXT holds actions ON the artifact, never navigation (§5.1 writer-only).
2. Per-section selection is REMEMBERED — rail-switching away and back restores the section exactly (selection stores + `<Activity>` pane-keeping, §4a).
3. Per-section panel DEFAULTS, user override wins (the `SECTION_PANEL_DEFAULTS` map sets only the initial value; the persisted per-panel mode wins thereafter).
4. Cross-section actions carry their subject in ONE action path (`startNewChat({characterIds})` + `setActiveSection`) — the user lands ready to act.
5. Modals are for interrupts and pickers ONLY (new-chat picker, add-member, theme, settings, account, ⌘K). Section content NEVER lives in a modal — it is a CONTEXT tab or a CONTENT state.
6. Focus mode = both side panels collapsed (`toggleFocus`); the topbar reopen affordances are the way back.

#### 4.3 Interaction & visual grammar — the ten UX rules (ledger D62)

Testable law; enforcement tiering per gate lives in `UI-Gates-and-Lessons.md` §8 + `history/design-enforcement.md`. When a build instinct conflicts with a rule, the rule wins.

1. **No dead ends.** Every reachable state renders ≥1 enabled next-step affordance (empty teaches, error retries, draft offers a character).
2. **Character-first entry.** Every "new chat" affordance goes through choosing/confirming a character; a characterless draft is an explicit "Blank chat" pick, never the default.
3. **One primary action per view.** Exactly one `intent="primary"` control visible per region at rest (composer Send counts for CONTENT).
4. **Progressive disclosure.** Rest state shows the reading surface; management chrome appears on hover AND `:focus-within` (keyboard parity), always-visible at `pointer: coarse`, or lives one click away (CONTEXT tab, options menu).
5. **LIST finds; CONTENT does.** Every LIST panel composes header row → search → `ListRow`s.
6. **Keyboard first.** ⌘K reaches every section/recent/create; Esc closes the top layer; focus is visible everywhere and lands correctly on open.
7. **Perceived performance.** Optimistic send, shape-matched skeletons, streaming text as the arrival motion. Never a centered spinner; never layout shift on data arrival.
8. **Empty, loading, error are designed states** — every surface ships all three (the `QueryBoundary` battery forces the slots; D62 makes them worth looking at).
9. **Chrome is quiet; content is loud.** Micro-caps muted section labels; mono data accents; the accent color on ≤10% of any viewport. If a screenshot's loudest element is chrome, the hierarchy is inverted.
10. **Same action, same home.** One store action / verb per action regardless of entry point; identical label + icon everywhere (icon home = the registry).

**Voice table:** section labels = `Text` micro-caps (10.5px equiv token, weight 600, tracked) · data accents (scores, counts, timestamps, kbd) = mono · labels sentence-case · placeholder copy per-section from the ONE registry map (distinct per `SectionId` — gate `placeholder-copy-registry`). The Weave glyph appears at most ONCE per screen (DESIGN.md restraint rule), only in empty states / loading / corpus.

### 4a. React 19 / 19.2 — platform leverage (use these, skip those)

The client targets **React 19 + the React Compiler** (LIVE: the compiler runs full-compile in `packages/client/vite.config.ts`; `@orb/ui` is source-consumed via `optimizeDeps.exclude` so the compiler sees it). Several celebrated React-19 features are REDUNDANT with the TanStack stack and must be skipped so two systems don't fight.

**USE:**

- **The React Compiler is ON — stop hand-writing `useMemo`/`useCallback`/`React.memo`.** The ONE blind spot is `useVirtualizer` (interior mutability) → sealed in `@orb/ui/virtual-list` with **`directDomUpdates: true` + `containerRef`** (TanStack Virtual 3.14+, Compiler-E2E-tested, **NOT `"use no memo"`**) — BUILT; features never wire it by hand.
- **`<Activity>` (19.2, stable) for the single-route panes.** Keep a pane mounted-but-hidden on flip-away (chat ⇄ library) so returning is instant with scroll + form state intact (§5.1). Replaces unmount/remount. Two companion rules (2026-07-04 audit): (1) a hidden pane cannot hold focus — focus dies silently on hide; on `hidden→visible` restore focus to the pane's stable anchor (its header) — a WCAG keyboard-operability obligation, not polish; (2) hide-coupled DOM work (scroll-position capture, media pause) runs in `useLayoutEffect` — Activity unmounts effects synchronously with the visual hide, and a passive `useEffect` cleanup runs too late.
- **`useEffectEvent` (19.2, stable) is THE fix for the effect footguns** — separates an effect's non-reactive part from its deps. The correct tool for the seam effects neo hand-rolled with `prevRef` bookkeeping (§7); prefer it over ref-juggling.
- **`useDeferredValue` for every search/filter-over-collection surface** (library grid · corpus search · tag/world-info filters): the input stays responsive while the filtered list lags a frame behind. Pass `initialValue` so the first render has a defined deferred value. Division of labor: `startTransition` wraps pane *switches*; `useDeferredValue` absorbs derived-*list* churn; neither is a debounce hack. (§13.2 row.)
- **View Transitions API for single-route navigation** — hand-rolled `document.startViewTransition()` (the router's built-in VT never fires in our shell — §6.1 trap 2; React's own `<ViewTransition>` component is STILL canary-only, re-verified 2026-07-04 — the hand-rolled call stands). Pairs with `<Activity>`; utilities live in `@orb/ui` styles. A dynamic `view-transition-name` must be a valid CSS custom-ident: `useId` output is safe since 19.2 (`_r_` prefix exists for exactly this); an entity-id-derived name must be sanitized.
- **`ref` as a prop (no `forwardRef`)** — biome-enforced (`noReactForwardRef`).
- **Resource preloading (`preload`/`preinit`) where the need is predictable** — preinit the palette CSS on theme switch (kills the FOUC), preload the code-editor/Shiki chunk when a code block is likely. Sparingly: measured wins only, never speculative sprays.
- **19.2 Chrome Performance Tracks (Scheduler + Components lanes) are the verification tool for this doc's priority claims** — e.g. confirm a pane switch actually renders in the Transition lane (not Blocking) and Stop stays responsive mid-stream. Use at the Phase-6 chat checkpoints alongside the §6.3.1 golden tests.

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
| **1 — component layout** | a surface in a wide pane vs a narrow drawer | **`@container`** + container-query units (`cqi`) + `clamp()` | **features** (the ONLY responsive thing they write) |
| **2 — macro structure** | rail+list+content+context desktop ⇄ single-column mobile; panels dock⇄overlay (the §11.1 clamp) | **`@media`** (viewport) | **SHELL only** (\~1 file; the sole legal `@media` site) |
| **3 — device capability** | touch targets; hover affordances | **`@media (pointer/hover)`** + token sizing | **token/shell layer** (never features) |
| **4 — mobile platform** | keyboard, safe-area, overscroll, viewport height | **CSS primitives** (`dvh`/`svh`, `env()`, viewport meta) | **shell + composer/scroll primitives** (once) |

**Axis 1 (the core).** A surface adapts to *its container* — the same `<CharacterGrid>` is 4-up in a wide pane, 1-up in a drawer, automatically. No mobile variant, no `compact`/`inDrawer` prop (`no-layout-context-props`). Fluid type/spacing inside a component use `cqi`+`clamp()`, not viewport units.

**Axis 2.** The one genuinely viewport-dependent reflow, in the SHELL: 3-pane ⇄ stack, drawer ⇄ sheet. Tiny (neo: one `clamp()` width var + the overlay model, §11.2). `no-media-queries-in-features` keeps it there.

**Axis 3 — capability, NOT size.** hover/pointer are media-query-only (container queries can't see them). **Pointer-conditional floor (AMENDED — D62 P1; was "unconditional"):** interactive primitives meet the ≥44px touch floor at `@media (pointer: coarse)` via token control-heights; fine pointers get the desktop scale — `control-sm` 28px · `control-md` 34px · `control-lg` 40px · icon 34px — emitted as a token-layer `pointer: fine` override (THIS layer, never features; nothing to branch). An interactive element with a sub-44px visual box on coarse pointers wraps in a ≥44px hit area. `data-density="compact"` remains the separate spacing axis. Hover is only ever an *enhancement* (`@media (hover:hover)`); **every hover action has a tap-equivalent** (and a `:focus-within` keyboard equivalent, §4.3 rule 4). Base UI suppresses tooltips on touch for free. *Gate `touch-target-floor`: asserts the floor per-pointer (one coarse-emulated CT pass).*

**Axis 4 — mobile platform CSS, baked into 3 primitives:**

- **`dvh`/`svh` units, not `vh`** (with a `vh` fallback line) — `svh` where above-fold must stay visible, `dvh` for the adaptive shell.
- **The keyboard gotcha (verified):** `dvh`/`svh` are NOT shrunk by the virtual keyboard → set **`interactive-widget=resizes-content`** in the viewport meta so the composer reflows above the keyboard; `visualViewport` API only for precise composer-pinning if ever needed.
- **`env(safe-area-inset-*)`** padding on shell + composer; **`overscroll-behavior: contain`** on every scroll region; `inputmode`/`type=` on inputs (Base UI fields set these).

**Why no second build:** Base UI gives touch/keyboard/pointer *interaction* correctness for free; we own only *layout* (axes 1–2) + *platform CSS* (axis 4), and axes 2–4 are all shell/token/primitive-level. (D42 §4 + D43 §11.2; verified 2026-06.)

### 5. State

- **Server state → TanStack Query** (+ tRPC via `@trpc/tanstack-react-query`). NEVER in zustand.
- **Client/UI state → Zustand** (DECIDED — D42; not Jotai/TanStack Store: gated-zustand is more machine-enforceable for amnesiac agents than free-form atoms). Gated by `state:files`: one `create(` per file, ≤10 top-level fields, no exported `set`/`getState`/store handle, `persist({name})` namespaced. Draft stores via `createEntityDraftStore`.
- **Local-state-first** — `useState`/props unless genuinely cross-tree; stores only for global concerns (active selection, theme, the stream buffer).
- **Lifecycle slices modeled as discriminated-union transitions**, not ad-hoc `setState` — the stream/turn lifecycle (`turnStarted → delta → turnCompleted|turnAborted`, the ghost slot) is a state machine; model it explicitly inside the store. No XState.

#### 5.1 Single-route shell + the jank-avoidance rule (the neo lesson)

The URL stays `/` (entity ids never in the address bar; multi-device sync is DB-is-truth + the bus, not URL-bookmarking). neo's single-route jank came NOT from single-route — it came from every surface reading one ambient "active character/chat" global and chasing it (the `this_chid` parity sync effect). **The rule a cold agent cannot get wrong:**

> surfaces own their own state · selecting a thing ≠ a cascade of side effects · NO effect making the right panel chase the active chat (no `this_chid` re-coupling).

If "open the library beside a live chat without it yanking the chat" is possible, the jank is gone. If real deep-links/back-forward ever become wanted, routes are a localized bolt-on (TanStack Router for the chat id only) — NOT a rewrite.

**The sanctioned cross-feature-navigation SEAM (built + proven 2026-07-04c — the positive pattern that satisfies the rule):** shared client selection state (active section, active chat, open modal) lives in a **gated Zustand store BELOW the features** (`state/shell-store.ts`, `state/active-chat-store.ts`), NOT route-`useState` and NOT a feature. Arbitrary leaf writers — a rail button, a character card's "start chat", a message row's fork — call intent-named MODULE actions (`setActiveSection`/`selectChat`/`startNewChat`/`openModal`); **writers only WRITE, never write-because-they-read.** Reading has exactly THREE sanctioned shapes, all RENDER-only (amended 2026-07-09 — the pre-amendment "the route is the SINGLE reactive reader" sentence was over-narrow; the persona rail-foot panel proved the mirror shape):

> 1. **The COMPOSITION reader** — the route (`home-page.tsx` reads the store → renders the right CONTENT/LIST into `AppShellProps.sections`); surfaces under it receive the selection as a PROP and never re-read it.
> 2. **The OWN-SECTION reader** — a section's LIST/CONTENT surface reading *its own* section's selection pointer to render (the library highlighting its selected row via `useSelectedCharacterId`).
> 3. **The MIRROR reader** — a shell-chrome/CONTEXT surface whose JOB is reflecting the active artifact and that the route cannot prop-thread (it mounts in a domain-agnostic shell slot): it subscribes to the CANONICAL pointer hook (`useActiveChatId`, never a hand-rolled handle derivation) and fetches its own data via Query keyed by that id. The store carries the POINTER; entity data comes from Query (whose cache dedupes across all readers — N readers, one fetch, one truth).
>
> What stays BANNED — and is the actual `this_chid` disease — is **subscribe-and-EFFECT**: a `useEffect`/`useLayoutEffect` in `features/**` keyed on a shared-selection pointer (gate `no-effect-on-shared-selection`; app-shell is shell-tier-exempt for its layout/appearance root effects). "Do X when the selection changes" is a render derivation, not an effect. Because every reader shape is render-only, `this_chid`-chasing stays impossible **by construction**, and three properties fall out for free: (1) `app-shell` stays domain-agnostic (renders regions + `ReactNode` slots — zero `ChatHandle`/`Character` knowledge); (2) NO feature→feature imports — a `character` card starts a chat via `#state` writes alone, never importing `#features/chat` (dep-cruiser-enforced); (3) the same store action is the ONE home for a navigation both a new-chat flow AND fork-nav terminate at. This is the blessed shape for "many arbitrary leaf components trigger a navigation" — reach for it, not prop-drilling or a shell callback that doesn't understand the domain.

The tab title still tracks the active entity even with the URL pinned to `/`: render React 19's native `<title>` from the active pane (metadata hoists to `<head>`) — never a `document.title =` effect.

### 6. The stack — keep / dump

| | Decision |
| - | - |
| **DUMP** | **shadcn** (copy-paste workflow) → hand-author `@orb/ui`. **Radix** → **Base UI**. **react-markdown + rehype-sanitize + remark-gfm + rehype-raw** → **Streamdown** (§6.3). **react-syntax-highlighter / Prism** → **Shiki** (free inside Streamdown). **nivo** → **ECharts** (D52). The `@/` alias → `#`. |
| **KEEP** | feature-slice · surfaces/anchors · state-files · intent tokens · the gate battery · **Tailwind v4** · **tailwind-variants** (slots; subsumes cva+clsx+tailwind-merge — D54) · **lucide** · **TanStack** (Query / Router-minimal / Form / Virtual) · **Zustand** · the satellites **cmdk · @dnd-kit (the `@dnd-kit/react` rewrite) · minisearch** · **ECharts** (D52). **Base UI native: toast + drawer** (dropped **sonner** + **vaul**, D54); **dropped react-resizable-panels** (shell uses the clamp-overlay, §11.1). |
| **WRAP** | every kept third-party lib lives behind `@orb/ui` (`ui-satellite-seals`); app imports `@orb/ui`, never the lib. |

#### 6.1 TanStack — keep, with discipline

> **`QueryClient` defaults (born-compliant — from the full-docs mine, `../history/UI-Lib-TanStack-Query.md`):** `staleTime: Infinity` (the SSE bus drives freshness — **NOT `'static'`**, which silently ignores `invalidateQueries`) · `gcTime: 5*60_000` · `refetchOnWindowFocus: false` (bus owns liveness) · **`refetchOnReconnect: true`** (SSE-gap catch-up — disabling it is the actual bug) · `refetchOnMount: true` · `networkMode: 'online'` · `structuralSharing: true` · `throwOnError: false` (the `<QueryBoundary>` opts in per-tree) · mutations `retry: 0` · global error toasts via `QueryCache`/`MutationCache` `onError` keyed off `meta`. **Gate-boundary note:** `no-inline-cache-surgery-in-stream` must scope to stream/subscription bodies only — it must NOT trip on the legitimate `setQueryData` inside `createEntityMutation.onMutate`. Adopt `skipToken` (kills the `castId<X>("")` sentinel). The `@tanstack/eslint-plugin-query` discipline rules are LIVE in `eslint.config.js` (dormant until client Query code lands).
>
> **Reference companions** (`history/`, re-homed 2026-07-09 — full-read examples + deep-docs mines; the distilled verdicts are already folded into the cited spec sections, so these are evidence/provenance, not extra law):
>
> | Companion | Fed into |
> | - | - |
> | `../history/UI-Lib-TanStack-Query.md` | the QueryClient defaults (above) · `createEntityMutation` · `createCollectionSurface` · `<QueryBoundary>` · §13 |
> | `../history/UI-Lib-TanStack-Form.md` | the editor-factory six-obligation contract (§13.4) · confirms Form is React-Compiler-clean |
> | `../history/UI-Lib-TanStack-Router.md` | the Router verdict + traps (below) |
> | `../history/UI-Lib-TanStack-Virtual.md` | the D54 "keep TanStack Virtual" reversal (§11.8) |
> | `../history/UI-Lib-Zustand.md` | the §5/§13.1 store conventions (frozen `EMPTY` + `useShallow`; `persist` partialize/migrate) |

- **Query / Form / Virtual: keep** (load-bearing; dropping = reinventing worse).
- **Router: use it MINIMALLY** — single-route shell means \~3 routes (`/`, `/login`, `/admin/*`), BUILT hand-written in `packages/client/src/routes/`. The file-based codegen plugin is DROPPED — **type-safety survives dropping it** (inference + one `declare module { Register }`, not codegen; `UI-Lib-TanStack-Router.md`). Two real traps: (1) `useBlocker` will NOT fire on the in-app editor pane-switch (a reducer state change, not a navigation) → the editor dirty-guard is **hand-rolled in-app**; (2) the router's built-in View Transitions fire only on URL commits (`pathChanged` is always false in our shell) → §4a's hand-rolled VT is correct. Steal-list: router-context DI (forward `queryClient`/`trpc`), `beforeLoad`+`redirect` auth gate, `lazyRouteComponent` for `/admin/*`, `createMemoryHistory` in tests, DEV-gated devtools.
- **Form threshold rule (CORRECTED — D54; "entity editors" was under-scoped):** a **form factory** (§13) is the home for **ANY multi-field form** — trigger = **≥3 fields OR validation OR save/draft semantics**, NOT "is it an entity." Covers settings panels, connection/credential add+edit, group-chat config, room overrides, the D44 theme editor, user-admin create/edit. Only genuinely trivial inputs stay plain controlled + the same Zod schema (a 1–2-field search box, a lone toggle, a single rename). Full surface→factory map: §13.4. RHF stays banned (Compiler-incompatible; never coming back).

#### 6.2 Tests

Playwright CT (`.ct.tsx` under the `tests/ui` mirror — LIVE, `playwright-ct.config.ts`) for component tests + Playwright e2e (`.spec.ts`); central `tests/` mirror. Browser is Playwright, NOT Vitest (it hangs) — separate runners, never in `pnpm check`. The CT contract (token assertions, providers, fixtures): §13.7. Visual-regression screenshots: parked, adopt when the first themed surfaces stabilize.

#### 6.3 Markdown + code → `@orb/ui/markdown` = Streamdown — BUILT

- **Streamdown** is THE markdown renderer, used everywhere (chat AND static descriptions → one lib). It repairs incomplete/unterminated markdown mid-stream instead of flashing, does incremental DOM updates (react-markdown re-parses the whole message per token → \~O(n²) lag), and bundles **Shiki** + KaTeX + Mermaid + copy/download + security policies. Sealed as `@orb/ui/markdown` with **two trust policies** (`packages/ui/src/markdown/policy.ts`) + `toPlainText` (remark `strip-markdown`, D54 — previews/snippets/notifications). The concrete two-policy security spec: §11.6.

##### 6.3.1 The streaming-reveal stack — the three layers, and who owns each (D43; verified 2026-06)

neo had real markdown-parse + streaming display bugs because it hand-rolled the parse/repair layer that is now a solved problem. Three layers, one owner each:

1. **Parse · repair · incremental · fade · security → Streamdown (owns this).** neo's `repairStreamingTail`, hand-rolled `incremental` reparse, and `.stream-word` CSS are NOT ported — Streamdown does all three, robustly.
2. **Pacing → neo's `useSmoothText`, sealed as a pure `@orb/ui/stream` primitive — BUILT** (`packages/ui/src/stream/`). Streamdown has **no pacing** (verified at streamdown.ai/docs/animation); an external pacer composes cleanly. `useSmoothText` is the genuinely best-of-best layer: adaptive backlog-drain, **grapheme-cluster safety** (no torn emoji/ZWJ — *no library does this*), trailing-partial-word hold-back, hidden-tab flush, reduced-motion passthrough. Pipeline: tokens → `useSmoothText` (reveal cadence + cut-point) → Streamdown (repair + render + fade). Do NOT swap it for AI SDK `smoothStream` (server-side, fixed-delay, cruder).
3. **TTFT affordance → the "Thinking…" shimmer** — BUILT (`stream/shimmer.tsx`).

- The `<speaker>`-tag hold-back lives in `@orb/kit/fix-markdown` (`holdTornSpeaker`) — kept, because orbweaver's chat DOES keep the `<speaker>`-span wire format (§12.4).

**HONEST RISK — Streamdown's open bugs cluster in code-blocks-while-streaming, the SAME spot neo's did (verified 2026-06).** Capability is complete, but the streaming-time code-block path is its soft spot (#473 fenced blocks buffer-not-incremental, #402 Shiki re-highlight flicker, #195 huge blocks freeze the tab, #343 lazy chunks crash after deploy). Streamdown is "trade hand-rolled bugs for a maintained library's upstream-fixed bugs," NOT "weirdness solved" — still the right call, with these guards:

1. **Version floor ≥ 2.5** — met (`packages/ui/package.json`).
2. **The pacer mitigates the flicker (#402/#473):** feeding Streamdown word-snapped \~30fps commits (not raw per-token deltas) cuts the re-highlight churn — an explicit reason the pacer sits in front.
3. **Error boundary around the seal** (#343) — BUILT (`markdown.tsx` `MarkdownErrorBoundary`; white-screen → graceful fallback).
4. **Large-block perf guard (#195)** — BUILT (`markdown.tsx` `MAX_RENDER_LENGTH` whole-input fallback to plain `<pre>`).
5. **Golden-test streaming code fences** against the #473/#402 scenarios before chat commits — a Phase-6 chat checkpoint, not a hope.
