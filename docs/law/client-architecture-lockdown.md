---
kind: law
status: active
updated: 2026-09-05
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

## 9. The state model (partitioned commons)

- **Partition, not scatter, is the anti-god move.** `state/` holds small stores, the three store factory
  doors (plus `create-drill-selection-store.ts`, itself minted through a gated door), `chat-handle.ts`,
  `assemble-chrome.ts` (D73), and the registry tier. Every total or contributor registry is countable off the
  door's `createRegistry(`/`createContributorRegistry(` call sites in `compose/authed-app.tsx`, which G8
  pins to `main.tsx` or a `compose/` module and nowhere else. A registry delivered through React context
  carries a `*-registry-context.ts` + `*-registry-provider.tsx` pair (minted via
  `lib/create-registry-context.tsx`, gate `registry-context-via-mint`); one whose Def type is state-owned
  adds the `*-registry.ts` contract module beside it. Every store is minted through exactly one of the
  three doors — bare zustand `create(`/`createStore(` exists only inside them: `createGatedStore`
  (devtools, required action labels, unique-name throw), `createPersistedStore` (version, partialize,
  total migrate), `createEntityDraftStore` (frozen empty, `useShallow`, persist). Gates: `state-files`,
  `persist-partialize-and-total-migrate`, `no-raw-zustand-persist`, both selector-stability guards, the
  ESLint static-`setState` ban, `persistence-boundary` (device-local vs synced).
- **`shell-store` is one drawer for cross-cutting shell state** (activeSection, panelOverrides, openModal,
  contextTab, openOverlayPanel) — features read via narrow hooks, write via intent-named module actions;
  the handle never escapes the file. `openConfigTo` (§8) is the one settings navigation verb.
- **Feature-transient stores are feature-owned but centrally homed** (`character-selection-store`,
  `corpus-selection-store`, …) so a pointer another feature must read is never trapped behind a feature
  boundary. Durability criterion: per-device transient state gets a store; anything that must survive
  across devices is server state.
- **The write/read discipline is §5.1** (writers only write; three render-only reader shapes;
  `no-effect-on-shared-selection` gates the banned subscribe-and-effect).

## 10. The data/ tier — the whole surface, not just the factories

