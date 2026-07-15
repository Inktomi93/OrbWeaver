---
kind: spec
status: draft
updated: 2026-07-14
---

# Client Architecture Lockdown (ratified draft — pending promotion)

> **RATIFIED 2026-07-14 — all eight open decisions resolved by the owner; §18 records the rulings (O2 and O4 stay flagged as tracked follow-ups by explicit choice).** The doc is FINAL as a `proposed/` draft; the remaining step is promotion to `core/` + the D-ledger entry (M11). **§6b was refined POST-RATIFICATION by the M3 design pass (2026-07-14, owner-authorized): the `ContextDefinition<S>` generic became the `defineContextTabs<S>` mint over a non-generic `ContextDefinition` — the variance proof in §6b is why. O5's ruling (strict typing) is unchanged; only its MECHANISM moved to the mint. The M3 corrections in §15 were pulled forward so docs+code stay in lockstep for the M3 executor.** Precedence after promotion: D-ledger → the core `UI-*.md` set → this doc. It BUILDS ON standing law and never restates it: the Discord/region model + settings taxonomy are `UI-Architecture-and-Layout.md` §4.1–§4.3, the reuse primitives are `UI-Primitives-and-Reuse.md` §13, the enforcement families are `UI-Gates-and-Lessons.md` §8. Every code claim was verified against source 2026-07-14 (full-file reads + ast-grep/grep sweeps); where the commissioning brief disagreed with code, the CODE version is recorded, marked **\[CORRECTED]**.
>
> **Audience: a zero-context agent.** Every rule here is (a) spelled out — nothing implicit, (b) backed by a machine gate that goes RED on violation wherever gateable (§16 names each gate; prose is the WHY, the gate is the WALL), (c) demonstrated by a worked example where a mechanism is involved. Start at §1 (the decision table); read depth only for the row you hit.

**The one-sentence thesis:** composition drifted because a section/pane/tab was smeared across parallel static maps no gate forced to agree — the fix is ONE registry primitive, definitions co-located with their owning feature, exactly one assembly at the composition root, and a gate on every seam, so a half-registered section, a god-feature, a shadow map, a god-map route, or an under-fanned event is structurally impossible.

## 0. TL;DR — the non-negotiables (one screen)

1. **Five tiers, one direction:** `@orb/ui` → `components/` → `{data,forms,state}/` → `lib/` → `features/`; routes + `main.tsx` compose on top. A feature imports DOWN only; features never import each other at runtime (dep-cruiser).
2. **Features touch ZERO CSS.** No `className`/`style` on a raw intrinsic element anywhere in client src (ESLint, LIVE); no `.css` file in a feature (gate G14). Values come from DTCG tokens; skins from `@orb/ui` `variants.ts`; structural layout from `shell.css` — the one exception, because an animated grid-track layout engine is not a token (§4).
3. **One registry primitive, no static maps.** A section / settings pane / modal / contributor is ONE co-located definition, assembled ONCE at the composition root. A second `Record<SectionId, …>`-style map anywhere else is RED (G2). "Derive, don't re-declare."
4. **The `/` route is a thin mount.** No `sections={{…}}` god-map, no feature imports in a route body. `main.tsx` is the registration door — the ONLY place feature definitions/contributors are imported and assembled (G1/G8).
5. **Cross-feature needs have exactly one channel each** (§12): ephemeral client state → the `state/` commons; another feature's server data → `trpc.*` (cache-first — NOT a network round-trip when cached); shapes → contracts/type-only; composites → `components/`; navigation → store actions; a feature's own Content↔Context → its editor-bridge (INTRA-feature only). Anything else is a violation.
6. **Every mutation rides `createEntityMutation`; every paginated browse rides `createCollectionSurface`; every ≥3-field form rides a form factory; every destructive confirm rides `ConfirmDialog`** (G6/G7/G9 + LIVE form gates).
7. **Every suspending read sits in `QueryBoundary`; every surface ships designed empty/loading/error states** (§11). A bare spinner or an unhandled throw is a defect.
8. **Events:** shared-room truth rides the durable seq-stamped chat bus; per-person freshness rides the user bus; both are exhaustively applied and producer-ratcheted; the invalidation seam is the only client event→cache router (§13). A new bus without the full belt set is RED (G11).
9. **A green `pnpm check` proves structure, not logic** — but a RED one proves you broke a law above. Run it; read the FULL output.

## 1. IF YOU ARE ABOUT TO… (the cold-agent's first stop)

| You are about to build… | The ONE right move | NOT | Wall |
| - | - | - | - |
| a new rail section | a `SectionDefinition` in `features/<owner>/lib/`, exported on the front door, added to the `main.tsx` assembly (§6, example E1) | entries in rail/panel/placeholder/context maps + a route branch | G1/G2 + tsc |
| a rail section whose content ISN'T BUILT yet | a full `SectionDefinition` with `content: { planned: "<reason>" }` — the sanctioned PLANNED state (§6a; refinery is the founding member) | a rail entry with no registration; shipping half-wired | G1 |
| a settings pane | a `SettingsPaneDefinition` owned by YOUR feature, registered at the root (§8, example E2) | a surface inside `features/settings` + an if-ladder branch | G4 |
| a tab on the chat context panel from ANOTHER feature | a `ContextTabDef` contributor with a `when` predicate, registered in `main.tsx` (§6c, example E3) | importing `#features/chat`; editing the chat panel | G8 + `client-features-no-cross` |
| a modal | a `ModalDefinition` owned by your feature, registered at the root (§6d) | a body in app-shell's `MODAL_SLOTS` + a route override | G13 |
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
| a new domain event / bus | add to the union + types-const, emit durable-first, map in `invalidation.ts`, coverage-gate (§13, example E4) | an ad-hoc EventEmitter; an actor-only emit for shared state | G10/G11/G12 + LIVE ratchets |
| observing app-wide state for tooling | the `lib/agent-bridge.ts` observer model (QueryClient cache + DOM attrs) | importing features to introspect them | §12 row 8 |
| styling ANYTHING | a token (`tokens.json`) → a variant (`variants.ts`) → compose primitives; if it truly needs structural CSS it belongs in `shell.css` and is probably shell-tier work — STOP and flag | raw values; a new `.css` file; `className` on a `<div>` | ESLint keystone + token grits + G14 |
| a shared domain-aware composite (2+ features need it) | `components/` (tier 2) | copy-paste per feature; stuffing it into `@orb/ui` | R2 + `ui-cake` |
| a new client store | one of the 3 doors (`createGatedStore`/`createPersistedStore`/`createEntityDraftStore`) in `state/` | bare zustand `create()`; fields on an existing store past the cap | `state-files` + persist gates (LIVE) |

## 2. The failure analysis (what actually broke — code-verified)

Two mechanism failures, zero spec failures — §4.2/§13 law was right and ignored-by-structure:

1. **Composition lived in parallel static maps.** A rail section is smeared across SIX structures: `SECTION_IDS` (`state/shell-store.ts:12`), `RAIL_SECTIONS` + `SECTION_PANEL_DEFAULTS` (`features/app-shell/lib/rail-slots.ts:51,88`), `CONTEXT_SLOTS` (partial — `lib/context-slots.ts:18`), `SECTION_PLACEHOLDER_COPY` (`lib/section-placeholder-copy.ts:14`), and the `sections={{…}}` map in `routes/home-page.tsx:260`. Only the total `Record`s are tsc-forced; `CONTEXT_SLOTS` and the route map are `Partial` — so **`refinery` half-exists** (rail entry + defaults + copy; no context tabs, no route body, no `features/refinery/` dir) and nothing is RED.
2. **The settings shell is a hand-if-ladder over a god-feature.** `features/settings/` holds 86 files spanning nine domains (admin · appearance · backup · connections/credentials · persona · regex · system · tags · theme · workloads); `SettingsPane` (`settings-shell-surface.tsx:335`) maps category→surface by if-ladder, so a `built: true` category missing a branch silently renders the placeholder — the settings twin of the refinery bug. Four feature dirs are `.gitkeep` stubs (`credentials` · `prompt-manager` · `user-admin` · `workloads`) whose UI lives inside settings.

Slot census (verified): 5 shell registries in 3 incompatible shapes (discriminated-union array · total `Record` · partial `Record`) + one SHADOW — `YOU_MODAL_ROWS` (`you-sheet.tsx:22`) re-declares rows `RAIL_ACTIONS`/`ACCOUNT_ACTION` own. CONTEXT has four incompatible wirings: registry-tabs (characters/presets/corpus/analytics via `ContextTabsPanel`), chat's bespoke internal `<Tabs>`, worldInfo's single direct body, refinery's nothing. Only RAIL↔MODAL has a bijection gate (`registry-pairing`); `ContextTabsPanel` fail-softs a missing body to "Nothing to show here." with no gate. `ROLE_SLOTS` (`settings/lib/connections-model.ts:63`) is a connection-domain namesake, not shell anatomy.

**\[CORRECTED] — three brief claims the code refutes:**

- *"The paint rule is ungated."* FALSE — the compose-only keystone is LIVE ESLint (`eslint.config.js:87-100,370-400`), covering ALL of `packages/client/src`, three exact exemptions (§4).
- *"16 bespoke mutation hooks bypass `createEntityMutation`."* STALE — all 16 `use-*-mutations.ts` import the factory; a features-wide sweep finds ZERO raw `useMutation(` call sites (2026-07-13 consolidation).
- *"12 raw AlertDialog / 13-of-18 hand-rolled rows."* PARTIALLY STALE — raw `@orb/ui/alert-dialog` importers in features are FIVE (`chat/anchors/character-gallery-dialog.tsx`, `settings/components/{admin-user-sessions-dialog,credential-key-row,workload-row}.tsx`, `world-info/components/entry-editor.tsx`), all destructive confirms bypassing `ConfirmDialog`. Of 18 `*-row.tsx` files 9 import `ListRow`/`#components` — and 4+ of the other 9 are NOT drift (message/facet/setting rows are different anatomy). Filename is the wrong gate predicate (§14).

## 3. The five-tier reuse ladder (the canonical client layering)

The client is FIVE tiers, not "ui + features". A builder reaches DOWN this ladder before hand-rolling anything; each tier names its enforcer. `packages/client/src/components/` is hereby canonized as tier 2 — it exists (`confirm-dialog` · `row-actions-menu` · `library-row` · `library-surface` · `entry-list-editor` · `character-picker` · `regex-editor-dialog`; barrel `components/index.ts`), and the 2026-07-13 consolidation proved the need: 13 hand-rolled rows and 12 raw confirms accumulated while these composites sat unbuilt.

