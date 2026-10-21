---
kind: law
status: active
updated: 2026-10-17
---

# Client Architecture Lockdown

> **Precedence:** D-ledger → the core `UI-*.md` set → this doc. It builds on standing law and never
> restates it: the Discord/region model and settings taxonomy are `UI-Architecture-and-Layout.md`
> §4.1–§4.3, the reuse primitives are `UI-Primitives-and-Reuse.md` §13, custom static enforcement is governed by D333.
>
> **Audience: a zero-context agent.** This document records client architecture law and examples. D333 retires custom static enforcement. Current checks live in native configs and tests; this document claims no blanket static certification.

**The one-sentence thesis:** composition drifted because a section/pane/tab was smeared across parallel static maps. Keep each definition with its owning feature and assemble it once at the composition root.

## 0. TL;DR — the non-negotiables (one screen)

1. **Five tiers, one direction:** `@orb/ui` → `components/` → `{data,forms,state}/` → `lib/` → `features/`; routes + `main.tsx` compose on top. A feature imports DOWN only; features never import each other at runtime (dep-cruiser).
2. **Ordinary features touch ZERO CSS.** Do not add `className`/`style` to a raw intrinsic element or add a feature stylesheet outside the shell-frame path. The six homes, their responsibilities, and that bounded exception live in §4; do not restate the vocabulary here.
3. **One registry primitive, no static maps.** Keep each section, settings pane, modal and contributor in one definition, assembled at the composition root. Do not add a parallel registry map. "Derive, don't re-declare."
4. **The `/` route is a thin mount.** Do not add a sections map or feature imports to a route body. Assemble feature definitions and contributors at the composition door, and it is two modules: `main.tsx` (boot) plus `client/src/compose/` (the assemblies, behind the `/` route's lazy boundary). §7 states the split and why.
5. **Cross-feature needs have exactly one channel each** — the eleven-row decision table is §12: ephemeral client state (and navigation) → the `state/` commons; another feature's server data → `trpc.*` (cache-first — NOT a network round-trip when cached); **EXTENDING another feature's surface → a CONTRIBUTOR registry assembled at the door** (ten families live; this is the graft channel); shapes → contracts/type-only; composites → `components/`; a feature's own Content↔Context → its editor-bridge (INTRA-feature only). Anything else is a violation.
6. **Use shared client primitives.** Route mutations through `createEntityMutation`, paginated browsing through `createCollectionSurface`, multi-field forms through a form factory, and destructive confirms through `ConfirmDialog`.
7. **Every suspending read sits in `QueryBoundary`; every surface ships designed empty/loading/error states** (§11). A bare spinner or an unhandled throw is a defect.
8. **Events:** shared-room truth rides the durable seq-stamped chat bus; per-person freshness rides the user bus; the invalidation seam routes client events into the cache (§13).

## 1. IF YOU ARE ABOUT TO… (the cold-agent's first stop)

| You are about to build… | Use | Avoid |
| - | - | - |
| a rail section | A `SectionDefinition` in `features/<owner>/lib/`, exported at the feature door and assembled in `main.tsx` (§6) | Parallel rail, panel, placeholder or context maps |
| a planned rail section | A complete `SectionDefinition` with `content: { planned: "<reason>" }` (§6a) | A rail entry without a definition |
| a settings group | A `ConfigGroupDefinition` and its `ConfigSectionContribution` values, owned by the feature and assembled at the root (§8) | A surface inside `features/settings` or an if-ladder branch |
| a tab on another feature's context panel | A `ContextTabDef` contributor registered in `main.tsx` (§6c) | Importing or editing the other feature |
| a modal | A `ModalDefinition` owned by its feature and registered at the root (§6d) | A shell-owned modal-slot map or route override |
| an entity list row | `@orb/ui/list-row` or `#components` `LibraryRow` | A hand-rolled interactive row |
| a paginated collection | `createCollectionSurface` | Hand-wired `useInfiniteQuery` and list state |
| a small bounded list | `useSuspenseQuery` with `LibrarySurfaceShell` or `LibraryListLayout` | A collection factory for a one-shot read |
| a create, update or delete | `createEntityMutation` | Raw `useMutation` with cache surgery |
| a destructive confirm | `#components` `ConfirmDialog` | Raw `@orb/ui/alert-dialog` in a feature |
| a multi-field or saved form | `createAutosaveEntityForm` or `createSavedEntityForm` as appropriate | Hand-wired controlled form state |
| a suspending read | `useGatedQuery` or `useSuspenseQuery` inside `QueryBoundary`, with `QueryErrorState` (§11) | A bare `useQuery` state ladder or spinner |
| another feature's server entity | `trpc.*` query options (§12) | Importing the feature or copying its data into a store |
| active chat, section or selection | A `state/` commons hook | A query for client-side state |
| cross-section navigation | An action from `#state` (§5.1) | Prop-drilling or importing the target feature |
| feature content and its context inspector | The feature's `createFormHandleBridge` (§12 row 6) | A cross-feature bridge or global event emitter |
| a domain event | Add the event to its union, emit after durable commit and map it in `invalidation.ts` (§13) | An ad-hoc event emitter for shared state |
| readiness or dev state | `lib/app-ready-signal.ts` or `lib/agent-bridge.ts` (§12 row 11) | Importing dev instrumentation into production |
| styling | Follow §4: tokens, `tv()` skins and UI layout primitives | Raw values or new feature stylesheets |
| a shared domain-aware composite | `components/` (tier 2) | Copying it across features or placing it in `@orb/ui` |
| a client store | A store factory in `state/` | Bare Zustand stores or adding fields to an unrelated store |

## 3. The five-tier reuse ladder (the canonical client layering)

The client is FIVE tiers, not "ui + features". A builder reaches DOWN this ladder before hand-rolling anything. `packages/client/src/components/` is tier 2 — domain-aware composites with no single feature owner (`confirm-dialog` · `row-actions-menu` · `library-row` · `library-surface` · `entry-list-editor` · `character-picker` · `regex-editor-dialog`; barrel `components/index.ts`).

| Tier | Home | What belongs | May import | Enforcer |
| - | - | - | - | - |
| 1 primitives | `@orb/ui` | domain-agnostic parts (Button, ListRow, Dialog, setting-row) | kit + sealed satellites | resolver physics + `ui-cake` + `ui-satellite-seals` |
| 2 composites | `client/src/components/` | domain-aware cross-feature composites and app-level components with no single feature owner (ConfirmDialog, LibraryRow, CharacterPicker, QueryBoundary, WeaveGlyph) | ui · kit · contracts · `#data` · `#forms` · `#state` · `#lib` · siblings — never `features/`/`routes/` | dep-cruiser `client-components-tier` — three rules in `.dependency-cruiser.cjs`: `client-components-tier` + `client-lib-below-components` + `client-state-below-components` |
| 3 factories/seams | `client/src/{data,forms,state}/` | the wiring machines: `createEntityMutation`, `createCollectionSurface`, form factories, the invalidation seam, the state commons + 3 store doors | per the existing direction rules | `client-data-direction` · `client-forms-direction` · `client-state-below-data` |
| 4 util floor | `client/src/lib/` | cross-cutting display/util seams (time, notify, test-ids, message-render, message-role-labels, theme-override-form, agent-bridge) + the registry primitive | ui/kit/contracts only — reaches up to nothing in-client | `client-lib-floor` |
| 5 features | `client/src/features/` | the slices (per-slice shape: `features/README.md` — surfaces/anchors/components/hooks/lib/index.ts); compose tiers 1–4, never each other | everything below + type-only cross-feature | `client-features-no-cross` · `client-feature-front-door` |

Above the tiers: `routes/` composes features, never the reverse (`client-features-below-routes`), and
`main.tsx` is the top nothing imports (`client-nothing-imports-main`). Their jobs are §7.

**The composition-tier directory module.** A top-level `client/src/<name>/index.ts` sitting beside
`main.tsx` is a sixth, door-owned residency class — not a tier. What earns it: dev-only glue that must
compose feature front doors plus `#state` module actions and is injected into the agent bridge — the
`agent-nav/`, `agent-seed/`, `agent-rpg/`, `agent-plugin/` and `agent-handles/` modules (§7). They cannot
live at tier 4 (`client-lib-floor` forbids the floor from importing `#state`/`#features`/`#data`), are not
features (they own no registered definition), and are not routes (`app-root.tsx` is the only route
that may import a feature front door). Wall: `client-composition-tier-door-only` — only `main.tsx`
imports them, with one exception: a sibling composition-tier module may compose another (they are all
door glue), which is how `agent-handles/` legally assembles the other four behind `main.tsx`'s dev-only
dynamic import.

**Bucket nesting is legal in every bucket, and it changes no rule.** A bucket may group its modules into
sub-dirs. Grouping is presentation for the reader and never alters a file's role. Do not re-declare the bucket axis with group directories such as `components/hooks/` or `surfaces/anchors/`.

**Tier-placement rule:** a domain-aware composite needed by ≥2 features belongs in `components/`, never
duplicated per-feature — `UI-Primitives-and-Reuse.md` §13.0's bar (3+ and changing together) decides
when to hoist. Review repeated composites before hoisting them; semantic near-duplicates need a design decision.

**What is a feature:** a feature dir earns its existence by owning at least one registered definition — a rail section, a Corpus mode, a modal, a settings pane, a chrome widget, or a config collection. A feature whose whole product surface is a member library contributed to the Configuration workspace — the collection case — satisfies this with its `*-group.tsx` (the `ConfigGroupDefinition`) and additionally owns a `*-collection.tsx`, never a settings pane.

## 4. The paint law — who may write CSS, and WHY

### 4.1 The rule

**Every reusable portable visual VALUE is a conformant DTCG token; every component SKIN is a `tv()`
variant; LAYOUT is an `@orb/ui` primitive. A generated value that inherently depends on the CSS runtime is
explicit vendor-extension data, never a fake token type. CSS is legal in exactly the six homes below, and a
feature is not a seventh home.** This is a path-closed set: a CSS file outside these paths is a defect even
when its declarations use tokens.

### 4.2 The six homes — closed by path

| Home | What it is | Hand-written? |
| - | - | - |
| `packages/ui/src/tokens/tokens.json` | THE reusable-value source: stable DTCG tokens/value-set composition plus schema-validated `orb.cssValues` metadata for generated values that cannot be portable. Edit → `pnpm --filter @orb/ui tokens:build` regenerates | yes (the source) |
| `packages/ui/src/styles/theme.css` | generated Tailwind `@theme` plus seed `[data-theme]` value sets — DO NOT EDIT. The value-set sources are `packages/ui/src/tokens/themes/*.json`; there is no authored `ui/src/styles/themes/**` tier | NO — generated by `tokens.build.ts`, freshness-enforced |
| `packages/ui/src/styles/globals.css` | ui's universal CSS mechanism tier: imports, UA/vendor normalization, reduced-motion and reset floors, shared keyframes, masks/formulas, and primitive-wide treatments — never product/shell styling | yes, only when CSS itself is the mechanism |
| `packages/ui/src/styles/tiers.css` | density-tier slot map: semantic slot names repoint to DTCG token steps | yes (token references only) |
| `packages/client/src/styles/globals.css` | client-wide CSS mechanisms: document appearance/defers, capability-query treatments, reading rules, and bounded recipes shared above features — never a component skin or shell-frame rule | yes, only when token/`tv()` composition cannot express it honestly |
| `packages/client/src/features/app-shell/surfaces/shell.css` | the app frame: shell geometry, region paint, responsive regime, and coordinated compositor motion — never component skins | yes — the ONE feature-tier stylesheet |

`packages/ui/src/**/variants.ts` is not a CSS home. It is the component-skin mechanism: `tv()` composes token utilities and may not mint values or stylesheets.

### 4.3 Placement and literals

Route by responsibility: reusable values and palettes originate in the token vault; nonportable
custom-property outputs live under its validated `orb.cssValues` extension; generated theme output only
reflects those sources; ui globals own universal browser/CSS mechanisms; tiers map density semantics;
client globals own client-wide appearance, reading, and capability treatments; shell owns the frame's
geometry, structural paint, and coordinated motion; `variants.ts` owns component skins. An authored
stylesheet expression is legal only when CSS itself is the mechanism and it belongs to that home's
responsibility, with a local reason.

When a builder needs paint: add a conformant token value in `tokens.json`; when its generated output
cannot exist outside the CSS runtime, add an explicitly owned `cssValues` entry instead of lying about
`$type`; otherwise add a semantic density slot in `tiers.css` or a component variant/primitive in
`@orb/ui`. Never raw colour, spacing, radius, shadow, motion, or z-index values outside the shell literals
below. An unknown or unsupported utility/token name resolves to no declaration; add it to the governed
vocabulary first. The allowed path is not a dumping-ground license: the `cssValues` vendor extension is
not a second token vocabulary, and it is not a place for feature paint.

Owner-authored custom CSS is user data, not a seventh repository CSS home. It enters through
`CustomThemeStyle` after `validateThemeCss`, is deliberately unlayered so the owner wins, and targets the
stable `data-slot` and `.shell-*` API. The validator warns on `@import`, rejects `position:
fixed`/`sticky`, and the contracts schema caps the field at `THEME_CSS_MAX`. The full contract is
`UI-Theming-and-Content.md` §12; this exception never licenses raw literals or another authored stylesheet
in source.

### 4.4 Why `shell.css` is the exception

`shell.css` owns the shell's structural surfaces and layout algebra: rail/list/context track arithmetic and
the zero-width sentinel, co-motion variables, one viewport media query, and specificity-ordered elevation.
Density repointing lives in `tiers.css`; shell does not own density semantics. Its panel motion uses FLIP
because animating dynamic grid tracks causes layout shift; JS stamps `data-list-flip`, `shell.css` owns
distance and keyframes, and the reduced-motion case settles transforms immediately. The rule for when a
FLIP may compute its delta in JS instead lives in `motion-and-animation-guide.md` §1.5.

Its structural literals are limited to viewport units, grid ratios and zero sentinels, query conditions, and
per-site alpha composition — everything else wants a token. `shell.css`'s colour declarations are all
token-sourced; that paint is legal because it belongs to the shell's own region fills, seams, scrim, and
elevation, never a component's skin.

### 4.5 The two cascade mechanisms

**Unlayered is the mechanism.** Tailwind v4 emits utilities into `@layer utilities`; an unlayered rule
beats a layered utility regardless of specificity — how `theme.css` and `tiers.css` repoint a primitive's
utility-backed defaults, and how ui's document floors stay floors. There are zero `@layer` blocks in the
authored CSS, and that count must remain zero. Owner-authored custom CSS is also deliberately unlayered
so the owner wins within the §4.3 boundary.

**Source order is critical.** Production and Playwright CT both import
`packages/client/src/styles/index.ts`, the one CSS front door: shell.css → UI globals → client globals.
Client globals and shell contain overlapping selectors at identical specificity, so reversing them can
silently change the winner. CT adds only its `tests/` Tailwind source root through `playwright/index.css`;
it carries no product import or product source. `tests/client/styles/css-home-topology.suite.test.ts` derives and closes this graph. Moving an import changes
the cascade contract and requires an explicit law change.

### 4.6 Polarity has one mechanism

`light-dark()` cases selected by `color-scheme` are the only sanctioned polarity mechanism. `ThemeScope`
derives `color-scheme` from the palette's measured black-vs-white contrast through `surfacePolarity`, so
custom themes and native controls resolve the same polarity without enumerating theme names. A `dark:`
variant keyed to named `[data-theme]` values cannot see a custom theme's derived polarity and is therefore a
defect, not a second supported path. Native ESLint (`orb/no-tailwind-dark-variant`) rejects any authored string in `@ui` or `@client` that spells
a top-level `dark:` variant, so a class list is caught where it is written.

### 4.7 Current checks

D333 retires custom static CSS and token certification. Keep the paint law in §4; native configs and tests cover only their declared scope.

**Auto-overlay is real, built behavior (never amend the law down):** below the 64rem shell breakpoint a
docked-default side panel becomes a **closed slide-over** (renders `collapsed` — content reclaims the
width), **openable on demand** (`overlay`, with a scrim), and restores to docked on re-widen. The
device-transient `openOverlayPanel` tracks which slide-over is open; one shared `resolvePanelMode` algebra
in `#state` is consumed by both `resolvePanel` and `useListDocked` so they cannot drift. Toggle actions
write `openOverlayPanel` in the overlay regime and the persisted `panelOverrides` only when wide — a
resize never mutates the stored preference. Escape closes the open slide-over, yielding to an open modal
(a modal owns Escape itself). An explicit `docked` override is also slide-over-closed while narrow — the
override's intent is honored by restoring it on re-widen, never by discarding it. The mobile regime
(below 48rem) is the separate, narrower regime that also can never resolve `docked`; it reads the same
`openOverlayPanel` tracker as the narrow-desktop overlay regime, so the two never drift on separate
state. The breakpoint is a second `matchMedia` signal (`narrowViewport`) in the `orb/no-raw-matchmedia` legal
home — overlay is mode-gated rendering, not `@media`-gated, so the one app-shell CSS `@media` (the 48rem
mobile column flip) stays the only one. User override wins inside each regime: an explicit
`overlay`/`collapsed` override passes through unchanged in both regimes; only a `docked` resolution
auto-closes while narrow.

## 5. The registry primitive — ONE mechanism, three applications

`createRegistry<Id, Def>` (home `client/src/lib/registry.ts`) replaces every parallel static map: it takes
a name, the vocabulary tuple (`ids`, imported from its one home), and a `Record<Id, Def>` total by tsc — a
missing or extra member is a compile error — and returns a read-only `Registry` (`get(id)` · `list()` ·
`has(id)`), throwing on an unknown-id get. `createContributorRegistry<Def extends {id: string}>` is the
open-ended sibling for the cross-feature extension seam — no fixed vocabulary, and duplicate ids throw at
construction.

Binding rules:

1. **No side-effect registration.** A definition is an exported value on its feature's front door; the composition root imports and assembles. A mutating `register()` API is banned.
2. **Assemble each registry at the registration door (§7).**
3. **Completeness is typed.** The `Record<Id, Def>` assembly is total over its vocabulary tuple.
4. **Derive, do not re-declare.** Do not add a second hand-typed map for a subset of the vocabulary tuple.
5. **Vocabulary tuples keep their one home:** each shell vocabulary tuple has its own two-reader module in `state/` (`SECTION_IDS` in `state/section-ids.ts`, `MODAL_SLOT_IDS` in `state/modal-slot-ids.ts`, `PanelMode` in `state/panel-resolve.ts`, `CONFIG_GROUP_IDS` in `state/config-group-ids.ts`). State owns the shell vocabulary so features import from state, never the reverse; `client-state-below-data` makes the reverse impossible. An id union is shell vocabulary iff it keys a door-assembled total registry whose definitions span features, or appears in `ShellState`/a shell action. An open-ended id a single host interprets (`contextTab`) is not vocabulary — it stays an opaque `string` by design.
6. **A Def's higher-tier need inverts to a projection; the Def never moves up.** Every registry `*Definition` homes in `state/`, and `client-state-below-data` stays exemption-free — even `import type` from `data/` is RED. When a Def member needs a `data/`-tier value type (viewer gating), the Def declares a named state-owned projection consumed contravariantly (`when: (v: SettingsViewerView) => boolean`), and the host — a feature, which may import `#data` — computes and supplies it at filter/render time. The projection homes beside its Def; hoist to `lib/registry-contracts.ts` only when a second party needs it without importing state.

Applications: sections (§6) · settings panes (§8) · contributors (§6c) · modals (§6d) — one primitive, all completeness-checked, zero god-maps.

## 6. The section model

### 6a. SectionDefinition (absorbs six structures)

A `SectionDefinition` carries its rail identity, panel defaults, placeholder, content, content-inset declaration, selection title, and context.
A list-bearing section declares its selection seam, search policy, and `useListHeader` data hook. The shell renders `ListPaneHeader` from that data.
Pane availability derives from the list body and context kind. A section cannot declare a separate availability override.
The shell applies `--spacing-section` as the CONTENT inline inset. A full-bleed surface declares a reason through `{ planned: "<reason>" }`.
Every roster search uses `ListSearch`. The registry-derived roster CT census covers section lists and Corpus modes, including newly registered members.
A no-search declaration carries a nonempty reason. Type tests reject omitted band, inset, and search declarations.
The shape's law is the header of `client/src/state/section-registry.ts` (§15).

- One definition per section, co-located `features/<owner>/lib/<id>-section.ts`, exported on the front door. Section-id↔feature-name is not a mechanical mirror — ownership is declared by where the definition lives; Ownership follows the definition location, not the section name.
- Definitions are self-contained: they read `#state` (selection pointers), `#data` (trpc/Query, `useInvalidation`), `#components`/`@orb/ui` directly, calling `#state` module actions themselves rather than receiving them as props.
- `AppShell` stays domain-agnostic: it consumes the registry (`sections.get(active)`) instead of a `Partial<Record<…>>` prop; `panelDefaults` arrives from the registry.
- **`SectionDefinition` is non-generic.** `context` is a `ContextDefinition` that has already applied its section's context-state type `S` (§6b) — `S` never crosses the shell seam.

**The planned state.** A real, planned-but-unbuilt section registers fully with `content: { planned: "<the tracked reason>" }` — the shell renders the definition's own `placeholder` copy for its content. The `SectionDefinition` union in `state/section-registry.ts` excludes list, header and tab context in this case. Keep the reason, declaration and rail membership together. The planned marker and the real body are the same field, so building the section removes the marker in the same edit. A section id is full, declared-planned with a reason, or absent from the tuple.

Register a section by exporting its `SectionDefinition` from the owning feature's `lib/`, then adding it to
the `main.tsx` door assembly, total over `SECTION_IDS`. Never add an entry to a parallel rail, panel-default or placeholder-copy map, or a `sections={{…}}` branch in a
route — those structures do not exist.

**The `SECTION_IDS` coupled-site checklist.** A rail membership change (adding a section, removing one,
re-homing a surface between the rail and settings) touches a fixed set of sites; tsc only carries some of
them:

1. **`state/section-ids.ts`'s `SECTION_IDS` tuple** — the one home (§5 rule 5). Tuple order is rail order.
2. **The persisted-state sanitizers in the same file** — `isSectionId` (the `migrate()` guard) and the per-section `panelOverrides` sanitize; a removed id must fall back cleanly, an added one needs its `panelDefaults`.
3. **The definition, its factory, and the feature front-door export** — co-located `features/<owner>/lib/<id>-section.tsx`, and the `main.tsx` door row.
4. **Per-section selection stores** — the pointer is a `createDrillSelectionStore` mint in `state/`, centrally homed so a sibling can read it (§9).
5. **`agent-nav/`'s vocabulary validation** — `__orb.nav` validates against `SECTION_IDS`.
6. **`tests/support/browser/ct-door.ts`** — forwards production composition; isolated variants derive from its registries without a second table.
7. **Mobile fate** — `RailEntry.mobile` is required by the `state/section-registry.ts` contract. Rail chrome actions also require mobile curation; topbar actions may omit it and default to `"tab"`. The door preserves the rail-modal `"sheet"` default.
8. **Chrome derivation** — `assembleChrome` reads `sections.list()`; an entry you had to hand-add is a a parallel map.
9. **Placeholder copy** — the real-registry test requires a distinct (title, description) per section.
10. **The rail prose** — `UI-Architecture-and-Layout.md` §4.1's section list.

A membership change that moves a surface between the rail and Settings does this surgery twice: once here, once on the `CONFIG_GROUP_IDS` twin.

### 6b. ContextDefinition — the `defineContextTabs<S>` mint (strictly typed)

`S` (a section's context-state projection) appears only in contravariant positions (`when`, `body`) — why `SectionDefinition<S>` erases cleanly to `<never>`. Consuming a tab means producing an `S` and calling `body(s)`, a covariant position that would break the never-erasure if it crossed the shell seam. So `S` never crosses it: pair `S` with its consumer inside the definition file via a mint that returns a non-generic `ContextDefinition` carrying an already-resolved `useResolved` hook.

`ContextTabDef<S>` carries `id`, `label`, `body: (state: S) => ReactNode`, and a set of optional
resolve-time fields, each read at the same point `when` is (§15 names the code header for the exact
list): `when: (state: S) => boolean` (absent = always visible), `icon`, `strip` (rail membership,
absent = the meta rail), `crown` (a host-only presentation marker), `badge`, `disabledReason`, and
`defaultTab: (state: S) => boolean` (a preferred-default marker — see below). `ContextDefinition` is
non-generic, with three cases, each carrying an optional `empty` no-selection slot (§11):
`{kind:"none"}`, `{kind:"single", body: () => ReactNode, header}`, and `{kind:"tabs", useResolved: () =>
ResolvedContextTabs | null}` where `useResolved` is minted only by `defineContextTabs`.
`ContextTabsSpec<S>` carries `useContextState: () => S | null`, `tabs`, required `header`, and optional fields: `actions`,
`railLabel`, `empty`, `contributors: ContributorRegistry<ContextTabDef<S>>` (§6c), and
`regions: ContributorRegistry<ContextRegionDef<S>>` (band claims, below). The mint,
`defineContextTabs<S>(spec): ContextDefinition`, throws at construction on a duplicate tab id. Shapes'
law is the header of `client/src/lib/registry-contracts.ts` (§15).

- `S` is spelled once, at the mint call, checked against the published projection; the spec's `contributors` typechecks against the host's `S`, so a contributor reading a field the projection lacks is a compile error; the shell only ever sees the non-generic `ContextDefinition`. A consumer-side cast is a lie tsc can't check; a typed per-key `get` accessor reintroduces an id→S map and per-section recipes in app-shell.
- Tab id, label, `when`, and body are one object — the object keeps the tab id, label, predicate and body together.
- **The resolved tab order is fixed:** `when`-filtered own tabs then contributors, in declared order — contributors merge in after a host's own tabs, under the same `when` gating (§6c).
- **`ContextTabsPanel` resolves the active tab** as the store's `contextTab` if it names a visible tab, else the first tab whose `defaultTab` resolves true (first-true-wins), else the declared-order first tab. `defaultTab` lets a section override the plain first-tab default (a game chat lands on `rpg.status`, not the roster's Members) without a stored selection winning by continuity.

**Region claims (D119).** `ContextDefinition` itself gains no case. A `ContextRegionDef<S>` is `{ id, claims: (s: S) => boolean, band: () => ReactNode }` — a claim on the pane's head band only: `resolveContextTabs` folds the first claiming region's `band()` into `ResolvedContextTabs.header` in place of the section's own `header(state)`. `S` stays contravariant-only. A claim never suppresses resolution: `tabs`/`actions` resolve in full either way, and the one host (`ContextTabsPanel` → `ContextBracket`) renders them.

### 6c. The contributor seam (rpg/crew extending chat without importing it)

`features/rpg` exports a `ContextTabDef<ChatContextState>`; `main.tsx` assembles
`createContributorRegistry("chat-context", [rpgContextTab, crewContextTab])` and passes it into the chat
section definition, which flows it into `defineContextTabs`'s `contributors`. rpg never imports chat; chat
never imports rpg; the door imports both. `chatsSection` is authored as a factory,
`makeChatsSection(chatContextContributors, ...)`, so the door→factory→mint→resolve→render path is
exercised even with zero contributions. `ContextTabsPanel` is the one renderer for every `kind:"tabs"`
section, chat included — there is no bespoke chat tabs renderer beside it.

**Surface-anchor contributors.** Same door→factory→content mechanism, consumed by the chat content surface
at named anchor points. The anchor vocabulary is the closed tuple `CHAT_SURFACE_ANCHORS` in
`packages/client/src/lib/contribution-contracts.ts`; that tuple is the list of anchors. `message-footer` is
the one per-row anchor. Every other anchor is a room anchor: the thread flank, the band above the composer,
the composer's action rail, and the Message tools groups that lead the menu or follow its Media group. The
anchors carry different state, so `ChatSurfaceContribution` is a discriminated union by anchor: the room
anchors carry `ChatRoomSurfaceState`; `message-footer` carries `ChatMessageSurfaceState`. Threaded into the content by
props. `message-footer` mounts per committed message row only. Flank layout is the seam's responsibility:
a `@container` query on the chat-content region's own inline size stacks the flank below the thread
beneath `lg` (512px) so no consumer can crush the reading column. Zero flank contributions ⇒ the thread
renders alone with no wrapper.

Contributor contract types home in `client/src/lib/registry-contracts.ts` (tier 4 — importable by chat and
contributors without either importing the other).

**Region claims are a third contributor case.** One claimant may take a host's context pane's head band
for a state it declares; the rails, viewport and ground are the shell's context bracket in every room.
Minted only by `defineContextRegion`, at most one call site project-wide; one bracket project-wide.

The wrong way: `import { ChatContextPanel } from "#features/chat"` (dep-cruiser RED) or editing chat's panel per graft.

### 6d. The modal registry (same move)

A `ModalDefinition` `{ id, title, presentation?, size?, trigger, body }` registers feature-owned bodies at
the door. Two shape rules: (a) each modal self-declares its `trigger: { placement, label, icon }` over a
closed `MODAL_TRIGGER_PLACEMENTS` vocabulary (`rail-footer`/`avatar`/`topbar-command`/`content`/`mobile-tab`),
and the rail-footer/topbar/mobile-bar derive their modal affordances from the registry — never a
parallel trigger map. The `avatar` placement is the one exception: its desktop affordance is
the feature-provided `railFoot`, which owns the account trigger itself. (b) `body` carries the
declared-planned case `(() => ReactElement) | { planned: string }`, mirroring `SectionDefinition`.
Delivered via `ModalRegistryContext`, consumed blind by `ModalHost`.

`orb/modal-definition-home` and `orb/modal-definition-literal` mirror the co-location design. Keep modal ownership and route registration together.

## 7. The composition root — `main.tsx` (the registration door) + thin routes

**The registration door is `main.tsx` + `client/src/compose/`.** `main.tsx` is the boot half: it binds the
singletons (QueryClient → tRPC client → toast manager, minted once in `compose/app-singletons.ts`), binds
`notify`, installs the error-report hook, installs the production readiness signal from
`lib/app-ready-signal.ts` — the readiness module owns the one Promise/DOM marker, and
`globalThis.__orb.ready` imports that same Promise rather than forking state — reaches the dev
`agent-bridge.ts` observer only through the literal
`import.meta.env.DEV` dynamic `agent-handles/index.ts` door, stacks providers (`QueryClientProvider` →
`TRPCProvider` → `ToastProvider` → `AppErrorBoundary` → `RouterProvider`), and raises the `BootVeil`;
nothing imports `main.tsx` (`client-nothing-imports-main`). `compose/authed-app.tsx` mounts the lazy authenticated route.
`compose/authed-composition.tsx` owns its injected factory: feature definitions and contributors are imported and assembled
(`createRegistry`/`createContributorRegistry` call sites live in `main.tsx` or a `compose/` module).
`compose/authed-providers.tsx` delivers the assembled registries to the `/` route's `AppRoot` and isolated component mounts. This is critical for
one-directional flow: a contributor "registers" by being imported at the door, never by importing its
host feature.

**Boot and authenticated composition stay separate because assembly imports the feature graph,**
which would parse the whole feature graph before the login form paints for a client that has not
authenticated yet. `routes/router.tsx` mounts the `/` component via `lazyRouteComponent`, so the
assemblies and the feature graph under them are a separate chunk fetched during the route's load phase,
after `requireAuthed()` passes. `client-compose-door-only` (dep-cruiser — only `main.tsx`,
`routes/router.tsx`, and a `compose/` sibling may import `compose/`) and's one-assembly rule keep this
from becoming a backdoor. The singletons live in `compose/app-singletons.ts` because both halves need the
same QueryClient/tRPC client.

**The door's third job: the composition-tier dir modules (§3).** `main.tsx` installs the agent-bridge
implementations from `agent-nav/`, `agent-seed/`, `agent-rpg/` and `agent-plugin/`, handed to
`installAgentDebugHandle`; `client-composition-tier-door-only` makes `main.tsx` their only importer. This
assembly is dev-only and must stay out of the production boot chunk: `main.tsx` reaches it through `if (import.meta.env.DEV) { void import("./agent-handles/index.ts") … }`, so the bundler constant-folds the
case and the graph it pulls in leaves the production output. Adding a dev handle goes in `agent-handles/`,
never onto `main.tsx`'s static import list.

**`@orb/client` declares no `sideEffects` field.** Keep its import graph explicit. `@orb/kit` and `@orb/contracts` declare `"sideEffects": false`; `@orb/ui` declares `"sideEffects": ["**/*.css"]`.

**Routes are thin mounts (D54).** `routes/` = `router.tsx` (a hand-written 2-route tree — `/` + `/login`;
`beforeLoad` auth gates from `features/auth`), `__root.tsx` (root route plus NotFound), `route-pending.tsx`,
`login-page.tsx`, and the `/` route component. Routes compose features, never the reverse
(`client-features-below-routes`).

**`app-root.tsx` is the `/` route, and it is a thin mount, never a god-map.** `AppShell` (the 4-region
frame) is the top structural component: shell on top, everything renders inside it. There is no "home
page" concept — the no-selection landing is the chats section's content-none-selected state, a section
state, not a page; a `home` section also exists (a rail entry and the persisted store's default, tiles
assembled at the door, D121/D211), but a route that hand-assembles other features is still forbidden. `app-root.tsx` reads the section registry and
stays trivial. What legitimately stays on it: the `useUserBus` mount (mounted at the root so no feature
unmount can drop it), `AriaAnnouncer`, the `?join=` token capture plus `JoinInviteDialog`,
`FirstRunPersonaDialog`, and `CharacterGalleryAnchor` (the one gallery dialog every surface opens through `openCharacterGallery`). Door-assembled home tiles use `HomeTileContribution` in `state/home-tile-contracts.ts`: dormant bodies have no action; live bodies may declare one. Keep route feature imports within the auth route and app-root composition seams.

## 8. The settings host + pane registry

The settings host is a config-GROUP registry: `state/config-group-registry.ts`
(`ConfigGroupDefinition`, total over `CONFIG_GROUP_IDS` in `state/config-group-ids.ts`, four shelves
`CONFIG_SHELVES` = User · App · Collections · Plugins), host `features/config` (list + content, rail
foot). The body union is `sections | collection | placeholder`: every non-collection group is a `sections`
skimmer over the contribution seam in `state/config-section-registry.ts`, assembled at the door in
`compose/config-sections.ts` — the one section registry every group's LIST rows derive from (no `surface` case, no
group-owned `subcategories` — persona, plugins, connections, automation and backup surfaces decompose
into `ConfigSectionContribution`s, D120); the four collections are `collection` groups whose body is their
`CollectionContribution`. `openConfigTo(group, sub?, setting?)` (`state/config-nav-store.ts`) is the one
navigation verb. is the native `orb/config-group-definition-home` rule.

