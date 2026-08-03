# Stickler design review — F-8: the MULTI-OWNER COLLECTION-CONTRIBUTION primitive

**Date:** 2026-08-03 · **Charge:** design the one primitive by which MULTIPLE features contribute
members to a collection surface another feature owns (D120 generalized), such that a new contributor
is one file + one door row, the owner never imports contributors, completeness is gateable at birth,
and the owner's config-rail fork stays a cheap rail-level edit EITHER way. Review-and-propose only;
no source touched.

**Law read IN FULL this session:** `.claude/agent-doctrine.md` · `docs/architecture/core/AGENTS.md` ·
`client-architecture-lockdown.md` (§0–§16 whole, incl. the CARCH-refreshed §12 matrix and the §3
F-3/F-4 additions) · `Core-0-Architecture-and-Structure.md` §6–§8 (the partitioning table, per the
design-review charge) · `Core-Laws-and-Precedents.md` (the §0 index) · `Core-Path-Registry.md` D54 ·
D62 · D66 · D73 · D107 · D114 · D119/D119a · D120 · D121(A–D) · D122 · the origin review
`2026-08-03-client-architecture.md` (whole) · `set-seams-spec.md` §5–§8 (the D120 anatomy + stage
table) · `list-pane-projection-proposal.md` §5–§6 (Arm A/B/C verdicts) · retro-workboard DISCUSSION
PILE (the config-rail riff, verbatim). **Code read whole:** `lib/registry.ts` ·
`lib/contribution-contracts.ts` · `lib/home-tile-contracts.ts` · `state/settings-pane-registry.ts` ·
`state/create-drill-selection-store.ts` · `main.tsx` · `features/home/lib/home-section.tsx` ·
`scripts/check/gates/home-tile-registry-completeness.ts` · `scripts/check/gates/feature-owns-definition.ts`
(header + RE). Targeted reads: `chats-section.tsx:98–115`, `characters-section.tsx:29–41`,
`presets-section.tsx:1–46`, `tags-pane.tsx`/`regex-pane.tsx`, `shell-store.ts` (tuple + migrate),
`agent-nav/index.ts:20–65`, `tests/support/ct/ct-data-providers.tsx:106–448`.

