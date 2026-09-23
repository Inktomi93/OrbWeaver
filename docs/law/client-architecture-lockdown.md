---
kind: law
status: active
updated: 2026-09-23
---

# Client Architecture Lockdown

> **Precedence:** D-ledger → the core `UI-*.md` set → this doc. It builds on standing law and never
> restates it: the Discord/region model and settings taxonomy are `UI-Architecture-and-Layout.md`
> §4.1–§4.3, the reuse primitives are `UI-Primitives-and-Reuse.md` §13, the enforcement families are
> `UI-Gates-and-Lessons.md` §8.
>
> **Audience: a zero-context agent.** Every rule here is spelled out, backed by a machine gate wherever
> gateable (§16 names each gate; prose is the why, the gate is the wall), and shown with a worked example
> where a mechanism is involved. Start at §1 (the decision table); read depth only for the row you hit.

**The one-sentence thesis:** composition drifted because a section/pane/tab was smeared across parallel static maps no gate forced to agree — the fix is ONE registry primitive, definitions co-located with their owning feature, exactly one assembly at the composition root, and a gate on every seam, so a half-registered section, a god-feature, a shadow map, a god-map route, or an under-fanned event is structurally impossible.

## 0. TL;DR — the non-negotiables (one screen)

1. **Five tiers, one direction:** `@orb/ui` → `components/` → `{data,forms,state}/` → `lib/` → `features/`; routes + `main.tsx` compose on top. A feature imports DOWN only; features never import each other at runtime (dep-cruiser).
2. **Ordinary features touch ZERO CSS.** No `className`/`style` on a raw intrinsic element anywhere in client src (ESLint, LIVE), and no feature owns a stylesheet except the one enumerated shell-frame path (G14). The six homes, their responsibilities, and that bounded exception live in §4; do not restate the vocabulary here.
3. **One registry primitive, no static maps.** A section / settings pane / modal / contributor is ONE co-located definition, assembled ONCE at the composition root. A second `Record<SectionId, …>`-style map anywhere else is RED (G2). "Derive, don't re-declare."
4. **The `/` route is a thin mount.** No `sections={{…}}` god-map, no feature imports in a route body. The registration door is the only place feature definitions/contributors are imported and assembled (G1/G8), and it is two modules: `main.tsx` (boot) plus `client/src/compose/` (the assemblies, behind the `/` route's lazy boundary). §7 states the split and why.
5. **Cross-feature needs have exactly one channel each** — the eleven-row decision table is §12: ephemeral client state (and navigation) → the `state/` commons; another feature's server data → `trpc.*` (cache-first — NOT a network round-trip when cached); **EXTENDING another feature's surface → a CONTRIBUTOR registry assembled at the door** (ten families live; this is the graft channel); shapes → contracts/type-only; composites → `components/`; a feature's own Content↔Context → its editor-bridge (INTRA-feature only). Anything else is a violation.
6. **Every mutation rides `createEntityMutation`; every paginated browse rides `createCollectionSurface`; every ≥3-field form rides a form factory; every destructive confirm rides `ConfirmDialog`** (G6/G7/G9 + LIVE form gates).
7. **Every suspending read sits in `QueryBoundary`; every surface ships designed empty/loading/error states** (§11). A bare spinner or an unhandled throw is a defect.
8. **Events:** shared-room truth rides the durable seq-stamped chat bus; per-person freshness rides the user bus; both are exhaustively applied and producer-ratcheted; the invalidation seam is the only client event→cache router (§13). A new bus without the full guard set is RED (G11).
9. **A green `pnpm check` proves structure, not logic** — but a RED one proves you broke a law above. Run it; read the FULL output.

## 1. IF YOU ARE ABOUT TO… (the cold-agent's first stop)

| You are about to build… | The ONE right move | NOT | Wall |
| - | - | - | - |
| a new rail section | a `SectionDefinition` in `features/<owner>/lib/`, exported on the front door, added to the `main.tsx` assembly (§6) | entries in rail/panel/placeholder/context maps + a route branch | G1/G2 + tsc |
| a rail section whose content ISN'T BUILT yet | a full `SectionDefinition` with `content: { planned: "<reason>" }` — the sanctioned PLANNED state (§6a; refinery is the founding member) | a rail entry with no registration; shipping half-wired | G1 |
| a settings group | a `ConfigGroupDefinition` (a `sections` SKIMMER) owned by YOUR feature + one `ConfigSectionContribution` per anchored section, both registered at the root (§8) | a surface inside `features/settings` + an if-ladder branch; a `surface` render hand-stamping anchors | G4 (`config-group-completeness`) + tsc |
| a tab on the chat context panel from ANOTHER feature | a `ContextTabDef` contributor with a `when` predicate, registered in `main.tsx` (§6c) | importing `#features/chat`; editing the chat panel | G8 + `client-features-no-cross` |
| a modal | a `ModalDefinition` owned by your feature (self-declares its `trigger`), registered at the root (§6d) | a body in app-shell's `MODAL_SLOTS` + a route override; a `RAIL_ACTIONS`-style parallel trigger map | `modal-registry-completeness` + G2 |
| an entity list row | `@orb/ui/list-row` or `#components` `LibraryRow` | a hand-rolled interactive row | G6 |
| a browse/list over a PAGINATED collection | `createCollectionSurface` | hand-wired `useInfiniteQuery` + list | G9 (seal) |
| a small bounded list (one-shot fetch) | `useSuspenseQuery` + `LibrarySurfaceShell`/`LibraryListLayout` | `createCollectionSurface` ceremony; a bespoke shell | R1 |
| a create/update/delete | `createEntityMutation` | raw `useMutation` + cache surgery | G9 (seal) |
| a destructive confirm | `#components` `ConfirmDialog` | raw `@orb/ui/alert-dialog` in a feature | G7 |
| a form (≥3 fields OR validation OR save/draft) | `createAutosaveEntityForm` (D66 A4) / `createSavedEntityForm` where law says button-gated | hand `useAppForm`/controlled soup | `form-factory-for-multifield` (LIVE) |
| a read that can suspend/fail | `useGatedQuery`/`useSuspenseQuery` inside `QueryBoundary`; error UI = `QueryErrorState` (§11) | bare `useQuery` + `isPending` ladders; a spinner | LIVE data gates + R4 |
| reading ANOTHER feature's server entity | `trpc.*` queryOptions — cache-first, deduped by key (§12) | importing the feature; copying the data into a store | `client-features-no-cross` |
| reading the active chat/section/selection | the `state/` commons hooks (`useActiveChatHandle`, …) | a trpc call for an id that lives client-side | §12 matrix |
| cross-section navigation | `#state` module actions (`setActiveSection` + seed) | prop-drilling a callback; importing the target feature | §5.1 (LIVE) |
| your feature's CONTENT talking to its own CONTEXT inspector | that feature's editor-bridge (`createFormHandleBridge`) | using a bridge ACROSS features; a global event emitter | §12 row 6 |
| a new domain event / bus | add to the union + types-const, emit durable-first, map in `invalidation.ts`, coverage-gate (§13) — the domain verb emits AFTER its durable write commits | an ad-hoc EventEmitter; an actor-only emit for shared state | G10/G11/G12 + LIVE ratchets |
| observing production readiness and dev tooling state | `lib/app-ready-signal.ts` for the lean production signal; `lib/agent-bridge.ts` for the DEV-only observer surface | importing the dev instrumentation graph from production or importing features to introspect them | §12 row 11 |
| styling ANYTHING | follow §4's paint law: token value → `tv()` skin → primitive layout; a shell-frame mechanism is the bounded exception, so STOP and flag it for shell-tier ownership | raw values; a new `.css` file; `className` on a `<div>` | ESLint keystone + token gates + G14 |
| a shared domain-aware composite (2+ features need it) | `components/` (tier 2) | copy-paste per feature; stuffing it into `@orb/ui` | R2 + `ui-cake` |
| a new client store | one of the 3 doors (`createGatedStore`/`createPersistedStore`/`createEntityDraftStore`) in `state/` | bare zustand `create()`; fields on an existing store past the cap | `state-files` + persist gates (LIVE) |

## 3. The five-tier reuse ladder (the canonical client layering)

The client is FIVE tiers, not "ui + features". A builder reaches DOWN this ladder before hand-rolling anything; each tier names its enforcer. `packages/client/src/components/` is tier 2 — domain-aware composites with no single feature owner (`confirm-dialog` · `row-actions-menu` · `library-row` · `library-surface` · `entry-list-editor` · `character-picker` · `regex-editor-dialog`; barrel `components/index.ts`).

| Tier | Home | What belongs | May import | Enforcer |
| - | - | - | - | - |
| 1 primitives | `@orb/ui` | domain-agnostic parts (Button, ListRow, Dialog, setting-row) | kit + sealed satellites | resolver physics + `ui-cake` + `ui-satellite-seals` |
| 2 composites | `client/src/components/` | domain-aware cross-feature composites and app-level components with no single feature owner (ConfirmDialog, LibraryRow, CharacterPicker, QueryBoundary, WeaveGlyph) | ui · kit · contracts · `#data` · `#forms` · `#state` · `#lib` · siblings — never `features/`/`routes/` | dep-cruiser `client-components-tier` (G5) — three rules in `.dependency-cruiser.cjs`: `client-components-tier` + `client-lib-below-components` + `client-state-below-components` |
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
features (they own no registered definition, G23), and are not routes (`app-root.tsx` is the only route
that may import a feature front door). Wall: `client-composition-tier-door-only` — only `main.tsx`
imports them, with one exception: a sibling composition-tier module may compose another (they are all
door glue), which is how `agent-handles/` legally assembles the other four behind `main.tsx`'s dev-only
dynamic import.

**Bucket nesting is legal in every bucket, and it changes no rule.** A bucket may group its modules into
sub-dirs. Grouping is presentation for the reader — it never alters a file's role — so `client-structure`'s
per-file contracts recurse to any depth. What nesting may not do is re-declare the bucket axis: a group
dir named after a bucket (`components/hooks/`, `surfaces/anchors/`) is RED — `client-structure` rule 8
catches it, and rule 4 (known buckets only) keeps keying on the feature root regardless of nesting.

**Tier-placement rule:** a domain-aware composite needed by ≥2 features belongs in `components/`, never
duplicated per-feature — `UI-Primitives-and-Reuse.md` §13.0's bar (3+ and changing together) decides
when to hoist. `jscpd` (tsx
scanned, 5% threshold) is the standing tripwire; the hoist itself is review R2.

**What is a feature:** a feature dir earns its existence by owning at least one registered definition — a rail section, a modal, a settings pane, a chrome widget, or a config collection. `feature-owns-definition` (G23) is RED when a feature dir co-locates no `lib/*-{section,modal,group,chrome}.tsx`. No exemptions. A feature whose whole product surface is a member library contributed to the Configuration workspace — the collection case — satisfies this with its `*-group.tsx` (the `ConfigGroupDefinition`) and additionally owns a `*-collection.tsx`, never a settings pane.

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
responsibility, with a local why and a test or gate pin.

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
it carries no product import or product source. `playwright-css-topology` derives and closes this graph. Moving an import changes
the cascade contract and requires an explicit law change.

### 4.6 Polarity has one mechanism

`light-dark()` cases selected by `color-scheme` are the only sanctioned polarity mechanism. `ThemeScope`
derives `color-scheme` from the palette's measured black-vs-white contrast through `surfacePolarity`, so
custom themes and native controls resolve the same polarity without enumerating theme names. A `dark:`
variant keyed to named `[data-theme]` values cannot see a custom theme's derived polarity and is therefore a
defect, not a second supported path. There is no authored `@custom-variant dark` declaration; its gate
(`no-tailwind-dark-variant`) proves it through the whole-project static-class provenance substrate.

### 4.7 Enforcement

Every mechanism below is gated, floored, or tested — never merely documented:

- The colour/value/motion gates constrain authored values; `playwright-css-topology` makes production and CT
  share the ordered product CSS graph while keeping the CT-only source explicit; G14 (`sanctioned-css-homes`)
  path-closes repository-owned product CSS to the six-home table and fails on a missing home; compose-only
  keeps client intrinsic paint out of features; class-merge seals and tests preserve primitive ownership. The
  sanctioned homes are path permissions, not proof that every declaration inside them is correct.

- `css-family-ownership` is the responsibility wall that routes every declaration and every selector case
  in a sanctioned CSS path to its semantic home; a `tv()` call this gate cannot resolve statically is
  runtime-assembled and falls to the rendered side-eye sweep instead, not to a wider static grammar.

- `css-var-defined` rejects unresolved static `var(--x)` references and declaration-proven arbitrary-variable
  utilities. Its definition set includes generated tokens, authored declarations, explicit fallbacks, exact
  CSSProperties-backed runtime writers, and the installed Base UI custom-property contract.

- `tokens-contract` validates the hash-pinned DTCG 2025.10 Format/Resolver schemas, structured portable
  values, exact Light/Mocha seed membership, the bounded Hearth/Light/Mocha Resolver, removed portable
  paths, explicit `orb.cssValues` output roles and placement, and exact CSS target identity; it fails
  loud on a schema, hash, or zero-population mismatch. The type-directed emitter preserves ThemeScope,
  polarity, carried palettes, runtime formulas, and owner custom CSS.

- `pnpm snap --dead-css` is a blocking floor, not a warning report: the appearance-invariant evaluator
  (`tooling/src/snap/ops/appearance-invariants.ts`) reddens any dead or empty CSS identity and treats a zero
  denominator, an unreadable sheet, or an unsettled `motion-dead-class-flagger` drain as an instrument
  error. Matrix cells compare identities, so a same-count replacement cannot pass.

- One policy-neutral planner (`tooling/src/_shared/variant-matrix.ts`) feeds Snap's and the design audit's
  appearance-invariant verdicts. Snap's `--matrix --motion <selector>` reuses the retained pure
  planner/verdict engine in `tooling/src/motion-audit` without a second parser or browser path. The
  R1–R7 invariant policy has one home: `packages/client/src/lib/appearance-invariant-manifest.ts`.
  Route mode is the only R1–R7 verdict owner; scenario mode publishes `not-applicable: scenario-owned-drive`
  rather than counterfeiting one.

- The final browser cascade proves itself through the revision-pinned official DevTools frontend SDK. A
  declaration for which `propertyState(property)` is `null` is skipped before the denominator; zero
  classified declarations remain an instrument error except for the explicit `allowComputedDefault` case.
  Vite's blank rule URLs recover repository provenance only from the authoritative `data-vite-dev-id`
  stylesheet header. `css-selector-has-a-writer` gives every authored selector a semantic writer proof;
  `css-length-tokens` gives every reusable length and unitless line-height token ownership; `css-family-
  ownership` proves a `tv()` call site's provenance and, where it holds a single configured class-merge
  helper, that helper's provenance too.

Runtime-assembled class strings remain outside static proof; the rendered side-eye sweep is their named
backstop, not a reason to widen the static set.

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
state. The breakpoint is a second `matchMedia` signal (`narrowViewport`) in the `no-raw-matchmedia` legal
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

Binding rules (each is a §16 gate or tsc):

1. **No side-effect registration.** A definition is an exported value on its feature's front door; the composition root imports and assembles. A mutating `register()` API is banned.
2. **Exactly one assembly per registry, at the registration door (§7)** — `createRegistry(`/`createContributorRegistry(` call sites anywhere else are RED (G8).
3. **Completeness is tsc.** The `Record<Id, Def>` assembly is total over the vocabulary tuple. G1 adds what tsc can't see: co-location and uniqueness.
4. **The anti-hardcode law:** a keyed static map covering the id space outside {the vocabulary tuple, definition files, the one assembly} is RED (G2). Derive, don't re-declare — `MOBILE_PRIMARY_SECTIONS` derives from `RAIL_SECTIONS`; that shape is the standard.
5. **Vocabulary tuples keep their one home:** each shell vocabulary tuple has its own two-reader module in `state/` (`SECTION_IDS` in `state/section-ids.ts`, `MODAL_SLOT_IDS` in `state/modal-slot-ids.ts`, `PanelMode` in `state/panel-resolve.ts`, `CONFIG_GROUP_IDS` in `state/config-group-ids.ts`). State owns the shell vocabulary so features import from state, never the reverse; `client-state-below-data` makes the reverse impossible. An id union is shell vocabulary iff it keys a door-assembled total registry whose definitions span features, or appears in `ShellState`/a shell action. An open-ended id a single host interprets (`contextTab`) is not vocabulary — it stays an opaque `string` by design.
6. **A Def's higher-tier need inverts to a projection; the Def never moves up.** Every registry `*Definition` homes in `state/`, and `client-state-below-data` stays exemption-free — even `import type` from `data/` is RED. When a Def member needs a `data/`-tier value type (viewer gating), the Def declares a named state-owned projection consumed contravariantly (`when: (v: SettingsViewerView) => boolean`), and the host — a feature, which may import `#data` — computes and supplies it at filter/render time. The projection homes beside its Def; hoist to `lib/registry-contracts.ts` only when a second party needs it without importing state.

Applications: sections (§6) · settings panes (§8) · contributors (§6c) · modals (§6d) — one primitive, all completeness-checked, zero god-maps.

## 6. The section model

### 6a. SectionDefinition (absorbs six structures)

A `SectionDefinition` carries: `id`; `rail` (label, icon, group, mobile fate, rail zone); an optional
`panels` (which panels the section has at all — absent = both); `panelDefaults` (the boot default per
panel — the persisted override wins); `placeholder` (distinct title/description, gate-checked); an
optional `list`, with an optional `listHeader` riding beside it; `content` — a real content pane, or the
declared-planned case (below), never absent; an optional `header`; and `context: ContextDefinition` —
`{kind:"none"}` is an explicit decision, never an absence. The shape's law is the header of
`client/src/state/section-registry.ts` (§15).

- One definition per section, co-located `features/<owner>/lib/<id>-section.ts`, exported on the front door. Section-id↔feature-name is not a mechanical mirror — ownership is declared by where the definition lives; G1 keys on location, never name derivation.
- Definitions are self-contained: they read `#state` (selection pointers), `#data` (trpc/Query, `useInvalidation`), `#components`/`@orb/ui` directly, calling `#state` module actions themselves rather than receiving them as props.
- `AppShell` stays domain-agnostic: it consumes the registry (`sections.get(active)`) instead of a `Partial<Record<…>>` prop; `panelDefaults` arrives from the registry.
- **`SectionDefinition` is non-generic.** `context` is a `ContextDefinition` that has already applied its section's context-state type `S` (§6b) — `S` never crosses the shell seam.

**The planned state.** A real, planned-but-unbuilt section registers fully with `content: { planned: "<the tracked reason>" }` — the shell renders the definition's own `placeholder` copy for its content. G1 holds four walls: the `planned` reason is a non-empty string; a planned section is fully placeholder (no `list`, no `header`, `context: { kind: "none" }` — a planned section that also wires real bodies is RED); the planned marker and the real body are the same field, so building the section forces deleting the marker in the same edit — a stale exemption is unrepresentable; and a rail-visible section with no registration at all stays RED. A section id is always in exactly one honest state — full, declared-planned with a reason, or absent from the tuple.

Register a section by exporting its `SectionDefinition` from the owning feature's `lib/`, then adding it to
the `main.tsx` door assembly, total over `SECTION_IDS`. Never add a `RAIL_SECTIONS` entry, a
`SECTION_PANEL_DEFAULTS` key, a `SECTION_PLACEHOLDER_COPY` key, or a `sections={{…}}` branch in a route —
those structures do not exist.

**The `SECTION_IDS` coupled-site checklist.** A rail membership change (adding a section, removing one,
re-homing a surface between the rail and settings) touches a fixed set of sites; tsc only carries some of
them:

1. **`state/section-ids.ts`'s `SECTION_IDS` tuple** — the one home (§5 rule 5). Tuple order is rail order.
2. **The persisted-state sanitizers in the same file** — `isSectionId` (the `migrate()` guard) and the per-section `panelOverrides` sanitize; a removed id must fall back cleanly, an added one needs its `panelDefaults`.
3. **The definition, its factory, and the feature front-door export** — co-located `features/<owner>/lib/<id>-section.tsx`, and the `main.tsx` door row.
4. **Per-section selection stores** — the pointer is a `createDrillSelectionStore` mint in `state/`, centrally homed so a sibling can read it (§9).
5. **`agent-nav/`'s vocabulary validation** — `__orb.nav` validates against `SECTION_IDS`.
6. **`tests/support/browser/ct-data-providers.tsx`** — the real section registry and the `fakeSection` fold, a hand-maintained door mirror.
7. **Mobile fate** — `rail.mobile` (`MobileCuration`) is an explicit per-section decision, `"tab"` or `"sheet"`; there is no default.
8. **Chrome derivation** — `assembleChrome` reads `sections.list()`; an entry you had to hand-add is a G2 parallel map forming.
9. **Placeholder copy** — `placeholder-copy-registry` requires a distinct (title, description) per section.
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
`{kind:"none"}`, `{kind:"single", body: () => ReactNode, header?}`, and `{kind:"tabs", useResolved: () =>
ResolvedContextTabs | null}` where `useResolved` is minted only by `defineContextTabs` (G3).
`ContextTabsSpec<S>` carries `useContextState: () => S | null`, `tabs`, and a set of optional fields: `actions`,
`header`, `railLabel`, `empty`, `contributors: ContributorRegistry<ContextTabDef<S>>` (§6c), and
`regions: ContributorRegistry<ContextRegionDef<S>>` (band claims, below). The mint,
`defineContextTabs<S>(spec): ContextDefinition`, throws at construction on a duplicate tab id. Shapes'
law is the header of `client/src/lib/registry-contracts.ts` (§15).

- `S` is spelled once, at the mint call, checked against the published projection; the spec's `contributors` typechecks against the host's `S`, so a contributor reading a field the projection lacks is a compile error; the shell only ever sees the non-generic `ContextDefinition`. A consumer-side cast is a lie tsc can't check; a typed per-key `get` accessor reintroduces an id→S map and per-section recipes in app-shell.
- Tab id, label, `when`, and body are one object — no bijection gate is needed where no bijection can break.
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
at named anchor points. The anchor vocabulary is a closed tuple —
`CHAT_SURFACE_ANCHORS = ["thread-flank", "above-composer", "message-footer"] as const`. The anchors carry
different state, so `ChatSurfaceContribution` is a discriminated union by anchor: the room anchors carry
`ChatRoomSurfaceState`; `message-footer` carries `ChatMessageSurfaceState`. Threaded into the content by
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
`RAIL_ACTIONS`-style parallel map. The `avatar` placement is the one exception: its desktop affordance is
the feature-provided `railFoot`, which owns the account trigger itself. (b) `body` carries the
declared-planned case `(() => ReactElement) | { planned: string }`, mirroring `SectionDefinition`.
Delivered via `ModalRegistryContext`, consumed blind by `ModalHost`.

`modal-registry-completeness` mirrors G1: co-location, uniqueness, planned-case honesty, the
singleton-placement case (one modal per `avatar`/`topbar-command`/`mobile-tab`), and the anti-god-map case.
`modal-body-not-placeholder` reds a function-case `body` rendering a placeholder component instead of
`{planned}`. G2's ModalSlotId case (§16) keeps a parallel modal map from re-forming.

## 7. The composition root — `main.tsx` (the registration door) + thin routes

**The registration door is `main.tsx` + `client/src/compose/`.** `main.tsx` is the boot half: it binds the
singletons (QueryClient → tRPC client → toast manager, minted once in `compose/app-singletons.ts`), binds
`notify`, installs the error-report hook, installs the production readiness signal from
`lib/app-ready-signal.ts` — the readiness module owns the one Promise/DOM marker, and
`globalThis.__orb.ready` imports that same Promise rather than forking state — reaches the dev
`agent-bridge.ts` observer only through the literal
`import.meta.env.DEV` dynamic `agent-handles/index.ts` door, stacks providers (`QueryClientProvider` →
`TRPCProvider` → `ToastProvider` → `AppErrorBoundary` → `RouterProvider`), and raises the `BootVeil`;
nothing imports `main.tsx` (`client-nothing-imports-main`). `compose/authed-app.tsx` is the composition
half: the one place feature definitions and contributors are imported and assembled
(`createRegistry`/`createContributorRegistry` call sites live in `main.tsx` or a `compose/` module — G8),
plus the registry-provider stack it wraps around the `/` route's `AppRoot`. This is critical for
one-directional flow: a contributor "registers" by being imported at the door, never by importing its
host feature.

**The door is two modules because assembling means importing every feature front door — the whole app,**
which would parse the whole feature graph before the login form paints for a client that has not
authenticated yet. `routes/router.tsx` mounts the `/` component via `lazyRouteComponent`, so the
assemblies and the feature graph under them are a separate chunk fetched during the route's load phase,
after `requireAuthed()` passes. `client-compose-door-only` (dep-cruiser — only `main.tsx`,
`routes/router.tsx`, and a `compose/` sibling may import `compose/`) and G8's one-assembly rule keep this
from becoming a backdoor. The singletons live in `compose/app-singletons.ts` because both halves need the
same QueryClient/tRPC client.

**The door's third job: the composition-tier dir modules (§3).** `main.tsx` installs the agent-bridge
implementations from `agent-nav/`, `agent-seed/`, `agent-rpg/` and `agent-plugin/`, handed to
`installAgentDebugHandle`; `client-composition-tier-door-only` makes `main.tsx` their only importer. This
assembly is dev-only and must stay out of the production boot chunk: `main.tsx` reaches it through `if (import.meta.env.DEV) { void import("./agent-handles/index.ts") … }`, so the bundler constant-folds the
case and the graph it pulls in leaves the production output. Adding a dev handle goes in `agent-handles/`,
never onto `main.tsx`'s static import list.

**`@orb/client` declares no `sideEffects` field.** An enumeration duty no gate enforces is a
silent-failure machine: a real import-for-effect module left off an allowlist gets silently dropped by
the bundler, and nothing catches it. The accepted cost is a wider boot chunk instead, bounded by
`BOOT_CHUNK_CEILING_BYTES` (`tooling/src/verify/ops/boot-chunk-ratchet.ts`). `@orb/kit` and
`@orb/contracts` are `"sideEffects": false`; `@orb/ui` is `"sideEffects": ["**/*.css"]` — each is a
leaf package with no import-for-effect module of its own, so the enumeration risk does not apply to
them.

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
unmount can drop it), `AriaAnnouncer`, the `?join=` token capture plus `JoinInviteDialog`, and
`FirstRunPersonaDialog`. G1's anti-god-map case: a `sections={{…}}`/`modals={{…}}` object-literal map in a
route file, or a feature front-door import in `routes/**` other than the two sanctioned composition seams
(`router.tsx` → `features/auth`, and `app-root.tsx`), is RED.