`CONFIG_GROUP_IDS`/`ConfigGroupId` live in `state/config-group-ids.ts`, its own two-reader vocabulary
module (§5 rule 5); `ConfigGroupDefinition`, `SettingsViewerView` (the state-owned viewer projection `when`
consumes — plain derived values only, no `data/` import, §5 rule 6), `CONFIG_SHELVES` and
`SettingsSubcategory` home in `state/config-group-registry.ts`. The Context+hook/Provider pair mirrors
`modal-registry-context.ts`/`-provider.tsx`. The host computes `SettingsViewerView` from its non-suspense
`sessions.me` probe (§10's sanctioned non-suspense exception) and supplies it at nav/search/pane filter
time.

`state/config-section-registry.ts` derives each `anchorId` from its contribution's `anchor` and `nav.id`;
keep the formatter unexported. `body(anchorId)` forwards this required value through component props to the
existing DOM root. The viewer-aware resolver returns unavailable for missing or hidden targets; the prefix
resolver does so for empty groups, and the scroll-spy reads that prefix. Jumps wait up to five seconds for
registered targets. Supersede or unmount cancels observer, timer, suppression, queued flash and focus work.

- The settings shell is a thin host: nav, fuzzy search and scroll-spy read `registry.get(active).body` —
  a category with no branch can no longer silently placeholder ( forces the explicit `{placeholder: true}`
  flag).
- **Features own their panes.** `features/user-admin` owns `admin`; `features/credentials` owns
  `connections`; `features/workloads` owns `workloads` and `backup` (backup/restore is the workloads +
  portability-serde export/import system, not a standalone feature); `features/persona` owns its pane.
  `features/config` owns `appearance` and `chat-behavior`, including the theme editor and picker.
  `features/regex` owns a `*-collection.tsx`, not a pane (§3's collection case).
  `features/tag` owns the Corpus Labels mode; `features/stats` owns Corpus Insights (D271).
- The host imports no pane bodies — they arrive via the door assembly, so `client-features-no-cross`
  enforces the de-god split for free.
- `openConfigTo`'s `group` argument is typed against `CONFIG_GROUP_IDS`; tsc validates every deep-link call
  site against the tuple. `contextTab` stays an opaque `string` by design — §5 rule 5's vocabulary test
  separates a closed door-assembled cross-feature vocabulary from an open id one host interprets.

Add a settings group by exporting a `ConfigGroupDefinition` (a skimmer, nothing else) from the owning
feature's `lib/`, exporting one `ConfigSectionContribution` per anchored section, and registering both at
the door (`compose/authed-composition.tsx`'s group registry, total over `CONFIG_GROUP_IDS`). Keep each
surface in its owning feature's `lib/`; forward the registry-supplied address instead of minting one at the
component.

Client state and data rules live in [client-architecture-state-and-gates.md](client-architecture-state-and-gates.md).