**Gate battery:** `pnpm check` run whole-tree this session → **PASS, exit 0, 0 failed stages**
(`reports/verify.json`: `"ok": true, "failed": 0`; the suppressions red the origin review carried is
cleared on today's tree).

---

## VERDICT (one paragraph)

**The PRIMITIVE already exists and is coherent — with receipts.** `createContributorRegistry` + the
door-only assembly (G8) + a per-family typed contract + host-published projections + the
zero-contributions-⇒-byte-identical default + a per-family completeness gate is the house
multi-owner mechanism, proven at TEN live families and proven at full self-owned-section granularity
by D120. What F-8 names is not a missing mechanism but a missing FAMILY: no contract yet exists for
"a member collection inside a tri-pane rail workspace" (list group + member editor + mixed-kind
selection). Three things are genuinely missing, none of them a new primitive: **(1)** the
collection-family CONTRACT (specified below, §4), **(2)** the LAW+GATE that §12 row 5 promises but
does not enforce (the host-factory bundle rule — the only row in the channel matrix with no named
enforcer; constitution §2.3: a prose-only boundary is a wish), and **(3)** the family-birth playbook
(the coupled-site list a new contributor family must touch). Item 2 is fork-independent and
dispatchable today; items 1+3 ride the owner's config-rail ruling and should NOT ship code before a
consumer exists (dead-wire discipline) — they ship as THIS design set, mint-ready.

---

## 1. INVENTORY (receipted — what exists on today's tree)

### 1.1 The mechanism (the candidate "one primitive")

- `lib/registry.ts` (76 lines, read whole): `createRegistry` (total, tsc-complete over a vocabulary
  tuple) + `createContributorRegistry` (open, duplicate-id THROWS at construction, `list()` preserves
  door order). No mutating `register()` exists anywhere — assembly is import-at-the-door only.
- The door (`main.tsx`, read whole): THREE total registries (sections · modals · settings-panes) and
  TEN contributor families — chrome · settings-sections · chat-context tabs · chat-context REGIONS ·
  chat-surface anchors · tool-renderers · message-tools-renderers · slash-commands · character-detail
  · home-tiles (`main.tsx:155–325`). All G8-pinned to this one file.
- Delivery is two shapes, both live: **context provider** (settings-sections, slash-commands,
  message-tools — `createRegistryContext` mint, gate `registry-context-via-mint`) and **factory
  threading** (`makeChatsSection(4 registries)`, `makeCharactersSection(registry, renderProp)`,
  `makeHomeSection(tiles)` — the home-section header explicitly names this "the FACTORY posture").

### 1.2 The two precedents the charge names, at contract level

- **D120 / `SettingsSectionContribution`** (`state/settings-pane-registry.ts`, read whole):
  `{id, anchor: SettingsCategoryId, nav, when?(viewer), owns?, body}` + `groupByAnchor` (keyed write,
  never an `anchor ===` switch) + `resolveSettingsSections` (render) + `settingsSectionNavs`
  (nav/search) off the SAME grouping + `assertSettingsKeyPartition` THROWING at the door (overlap ·
  nested-claim · gap · stale-cite arms). Homed in `state/` because it binds state vocabulary
  (SettingsCategoryId + SettingsSubcategory) — §5 rule 6.
- **Home tiles / `HomeTileContribution`** (`lib/home-tile-contracts.ts`, read whole):
  `{id, title, icon, order?, span?, action?, useVisible?, body | {dormant}}`. Homed at tier 4 because
  it binds NO state vocabulary — the stated precedent for that choice. Placement is the DOOR ARRAY
  (no anchor field); order is canonical `(order, id)`. Gate
  `home-tile-registry-completeness` (read whole, 251 lines): co-location
  (`features/*/lib/*-tile.tsx`) · static duplicate-id naming both owners · dormant honesty
  (reason+teaser non-empty, no `action` on a doorway) · anti-god-map (no second `"home-tiles"`
  assembly outside the door). Six tile defs on the tree, all six door-registered (swept:
  `find features -name "*-tile.tsx"` vs `main.tsx:199–206`).

### 1.3 The gap's live subjects (the four riff collections, where they live TODAY)

| Collection | Client home today | Chrome level | Def receipt |
| - | - | - | - |
| presets | own RAIL section (bespoke `SectionDefinition`, `kind:"single"` context readout w/ a first-class no-selection arm) | rail workspace | `preset/lib/presets-section.tsx:24–46` |
| world-info | own RAIL section | rail workspace | `worldInfoSection`, `main.tsx:218` |
| tags | settings PANE, `surface` mode (D114/S5: `features/tag` minted, owns the pane) | modal | `tag/lib/tags-pane.tsx:24` |
| regex | settings PANE, `surface` mode ("a script LIBRARY", its own header's word) | modal | `regex/lib/regex-pane.tsx:24` |

Server-side (Core-0 §6, read per the charge): tags = "one namespace + per-entity junctions" ·
world-info = "one books/entries store + scope junctions (the canonical pattern)" · regex = "a regex
library + scope junctions — the world-info pattern" · presets = generation config. **The four riff
members are ALREADY one coherent server-side class** (library-of-objects + scope junctions); the
client presents them at two different chrome levels. No prior ruled-but-unbuilt CLIENT collection law
found (ledger swept for "collection"/"config rail"/"library treatment": only D54's
`createCollectionSurface`, which is the data-tier PAGINATION factory — a different concept sharing
the word; see fork F-2).

### 1.4 The ledger state bearing on the fork (drift check, per the charge)

- **D121(C)** amends D62-P6: the ceiling is now "a rule about KIND, not a count — a rail section owns
  a top-level WORKSPACE with its own LIST/CONTENT/CONTEXT grid; anything that is a dialog, a
  preference, or a one-shot goes to modals/settings" (`Core-Path-Registry.md:343`). A CONFIGURATION
  workspace is legal under this ceiling with no further amendment. (The origin review's F-2 — the
  unamended ledger — is FIXED on today's tree.)
- **D114/D120** rule tags/regex OWNERSHIP (features/tag, features/regex) and their CURRENT pane
  homes. A config-rail migration changes their def KIND, never their ownership — but it amends
  D114's "owning its pane in surface mode" clause: a D-entry rider is owed at that stage.
- **List-pane-projection** (ratified): Arm A+B approved; **Arm C (unified characters∪chats rail) was
  judged NOT RECOMMENDED** in the ratified proposal (`list-pane-projection-proposal.md:353`), while
  the workboard keeps the merge alive as a cheap post-A+B edit. Consequence for THIS design: the
  characters+chats rail-merge is NOT a collection-contribution subject (it is the A+B behavioral
  convergence of two LIBRARY sections) — the primitive must not be stretched to cover it (§6).
- **§12 row 5** (landed today via CARCH): "≥2 foreign panes ⇒ mint a contribution seam instead" — the
  law this design is the seam FOR. Its enforcer column reads "convention + `client-features-no-cross`",
  i.e. the tripwire itself has NO gate (finding F-A below). No live host trips it today: chats
  consumes 4 registries but zero foreign PANES; characters carries exactly ONE render-prop pane
  (Arm A, legal).

### 1.5 The arity smell, measured

`makeChatsSection(chatContextContributors, chatContextRegions, chatSurfaceContributors, toolRenderers)`
— FOUR positional `ContributorRegistry` params (`chats-section.tsx:98–103`). Call sites that churn on
every new seam: `main.tsx:212`, `tests/support/ct/ct-data-providers.tsx:175` AND `:352–356` (the CT
override arm) — receipts for the bundle refactor's blast radius. `makeCharactersSection` = 1 registry
+ 1 render prop (passes the proposed cap). `makeHomeSection` = 1 registry.

### 1.6 Selection machinery

`createDrillSelectionStore` (read whole): `P extends string` primary + optional secondary; **no kind
axis** — a mixed-kind list (a preset row and a tag row in one pane) cannot express its selection
today without string-packing. Sealed by G27 (`selection-store-via-factory`).

---

## 2. SHAPE JUDGMENT — what the "one primitive" IS

**The primitive is the CONTRIBUTION-FAMILY pattern, and it is already law-by-example.** Every live
family repeats the same seven-part anatomy, none of it accidental:

1. a typed CONTRACT at tier 4 (`lib/*-contracts.ts`) or `state/` (iff it binds state vocabulary — the
   two homes are already adjudicated by precedent, §1.2);
2. `createContributorRegistry` at the DOOR, one assembly, G8;
3. HOST-PUBLISHED projections consumed contravariantly (`when(view)`, `body(view)`) — the host never
   learns contributor types, the contributor never learns host internals;
4. placement by DOOR ARRAY ORDER (or an explicit `order` for canonical `(order, id)` sort) — never a
   contributor-side anchor unless one registry must serve MANY hosts (settings-sections is the one
   family that needs `anchor`, because the shell reads ONE registry for nav/search across ten panes);
5. zero contributions ⇒ byte-identical host;
6. honesty arms for not-built states (`{planned}`/`{dormant}` — marker and body are the SAME field,
   stale exemptions unrepresentable);
7. a per-family completeness GATE + the two hand-maintained door mirrors
   (`ct-data-providers.tsx`, the partition/registry tests).

What the config-rail shape needs and NO family yet provides is a contract for a **collection
member**: a contributor that supplies a LIST GROUP (rows), a MEMBER EDITOR (content), and
participates in ONE mixed-kind selection. That is a new FAMILY (an eleventh), not a new mechanism —
exactly the "coherent-as-is, only law/naming missing" arm the charge allowed, PLUS one genuinely new
contract and one genuinely missing gate.

**What the primitive is NOT:** it is not a generalization that should absorb the existing families
(their per-family contracts are the type safety — a universal `Contribution<T>` would erase the
anchor-discriminated narrowing `contribution-contracts.ts` documents as the reason unions type
cleanly), and it is not the characters+chats merge (§1.4).

---

## 3. THE DESIGN — one sentence, then the parts

> **A `CollectionContribution` is a co-located, door-registered description of ONE object library —
> its list group, its member editor, its create verb — consumed blind by a thin HOST feature that
> owns only the frame, the mixed-kind selection, and the welcome state; the door array IS the
> collection roster, so the config-rail fork is arithmetic on door arrays.**

## 4. The contract shape

Home: **tier 4, `lib/collection-contracts.ts`** — it binds no state vocabulary (kind ids are
host-opaque strings, the `contextTab` posture; member ids are opaque strings branded at the owner's
edge). The `home-tile-contracts.ts` precedent, cited in its header.

```ts
/** What the host hands a collection's LIST half. Selection arrives kind-pre-bound: `selectedId` is
 *  non-null ONLY when the selected member belongs to THIS collection. */
export interface CollectionListView {
  readonly selectedId: string | null;
  /** The host's mixed-kind selectFromList, kind pre-bound (writes selection AND closes an open
   *  LIST slide-over — the drill-store dual-write, unchanged). */
  readonly onSelect: (memberId: string) => void;
}

export interface CollectionDetailView {
  /** Opaque at the seam; the owner re-brands through its own id schema (the stamped-id posture —
   *  the same trade every drill store already makes at `P extends string`). */
  readonly memberId: string;
}

export interface CollectionContribution {
  /** The collection KIND — registry key, React key, and the selection store's kind axis.
   *  Host-opaque (an open id one host interprets is NOT shell vocabulary — §5 rule 5's test). */
  readonly id: string;
  /** The group header's kicker voice + icon (host-rendered — a contribution never draws its own band). */
  readonly label: string;
  readonly icon: LucideIcon;
  /** Canonical (order, id) — the assembleChrome/home-tile ordering precedent. */
  readonly order?: number;
  /** Live capability gate (the ChromeEntry.useVisible contract: called UNCONDITIONALLY over the
   *  door-frozen list). false ⇒ the whole group renders NOTHING. Never a build fact. */
  readonly useVisible?: () => boolean;
  /** The group count for the header ("PRESETS · 12") — a cache-first hook, same call discipline. */
  readonly useCount?: () => number | undefined;
  /** The group's rows — OWNER-rendered (its own query, its own row anatomy under the ratified
   *  §12.2 row-action grammar + G6), inside the host's group frame. */
  readonly list: (view: CollectionListView) => ReactNode;
  /** The create verb as DATA — the host renders it in its own chrome grammar (the
   *  ModalDefinition.trigger precedent: self-declare, host places). */
  readonly create?: { readonly label: string; readonly run: () => void };
  /** CONTENT for a selected member of this kind — the full editor, owner-rendered, no popups. */
  readonly detail: (view: CollectionDetailView) => ReactNode;
  /** Optional CONTEXT body for a selected member (presets' readout class). Absent ⇒ the host's
   *  context empty-state. Growth field — see fork F-9 for presets' idle-readout arm. */
  readonly context?: (view: CollectionDetailView) => ReactNode;
}
```

Deliberate exclusions, each with the why:

- **No `anchor` field.** One registry per host, placement by door array (fork F-3). The settings
  family needed `anchor` because ONE registry serves ten pane hosts through the shell's global
  nav/search; a collection host consumes its own registry whole. This is what makes the rail fork
  arithmetic: moving presets between "own section" and "config member" is moving one array member
  between two door assemblies — zero contribution edits.
- **No `owns` / partition pin.** D120's partition exists because N sections patch ONE shared
  settings blob. Collections write their OWN domain tables through their own verbs — there is no
  shared write target, so importing the pin would be cargo cult. (State this in the contract header
  so a future reader doesn't "complete" the mirror.)
- **No `{dormant}` arm v1.** All four candidate collections are built. If a dormant collection ever
  registers, lift the `DormantDoorway` shape verbatim from home-tiles (marker=body same-field rule).
- **No `nav`/search field v1.** Cross-collection search is fork F-10 (defer); per-collection search
  stays inside the owner's `list` surface, where all four already have it.

## 5. The host + door assembly

**The host is a NEW THIN FEATURE, `features/config` — the `features/home` precedent exactly.** It
owns: `lib/config-section.tsx` (a `SectionDefinition` factory `makeConfigSection(collections)` —
satisfies `feature-owns-definition` via the existing `-section.tsx` RE), the group-frame components,
the welcome/no-selection CONTENT, the context routing, and ONE kinded selection store. It imports
ZERO contributors (they arrive via the registry) — `client-features-no-cross` then enforces the
de-god for free, the §8 settings-host sentence verbatim.

```ts
// main.tsx — fork arm CONFIG-RAIL YES:
const configCollections = createContributorRegistry<CollectionContribution>("config-collections", [
  tagCollection, regexCollection, worldInfoCollection, presetCollection, // door order = group order
]);
const sections = createRegistry("sections", SECTION_IDS, {
  …, config: makeConfigSection(configCollections), …   // presets/worldInfo rows deleted from the tuple
});

// fork arm NO: this block never exists; the contract never mints; nothing ships dormant.
```

**Selection:** `state/config-selection-store.ts` minted through a KINDED overload on
`createDrillSelectionStore` (fork F-7): state `{kind: string; memberId: string} | null`; `select`,
`clear`, `selectFromList` (overlay dual-write preserved); the host pre-binds `kind` per group when
constructing each `CollectionListView`. G27's seal keeps holding (one mint, one new overload).

**Content routing:** `selected === null` ⇒ host welcome (empty states are load-bearing — a designed
launcher card per collection, never null); else `registry.get(selected.kind).detail({memberId})`.
Context: `{kind:"single", body: routes by selected kind → contribution.context ?? EmptyState}`.

**Room-tier boundary (the riff's own guardrail, made structural):** every `CollectionContribution`
is a USER-TIER library. Room-tier overrides (per-chat preset binding, per-chat injections) never
ride this seam — they stay on the chat context panel's existing machinery. One sentence in the
contract header; reviewable, and gateable later if an offender class appears.

## 6. Which surfaces migrate, which stay bespoke

| Surface | Disposition | Why |
| - | - | - |
| tags · regex | **MIGRATE FIRST** (R1) | already CRUD libraries in `surface` panes; no context anatomy, no listHeader debt; buys the riff's core win (libraries out of the modal); their `-pane.tsx` defs delete, `SETTINGS_CATEGORY_IDS` drops two members; D114 rider minted |
| world-info | **MIGRATE SECOND** (R2) | a clean library rail section; its L4 band debt (list-pane §6: no `listHeader`) gets paid by the host's group frame instead |
| presets | **MIGRATE LAST, owner-timed** (R3) | owner: "still not set on presets being their own thing" — the door-array design keeps BOTH arms one-line cheap forever, so deferring costs nothing; its `kind:"single"` readout with a first-class no-selection arm is the one hard anatomy question (fork F-9) |
| characters + chats | **STAY BESPOKE** | library-treatment sections; their merge fork is the ratified-A+B convergence, explicitly NOT this primitive (Arm C judged NOT RECOMMENDED, `list-pane-projection-proposal.md:353`) |
| home | STAY | tiles are its own family; home is the host-feature PRECEDENT, not a subject |
| corpus · analytics | STAY | analytic drill workspaces, single-owner, not object libraries |
| settings shell | STAY | D120's machinery is the sibling family, not a member; if the "settings categories as singleton-anchor rows" sub-fork lands, the config host DERIVES that group from the pane registry (G2-legal: derive, don't re-declare) — see F-6 |
| the ten existing contributor families | STAY | different granularities; per-family contracts ARE the type safety (§2) |

## 7. Gate arms (completeness at birth)

1. **`section-factory-contribution-bundle`** (R0, fork-independent — the §12 row 5 enforcer):
   ts-morph over `packages/client/src/features/**`: an exported function returning
   `SectionDefinition` with **>1 parameter typed `ContributorRegistry<…>`** is RED (fix: ONE
   named-field bundle object), and **>1 function-typed render-prop parameter** is RED (fix: mint the
   contribution seam — row 5's tripwire, now a wall). Lands WITH the `makeChatsSection` 4→1 bundle
   refactor in the same lane (gates land on a FIXED tree): touches `chats-section.tsx:98`,
   `main.tsx:212`, `ct-data-providers.tsx:175,352`, the chats-section CT fixtures.
   `makeCharactersSection` (1+1) and `makeHomeSection` (1) pass unmodified.
2. **`collection-registry-completeness`** (R1, with the family): the home-tile gate's four arms
   re-keyed — co-location (`features/<owner>/lib/*-collection.tsx`) · static duplicate-id naming
   both owners · anti-god-map (no second `"config-collections"` assembly outside the door) ·
   create-is-data honesty — PLUS the arm the home-tile gate lacks: **the ORPHAN-DEF arm** (a
   co-located exported `CollectionContribution` absent from the door array is RED unless
   cited-dormant; two-sided per the exemption discipline). Swept today: the tile family has no live
   orphan (6/6 registered), so retrofitting the arm there is optional hardening, not a fix.
3. **tsc carries the rest**: registry totality is N/A (open registry); duplicate-id throws at
   runtime construction AND statically via arm 2; the kinded selection store's vocabulary is
   deliberately open (fork F-4) so there is no tuple to gate.
4. **Coupled-site edits that MUST land in the same commit as the first `-collection.tsx`:**
   `feature-owns-definition`'s `DEFINITION_RE` gains `|collection` (`feature-owns-definition.ts:9`)
   — without it, tag/regex lose their qualifying `-pane.tsx` defs at migration and go RED; lockdown
   §3's "What IS a feature" sentence gains the same word.

## 8. The SECTION_IDS playbook (DOC-LAW, owed regardless of fork)

The coupled-site list a rail-vocabulary edit touches, receipted this session — land as one paragraph
in lockdown §6a (origin proposal 3), cited from the shell-store header:

`state/shell-store.ts:36` tuple (order IS rail order) · `migrate()`'s `isSectionId` sanitize
(`:143,189`) + per-section `panelOverrides` sanitize · the section's def + factory + front-door
export · per-section selection stores (G27 mints) · `agent-nav/index.ts:39,65` vocabulary validation
· `tests/support/ct/ct-data-providers.tsx:106–448` (REAL registry + `fakeSection` fold — one of
D120's two named hand-maintained mirrors) · mobile-fate curation (`rail.mobile`, D121(C) brand-cell
rule) · chrome derivation (`assembleChrome` reads `sections.list()` — self-updating, verify only) ·
placeholder-copy distinctness gate · `home-section-spec`/`UI-Arch §4.1` rail prose. A config-rail
landing does this surgery TWICE (add `config`; remove `presets`/`worldInfo`) plus the settings twin
(`SETTINGS_CATEGORY_IDS` minus `tags`/`regex`, `settings-pane-registry.test.ts` partition mirror).

## 9. Staging (the R-program)

| Stage | Fork-dependence | Ships | Notes |
| - | - | - | - |
| **R0** | NONE — dispatchable now | the bundle refactor + gate 7.1 · the §12 row-5 enforcer cite (matrix row gains its gate name) · the §8 playbook paragraph in lockdown §6a | one lane, ~a day; kills the arity churn before a fifth chat seam lands |
| **R1** | config-rail YES | `lib/collection-contracts.ts` + kinded selection overload + `features/config` host (mock-first: commit the mock, then build, side-eye after) + `SECTION_IDS += config` + gates 7.2/7.4 + FIRST MEMBERS tags & regex (panes retire, settings tuple shrinks, D114 rider) | smallest members first; proves the seam on zero-context-anatomy collections |
| **R2** | after R1 green | world-info migrates; `SECTION_IDS -= worldInfo` | pays its L4 band debt via the host frame |
| **R3** | owner-timed | presets migrates (or is RULED to stay its own section — both one door line); `SECTION_IDS -= presets`; resolve fork F-9 | the owner's "presets own thing" hesitation stays free until here |
| **R4** | close-out | D-entry minted (the family + the row-5 enforcer + the D114 rider), `d-citation-integrity` carries it; retire any bespoke residue | SET-SEAMS S6 discipline |
| **NO arm** | config-rail NO | R0 only; this file parks as the design set (proposed/-class status via the review index); ZERO dormant code ships | no dead wire, no phantom `features/config` |

Every stage shippable alone (the SET-SEAMS stage discipline); every migration keeps
zero-contributions-⇒-byte-identical as its intermediate invariant.

## 10. OWNER FORKS (recommended arm marked ▸)

- **F-1 · The config rail itself** — owner's call, explicitly not closed here ("rule by feel
  post-SET-SEAMS-seal"). Architectural read only: the YES arm now has three receipts it lacked when
  riffed — D121(C)'s kind-ceiling legalizes the workspace; Core-0 §6 shows the four members are one
  server-side class; tags/regex are today workspace-grade libraries living inside a modal. ▸ Design
  composes both arms; R0 is worth doing on either.
- **F-2 · Naming** — ▸ `CollectionContribution` / `*-collection.tsx` (the riff's own noun; the
  `createCollectionSurface` collision is tier-separated — data-tier pagination factory vs tier-4
  contract — disambiguated in one header line). Alternative: `LibraryContribution` (harmonizes with
  the tier-2 `Library*` composites but collides with the riff's use of "library treatment" for
  CHARACTERS, the surface class that explicitly does NOT ride this seam).
- **F-3 · Placement grammar** — ▸ door-array per host (home-tiles posture; makes the rail fork
  array-arithmetic). Alternative: a contributor-side `anchor` field (the settings posture) — only
  needed if ONE roster must serve many hosts simultaneously; adopt later without breaking defs
  (additive field) if that world arrives.
- **F-4 · Kind ids** — ▸ host-opaque strings, dup-throw at the door (the `contextTab`/§5-rule-5
  vocabulary test: no door-assembled TOTAL registry keys on them). Alternative: a closed tuple —
  buys tsc totality nobody consumes, costs the full §8 playbook on every membership edit.
- **F-5 · List granularity** — ▸ owner-rendered GROUP per collection (owner keeps its query + row
  anatomy under the ratified row-action grammar; the host frames). Alternative: one interleaved
  mixed-kind row list — requires cross-kind sort semantics and a data-shaped row contract that
  nothing needs yet; defer until a real interleaving requirement lands.
- **F-6 · Settings categories as singleton-anchor rows** (the riff's "maybe") — ▸ NOT v1. When
  wanted: a host-DERIVED group over the settings-pane registry (rows = `panes.list()` → 
  `openSettingsTo(id)`), which is G2-legal derivation, zero new contributions, ~an afternoon.
- **F-7 · Selection shape** — ▸ a kinded overload on `createDrillSelectionStore`
  (`{kind, memberId}`, typed pair, G27 seal intact). Alternative: composite string keys
  (`"presets:abc"`) — zero factory surgery but stringly state the house style consistently rejects.
- **F-8 · Create affordance grammar** — ▸ data-shaped `create: {label, run}`, host-rendered at the
  group header (D66 A2 read per-group; "real per-object editors, no popups" honored by `run` opening
  the member editor in CONTENT). Band-level "New ▾" fold is a mock-pass question, not a contract one.
- **F-9 · Presets' idle readout** (only if presets migrates) — its context readout renders a
  first-class NO-SELECTION arm (the active preset's effective profile — `presets-section.tsx:7–11`).
  Arms: (a) a host-level `contextIdle` growth field on the contribution; (b) the active-preset
  readout re-homes to the HUD/home tile; (c) presets keeps its own section (F-1's cheap escape).
  ▸ Decide AT R3 with the mock in hand — the contract stays additive under all three.
- **F-10 · Cross-collection search** — ▸ defer; growth field (`search?: (q) => rows`) sketched but
  unminted until the host's mock demands it.

---

## FINDINGS (defect-class items surfaced en route — both small, both actionable)

- **F-A · P3 (law-quality)** — `client-architecture-lockdown.md` §12 row 5's new clause "≥2 foreign
  panes ⇒ mint a contribution seam instead" has NO enforcer; its Enforced-by column is "convention +
  `client-features-no-cross`", which forces the door but cannot count panes. Every other matrix row
  names a wall; constitution §2.3: "a prose-only boundary is not a placement — it's a wish."
  **Fix = R0's gate 7.1** (the render-prop-count arm IS the row's enforcer); update the row's cite
  when it lands. Evidence: §12 read whole this session; no `make*Section` arity rule in
  `scripts/check/gates/` (listed) or `.dependency-cruiser.cjs`.
- **F-B · P4 (gate hardening, prospective)** — `home-tile-registry-completeness` has no ORPHAN-DEF
  arm: a co-located, exported, never-door-registered tile ships gate-green (knip-dependent at best).
  Swept today: no live orphan (6 defs / 6 registered, receipts §1.2). Not a defect on this tree;
  fold the two-sided arm into the family gate template (7.2) and optionally retrofit.

## Verified clean (what my silence covers)

- `pnpm check` whole-tree PASS, exit 0, zero failed stages (`reports/verify.json`).
- The ten contributor families + three total registries counted off `main.tsx` call sites (G8-pinned)
  — the lockdown §9 census of THIRTEEN matches the tree.
- All six home-tile defs door-registered (no orphan).
- No existing `*-collection.tsx` / `CollectionContribution` naming on the client tree (one collision:
  `data/create-collection-surface.ts`, adjudicated in F-2).
- `SECTION_IDS` coupled sites enumerated by sweep (`grep -rl SECTION_IDS packages/client/src` +
  agent-nav + ct-data-providers), receipts in §8.
- D62-P6 vs the eight-section tree: RECONCILED on today's tree by D121(C) (the origin review's F-2 is
  closed).
- Ledger swept for a prior collection/config-rail ruling: none exists — the question is genuinely new
  at the client tier; the server tier already classes the four members together (Core-0 §6).

**Regions NOT read** (scope honesty): the four collections' surface/editor bodies
(`preset-library-surface`, `tags-settings-surface`, `regex-settings-surface`, world-info surfaces) —
migration COST at row/editor level is asserted from their def files + the projection proposal's §6
table, not from body reads; `assemble-chrome.ts` internals; the settings shell's nav/search
internals; `Core-Enforcement-Active-Gates.md` (consulted via the gate files themselves); the rpg
context-tab factory bodies.

## Unconfirmed / low priority

- Whether presets' readout couples to the editor-bridge (vs only the drill store) — affects F-9 arm
  (a); check at R3, not before.
- The mobile fate of a `config` section (tab vs sheet vs neither) — a D121(C) brand-cell-adjacent
  curation call for the R1 mock pass.