| Tier | Home | What belongs | May import | Enforcer |
| - | - | - | - | - |
| 1 primitives | `@orb/ui` | domain-AGNOSTIC parts (Button, ListRow, Dialog, setting-row) | kit + sealed satellites | resolver physics + `ui-cake` + `ui-satellite-seals` (LIVE) |
| 2 composites | `client/src/components/` | domain-AWARE cross-feature composites with no single feature owner (ConfirmDialog, LibraryRow, CharacterPicker) | ui · kit · contracts · `#data` · `#forms` · `#state` · `#lib` · siblings — NEVER `features/`/`routes/` | **NEW dep-cruiser `client-components-tier` (G5)** — today `components/` has NO tier rule (verified: the `.dependency-cruiser.cjs` client block names only lib/state/data/forms/features/routes/main) |
| 3 factories/seams | `client/src/{data,forms,state}/` | the wiring machines: `createEntityMutation`, `createCollectionSurface`, `QueryBoundary`, form factories, the invalidation seam, the state commons + 3 store doors | per the existing direction rules | `client-data-direction` · `client-forms-direction` · `client-state-below-data` (LIVE) |
| 4 util floor | `client/src/lib/` | cross-cutting display/util seams (time, notify, test-ids, weave-glyph, message-render, message-role-labels, theme-override-form, agent-bridge) + the NEW registry primitive | ui/kit/contracts only — reaches UP to nothing in-client | `client-lib-floor` (LIVE; extend to forbid lib→components, G5) |
| 5 features | `client/src/features/` | the slices (per-slice shape: `features/README.md` — surfaces/anchors/components/hooks/lib/index.ts); compose tiers 1–4, never each other | everything below + type-only cross-feature | `client-features-no-cross` · `client-feature-front-door` (LIVE; verified zero live cross-feature imports) |

Above the tiers: `routes/` composes features (never the reverse — `client-features-below-routes`, LIVE) and `main.tsx` is the top nothing imports (`client-nothing-imports-main`, LIVE). Their jobs are §7.

**Tier-placement rule:** a domain-aware composite needed by ≥2 features belongs in `components/`, never duplicated per-feature — §13.0's bar (3+ AND changing together) decides *when* to hoist; two features sharing decides *where* (tier 2, not a feature, not `@orb/ui` — ui stays parts-only per the `components/index.ts` header ruling). `jscpd` (tsx scanned, 5% threshold) is the standing tripwire; the hoist itself is review R2.

**What IS a feature (guidance under O2 — intent stated, gate deferred):** a feature dir earns its existence by owning ≥1 registered definition — a rail section, a settings pane, or a contributor. Empty `.gitkeep` stubs should resolve to one of those or be deleted. This is GUIDANCE, not a gate, by owner ruling (§18 O2): the hard "empty dir = RED" form is deferred until core lands and the policy can be re-judged.

## 4. The paint law — who may write CSS, and WHY

**The default for every visual value is a DTCG token; the default for every skin is a `tv()` variant; features write NEITHER CSS nor raw values.** The full sanctioned-CSS-homes list — anything not on it is RED:

| Home | What it is | Hand-written? |
| - | - | - |
| `packages/ui/src/tokens/tokens.json` | THE value source (DTCG). Edit → `pnpm --filter @orb/ui tokens:build` regenerates | yes (the source) |
| `packages/ui/src/styles/theme.css` | the generated Tailwind `@theme` — DO NOT EDIT | NO — generated, freshness-test-enforced |
| `packages/ui/src/styles/globals.css` | ui's one CSS entry: imports tailwind + theme.css + the deliberately-UNLAYERED floors (reduced-motion floor, resets) | yes (floors only) |
| `packages/ui/src/**/variants.ts` | component skins — `tv()` over token utilities; the ONLY styling-variation path | yes (token classes only — the grit gates cover ui too, D43) |
| `packages/client/src/styles/globals.css` | the client's single stylesheet: imports ui's CSS entry + the document-level shell defers (html/body `overflow: clip`, dvh, Base UI stacking, glass/contrast media rules) | yes |
| `packages/client/src/features/app-shell/surfaces/shell.css` | **the structural layout machine** (below) | yes — the ONE feature-tier file |

**WHY shell.css is the exception (the owner ruling, verified against the file):** it is a LAYOUT ENGINE, not skinnable values — `grid-template-columns: var(--rail-w) var(--list-track) minmax(0,1fr) var(--context-track)` with `transition: grid-template-columns var(--shell-motion) var(--shell-ease)` (an ANIMATED dynamic-track grid), the collapse/overlay zero-width track math, the co-motion vars `--shell-motion`/`--shell-ease` (grid + panel slide + dismiss scrim MUST share one duration/curve or they shear — `shell.css:12-13,18,249,341,394`), the mobile single-column collapse (`:361`), specificity-ordered elevation ramps. DTCG tokens express VALUES, not an animated-grid layout engine — and shell.css CONSUMES tokens for every value it uses (`--dimension-rail`, `--motion-base`, `--ease-out-expo` are all DTCG; `motion-token-purity` gates raw durations/easings in it). So the law is: **tokens are the default for all values; shell.css is the one structural exception; variants.ts skins components; features touch zero CSS.** When a feature "needs something special," it is almost always a missing token (→ `tokens.json`) or a missing primitive/variant (→ `@orb/ui`) — the gates push it there.

**RECONCILIATION (north-star §0 rule 2):** "hand-written CSS is legal in exactly ONE file: shell.css" is correct read as *feature-tier* CSS — `client/styles/globals.css` and ui's `globals.css` are real hand-written files at the styles tier, and `theme.css` is generated. This doc's table is the precise form; amend the north-star phrasing on promotion. `features/settings/surfaces/settings-shell.css` exists today — a violation of the one-feature-file rule; it dissolves with the settings de-god (M6) and gate G14 then bans the class.