## 8. The settings host + pane registry

The settings host is a config-GROUP registry: `state/config-group-registry.ts`
(`ConfigGroupDefinition`, total over `CONFIG_GROUP_IDS` in `state/config-group-ids.ts`, four shelves
`CONFIG_SHELVES` = User · App · Collections · Extensions), host `features/config` (list + content, rail
foot). The body union is `sections | collection | placeholder`: every non-collection group is a `sections`
skimmer over the contribution seam in `state/config-section-registry.ts`, assembled at the door in
`compose/config-sections.ts` — the one section registry every group's LIST rows derive from (no `surface` case, no
group-owned `subcategories` — persona, plugins, connections, automation and backup surfaces decompose
into `ConfigSectionContribution`s, D120); the four collections are `collection` groups whose body is their
`CollectionContribution`. `openConfigTo(group, sub?, setting?)` (`state/config-nav-store.ts`) is the one
navigation verb. G4 is `config-group-completeness`.

`CONFIG_GROUP_IDS`/`ConfigGroupId` live in `state/config-group-ids.ts`, its own two-reader vocabulary
module (§5 rule 5); `ConfigGroupDefinition`, `SettingsViewerView` (the state-owned viewer projection `when`
consumes — plain derived values only, no `data/` import, §5 rule 6), `CONFIG_SHELVES` and
`SettingsSubcategory` home in `state/config-group-registry.ts`. The Context+hook/Provider pair mirrors
`modal-registry-context.ts`/`-provider.tsx`. The host computes `SettingsViewerView` from its non-suspense
`sessions.me` probe (§10's sanctioned non-suspense exception) and supplies it at nav/search/pane filter
time.

- The settings shell is a thin host: nav, fuzzy search and scroll-spy read `registry.get(active).body` —
  a category with no branch can no longer silently placeholder (G4 forces the explicit `{placeholder: true}`
  flag).
- **Features own their panes.** `features/user-admin` owns `admin`; `features/credentials` owns
  `connections`; `features/workloads` owns `workloads` and `backup` (backup/restore is the workloads +
  portability-serde export/import system, not a standalone feature); `features/persona` owns its pane.
  `features/config` owns `appearance` and `chat-behavior`, including the theme editor and picker.
  `features/tag` and `features/regex` are each a collection: they own a `*-collection.tsx`, not a pane
  (§3's collection case).
- The host imports no pane bodies — they arrive via the door assembly, so `client-features-no-cross`
  enforces the de-god split for free.
- `openConfigTo`'s `group` argument is typed against `CONFIG_GROUP_IDS`; tsc validates every deep-link call
  site against the tuple. `contextTab` stays an opaque `string` by design — §5 rule 5's vocabulary test
  separates a closed door-assembled cross-feature vocabulary from an open id one host interprets.

Add a settings group by exporting a `ConfigGroupDefinition` (a skimmer, nothing else) from the owning
feature's `lib/`, exporting one `ConfigSectionContribution` per anchored section, and registering both at
the door (`compose/authed-app.tsx`'s group registry, total over `CONFIG_GROUP_IDS`). Never add a surface
outside its owning feature's `lib/` or hand-stamp anchors outside the contribution seam — that is the
god-feature growth vector G4 exists to kill.

Split off [client-architecture-state-and-gates.md](client-architecture-state-and-gates.md) for the 48 KiB law cap (§9 state model through §16 the gate spec).