- **`trpc.ts`** — the typed client + `useTRPC`; queryKeys are 100% proxy-derived (`no-array-literal-querykey`, LIVE).
- **`query-client.ts`** — the §6.1 QueryClient pins have ONE home here (verified header): `staleTime: Infinity` (the bus drives freshness — never `'static'`), `refetchOnReconnect: true` (SSE-gap catch-up), `refetchOnWindowFocus: false`, mutations `retry: 0`, global error toasts via `QueryCache`/`MutationCache` `onError` reading `meta.errorToast`. Do not re-tune these per-surface.
- **The HTTP-route fetch-fn pattern:** endpoints that are Hono routes, not tRPC (multipart/binary), get ONE `data/` fetch fn each — `upload-asset.ts` (the one client seam for persisting a picked file), `import-tree.ts` (folder import → `202 {workloadId}`), `import-bundle.ts`, `import-characters.ts`, sharing `http-error.ts` (`throwHttpError`) + the `CSRF_HEADER`. Rule: tRPC for everything except multipart/binary/streaming-HTTP; an HTTP route consumed anywhere gets a `data/` fetch fn — a feature never hand-writes `fetch()` (R5).
- **One canonical "who am I" composer** owns identity: it composes the already-cached `sessions.me` + settings + persona-list reads so every caller dedupes on the shared cache. A scattered `trpc.sessions.me` read for identity is the wrong move (the settings host's plain role read is the sanctioned exception class: a non-suspense probe that must never block its shell).
- **The rest:** `invalidation.ts` (§13.5) · `query-error-state.tsx` (§11) · `bus/` (§13) · `skeleton-rows.tsx` (shape-matched loading rows) · `use-gated-query.ts` (`skipToken` — kills `castId("")`).

### 10a. The three-class data contract + the durable-local contract (D138)

Every piece of client state is exactly one of three classes — the blunt "cross-feature → trpc" rule in
§12 is this contract's corollary, not a separate rule:

- **Server truth** lives ONLY in the query cache; freshness rides the buses (§13) + the mutation XOR +
  the gap-heals. Never persisted — a query-cache persister would be a second durable staleness layer, and
  is banned.
- **Client-ephemeral** state dies with the tab; needs no invalidation. Home: §12 row 1 (`state/*`).
- **Durable-local** state is device-scoped VIEW/DRAFT state and MUST satisfy the durable-local contract:
  1. **Per-user namespacing.** Every persisted key is `orb:u/<userId>/<name>` (drafts
     `orb-draft:u/<userId>/<name>`); `state/create-persisted-store.ts` mints against a boot pointer
     (`orb:active-user`) and `bindDurableLocalToUser(userId)` rebinds once the viewer resolves, adopting
     any legacy un-namespaced blob into the first bound user then deleting it. A genuine identity CHANGE
     keeps the existing hard-reload boundary; a merely STALE session recovers in place instead
     (`data/stale-session.ts`).
  2. **Referential integrity for any server row id a persisted field carries** — two pure-render rules
     (no effects; `no-effect-on-shared-selection` stays intact): an id unknown to its authority read is
     EXCLUDED from filtering (a dead reference can never veto rows), and an ACTIVE entry always renders
     its chip (named when resolvable, else an explicit "deleted" chip, clearable either way) — no
     auto-prune, no write-on-render.
  3. **Total migrate** (pre-existing law) stays; identity/referential validity are 1 and 2's job, not a
     smarter migrate.

Enforcer: `persistence-boundary` (raw-storage-outside-the-doors guard, §9) plus `state-files`/
`persist-partialize-and-total-migrate`. Design of record + the as-built deltas (why store rebind reads a
boot pointer rather than minting fresh, why legacy adoption goes through each store's own persist
storage): D138.

## 11. The error-handling battery + the three-states law

The stack, outermost-in:

1. **`AppErrorBoundary`** (`lib/error-boundary.tsx`) — the app-level render-throw catch. No retry (a stale state that threw once will throw again); fallback offers reload only. Wired once in `main.tsx` with `onError: reportClientError`.
2. **`reportClientError`** (`lib/client-error-report.ts`) — fire-and-forget telemetry via `trpcClient.clientError.mutate`; a failed report must never itself throw.
3. **`QueryBoundary`** (`components/query-boundary.tsx`) — the per-surface suspense + error battery. It bakes the `QueryErrorResetBoundary` → error-boundary `onReset` handshake: without it, "Try again" re-renders while the query is still errored and throws again; `retry` resets both so the refetch is real. Every suspending read mounts inside one.
4. **`QueryErrorState`** (`data/query-error-state.tsx`) — the one read-error block (muted label + Retry wired to the handshake's `retry`).
5. **Toasts** — mutation failures surface via `meta.errorToast` → the global `MutationCache.onError` → `notify`. One error slot per mutation (`no-multiplexed-mutation-error`).

**The three-states law:** every surface ships all three designed states — empty teaches (an `EmptyState`
with an action — `empty-state-has-action`), loading is a shape-matched skeleton (never a centered
spinner, never layout shift on arrival), error is `QueryErrorState` with a real retry.

## 12. Inter-feature communication — the channel matrix

The blunt rule "cross-feature reads → trpc" is wrong for client-ephemeral state (there is no row to fetch). This matrix is the law; each row carries its home and its enforcer. A `trpc.*` read is cache-first — TanStack Query dedupes and caches per key, so reading another feature's server entity (a persona's name while the persona list is loaded) is a cache hit, not a network round-trip; `staleTime: Infinity` plus the bus means it refetches only on invalidation. The anti-pattern is only using trpc for ephemeral client state, or a store for server rows.

Twelve rows, one per mechanism that exists on the tree, each with its home, its enforcer, and the one
question that selects it.

| # | Channel | Home | Enforced by | When it is the choice |
| - | - | - | - | - |
| 1 | state commons — narrow hooks + intent-named module actions | `state/*` | `state-files`, both selector guards, `no-effect-on-shared-selection`, `client-state-below-data` | client-ephemeral cross-cutting state: selection, panel modes, drafts, filters |
| 2 | tRPC query cache, cache-first | `trpc.*` queryOptions; `staleTime: Infinity` + bus freshness | `no-array-literal-querykey`, `no-static-staletime`, G9 seals | another feature's server-persisted entity — the router IS the cross-feature contract (D43(3)) |
| 2b | `peekQueryData` — hookless sync cache peek | `data/peek-query.ts` | its own header law + `client-cache-surgery-only-in-data` | a pure resolve-time predicate that cannot run a hook — never a substitute for a hook read |
| 2c | door-injected `trpcProxy` into a contributor factory | `main.tsx` `createTrpcProxy(trpcClient, queryClient)` | convention + the door's comments | a contributor whose `when`/resolve logic needs the cache outside render |
| 3 | total registries (closed vocabulary, tsc-total) | sections · modals · config-groups | G1/G2/G4/G8/G13 + the `Record<Id, Def>` assembly | a member of a closed shell vocabulary |
| 4 | contributor registries (open) | chrome · settings-sections · chat-context tabs · chat-context regions · chat-surface anchors · tool-renderers · message-tools-renderers · slash-commands · character-detail · home-tiles, assembled in `main.tsx` | G3 · G8 · the matching `*-registry-completeness` gate (settings-sections: `settings-section-anchored` + the door's `assertSettingsKeyPartition`) · duplicate-id throws at mint | a foreign feature extending a host surface — the graft channel |
| 5 | door-threaded render-prop projection | `makeCharactersSection(characterDetailContributors, (view) => …)` | `section-factory-contribution-bundle` (the arity wall: >1 render-prop or >1 `ContributorRegistry` param is RED) + `client-features-no-cross` | one foreign pane projected into a host, host controls placement; ≥2 foreign panes mint a contribution seam instead |
| 6 | shared derivations at tier 4 | a pure predicate/vocabulary module in `lib/` | `client-lib-floor`, `client-lib-below-components` | one pure predicate/vocabulary both sides must agree on |
| 7 | tier-2 composites | `components/` | G5 trio, G6/G7 | domain-aware UI ≥2 features need |
| 8 | event/sync spine → one invalidation seam | `data/bus/*` + `data/invalidation.ts` | `bus-producer-coverage`, G10/G11/G12, `no-inline-invalidate-outside-seam`, `bus-on-data-no-store-write` | server truth changed; freshness fan-out (§13) |
| 9 | editor-bridge | `forms/create-form-handle-bridge.ts` | intra-feature only, by its own header | a feature's own content ↔ its own context inspector — not an inter-feature channel |
| 10 | type-only cross-feature imports | `@orb/contracts` shapes | `client-features-no-cross`'s `dependencyTypesNot: ["type-only"]` | a shape wired at the composition root |
| 11 | readiness + agent observer split | `lib/app-ready-signal.ts` + dev-only `lib/agent-bridge.ts` and composition-tier handles (§3) | `agent-bridge-lock` + `client-composition-tier-door-only` | one shared readiness state; tooling never enters the production boot graph |
| 12 | session channel — typed cross-tab BroadcastChannel + Web Locks single-flight | `lib/session-channel.ts` (imports nothing above `#lib`) | `session-channel-boundary` | session lifecycle coordination across tabs/devices, or a durable-local rehydrate poke — never a server-truth payload |

Cross-section navigation is row 1; shared domain-agnostic parts are `@orb/ui` (§3), not a cross-feature
seam.

A cross-feature read never mirrors server rows into a store, never round-trips trpc for a client-ephemeral
pointer, and never bypasses a registry with a parallel map or a rogue event channel.

**The tier-4 bar for `lib/`** is "cross-cutting seam, reaches up to nothing": dev/observability modules
stay observer-shaped with zero feature imports; display/util seams and shared-vocabulary modules stay
pure. `client-lib-floor` plus G5's lib→components / components→features cases keep a disguised
feature-to-feature coupling from forming here.

## 13. The event/sync spine (multi-tab · multi-device · multi-human)

The same disease-class as the slot registries, highest stakes: a mis-wired or under-fanned event means two humans (or two of one person's devices) seeing different truth. Inventory — chat · user · notifications · rpg · automation, on three deliberate durability tiers:

| Bus | Scope | Durability | Producer gate |
| - | - | - | - |
| chat | per-chat, member-scoped | **durable-first**: `emit` awaits the `chat_events` INSERT (assigns `seq`) before the ring push; 256-entry ring + durable replay, member-gated; `on()` pre-buffers so the replay/live gap dedupes by `seq` | `bus-producer-coverage` |
| user | per-person, all devices | **live-only, fire-and-forget by design** — gap-heal = `invalidateAllUserRoots()` on every connect/reconnect | `bus-producer-coverage`; `connectionsChanged` is the one owner deferral, owned by `user-bus-deferred-member` |
| notifications | per-person durable inbox | **durable-first**: entry composes the INSERT before `publishNotification` | none (rides the inbox contract) |
| rpg | per-chat game state | **live-only, self-healing** — a domain-minted `EventEmitter` singleton; a verb publishes AFTER its durable write; the client blanket-invalidates on every (re)connect | `bus-producer-coverage` |
| automation | per-chat, over the `domain/automation` `notify` sink | **transient by design** — rides `defineBusChannel`; the `automation` room (`transport/trpc/stream/sources/automation.ts`) tails it rather than a standalone subscription | none |

Presence rides none of these buses: it is process-local, and single-replica is the current stance.

Every client-side apply is a pure switch ending `assertNever` or an exhaustive mapped-type Record — a new
member fails tsc. Plus `presence-registry.ts`: presence is a ref-count per userId over open SSE
connections plus a 15s grace window — server-derived, never a client-asserted heartbeat.

**The laws (each names its enforcer; gates in §16):**

1. **Durable-first, fan-out-second** for any bus carrying truth someone can miss: the durable INSERT assigns `seq` before the live publish; resume/replay reads the durable log. `tests/server/domain/chat/bus.int.test.ts` and `bus-golden.suite.int.test.ts` pin it.
2. **Fan scope follows visibility.** A shared-chat event fans to every present member's every device; a per-person event fans to all that person's connected devices. An event mutating state visible to others must fan beyond the actor. `server/src/entry/compose/emit-chat-changed.ts` derives its recipients from the live roster (present, kind `human`, not yet left) plus any pre-captured `extraUserIds` (a member removed in the same request) — never a non-member. Enforcers: G12 mechanically for membership-scoped domains; R3 for new visibility classes.
3. **Consumer exhaustiveness is compile-time.** Every bus union ends in `assertNever` or a mapped-type-total Record on the client.
4. **Producer coverage is ratcheted (D50/D108).** Every declared event type has a real server emit site; an owner deferral is typed warning-debt with a work item, and reds the day the member gains a producer.
5. **One client-side event→cache router.** `data/invalidation.ts` is the one seam for every client-consumed bus; a new bus's client half must land in this same file, and G11 checks it. `no-inline-invalidate-outside-seam` gates every other `.invalidateQueries`; `bus-on-data-no-store-write` keeps `onData` from becoming a second store.
6. **Presence is server-derived only.** A client-asserted presence write is banned — the contract declares no inbound presence schema. The read discloses one bit per asked user id through the single gating seam `transport/trpc/presence-disclosure.ts` — any authenticated caller may ask about any user id in v1, with no per-room membership filter; tightening the audience touches that file plus its one call site. A client read exists at `trpc.notifications.presence`.
7. **Server truth never rides BroadcastChannel (D138).** The session channel (§12 row 12) carries session lifecycle plus durable-local rehydration pokes only. Enforcer: `session-channel-boundary`.
8. **A delete announces after the row is gone.** Pick the order by the plane the event rides: live-only (run `DELETE … RETURNING` first, then emit once per returned row — an emit before a conditional delete can announce a row that survives); durable (write an event row that has an FK to the deleted row before the delete, because the cascade removes it); a junction the delete cascades or nulls (resolve the audience before the delete, then fan after — `entry/compose/room-reach.ts` gives this snapshot-then-fan op). Read any value the emit needs before the delete, and do not nest that read in a later branch the delete's own result can skip. Keep the fan unconditional over the returned rows. Homes: `packages/server/src/domain/chat/verbs/chat-lifecycle.ts`, `packages/server/src/domain/refinery/verbs/delete-session.ts`.

**The transport unification.** `chat-events-bus.ts`, `user-events-bus.ts`, `notifications-bus.ts` each
compose the one `defineBusChannel` primitive: `defineBusChannel<Key, Event>(channelFor, opts?: {
firehose: true })` (home `server/src/transport/trpc/bus-channel.ts`) rather than hand-rolling an
`EventEmitter`; durability stays per-bus policy composed in front of `publish`. The `{firehose: true}`
overload returns a bus with an extra `subscribeAll` — only chat declares it; calling it on user or
notifications is a compile error. G10 seals it: `new EventEmitter()` under `transport/` outside
`bus-channel.ts` is RED.

## 14. The reuse-primitive law — gate what §13 already says

- **Rows.** An entity-in-a-list row is `@orb/ui/list-row` or the tier-2 `LibraryRow` (the gate accepts both). In list-region surface files, a `.map()` callback returning interactive JSX not rooted in one of these or an allowlisted composite is RED (G6). Filename `*-row.tsx` is not the predicate — message anatomy, facet rows, and `setting-row`/`Field` rows are different species; residual anatomy judgment is R1.
- **Destructive confirms.** `ConfirmDialog` is the only feature-tier confirm. `features/**` importing `@orb/ui/alert-dialog` is RED (G7).
- **Mutations.** Importing `useMutation` from `@tanstack/react-query` outside `data/` is RED — a hard seal, no ratchet (G9).
- **Browse.** `createCollectionSurface` owns unbounded/paginated browse; `useInfiniteQuery` appears only inside the factory (G9). A small bounded owner list fetched whole in one `useSuspenseQuery` legally uses `LibrarySurfaceShell` + `LibraryListLayout` (tier 2) instead — the boundary is the query shape, paginated implies the factory.
- **Forms / virtualization / charts / markdown** — `form-factory-for-multifield`, `no-direct-useform`, `no-form-reset-in-autosave`, resolver physics, `ui-satellite-seals`.

## 15. Doc↔code precedence

Code is truth for shape; this doc is truth for the rule and the why. Every field list in §5/§6a/§6b/§8 is
illustrative, not exhaustive — read the current, complete shape off its code header:

| Shape | The law lives at |
| - | - |
| `SectionDefinition` · `RailEntry` · `SectionPlaceholderCopy` · `SectionPanelAvailability` | `client/src/state/section-registry.ts` |
| `ContextDefinition` · `ContextTabDef<S>` · `ResolvedContextTab(s)` · `ContextRegionDef<S>` · `ContextRegionView` · every published `S` projection | `client/src/lib/registry-contracts.ts` (path is critical — G3 case 3 resolves projections against it) |
| `ConfigGroupDefinition` · `SettingsViewerView` | `client/src/state/config-group-registry.ts` |

What is fixed law regardless of the sketch's exact fields: the non-generic shell seam, the
`defineContextTabs<S>` mint as the only tabs minter, `S` contravariant-only, and `{kind:"none"}` /
`{planned}` as explicit decisions rather than absences.

**The `.shell-panel-header` band clause.** "The band always renders" holds for the list panel and for a
`single`/`none` context panel. A `kind:"tabs"` context panel renders no shell band in any mode:
`SectionContextHeader` returns null and shell.css collapses the empty band element; the context bracket
owns the pane's head — its band slot (the section's `header` or a claimant's band), the 2px ember
content↔context binding it paints itself from the primary token, and, while the pane floats, its own
dismiss inside the band's corner.

## 16. THE GATE SPEC

The gate is the wall; prose is the why. Every ts-morph gate lands as a `tooling/src/verify/gates/*.ts`
descriptor (loader-discovered, `mustFlag`/`mustPass` self-tested per the house contract). Review-only rows
state why machine-checking fails and carry the exact checklist.

| # | Gate | Mechanism | RED condition |
| - | - | - | - |
| G1 | `section-registry-completeness` | ts-morph | a `SECTION_IDS` member with no `SectionDefinition` in the door assembly; a definition not co-located under a feature (`features/*/lib/*-section.*`); two definitions for one id; a planned case with an empty reason, or one that also wires a real body — any `context` initializer that is not the literal `{ kind: "none" }`, including a `defineContextTabs(…)` call, counts as a real body; an anti-god-map case (a `sections={{…}}`/`modals={{…}}` map in `routes/**`, or a feature front-door import outside the two sanctioned composition seams). |
| G2 | `no-parallel-section-map` | ts-morph | an object literal / `Record<Id, …>` type / array whose keys or `id` members cover ≥2 members of `SectionId`/`ModalSlotId`/`ConfigGroupId`, outside the allowlist {the vocabulary tuple file, the door assembly, definition files}. |
| G3 | `context-definition-shape` | ts-morph, incremental-safe | a hand-rolled tabs renderer outside `lib/registry-contracts.ts`; a zero-tab mint with no contributors; a `defineContextTabs`/`ContextTabDef<…>` type arg that is not `void` and not an identifier import-resolving to a type exported from `lib/registry-contracts.ts`; a resurrected `bodies: Record<string, ReactNode>` shape. Same gate for region claims: a hand-rolled region def outside `registry-contracts.ts`; a second `defineContextRegion(` call site; a feature painting shell chrome classes outside `app-shell/**`; a second writer of the `data-context-region` probe attribute. Declared blind spot: cases 5–8 read literal shapes, so a CT is the required second check. |
| G4 | `config-group-completeness` | ts-morph | a `CONFIG_GROUP_IDS` member with no registered group; a group definition not co-located with its owner, or a collection body outside `*-collection`; two defs for one id; the config host importing a feature's internals; a file stamping `configAnchorId` that no `ConfigSectionContribution` renders; a `{kind:"sections"}` pane that still declares its own `subcategories`. |
| G5 | `client-components-tier` | dep-cruiser, the rule set in `.dependency-cruiser.cjs` | `components/` → `features/`/`routes/`/`main.tsx`; `lib/` → `components/`; `state/` → `components/`. |
| G6 | `list-row-adoption` | ts-morph, both-ways allowlist ratchet | in a list-region surface file (one using `LibrarySurfaceShell`/`LibraryListLayout`/`createCollectionSurface`), a `.map()` callback or a `renderItem`/`renderRow` prop callback returning interactive JSX not rooted in `ListRow`/`LibraryRow`/an allowlisted composite. R1 is the judgment half (cards vs rows). |
| G7 | `confirm-uses-composite` | dep-cruiser | `from: features/**` `to: @orb/ui/alert-dialog` is RED. The composite (`ConfirmDialog`, tier-2 `components/`) lives outside features — no exemption. |
| G8 | `registry-assembly-at-door-only` | ts-morph | a `createRegistry(`/`createContributorRegistry(` call outside `main.tsx`/`compose/`; any mutating `register(` API existing at all. |
| G9 | `query-machine-seals` | ts-morph (import-specifier) | `useMutation` imported from `@tanstack/react-query` outside `data/`; `useInfiniteQuery` outside `data/create-collection-surface.ts`. |
| G10 | `bus-channel-primitive` | ts-morph | `new EventEmitter(` under `packages/server/src/transport/` outside `bus-channel.ts`. |
| G11 | `bus-definition-belts` | ts-morph | a `*_EVENT_TYPES` `satisfies Record<X["type"], true>` const in `@orb/contracts` with no matching coverage gate file, or no client-side total map in `data/invalidation.ts` — a new bus cannot ship missing the chat bus's guard set. |
| G12 | `membership-fan-guard` | ts-morph | under `domain/chat/**` (the membership-scoped domain list, registry-driven), a single-user emit identifier (`emitUserEvent`) — member-visible state rides the member-fan op (`emitChatChanged`) or the chat bus, never an actor-only channel. |
| G13 | `modal-registry-completeness` · `modal-body-not-placeholder` · `placeholder-copy-registry` | ts-morph | `modal-registry-completeness` mirrors G1: co-location (`features/*/lib/*-modal.tsx`), uniqueness, planned-case honesty, the singleton-placement case (one modal per `avatar`/`topbar-command`/`mobile-tab`), and the anti-god-map case. `modal-body-not-placeholder` reds a function-case `body` rendering a placeholder component instead of `{planned}`. `placeholder-copy-registry` reads `SectionDefinition.placeholder`. |
| G14 | `sanctioned-css-homes` | fs check (standalone `fsBacked` gate) | a repository-owned product `.css` file under `packages/**` outside the five CSS paths in §4, or any of the six homes (including the DTCG token source) missing. `playwright/index.css` is harness-owned, not a product home. |
| G15 | one-directional client tiers | dep-cruiser | `client-feature-front-door` · `client-features-no-cross` (type-only exempt) · `client-lib-floor` · `client-state-below-data` · `client-data-direction` · `client-forms-direction` · `client-features-below-routes` · `client-nothing-imports-main`. |
| G16 | compose, never paint | ESLint keystone | `className`/`style` on a raw intrinsic in `packages/client/src` (3 exact exemptions, §4). |
| G17 | token/value discipline | ts-morph | `no-color-literals` family · `no-arbitrary-tw-values` · `no-off-token-radius-shadow` · `no-off-token-inline-style` · `motion-token-purity`. |
| G18 | state discipline | ts-morph + eslint | `state-files` · `persist-partialize-and-total-migrate` · `no-raw-zustand-persist` · selector-stability pair · `no-effect-on-shared-selection` · static-`setState` ban · `persistence-boundary`. |
| G19 | data/query discipline | ts-morph | `no-array-literal-querykey` · `no-inline-invalidate-outside-seam` · `bus-on-data-no-store-write` · `no-fake-disabled-id` · `no-static-staletime` · `no-multiplexed-mutation-error`. |
| G20 | forms discipline | ts-morph | `form-factory-for-multifield` · `no-direct-useform` · `no-form-reset-in-autosave` · `no-form-state-in-useeffect`. |
| G21 | bus producer coverage | ts-morph | `bus-producer-coverage` — one policy quantified over every guarded bus union, with `user-bus-deferred-member` carrying the one owner deferral as typed warning debt. |
| G22 | structure/size/a11y | ts-morph | `client-structure` · `component-size` · `surface-a11y-focus` · `surface-in-a-container` · `no-raw-interactive-intrinsics` · `empty-state-has-action` · `no-interactive-role-in-features` · `test-presence-client`. |
| G23 | `feature-owns-definition` | fs check (standalone `fsBacked` gate) | a `packages/client/src/features/*` dir co-locating no registered definition (`lib/*-{section,modal,group,chrome}.tsx`) — a feature owns a rail section, a modal, a settings group, or a chrome widget, or it is deleted. No exemption exists — `notifications` owns a chrome def. |
| R1 | row/field anatomy choice (ListRow vs setting-row vs Field vs message anatomy) | review | Why ungateable: the correct primitive follows the value type and interaction shape, not a syntactic signature. Checklist: entity-in-a-collection → ListRow/LibraryRow · label+control settings line → setting-row · editable labeled input → Field · chat turn → the message-row-skin machine · a repeated interactive row in a list surface matching none of these → reject. |
| R2 | composite promotion (≥2-feature duplication → `components/`) | review + jscpd | Why ungateable: semantic near-duplicates (same anatomy, different fields) defeat textual clone detection; jscpd (tsx, 5%) is the tripwire, the hoist is judgment. Checklist: same anatomy in 2+ features and changing together → tier 2; 3+ repeats of wiring → tier 3 factory; a genuine one-off → leave. |
| R3 | fan-scope completeness for new multi-visibility features | review | Why ungateable in general: whether state is "visible to others" is a domain-semantic fact the AST can't derive outside the known membership domains (G12 covers chat mechanically). Checklist at contract review: who can see this state? every seer's channel gets the event (member-fan for rooms, per-person for owned) · durable-first if a miss diverges canon (else document the heal path) · the event type joins the union and coverage-deferred before the emit lands. |
| R4 | three-states completeness (§11) | review | Why ungateable fully: `empty-state-has-action` covers empty mechanically; loading shape-match and error-copy quality are visual judgments. Checklist: skeleton matches final shape (no layout shift) · error = `QueryErrorState` with real retry · empty names the next step. |
| R5 | HTTP fetch-fn discipline (§10) | ts-morph, gate `fetch-fn-in-features` | a client feature hand-writes a global `fetch(`. Checklist: multipart/binary → a `data/` fetch fn beside the existing four; everything else → tRPC. |