**Enforcement, all layers (mostly LIVE):** the ESLint compose-only keystone — `className`/`style` on a raw intrinsic element is an error across ALL of `packages/client/src` (routes/data/forms/state/lib/features), three exact exemptions: `features/app-shell/**` (the shell-tier painter), `state/**` (store-internal setState re-list mechanics), `lib/weave-glyph.tsx` (the one lib painter, exact path). `className` ON an `@orb/ui` primitive is legal (capital tags don't match; `cn(variants, className)` merges caller-last per §13.7) and the token gates constrain its VALUES (`no-color-literals` family, `no-arbitrary-tw-values`, `no-off-token-radius-shadow`, `no-off-token-inline-style`, `motion-token-purity` — LIVE). NEW: G14 bans `.css` files under `features/**` outside the shell.css allowlist. **\[CORRECTED]** the brief's "no paint gate exists" was false; this section records the enforcement so it can't be mis-believed again.

**Auto-overlay is REAL committed behavior (ratified O6 — build to the law, never amend the law down):** UI-Arch §4.1's "docked panels auto-`overlay` below a width breakpoint (the one app-shell `@media`)" is BUILT at M10 — the shell gains the desktop auto-overlay: a docked side panel auto-collapses to `overlay` when the viewport drops below the breakpoint, restoring on re-widen, with the persisted user override still winning inside each regime. The breakpoint lives in `shell.css`/`use-shell-layout` (shell tier — the sole legal viewport-`@media` site, §4b axis 2); the mobile `mobileSheet` model is the SEPARATE, narrower regime below it and is unchanged.

## 5. The registry primitive — ONE mechanism, three applications

**`createRegistry<Id, Def>` (NEW, home `client/src/lib/registry.ts`)** replaces every parallel static map:

```ts
/** Total, closed, validated at construction. Throws on unknown-id get. */
function createRegistry<Id extends string, Def>(
  name: string,
  ids: readonly Id[], // the vocabulary tuple, imported from its ONE home
  definitions: Record<Id, Def>, // TOTAL by tsc — a missing/extra member is a compile error
): Registry<Id, Def>; // read-only: get(id) · list() (ids order) · has(id)

/** Open-ended contributor list (no fixed vocabulary) — the cross-feature extension seam. */
function createContributorRegistry<Def extends { id: string }>(
  name: string,
  contributions: readonly Def[], // duplicate ids THROW at construction
): ContributorRegistry<Def>;
```

Binding rules (each is a §16 gate or tsc):

1. **No side-effect registration.** A definition is an exported VALUE on its feature's front door; the composition root imports and assembles. A mutating `register()` API is banned — import-order nondeterminism and hidden tree-shaking hazards are exactly how a zero-context model "registers" by accident.
2. **Exactly one assembly per registry, at the registration door (§7)** — `createRegistry(`/`createContributorRegistry(` call sites anywhere else are RED (G8).
3. **Completeness is tsc.** The `Record<Id, Def>` assembly is total over the vocabulary tuple — adding a `SECTION_IDS` member fails compile until a definition is registered. The gate half (G1) adds what tsc can't see: co-location and uniqueness.
4. **The anti-hardcode law:** a keyed static map covering the id space outside {the vocabulary tuple, definition files, the one assembly} is RED (G2). This kills the next `SECTION_PANEL_DEFAULTS` and the next `YOU_MODAL_ROWS` before it ships. Derive, don't re-declare — `MOBILE_PRIMARY_SECTIONS` already derives from `RAIL_SECTIONS`; that shape is the standard.
5. **Vocabulary tuples keep their one home:** `SECTION_IDS`/`MODAL_SLOT_IDS`/`PanelMode` stay in `state/shell-store.ts` (state owns the shell vocabulary so features import from state, never the reverse — that file's own header law; `client-state-below-data` makes the reverse impossible). Registries CHECK against the tuple; they never re-spell it.

Applications: sections (§6) · settings panes (§8) · contributors (§6c) · modals (§6d). Recursion is the point — the shell hosts sections, settings hosts panes, the chat lane hosts contributors — all the same primitive, all completeness-checked, zero god-maps.

## 6. The section model

### 6a. SectionDefinition (absorbs six structures)

```ts
interface SectionDefinition {
  readonly id: SectionId;
  /** RAIL_SECTIONS entry: label · icon · group ("primary"|"authoring"|"insight") · mobilePrimary? */
  readonly rail: RailEntry;
  /** SECTION_PANEL_DEFAULTS entry — the boot default; the persisted per-panel override wins. */
  readonly panelDefaults: Record<PanelName, PanelMode>;
  /** SECTION_PLACEHOLDER_COPY entry — distinct (title, description), gate-checked. */
  readonly placeholder: SectionPlaceholderCopy;
  readonly list?: () => ReactNode;
  /** REQUIRED — a real content pane, or the DECLARED-PLANNED arm (below). A section with neither
   *  is structurally impossible (the refinery bug). */
  readonly content: (() => ReactNode) | { readonly planned: string };
  readonly header?: () => ReactNode;
  /** REQUIRED — `{kind:"none"}` is an explicit decision, never an absence. */
  readonly context: ContextDefinition;
}
```

- One definition per section, co-located `features/<owner>/lib/<id>-section.ts`, exported on the front door. Section-id↔feature-name is NOT a mechanical mirror (`corpus`→`features/discovery`, `analytics`→`features/stats`, `chats`→`features/chat`) — ownership is declared by WHERE the definition lives; G1 keys on location, never name derivation.
- Definitions are self-contained: they read `#state` (selection pointers), `#data` (trpc/Query, `useInvalidation`), `#components`/`@orb/ui` directly. Verified feasible: today's `home-page.tsx` prop-closures are \~all wrappers over `#state` module actions (`selectChat`, `goToLanding`, `startNewChat`, `openModal`) the owning feature may call itself (§5.1's writer rule); `multiHumanCapable` is a trpc read any feature can make cache-first.
- `AppShell` stays domain-agnostic: it consumes the registry (`sections.get(active)`) instead of a `Partial<Record<…>>` prop; `<Activity>` pane-keeping (`section-content.tsx`) and `useShellLayout` are untouched — `panelDefaults` merely arrives from the registry.
- **`SectionDefinition` is NON-generic (final, post-M3).** The M1.cutover shipped it as `SectionDefinition<S=void>` erased to `<never>` at the door (`state/section-registry-context.ts`) — a scaffold for a consumer that computed `S` off the registry. M3's §6b mint makes `context` a `ContextDefinition` that has already applied `S` (S never crosses the shell seam), so the generic and the whole `<never>` apparatus are DELETED: `SectionDefinition` drops its type param, `SectionRegistry` becomes `Registry<SectionId, SectionDefinition>`, and `main.tsx`'s `<…, SectionDefinition<never>>` annotation is gone. `lib/registry.ts` is untouched.

**The PLANNED state (ratified O1 — refinery is the founding member).** A real, planned-but-unbuilt section registers FULLY with `content: { planned: "<the tracked reason>" }` — the shell renders the definition's own `placeholder` copy for its CONTENT. The state is deliberately narrow, and G1 holds all four walls:

1. the `planned` reason is a non-empty string (the tracked citation — the bus-coverage DEFERRED discipline applied to sections);
2. a planned section is FULLY placeholder: no `list`, no `header`, `context: { kind: "none" }` — a "planned" section that also wires real bodies is the refinery bug wearing a badge, RED;
3. the exemption is SELF-CLEANING BY CONSTRUCTION, stronger than a ratchet: the planned marker and the real body are the SAME field, so building the section forces deleting the marker in the same edit — a stale exemption is unrepresentable, not merely detected;
4. what stays RED is the truly-half-wired legacy shape: a rail-visible section with no registration at all.

So a section id is always in exactly one honest state — FULL, DECLARED-PLANNED (with a reason), or ABSENT from the tuple — and limbo is unspellable.

**E1 — worked example: register a section (the RIGHT way).**

```ts
// features/discovery/lib/corpus-section.tsx  (co-located with its owner)
export const corpusSection: SectionDefinition = {
  id: "corpus",
  rail: { label: "Corpus", icon: Library, group: "primary", mobilePrimary: true },
  panelDefaults: { list: "docked", context: "collapsed" },
  placeholder: { title: "Corpus", description: "Search across every thread…" },
  list: () => <CorpusListAnchor><CorpusListSurface /></CorpusListAnchor>,
  content: () => <CorpusContent />, // reads its own selection store internally
  context: { kind: "tabs", tabs: CORPUS_CONTEXT_TABS }, // id+label+body per tab, §6b
};
// features/refinery/lib/refinery-section.ts — the founding PLANNED member (O1)
export const refinerySection: SectionDefinition = {
  id: "refinery",
  rail: { label: "Refinery", icon: FlaskConical, group: "authoring" },
  panelDefaults: { list: "collapsed", context: "collapsed" },
  placeholder: { title: "Refinery", description: "Score → rewrite → analyze a character card…" },
  content: { planned: "refinery design set parked in proposed/ — owner keeps the section; build pending" },
  context: { kind: "none" },
};
// main.tsx (the registration door, §7) — the ONE assembly; total over SECTION_IDS (tsc)
const sections = createRegistry("sections", SECTION_IDS, {
  chats: chatsSection, characters: charactersSection, corpus: corpusSection,
  worldInfo: worldInfoSection, presets: presetsSection,
  refinery: refinerySection, analytics: analyticsSection,
});
```

The WRONG way it replaces: adding a `RAIL_SECTIONS` entry + a `SECTION_PANEL_DEFAULTS` key + a `SECTION_PLACEHOLDER_COPY` key + a `CONTEXT_SLOTS` key + a `sections={{…}}` branch in a route — five files, four of which you can forget (refinery forgot two and shipped).

### 6b. ContextDefinition — the `defineContextTabs<S>` mint (STRICTLY typed — ratified O5, refined by the M3 design pass)

`S` (a section's context-state projection) appears ONLY in contravariant positions (`when: (s:S)=>bool`, `body: (s:S)=>ReactNode`) — which is exactly why `SectionDefinition<S>` erased cleanly to `<never>`. But CONSUMING a tab means PRODUCING an `S` and calling `body(s)`. Any channel that hands `S` to the blind shell — a `useContextState: () => S` hook, a render-prop — is a COVARIANT position: `() => ChatContextState` is NOT assignable to `() => never`, so it BREAKS the never-erasure. TS has no existentials; a `SectionDefinition<never>` registry can NEVER type-safely round-trip `S`. **So don't round-trip it.** Pair `S` with its consumer INSIDE the definition file (where `S` is a real named type) via a mint that returns a NON-generic `ContextDefinition` carrying an ALREADY-RESOLVED `useResolved` hook. `S` never crosses the shell seam.

```ts
// lib/registry-contracts.ts (tier 4 — the mint lives WITH its shapes)
/** S = the host section's OWN context-state projection — a real named type, never any/unknown (O5). */
interface ContextTabDef<S> {
  readonly id: string;
  readonly label: string;
  /** Absent = always visible. THE dynamic axis — subsumes chat's isHost/group/members conditionals. */
  readonly when?: (state: S) => boolean;
  readonly body: (state: S) => ReactNode;
}

/** What the shell renders — S already applied. NON-generic: the host closed over its own projection. */
interface ResolvedContextTab {
  readonly id: string;
  readonly label: string;
  readonly node: ReactNode;
}
interface ResolvedContextTabs {
  readonly tabs: readonly ResolvedContextTab[]; // when-filtered, own tabs then contributors, declared order
  readonly actions?: ReactNode; // strip-trail actions, already state-bound
}

type ContextDefinition = // ← NON-generic — S never appears here
  | { readonly kind: "none" }
  | { readonly kind: "single"; readonly body: () => ReactNode }
  | { readonly kind: "tabs";
      /** A React hook, minted ONLY by defineContextTabs (G3 wall). null = nothing selected → the shell
       *  placeholder. May suspend. */
      readonly useResolved: () => ResolvedContextTabs | null };

interface ContextTabsSpec<S> {
  /** A module-level named `use*` fn (rules-of-hooks lint must see it); may suspend; null = no selection. */
  readonly useContextState: () => S | null;
  readonly tabs: readonly ContextTabDef<S>[];
  readonly actions?: (state: S) => ReactNode;
  /** §6c — injected at the door (M8); merged after own tabs at the mint, same `when` gating. */
  readonly contributors?: ContributorRegistry<ContextTabDef<S>>;
}

/** THE mint. Throws at construction on a duplicate tab id (own ∪ contributors). `useResolved` is a named
 *  hook closure over `spec`: read `useContextState()`, return null on null state, else `resolveContextTabs`. */
function defineContextTabs<S>(spec: ContextTabsSpec<S>): ContextDefinition;
```

- **Why this is the ONLY viable shape.** It is simultaneously STRICT (O5 — `S` is spelled ONCE, at the mint call, checked against the published projection), ERASURE-FREE (`S` is confined to the pure parametric `resolveContextTabs<S>(spec, state)`, which only pipes `useContextState`'s output into the same spec's `when`/`body`/`actions` — the correlation is carried by the object, re-established generically, ZERO casts), CONTRIBUTOR-TYPED (the spec's `contributors: ContributorRegistry<ContextTabDef<S>>` typechecks against the host's `S` — a contributor reading a field the projection lacks is a compile error), and BLIND AT THE SHELL (the shell only ever sees the non-generic `ContextDefinition`). The alternatives all fail one axis: a consumer-side cast (`registry.get("chats").context as ContextDefinition<ChatContextState>`) is a lie tsc can't check; a typed per-key `get` accessor is sound but needs an id→S type map + a per-id switch + per-section projection recipes IN app-shell (the smear re-forming). See §15.
- Tab id + label + `when` + body are ONE object — the `CONTEXT_SLOTS`↔`bodies` split (registry in app-shell, bodies route-injected, missing body fail-softs to "Nothing to show here.") dies structurally; no bijection gate needed where no bijection can break.
- `when` generalizes `chat-context-panel-surface.tsx`'s proven conditionals (`showMembers` floor-gated, `showGroup`/`preview` host-only); the `resolveActiveTab` posture survives inside `ContextTabsPanel`: active = the store's `contextTab` if visible, else the FIRST VISIBLE tab — never nothing. **The Members-default is encoded by tab ORDER** (members declared first → the generic resolve reproduces `showMembers ? "members" : "overrides"` exactly); there is NO default-tab config field, and none should be added.
- Kills all four wirings: chats = `tabs` (a PHASE-UNION `S`, §6c/§15); characters/presets/corpus/analytics = static `tabs`; worldInfo = `single`; refinery = `none` (declared-planned, §6a). `ContextTabsPanel` becomes the one renderer for every `kind:"tabs"` section including chat (M3).

### 6c. The contributor seam (rpg/crew/expressions extending chat WITHOUT importing it)

The design docs' `CHAT_CONTEXT_SLOTS`/`CHAT_SURFACE_SLOTS` become two contributor registries — GENERALIZE-THE-BESPOKE (the mechanism is 6b's `when`, which chat already proves), not greenfield:

- **Context-tab contributors:** `features/rpg` exports a `ContextTabDef<ChatContextState>`; `main.tsx` assembles `createContributorRegistry("chat-context", [rpgContextTab, crewContextTab])` and passes it into the chat section definition, which flows it straight into `defineContextTabs`'s `contributors` (merged after own tabs at the mint, same `when` gating). rpg never imports chat; chat never imports rpg; the door imports both — one-directional flow holds (`client-features-no-cross` keeps enforcing it).
- **The `contributors` arm is a REAL typed seam at M3, not a stub.** `chatsSection` is authored as a FACTORY `makeChatsSection(chatContextContributors: ContributorRegistry<ContextTabDef<ChatContextState>>): SectionDefinition` (M3); `main.tsx` builds `createContributorRegistry("chat-context", [])` (an EMPTY-but-typed registry) and passes it in. The mint accepts and merges it (over an empty list = a no-op), so the full type path — door → factory → mint → resolve → render — is COMPILED and EXERCISED at M3 with zero contributions. M8 only ADDS array members; it builds NO new shape. A CT proving a fake contributor renders + `when`-gates is the M8 acceptance (per §17 M8), against a seam that already exists.
- **Surface-anchor contributors:** `interface ChatSurfaceContribution { id; anchor: "thread-flank" | "above-composer" | "message-footer"; when?; body }` — same mechanism, consumed by the chat CONTENT surface at named anchor points; the anchor vocabulary is a closed tuple, so an unlisted anchor is unspellable.
- Contributor contract types (including each host's published context-state projection, per O5) home in `client/src/lib/registry-contracts.ts` (tier 4 — importable by chat AND contributors without either importing the other; may import `@orb/contracts` types).

**E3 — worked example: contribute a chat context tab.**

```ts
// features/rpg/lib/rpg-context-tab.tsx — rpg imports NOTHING from features/chat
export const rpgContextTab: ContextTabDef<ChatContextState> = {
  id: "game",
  label: "Game",
  when: (s) => s.game !== null, // appears only when this chat has an active game
  body: (s) => <RpgHudTab chatId={s.chatId} />,
};
// main.tsx — the door registers it; chat's definition consumes the registry blind
const chatContextContributors = createContributorRegistry("chat-context", [rpgContextTab]);
```

The WRONG way it replaces: `import { ChatContextPanel } from "#features/chat"` (dep-cruiser RED — runtime cross-feature) or editing chat's panel per graft (the closed-feature wall the rpg/crew designs hit).

### 6d. The modal registry (same move)

`MODAL_SLOTS` is today a two-layer indirection: a total registry of `placeholder: true` bodies in app-shell, overridden per-route via `AppShellProps.modals` (all six live bodies — settings/theme/newChat/command/account/you — ride the override). Under the lockdown a `ModalDefinition` `{ id, title, presentation?, size?, body }` registers feature-owned bodies at the door (chat owns `newChat` + `command`, auth owns `account`, settings owns `settings` + `theme`, app-shell owns `you`); the override layer is deleted. `registry-pairing` (trigger↔body bijection) and `modal-body-not-placeholder` survive re-pointed at the new shape (G13). `YOU_MODAL_ROWS` derives from the modal registry — the shadow dies.

## 7. The composition root — `main.tsx` (the registration door) + thin routes

**`main.tsx` is the registration door.** It already constructs the singletons ONCE (QueryClient → tRPC client → toast manager, verified `main.tsx:1-90`), binds `notify`, installs the error-report hook, installs the agent-bridge observer (`installAppReadySignal` + dev `installAgentDebugHandle`), stacks providers (`QueryClientProvider` → `TRPCProvider` → `ToastProvider` → `AppErrorBoundary` → `RouterProvider`), and nothing imports it (`client-nothing-imports-main`, LIVE). The lockdown adds its second job: **the ONE place feature definitions and contributors are imported and assembled** (`createRegistry`/`createContributorRegistry` call sites live here or in a `compose/` module only it imports — G8). This is load-bearing for one-directional flow: a contributor "registers" by being IMPORTED AT THE DOOR, never by importing its host feature — a zero-context model that tries `import "#features/chat"` from rpg hits dep-cruiser RED; the door is the only legal path.

**Routes are thin mounts.** `routes/` = `router.tsx` (hand-written 2-route tree — `/` + `/login`, no file-based codegen; `beforeLoad` auth gates from `features/auth`; D54), `__root.tsx` (root route + NotFound + the recorded router-context upgrade path), `route-pending.tsx`, `login-page.tsx`, and the `/` route component. "Routes compose features, never the reverse" is LIVE (`client-features-below-routes`).

**\[CORRECTED — the owner ruling] `home-page.tsx` is a misnomer and a god-map.** Verified: it is not a home page — it is the `/` route that mounts `<AppShell>` and imports **63 feature symbols across 11 features** to hand-assemble the `sections={{…}}`/`modals={{…}}` maps. Three truths to encode: (a) **`AppShell` (the 4-region frame) IS the top structural component** — the mental model "shell on top, everything renders inside it" is correct; (b) **there is NO "home page" concept** — the no-selection landing is the CHATS section's CONTENT-none-selected state (`{kind:"landing"}`, D62 P4), a SECTION state, not a page; (c) under the registry inversion the `/` route becomes a TRIVIAL mount that reads the section registry, and is RENAMED **`app-root.tsx`** (ratified O7 — locked; the name says what it is: the app's root mount, not a page). **Neo precedent (cite):** neo had no home page either — a file-based `_authed` LAYOUT route WAS the shell (`_authed.tsx`/`login.tsx`/`__root`); orbweaver dropped file-based routing and, in hand-writing the 2 routes, dumped the composition into a misnamed "home-page" with the god-map. The lockdown RESTORES the intended shape (shell on top, route = thin mount) — it is not a new design.

What legitimately stays on the `/` route (`app-root.tsx`) after M1/M4: the `useUserBus` mount (the always-on freshness driver — mounted at the root so no feature unmount can drop it, per its own header), `AriaAnnouncer`, the `?join=` token capture + `JoinInviteDialog`, `FirstRunPersonaDialog`. Gate G1's anti-god-map arm: a `sections={{…}}`/`modals={{…}}` object-literal map in a route file, or a feature front-door import in `routes/**` other than the sanctioned auth-gate seam (`router.tsx` → `features/auth` `requireAuthed`/`redirectIfAuthed`), is RED.

## 8. The settings host + pane registry

```ts
interface SettingsPaneDefinition {
  readonly id: SettingsCategoryId; // the SETTINGS_CATEGORY_IDS tuple keeps its one home
  readonly group: "user" | "app"; // the §4.2 taxonomy: USER (Account · Personas · Appearance · Chat behavior · …) / APP (Connections · Automation · System · Admin)
  readonly label: string;
  readonly icon: LucideIcon;
  readonly description: string; // distinct teaching copy (gate-checked, placeholder-copy pattern)
  /** Declarative viewer gating — replaces `adminOnly` with the general predicate. */
  readonly when?: (viewer: ViewerView) => boolean;
  readonly subcategories?: readonly SettingsSubcategory[]; // the anchor/search index, unchanged shape
  /** A real pane body, or an explicit placeholder flag — never a silent if-ladder fall-through. */
  readonly body: (() => ReactNode) | { readonly placeholder: true };
}
```

- The settings shell becomes a THIN host: nav + fuzzy search + scroll-spy stay (they are good); `SettingsPane`'s if-ladder becomes `registry.get(active).body` — a `built: true` category with no branch can no longer silently placeholder (G4 also forces the explicit flag).
- **Features own their panes.** De-god ownership map (as ratified): `admin-*` components + `use-admin-mutations` → `features/user-admin` (owns the `admin` pane) · credential components + `use-add-credential-form` + connections nav/model → `features/credentials` (owns `connections`) · the workloads components/hooks/nav set → `features/workloads` (owns `workloads`) · **`backup` → owned by `features/workloads` + the portability serde system (ratified O3: "backup has no feature" — backup/restore IS the workloads + portability-serde export/import system; the existing `backup-settings-surface` + import/export/bundle-tracker components move under that ownership at M6, registering the `backup` pane from there — not settings, not a standalone feature)** · `persona-settings-surface` → `features/persona` · `features/settings` KEEPS the genuinely settings-domain panes: appearance, system, tags (settings-owned per O3 — only backup moved), regex, theme editor/picker, chat-behavior + automation (unbuilt — `placeholder: true` or `when`-hidden). Three stubs become real features with a registered pane; `prompt-manager/.gitkeep` stays pending O2 (guidance says resolve-or-delete; the hard call is deferred until core lands — §18).
- The host imports NO pane bodies (they arrive via the door assembly) — `client-features-no-cross` then enforces the de-god for free.
- `openSettingsTo(category)` (the opaque deep-link seam, `shell-store.ts`) is unchanged; the host validates against the registry exactly as it validates against the tuple today.

**E2 — worked example: add a settings pane.**

```ts
// features/workloads/lib/workloads-pane.tsx  (the feature OWNS its pane)
export const workloadsPane: SettingsPaneDefinition = {
  id: "workloads", group: "user", label: "Workloads", icon: ListChecks,
  description: "Background jobs: run, schedule, and inspect.",
  subcategories: WORKLOADS_SUBCATEGORIES,
  body: () => <WorkloadsSettingsSurface />,
};
// main.tsx — assembled with every sibling; total over SETTINGS_CATEGORY_IDS (tsc)
const settingsPanes = createRegistry("settings-panes", SETTINGS_CATEGORY_IDS, { …, workloads: workloadsPane, … });
```

The WRONG way it replaces: dropping `workloads-settings-surface.tsx` + 10 support files into `features/settings/` and hand-extending the if-ladder — the god-feature growth vector.

## 9. The state model (partitioned commons — verified census)

Already correct and gated; recorded because "state/ is a god-store" and "editor-bridge is an event bus" are recurring mis-reads:

- **Partition, not scatter, is the anti-god move.** `state/` = 17 small stores + 3 factory doors + `chat-handle.ts`. Every store is minted through exactly one door (verified: 12 × `createGatedStore`, 4 × `createPersistedStore`, the draft factory; bare zustand `create(` exists ONLY inside the two door files): `createGatedStore` (devtools + REQUIRED action labels + unique-name throw) · `createPersistedStore` (version + partialize + total migrate) · `createEntityDraftStore` (frozen EMPTY + useShallow + persist). Gates: `state-files`, `persist-partialize-and-total-migrate`, `no-raw-zustand-persist`, both selector-stability belts, the ESLint static-`setState` ban, `persistence-boundary` (device-local vs synced).
- **`shell-store` is ONE drawer for cross-cutting shell state** (activeSection, panelOverrides, openModal, contextTab, mobileSheet, settingsCategory) — features READ via narrow hooks, WRITE via intent-named module actions; the handle never escapes the file.
- **Feature-transient stores are feature-owned but centrally HOMED** (`character-selection-store`, `corpus-selection-store`, …) so a pointer another feature must read is never trapped behind a feature boundary — deliberate design, not sprawl. Durability criterion (north-star §0b): per-device transient → a store; anything that must survive across devices → server state.
- **The write/read discipline is §5.1** (writers only write; three render-only reader shapes; `no-effect-on-shared-selection` gates the banned subscribe-and-effect). Nothing here amends it.

## 10. The data/ tier — the whole surface, not just the factories

- **`trpc.ts`** — the typed client + `useTRPC`; queryKeys are 100% proxy-derived (`no-array-literal-querykey`, LIVE).
- **`query-client.ts`** — the §6.1 QueryClient pins have ONE home here (verified header): `staleTime: Infinity` (the bus drives freshness — never `'static'`), `refetchOnReconnect: true` (SSE-gap catch-up), `refetchOnWindowFocus: false`, mutations `retry: 0`, global error toasts via `QueryCache`/`MutationCache` `onError` reading `meta.errorToast`. Do not re-tune these per-surface.
- **The HTTP-route fetch-fn pattern:** endpoints that are Hono routes, NOT tRPC (multipart/binary), get ONE `data/` fetch fn each — `upload-asset.ts` (the one client seam for persisting a picked file), `import-tree.ts` (folder import → `202 {workloadId}`), `import-bundle.ts`, `import-characters.ts`, sharing `http-error.ts` (`throwHttpError`) + the `CSRF_HEADER`. **Rule: tRPC for everything except multipart/binary/streaming-HTTP; an HTTP route consumed anywhere gets a `data/` fetch fn — a feature never hand-writes `fetch()`.** (Gateable later as a `fetch(`-in-features ban; today zero violations — review R5 until a second offender class appears.)
- **`use-viewer.ts` is THE canonical "who am I"** — composes three already-cached reads (sessions.me + settings + persona list) via `useSuspenseQueries` so every caller dedupes on the shared cache. A scattered `trpc.sessions.me` read for identity is the wrong move (the settings host's plain role read is the sanctioned exception class: a non-suspense probe that must never block its shell).
- **The rest:** `invalidation.ts` (§13.5) · `query-boundary.tsx` + `query-error-state.tsx` (§11) · `bus/` (§13) · `skeleton-rows.tsx` (shape-matched loading rows) · `use-gated-query.ts` (`skipToken` — kills `castId("")`).

## 11. The error-handling battery + the three-states law

The stack, outermost-in (all verified):

1. **`AppErrorBoundary`** (`lib/error-boundary.tsx`) — the app-level render-throw catch. No retry (no query underneath to reset — a stale state that threw once will throw again); fallback offers RELOAD only. Wired once in `main.tsx` with `onError: reportClientError`.
2. **`reportClientError` → `trpcClient.clientError.mutate(buildClientErrorPayload(…))`** (`lib/client-error-report.ts`) — fire-and-forget telemetry; a failed report must never itself throw (verified: swallowed).
3. **`QueryBoundary`** (`data/query-boundary.tsx`) — the per-surface suspense + error battery. It bakes the `QueryErrorResetBoundary` → error-boundary `onReset` HANDSHAKE: without it, "Try again" re-renders while the query is still errored and throws again; `retry` resets BOTH so the refetch is real. Every suspending read mounts inside one.
4. **`QueryErrorState`** (`data/query-error-state.tsx`) — the ONE read-error block (muted label + Retry wired to the handshake's `retry`); it replaced 6 hand-rolled ErrorStates + 28 inline arms (its own header records the drift cost).
5. **Toasts** — mutation failures surface via `meta.errorToast` → the global `MutationCache.onError` → `notify` (bound once in `main.tsx`). One error slot per mutation (`no-multiplexed-mutation-error`, LIVE).

**The three-states law (§4.3 rule 8, restated as the buildable checklist):** every surface ships all three designed states — EMPTY teaches (an `EmptyState` with an action — `empty-state-has-action`, LIVE), LOADING is a shape-matched skeleton (`skeleton-rows.tsx` / `Skeleton` — never a centered spinner, never layout shift on arrival), ERROR is `QueryErrorState` with a real retry. A zero-context model's failure modes — bare spinner, unhandled throw, dead-end empty — are each individually walled: rule §4.3-8 + `empty-state-has-action` + the QueryBoundary default `renderError`.

## 12. Inter-feature communication — the channel matrix (ratified, with verdicts)

The blunt rule "cross-feature reads → trpc" is WRONG for client-ephemeral state (there is no row to fetch). This matrix is the law; each row carries a live cite and a verdict. **The critical clarification: a `trpc.*` read is CACHE-FIRST** — TanStack Query dedupes and caches per key, so reading another feature's server entity (a persona's name while the persona list is loaded) is a cache hit, not a network round-trip; `staleTime: Infinity` + the bus means it refetches only on invalidation. The anti-pattern is ONLY using trpc for ephemeral client state (or a store for server rows).

| Need | Channel | Live exemplar (verified) | Verdict |
| - | - | - | - |
| client-EPHEMERAL cross-cutting state (active section/chat/selection, panel modes, drafts) | read the `state/` commons directly (narrow hooks); write via module actions | `features/persona/components/persona-this-chat-section.tsx` reads `useActiveChatHandle`; 11 files across 7 features call `setActiveSection` | **KEEP — the sanctioned pattern.** A trpc call for the active chat id would be RETIRE-on-sight (none exists — verified) |
| SERVER-persisted data another feature owns | `trpc.*` queryOptions (cache-first) | `chat/hooks/use-chat-style.ts` (chat reads `trpc.settings.getUserSettings`); `character/components/character-relations-tab.tsx` + `world-info/components/book-attachments.tsx` (read `trpc.persona.*`) | **KEEP — D43(3): the router IS the cross-feature contract.** Never re-home data to "avoid the read" |
| shared SHAPES/types | `@orb/contracts` + type-only cross-feature imports (root wiring) | `client-features-no-cross` exempts `dependencyTypesNot: ["type-only"]`; zero live uses today | **KEEP** |
| shared domain-aware COMPOSITES | `client/src/components/` (tier 2) | 24 importer files across 6 features | **KEEP — reach here before hand-rolling** |
| shared domain-agnostic parts | `@orb/ui` | everywhere | **KEEP** |
| intra-feature cross-REGION (a feature's CONTENT ↔ its own CONTEXT inspector) | the editor-bridge: `forms/create-form-handle-bridge.ts`, minted per feature | `character-editor-bridge` + `preset-editor-bridge` — both verified within-feature-only (publisher = the feature's editor surface, subscriber = the same feature's inspector) | **KEEP — and plainly: the editor-bridge is NOT an inter-feature channel.** Across features the analog is the contributor registry (§6c) |
| cross-SECTION navigation | `#state` module actions (`setActiveSection` + a seed: `startNewChat({characterIds})`, `selectCharacter`) | `chat-context-panel-surface.tsx:313` view-character jump | **KEEP — §4.2 physics rule 4** |
| observing cross-cutting app state WITHOUT coupling | the `lib/agent-bridge.ts` model: an OBSERVER reading the QueryClient cache + DOM `data-*`/aria attrs — imports zero features, dev-gated `__orb`, installs `data-app-ready` | `installAppReadySignal` / `installAgentDebugHandle` | **KEEP — owner-settled; cite as the model.** Any future "watch everything" need copies the observer shape, never a feature import |
| a foreign feature EXTENDING a host surface | the contributor registries (§6c), registered at the door | (new — M8) | **THE channel for rpg/crew; anything else is RED** |

**E5 — worked example: cross-feature read, right vs wrong.**

```ts
// RIGHT — chat reads the settings-owned appearance pref: cache-first trpc, fallback until resolved
const { data } = useQuery(trpc.settings.getUserSettings.queryOptions());
return data?.config.appearance.chatStyle ?? DEFAULT_APPEARANCE_SETTINGS.chatStyle;
// RIGHT — persona reads chat's ACTIVE-CHAT pointer: client-ephemeral, the state commons
const handle = useActiveChatHandle();
// WRONG — dep-cruiser RED (runtime cross-feature import):
import { useChatStyle } from "#features/settings"; // ← no such channel exists
// WRONG — a store mirroring server rows (server state never lives in zustand, §5):
const personaName = usePersonaStore((s) => s.names[id]);
```

**`lib/` channel audit (every entry adjudicated; tier-4 bar = "cross-cutting seam, reaches up to nothing"):** `agent-bridge` KEEP (owner-settled; the observer model) · dev/observability set KEEP (`bus-devlog`, `client-error-report`, `dev-flag`, `dev-tools`, `log-clock`, `long-task-tracer`, `motion-stats`, `perf-marks`, `probe-mode`, `render-profiler`, `render-stats`, `trpc-devlog` — all observer-shaped, zero feature imports) · display/util seams KEEP (`time`, `notify`, `download-json`, `error-boundary`, `test-ids`, `use-focus-on-mount`, `view-transition`, `weave-glyph`, `message-render`) · shared-vocabulary maps KEEP (`message-role-labels` — 7 consumers / 6 features, the ONE role-label home; `injection-copy` — 3 features, one warning string; `theme-override-form` — the character↔settings theme-model shape; `list-seeded-backgrounds` — app-shell + settings) · **no RETIRE findings** — nothing in `lib/` is a disguised feature-to-feature coupling (verified: zero `#features/` imports from `lib/`, `components/`, `data/`, `forms/`, `state/`). The risk is prospective, so it gets gates, not cleanup: `client-lib-floor` (LIVE) + G5's lib→components / components→features arms.

## 13. The event/sync spine (multi-tab · multi-device · multi-human)

The same disease-class as the slot registries, highest stakes: a mis-wired or under-fanned event = two humans (or two of one person's devices) seeing different truth. Inventory — FOUR bus machineries + presence, on THREE deliberate durability tiers (all verified in full):

| Bus | Scope | Durability | Client apply | Producer gate |
| - | - | - | - | - |
| chat (`domain/chat/bus.ts` + `transport/trpc/chat-events-bus.ts`) | per-chat, member-scoped | **durable-first**: `emit` awaits the `chat_events` INSERT (assigns the per-chat `seq`) BEFORE the ring push; 256-entry ring + durable replay, member-gated (`chatEventBounds`); `on()` pre-buffers so the replay/live gap dedupes by seq | `apply-chat-bus-event.ts` — pure switch ending `assertNever` (a new member fails tsc) + exhaustive `BUS_FILTERS` Record | `bus-coverage` (LIVE, D50) |
| user (`transport/trpc/user-events-bus.ts`) | per-person ("an entity you own changed"), all devices | **live-only, fire-and-forget BY DESIGN** — no durable half; gap-heal = `invalidateAllUserRoots()` on every transition into `pending` (first connect AND reconnect — `use-user-bus.ts`) | exhaustive `USER_BUS_FILTERS` mapped Record (tsc-total); the heal set is DERIVED from the same map (`allUserRootFilters`) | `user-bus-coverage` (LIVE; `connectionsChanged` = the sole cited DEFERRED) |
| notifications (`transport/trpc/notifications-bus.ts`) | per-person durable inbox | **durable-first**: entry composes the INSERT (assigns seq) before `publishNotification` | inbox list rides Query + cursor | none (rides the inbox contract, not a broad union) |
| buddy (`transport/trpc/buddy-bus.ts` over `domain/buddy`'s `createBuddyBus`) | per-person companion reactions | replay-buffer ring, live | (no client consumer yet) | none |

Plus `presence-registry.ts`: presence = a ref-count per userId over open SSE connections + a 15s grace window — server-derived, never a client-asserted heartbeat (a spoofable presence is a prompt-composition attack). All process-local, `ASSUMES(single-replica)`.

**Verification of the commissioning read (trust code):** (a) *"the user bus has no coverage gate"* — FALSE: `scripts/check/gates/user-bus-coverage.ts` is active, two-direction ratchet, self-tested. (b) *"is the user-bus apply exhaustive?"* — YES, by a different mechanism: a mapped-type Record over `UserBusEvent["type"]` is compile-time-total exactly like `assertNever`. (c) *"is the fanout as rigorous?"* — the TIERING is deliberate, not a gap: shared-room truth rides the durable seq-stamped chat bus; per-person freshness rides the lossy-but-self-healing user bus (its contract header records the design: a dropped tick costs one reconnect-heal, never divergent canon). The member-fan is real and security-scoped: `entry/compose/emit-chat-changed.ts` derives recipients from the LIVE roster (`kind='human'`, `leftSeq IS NULL`) + pre-captured `extraUserIds` for just-kicked members — never a non-member.

**The laws (each names its enforcer; NEW gates in §16):**

1. **Durable-first / fan-out-second** for any bus carrying truth someone can miss (chat, notifications): the durable INSERT assigns `seq` BEFORE the live publish; the seq is the cross-device ordering source of truth; resume/replay reads the durable log. Enforcers: structural in `createChatBus` + pinned by `tests/server/domain/chat/bus.int.test.ts` / `bus-golden.suite.int.test.ts`; `defineBus` (below) makes the ordering non-optional for new buses.
2. **Fan scope follows visibility.** A shared-CHAT event fans to every present member's channel (each member's every device); a per-PERSON event fans to all that person's connected devices (channel keyed by userId, one listener per device). **An event mutating state visible to others MUST fan beyond the actor** — for chat that means the member-fan op or the chat bus, never a single-user emit. Enforcers: G12 mechanically for membership-scoped domains; R3 at contract review for new visibility classes.
3. **Consumer exhaustiveness is compile-time.** Every bus union ends in `assertNever` or a mapped-type-total Record on the client. Enforcer: tsc; `defineBus` bakes it for new buses.
4. **Producer coverage is ratcheted.** Every declared event type has a real server emit site or a cited DEFERRED entry, both directions (stale entries RED). Enforcers: `bus-coverage` + `user-bus-coverage` (LIVE); G11 requires the belt for any NEW bus.
5. **One client-side event→cache router.** `data/invalidation.ts` is the ONE seam for BOTH buses (verified: `BUS_FILTERS` + `USER_BUS_FILTERS` + the derived gap-heal set in one file; `no-inline-invalidate-outside-seam` gates every other `.invalidateQueries`; `bus-onData-no-store-write` keeps `onData` from becoming a second store). A new bus's client half MUST land in this same file — G11 checks it.
6. **Presence is server-derived only.** A client-asserted presence write is banned — review; no client API exists to misuse today.

**The unification (`defineBusChannel` — the transport half):** `chat-events-bus.ts`, `user-events-bus.ts`, `notifications-bus.ts` hand-roll identical machinery three times — module-scope `EventEmitter` + `setMaxListeners(0)` + `channelFor(key)` + `on(emitter, channel, {signal})` + the untyped-args unwrap generator. Extract ONE `defineBusChannel<Key, Event>(name)` (home `server/src/transport/trpc/bus-channel.ts`) returning `{ publish(key, event), subscribe(key, signal), subscribeAll? }`; durability stays PER-BUS POLICY composed in front of `publish` (chat: the awaited INSERT; user: nothing; notifications: the inbox record op) — the tiers are deliberate and stay; only the plumbing unifies. **Buddy stays as-is — adoption DEFERRED by owner ruling (O4, tracked in §18):** the primitive covers chat + user + notifications now; buddy's `@orb/kit/replay-buffer` emitter (D10) adopts later, in its own decision. G10 then seals: `new EventEmitter()` under `transport/` outside the primitive's home is RED (buddy's bus is domain-minted, not a transport `EventEmitter`, so it passes as-is).

**E4 — worked example: add a user-bus event (the full ritual, every step walled).**

```ts
// 1. contracts/src/user-bus/index.ts — the union + the types-const (ONE home)
| { type: "documentsChanged"; documentId?: DocumentId }
export const USER_BUS_EVENT_TYPES = { …, documentsChanged: true } satisfies Record<UserBusEvent["type"], true>;
// ← tsc now FAILS in data/invalidation.ts until the map handles it (total Record)
// 2. data/invalidation.ts — the client route (the heal set derives automatically)
documentsChanged: (_e, trpc) => [trpc.documents.pathFilter()],
// 3. the domain verb emits AFTER its durable write commits (fire-and-forget)
await writeDocument(…); deps.emitUserEvent(ownerId, { type: "documentsChanged", documentId });
// 4. `pnpm check` — user-bus-coverage goes RED if step 3 is missing (or DEFERRED-cite it)
```

The WRONG ways it replaces: a bespoke emitter (G10 RED) · an event type with no emit (coverage RED) · an inline `invalidateQueries` in the feature (`no-inline-invalidate-outside-seam` RED) · a store mirror of the payload (`bus-onData-no-store-write` RED).

## 14. The reuse-primitive law — gate what §13 already says

§13.2 stays the cold-agent map; §13.6's "review flag" becomes machine teeth. Predicates verified against current code so day-one is green or a named migration:

- **Rows.** An entity-in-a-list row = `@orb/ui/list-row` OR the tier-2 `LibraryRow` (the gate accepts BOTH tiers). Predicate: in LIST-region surface files, a `.map()` callback returning interactive JSX not rooted in `ListRow`/`LibraryRow`/an allowlisted composite is RED (G6). Filename `*-row.tsx` is NOT the predicate — message anatomy (the 8-skin `MESSAGE_ROW_SKINS` machine), facet rows, and `setting-row`/`Field` rows are different species; residual anatomy judgment is R1.
- **Destructive confirms.** `ConfirmDialog` is the ONLY feature-tier confirm. Gate: `features/**` importing `@orb/ui/alert-dialog` is RED (G7, dep-cruiser — clean because the composite lives OUTSIDE features). Migrate the 5 named sites first (M5).
- **Mutations.** Verified clean (zero raw `useMutation(` in features; 16/16 hooks on the factory) → hard seal, no ratchet: importing `useMutation` from `@tanstack/react-query` outside `data/` is RED (G9).
- **Browse.** `createCollectionSurface` owns UNBOUNDED/paginated browse. Verified: `useInfiniteQuery` appears ONLY inside the factory → seal it (G9). **Adjudication the §13.2 map lacked:** a small bounded owner list fetched whole in one `useSuspenseQuery` (presets, world books) legally uses `LibrarySurfaceShell` + `LibraryListLayout` (tier 2) — the boundary is the QUERY SHAPE (paginated ⇒ factory), which is exactly what the seal enforces; no judgment remains.
- **Forms / virtualization / charts / markdown** — LIVE (`form-factory-for-multifield`, `no-direct-useform`, `no-form-reset-in-autosave`, resolver physics + `ui-satellite-seals`; verified zero `useVirtualizer` outside the seal). Cite, nothing new.

## 15. Doc↔code reconciliations (code is truth; fix the docs on promotion)

| Doc says | Code truth | Disposition |
| - | - | - |
| UI-Arch §4.2/D66 A1: LIST header = the shared `.shell-panel-header` band with the ONE primary New | `PanelChrome`'s header is optional and the LIST passes none (`app-shell.tsx:147-153`) | A1 is COMMITTED-not-built (north-star N1/N2 lane); record the gap so §4.2 isn't read as as-built |
| UI-Arch §4.2 lists chat CONTEXT tabs as if registry-owned | chat's tabs are a bespoke internal `<Tabs>`; `context-slots.ts` deliberately omits `chats` | Resolved BY this proposal (§6b); until M3, §4.2's table describes the target |
| UI-Arch §4.1 "LEFTOVER width feeds CONTEXT" | the grid gives leftover width to the centered CONTENT gutter (`--width-shell-content` clamp); CONTEXT is a fixed `--dimension-panel` column | Amend §4.1 phrasing (aspirational → actual) |
| "FOUR regions" | `RegionAnchor` names LIST/CONTENT/CONTEXT; RAIL is a non-container region (nav strip, hosts no surface) | Keep "four regions" as anatomy; footnote RAIL is not a containment region |
| UI-Gates §8 keystone "in `features/` (app-shell exempt)" | the keystone covers ALL `packages/client/src`; three exact exemptions | Tighten the §8 sentence (§4 here is the precise record) |
| north-star §0 rule 2 "hand-written CSS legal in exactly ONE file" | true at the FEATURE tier; `client/styles/globals.css` + ui `globals.css` are hand-written styles-tier files, `theme.css` is generated; `settings-shell.css` is a live violation | §4's table is the reconciled law; dissolve settings-shell.css at M6 |
| "home-page" as a concept | `routes/home-page.tsx` is the `/` route + a 63-symbol god-map; the "home" screen is the chats section's landing STATE (D62 P4) | §7 — rename to `app-root.tsx` (O7) + thin-mount at M1; neo precedent recorded |
| `client-structure` RESERVED note: `corpus` stub mirrors no domain | `features/discovery/` is BUILT (corpus stays the section label) | Update the gate's RESERVED comment at M7 |

(The former auto-overlay row is resolved by O6: no longer a doc↔code disagreement — the law stands and the code is BUILT to it at M10; see §4.)

**M3 corrections (pulled forward from M11 by the owner-authorized M3 design pass, 2026-07-14 — the code side lands IN M3; §6b was refined post-ratification):**

1. **§6b/O5 type shape.** `ContextDefinition`/`SectionDefinition` are NON-generic at the shell seam; strictness moves to the `defineContextTabs<S>` mint (`S` spelled once, at the mint call, against a `registry-contracts`-published projection). The variance proof (a covariant `S`-producer can't ride the `never`-erasure — §6b) is why. Supersedes the aspirational generic in the pre-M3 doc + the as-built `SectionDefinition<never>`.
2. **The M3 M-block CRUX sentence is SUPERSEDED.** The prompts-doc M-block said "the consumer computes each section's projection `S` … a typed narrow keyed by the active section id." That was written before the variance was worked. The projection is DEFINITION-OWNED and the consumer is PARAMETRIC (blind), not a keyed narrow. The keyed-narrow + typed-`get` accessor is the REJECTED-BUT-SOUND alternative (sound, but reintroduces an id→S map + per-id switch + per-section recipes in app-shell — the smear).
3. **The M-block UNDER-SCOPED chats.** Chats' bespoke context is TWO surfaces, not one: `ChatContextPanel` (committed) AND its twin `DraftContextPanel` (`features/chat/surfaces/draft-context-panel-surface.tsx`, drafts). Both are Base-UI `<Tabs>` with the same resolve + `when`-gating; both DIE at M3, unified under one `ContextDefinition` over a PHASE-DISCRIMINATED `ChatContextState` union (`CommittedChatContext | DraftChatContext`).
4. **`contextHeader` was never fed.** The M1.cutover bridge's `contextHeader` half has ZERO callers (as-built AND pre-cutover `home-page.tsx`, verified `git show f232a5b1~1`); the context panel renders the static "Details" fallback for every section. M3 DELETES `contextHeader` with zero behavior change and NO replacement — do not build capability for an absent consumer.
5. **§6c M8 note:** `chatsSection` becomes a factory taking the contributor registry, flowed into `defineContextTabs`'s `contributors` (§6c). Recorded so M8 does not re-derive the seam.
6. **§6b addendum:** the Members-default tab is encoded by tab ORDER under the generic resolve — there is no default-tab config field, and none should be added.
7. **No `SectionSlot` type exists.** `context-slots.ts:7`'s header prose references a `SectionSlot.context`; it is stale draft prose, never a real type, and dies with the file at M3.

## 16. THE GATE SPEC

Bias: machine-enforceable — **the gate is the wall; prose is the why.** `E` = exists (cite) · `N` = new (build) · `A` = amend. Every N/A ts-morph gate lands as a `scripts/check/gates/*.ts` descriptor (loader-discovered, `mustFlag`/`mustPass` self-tested per the house contract). Review-only rows state WHY machine-checking fails and carry the exact checklist.

| # | | Gate | Mechanism | RED condition |
| - | - | - | - | - |
| G1 | N | `section-registry-completeness` | ts-morph | a `SECTION_IDS` member with no `SectionDefinition` in the door assembly; a definition not co-located under a feature (`features/*/lib/*-section.*`); two definitions for one id; **the PLANNED arm (O1):** a `content: {planned}` with an empty reason, or a planned section that also wires `list`/`header`/a real context (a badge-wearing half-build); **the anti-god-map arm:** a `sections={{…}}`/`modals={{…}}` object-literal map in `routes/**`, or a feature front-door import in `routes/**` other than `router.tsx` → `features/auth` (the sanctioned beforeLoad seam). RED is limbo — a rail-visible section with no registration; a FULL or DECLARED-PLANNED definition both pass. (tsc's total Record carries missing/extra; the planned marker and the real body are one field, so a stale exemption is unrepresentable) **M3 amendment:** `wiresRealBody` must count a `context` initializer that is NOT the literal `{ kind: "none" }` — including a `defineContextTabs(…)` CallExpression — as a real body, else a planned section wired `context: defineContextTabs(…)` slips through. |
| G2 | N | `no-parallel-section-map` | ts-morph | an object literal / `Record<Id, …>` type / array whose keys or `id` members cover ≥2 members of `SectionId`/`ModalSlotId`/`SettingsCategoryId`, outside the allowlist {the vocabulary tuple file, the door assembly, definition files}. Kills the next `SECTION_PANEL_DEFAULTS`/`YOU_MODAL_ROWS`. **M3 amendment:** the two `FLAG[lockdown-M3]` allowlist entries (`context-slots.ts`, `routes/app-root.tsx`) + the FLAG phrasing DROP at M3 — those maps are deleted, so the allowlist shrinks to {tuple, door, definition files} |
| G3 | N | `context-definition-shape` | ts-morph, incremental-safe | post-M3, FOUR arms: (1) **mint-only tabs** — an object literal with `kind:"tabs"` + a `useResolved` member outside `lib/registry-contracts.ts` (a hand-rolled tabs renderer wearing the badge); (2) **zero-tab mint** — a `defineContextTabs` call whose `tabs` is `[]` AND no `contributors`; (3) **strict/publication arm (O5)** — a `defineContextTabs` call (or any `ContextTabDef<…>` type-ref, pre/post-M8 contributors) whose type arg is not `void` and not an identifier import-resolving to a type EXPORTED from `lib/registry-contracts.ts` — `any`/`unknown`/an inline type literal/an index signature is RED; (4) **bodies-split resurrection** — a JSX attribute or interface member named `bodies` typed `Record<string, ReactNode>` (readonly/Partial included) under `client/src`. (Tab↔body bijection is structural — one object — no bijection arm needed; the `Record<SectionId,…>` half is G2's type arm.) |
| G4 | N | `settings-pane-completeness` | ts-morph | a `SETTINGS_CATEGORY_IDS` member with no registered pane; a pane rendering placeholder copy without `body: {placeholder:true}`; a pane definition not co-located with its owner; the settings host importing a pane body directly |
| G5 | N | `client-components-tier` | dep-cruiser (3 rules) | `components/` → `features/`/`routes/`/`main.tsx`; `lib/` → `components/`; `state/` → `components/`. Closes the verified tier hole |
| G6 | N | `list-row-adoption` | ts-morph, both-ways allowlist ratchet | in a LIST-region surface file, a `.map()` callback returning interactive JSX (onClick/role/href) not rooted in `ListRow`/`LibraryRow`/an allowlisted composite. Ratchet because "interactive row" has irreducible edges (R1 is the judgment half) |
| G7 | N | `confirm-uses-composite` | dep-cruiser | `from: features/**` `to: @orb/ui/alert-dialog`. Precondition: M5 migrates the 5 named sites; the composite lives outside features so needs no exemption |
| G8 | N | `registry-assembly-at-door-only` | ts-morph | a `createRegistry(`/`createContributorRegistry(` call outside `main.tsx`/`compose/`; any mutating `register(` API existing at all |
| G9 | N | `query-machine-seals` | grit (import-specifier) | `useMutation` imported from `@tanstack/react-query` outside `data/`; `useInfiniteQuery` outside `data/create-collection-surface.ts`. Verified green today — hard seal |
| G10 | N | `bus-channel-primitive` | ts-morph | post-M9: `new EventEmitter(` under `packages/server/src/transport/` outside `bus-channel.ts` (buddy's domain-minted replay-buffer bus is out of scope — O4) |
| G11 | N | `bus-definition-belts` | ts-morph | a `*_EVENT_TYPES` `satisfies Record<X["type"], true>` const in `@orb/contracts` with NO matching coverage gate file OR no client-side total map in `data/invalidation.ts` — a new bus cannot ship missing the chat bus's belt set |
| G12 | N | `membership-fan-guard` | ts-morph | under `domain/chat/**` (the membership-scoped domain list, registry-driven), a single-user emit identifier (`emitUserEvent`) — member-visible state rides the member-fan op (`emitChatChanged`) or the chat bus, never an actor-only channel |
| G13 | A | `registry-pairing` · `modal-body-not-placeholder` · `placeholder-copy-registry` | ts-morph (existing files) | re-point at the M4/M1 shapes: trigger↔`ModalDefinition` bijection; the placeholder flag on the definition; distinct placeholder copy read from `SectionDefinition.placeholder`. Protected properties unchanged |
| G14 | N | `feature-css-files` | fs check (client-structure arm) | a `.css` file under `features/**` outside {`app-shell/surfaces/shell.css`} — the §4 homes table is the whole legal set (`settings-shell.css` dies at M6) |
| G15 | E | one-directional client tiers | dep-cruiser | `client-feature-front-door` · `client-features-no-cross` (type-only exempt) · `client-lib-floor` · `client-state-below-data` · `client-data-direction` · `client-forms-direction` · `client-features-below-routes` · `client-nothing-imports-main` — LIVE |
| G16 | E | compose, never paint | ESLint keystone | `className`/`style` on a raw intrinsic in `packages/client/src` (3 exact exemptions) — §4. **\[CORRECTED]** not ungated |
| G17 | E | token/value discipline | grit + ts-morph | `no-color-literals` family · `no-arbitrary-tw-values` · `no-off-token-radius-shadow` · `no-off-token-inline-style` · `motion-token-purity` — LIVE |
| G18 | E | state discipline | ts-morph + grit + eslint | `state-files` · `persist-partialize-and-total-migrate` · `no-raw-zustand-persist` · selector-stability pair · `no-effect-on-shared-selection` · static-`setState` ban · `persistence-boundary` — LIVE |
| G19 | E | data/query discipline | ts-morph + grit | `no-array-literal-querykey` · `no-inline-invalidate-outside-seam` · `bus-onData-no-store-write` · `no-fake-disabled-id` · `no-static-staletime` · `no-multiplexed-mutation-error` — LIVE |
| G20 | E | forms discipline | ts-morph + grit | `form-factory-for-multifield` · `no-direct-useform` · `no-form-reset-in-autosave` · `tanstack-form-only-in-shared` — LIVE |
| G21 | E | bus producer coverage | ts-morph | `bus-coverage` + `user-bus-coverage` (two-direction ratchets) — LIVE. **\[CORRECTED]** the user twin exists |
| G22 | E | structure/size/a11y | ts-morph | `client-structure` · `component-size` · `surface-a11y-focus` · `surface-in-a-container` · `no-raw-interactive-intrinsics` · `empty-state-has-action` · `no-interactive-role-in-features` · `test-presence-client` — LIVE |
| R1 | review | row/field ANATOMY choice (ListRow vs setting-row vs Field vs message anatomy) | — | WHY ungateable: the correct primitive follows the VALUE TYPE and interaction shape (the §13.8 R4 analog), not a syntactic signature. CHECKLIST: entity-in-a-collection → ListRow/LibraryRow · label+control settings line → setting-row · editable labeled input → Field · chat turn → the MESSAGE\_ROW\_SKINS machine · a repeated interactive row in a LIST surface matching none of these → reject |
| R2 | review + jscpd | composite promotion (≥2-feature duplication → `components/`) | — | WHY ungateable: semantic near-duplicates (same anatomy, different fields) defeat textual clone detection; jscpd (tsx, 5%) is the tripwire, the hoist is judgment. CHECKLIST: same anatomy in 2+ features AND changing together → tier 2; 3+ repeats of wiring → tier 3 factory; a genuine one-off → leave. `confirm-dialog.tsx`'s header (16 hand-assemblies before the composite) is the recorded cost of skipping this |
| R3 | review | fan-scope completeness for NEW multi-visibility features | — | WHY ungateable in general: whether state is "visible to others" is a domain-semantic fact the AST can't derive outside the known membership domains (G12 covers chat mechanically). CHECKLIST at contract review: who can SEE this state? every seer's channel gets the event (member-fan for rooms, per-person for owned) · durable-first if a miss diverges canon (else document the heal path) · the event type joins the union + coverage DEFERRED before the emit lands |
| R4 | review | three-states completeness (§11) | — | WHY ungateable fully: `empty-state-has-action` covers EMPTY mechanically; LOADING shape-match and ERROR-copy quality are visual judgments (side-eye's lens). CHECKLIST: skeleton matches final shape (no layout shift) · error = `QueryErrorState` with real retry · empty names the next step |
| R5 | review | HTTP fetch-fn discipline (§10) | — | WHY not yet gated: zero violations exist; a `fetch(`-in-features grit is trivial to add when the first offender appears — record it in Deferred with that trigger. CHECKLIST: multipart/binary → a `data/` fetch fn beside the existing four; everything else → tRPC |

Tally: **14 new (G1–G12, G14, + the G13 amendment set) · 8 existing families cited (G15–G22) · 5 review-only with stated reasons (R1–R5).**

## 17. Migration / standardization plan (sequencing, not code)

Ordered so every step lands gate-green and unlocks the next; one commit per step; `pnpm check` + `pnpm test` green-to-commit:

- [ ] **M0 — primitives.** `createRegistry`/`createContributorRegistry` in `lib/registry.ts` + contracts in `lib/registry-contracts.ts` + unit tests; build G8 with it (born-compliant).
- [ ] **M1 — sections + the thin route.** Introduce `SectionDefinition`; migrate one proven section (characters) end-to-end, then the rest (chats last — largest). Absorb the six structures member-by-member; delete each map when empty. The `/` route sheds the god-map, keeps only §7's residue, and is RENAMED `app-root.tsx` (ratified O7). Build G1+G2 in-wave.
- [ ] **M2 — refinery registers PLANNED (ratified O1).** `features/refinery/` gains its co-located definition with `content: { planned: "<reason>" }` + rail/defaults/copy + `context: {kind:"none"}` — the founding DECLARED-PLANNED member (§6a, E1); the legacy half-wiring dies with M1's maps. G1's planned arms activate here.
- [ ] **M3 — context unification (the `defineContextTabs<S>` mint, §6b).** A blind `SectionContextHost` in app-shell switches on `context.kind`; the feature owns each section's projection hook. THREE steps (the M1.cutover bridge is a `Partial`, so per-section retirement is legal — the prop dies with its last entry): **M3.1** — the mint + resolved/non-generic contracts, the S-type move to `registry-contracts.ts`, the host + generalized `ContextTabsPanel(tabs, actions)`, migrate characters/presets/corpus/analytics (mint) + worldInfo (`single` → `body()` direct); delete `CONTEXT_SLOTS` + its 5 bridge entries. **M3.2** — chat's `useChatContextState` over the phase-union `ChatContextState` (both `ChatContextPanel` AND `DraftContextPanel` unified + DELETED, F0.1); delete the whole bridge (prop + `SectionContextBridge` + `contextHeader`, F0.2) + every `FLAG[lockdown-M3]` marker. **M3.3** — G3 (4 arms) + the G1/G2 amendments + a `resolveContextTabs` unit test. Full delete/build/done-gate blueprint: the M3 M-block in `client-lockdown-agent-prompts.md`.
- [ ] **M4 — modals.** `ModalDefinition` feature-owned at the door; delete the `AppShellProps.modals` override layer + `YOU_MODAL_ROWS` (derive). Amend the three keystone gates (G13).
- [ ] **M5 — confirm/row adoption.** Migrate the 5 raw `AlertDialog` sites onto `ConfirmDialog`; wire G7 (hard) + G6 (ratchet, baseline zero in LIST surfaces).
- [ ] **M6 — settings de-god.** Thin host first (registry replaces the if-ladder; panes stay put — behavior-frozen). Then move panes out one wave per owner: user-admin → credentials → workloads (which also takes the `backup` pane + the import/export/bundle-tracker components, per O3 — backup has no feature; workloads + the portability serde system own it) → persona. Each move de-stubs its feature. `prompt-manager/.gitkeep` stays pending O2 (no deletion this program). Dissolve `settings-shell.css` (→ tokens/variants or shell.css if truly structural). Build G4 + G14 with the first move.
- [ ] **M7 — tier seals.** G5 (components tier) + G9 (query seals) — verified green today, pure locks; update `client-structure`'s stale RESERVED note.
- [ ] **M8 — contributor seam.** Land both chat contributor registries with a NO-OP assembly (empty contributions) + CTs proving a fake contributor renders/gates correctly — rpg/crew then build against a live seam.
- [ ] **M9 — bus channel unification.** `defineBusChannel` extraction (chat/user/notifications plumbing; buddy EXCLUDED — O4 deferred); G10 + G11 + G12. Zero behavior change — durability compositions stay byte-equivalent; the existing bus int-tests are the oracle.
- [ ] **M10 — auto-overlay (ratified O6 — build to the law).** The shell gains the §4.1 auto-overlay: docked panels auto-collapse to `overlay` below the width breakpoint (the one app-shell `@media`), restore on re-widen, user override winning inside each regime; the mobile `mobileSheet` model unchanged below it. Verify live per the north-star §9 loop (snap at widths straddling the breakpoint, flat AND ramp, ± glass).
- [ ] **M11 — docs.** Promote this doc to `core/` as ONE document (ratified O8 — no split), mint the D-entry, apply §15's reconciliations, add every G-gate row to `Core-Enforcement-Active-Gates.md` (+ R5's trigger to Deferred), retire the brief's stale claims wherever absorbed.

## 18. Decisions — ratified 2026-07-14 (O2 + O4 remain flagged)

| # | Ruling | Status |
| - | - | - |
| O1 | **Refinery: KEEP — registers as the founding DECLARED-PLANNED section** (`content: {planned: reason}`, §6a). G1 allows FULL or DECLARED-PLANNED; RED is limbo (rail-visible, unregistered) or a badge-wearing half-build. The planned marker and the real body are one field — a stale exemption is unrepresentable (the bus-coverage DEFERRED discipline, upgraded to a structural guarantee) | CLOSED |
| O2 | **Stub policy: DEFERRED-OPEN (owner: "complicated, especially as we build core — once core lands I'd feel stronger").** The INTENT stands as guidance (§3: a feature is a rail section OR a registered settings pane OR a contributor; stubs resolve or die) but NO hard empty-dir gate ships now; `prompt-manager/.gitkeep` stays. RE-DECIDE once core lands | **OPEN — re-decide post-core** |
| O3 | **Backup: NO standalone feature — the pane is owned by `features/workloads` + the portability serde system** (backup/restore IS the workloads + portability export/import system). `backup-settings-surface` + import/export/bundle-tracker move under that ownership at M6. Tags stays settings-owned (O3 resolved backup only) | CLOSED |
| O4 | **Buddy bus: adoption of `defineBusChannel` DEFERRED.** The primitive covers chat + user + notifications now (M9); buddy keeps its replay-buffer emitter and adopts later — a tracked follow-up, not a migration item | **FLAGGED — tracked follow-up** |
| O5 | **STRICT typing** ("we like strict technical"): each section's REAL projection type is published in `lib/registry-contracts.ts` and `any`/`unknown`/loose-index escapes are gate-RED (G3 strict arm); contributors typecheck against the host's `S`. **Refined by the M3 design pass (2026-07-14, owner-authorized):** strictness lives at the `defineContextTabs<S>` MINT (`S` spelled once, there, checked against the published projection) — NOT a generic `ContextDefinition<S>`, which cannot ride the `never`-erasure (the variance proof, §6b). `ContextDefinition`/`SectionDefinition` are non-generic at the shell seam | CLOSED (§6b refined post-ratification) |
| O6 | **Auto-overlay: BUILD IT PROPER** — the §4.1 behavior is real committed law; the shell is built to it at M10 (removed from the §15 disagreement table; never amend the law down) | CLOSED |
| O7 | **The `/` route renames to `app-root.tsx`** (the draft's proposed name, locked) at M1 | CLOSED |
| O8 | **ONE document.** Doctrine + gate-spec promote as a single core doc; §16/§17 stay in-doc | CLOSED |
