---
kind: design
status: draft
updated: 2026-09-06
---

# Pane standardization — what the shell forces vs what a section declares (#1191)

**Owner mandate (2026-09-02, verbatim):** *"we need to look at all our rail items and find whats being
set manually vs what should be standardized things need to be consistent"*

This is a design (`kind: design`, draft): ZERO production code rides this document. It converts the
measured pane-idiom matrix (#1191's second comment; full report `cb-pane-matrix-report.md`, session
scratchpad 2026-09-02) plus a source-complete read of every `SectionDefinition` into a per-axis standard,
each with its enforcement tier NAMED (constitution §2.3: a prose-only boundary is a wish). The build is a
later program dispatched from §6. The D-ledger and `client-architecture-lockdown.md` win on any conflict.

Prior-art lessons consulted (shared memory store, by filename): `lock-the-extensible-shape.md` (the
owner's standing fork rule), `empty-states-are-load-bearing.md`, `feature-root-slot-lands-with-occupant.md`
(no unoccupied opt-out arms), `contribution-type-homes-in-state.md` + `client-composition-tier-directory-module.md`
(type homes; `registry-contracts.ts` is AT the 450-line cap — a new tier-4 contract gets its own file),
`settings-section-three-coupled-sites.md`, `arrival-default-retires-host-ct-premises.md` +
`surface-flip-retires-the-ct-premise.md` (a shell-mount change sweeps the WHOLE shell CT family),
`new-domain-coupled-sites.md` (expect ~6 coupled-site classes per shape change).

## 1. The evidence base (measured + source-completed)

The matrix measured four axes rendered (LIST header, LIST body padding, CONTENT padding, open-contract
shape). This design completed the remaining axes by full source read of all ten section definitions
(`features/{chat,discovery,character,stats,databank,preset,refinery,plugin,home,config}/lib/*-section.tsx`),
the shell consumers (`app-shell.tsx`, `panel-chrome.tsx`, `section-content.tsx`, `section-context-host.tsx`,
`use-shell-layout.ts`, `region-anchor.tsx`), the shared composites (`components/list-pane-header.tsx`,
`components/library-surface.tsx`, `data/create-collection-surface.ts`), and every LIST surface. New facts
this pass adds to the matrix, each with its receipt:

| # | Finding | Receipt |
| - | - | - |
| E1 | The band contract is already "non-suspending `useQuery` count" by explicit comment in ALL SEVEN `ListPaneHeader` callers — and Refinery's hand-rolled band **suspends** (`useSuspenseQuery`), with no boundary in the pane: the suspension bubbles past `PanelChrome` to the router tier. | `chat-list-header.tsx:8`, `corpus-list-header.tsx:8`, `analytics-list-header.tsx:9`, `databank-list-header.tsx:18`, `preset-list-header.tsx:16` vs `refinery-list-surface.tsx:301`; no `Suspense`/`QueryBoundary` in `app-shell.tsx` or `app-root.tsx` |
| E2 | CONTEXT band identity: 6 of 7 non-`none` contexts supply the `header` band (chats/characters/corpus/analytics via the tabs mint; databank/presets on the `single` arm; config via `makeConfigContext`); **Refinery supplies none** — its bracket column starts bandless (`ResolvedContextTabs.header` absent ⇒ no band). | `refinery-section.tsx:84-91` vs `registry-contracts.ts:140-153` |
| E3 | `context.empty` (the F-12 no-selection arm): declared by chats/characters/refinery/databank/config; absent on corpus/analytics — **legitimately**, because both projections are never-`null` with unconditional tabs, so the arm is unreachable; absent on presets **by ruling** (the readout's no-selection panel is a first-class arm, preset-surface-redesign §7 D2, `presets-section.tsx:6-11`). | `corpus-section.tsx:49-50`, `analytics-section.tsx:25-30` |
| E4 | **Extensions ships a capability lie**: `context: { kind: "none" }` with no `panels.context: "unavailable"` ⇒ `contextAvailable` stays true (`use-shell-layout.ts:111` reads ONLY `panels`), the topbar ships the detail toggle, and the pane opens onto the generic "Nothing selected — pick something from the list and its details appear here" — false: selecting a page changes nothing there. Home is the only section coupling the two spellings. | `extensions-section.tsx:48` (no `panels`), `home-section.tsx:31`, `section-context-host.tsx:27,50-52` |
| E5 | `panels` (`SectionPanelAvailability`) is fully DERIVABLE on today's tree: `list` unavailable ⟺ the definition has no `list` slot; `context` unavailable ⟺ `kind: "none"`. Exactly one declarer exists (home) and it satisfies both derivations. | `section-registry.ts:67-70,107-119`; all ten defs read |
| E6 | LIST body species is already ADJUDICATED LAW: paginated ⇒ `createCollectionSurface` (sealed G9); small bounded whole-fetch ⇒ `LibrarySurfaceShell` + `LibraryListLayout` (lockdown §14). Conformers: chats/characters/databank (collection surface), presets/refinery (shell+layout). Outliers: **extensions** (shell WITHOUT `LibraryListLayout` — hand `Stack`, NO search of any kind) and **analytics** (neither — bespoke `useQuery` ladder; deliberate non-suspense, but its presentation shares nothing). | lockdown §14 "Browse"; `extensions-switcher-surface.tsx:58-79,88`; `analytics-list-surface.tsx:97-113` |
| E7 | LIST loading arms, cardinality ≥3: shape-matched `SkeletonRows` (chats/corpus/analytics/databank/extensions) vs `LibrarySurfaceShell`'s **text** fallback (`<Text tone="muted">{loadingLabel}</Text>` — presets, world-info, and extensions' boundary) vs Refinery's unowned suspension (E1). §11's three-states law already says "LOADING is a shape-matched skeleton … never a centered spinner" — the shared shell itself violates it. | `library-surface.tsx:40`, lockdown §11 |
| E8 | LIST empty arms: the working floor is a 3-class ladder — loading skeleton · TRUE-EMPTY teaching `EmptyState` with a live door · SCOPED-EMPTY naming every active narrowing axis with its exit (chats names character+search+month, `chat-list-surface.tsx:294-330`; databank splits search-empty from phase-scope-empty, `databank-library-surface.tsx:264-318`; refinery 2-arm). Extensions' four arms are ONE `EmptyState` whose copy is resolved per CAUSE (`EXTENSIONS_EMPTY_COPY[reason]`) — a refinement of the true-empty class, not a fourth class. **Analytics is under the floor**: both empties are bare `<Text voice="gloss">`, and its true-empty has NO door at all — a dead end the `empty-state-has-action` gate cannot see because no `EmptyState` is mounted. | `extensions-switcher-surface.tsx:43-56`, `analytics-list-surface.tsx:142-155` |
| E9 | LIST anchor containment: 7 of 8 list-bearing sections wrap their surface in a feature-named `<Container>` anchor (UI-Arch §4 anchor tier); extensions mounts `ExtensionsSwitcherSurface` bare. | `extensions-section.tsx:38` vs e.g. `chat-list-anchor.tsx` |
| E10 | Config's CONTENT inset is a deliberate species idiom: `px-section` on the pane, `py-section` INSIDE the scroll container — so the scrollbar hugs the pane edge and content scrolls under the block padding. Any root-scroller section needs its inset inside the scroller, which a shell-outside wrapper cannot provide. | `config-content-surface.tsx:232,242` |
| E11 | Chat's CONTENT is genuinely two-armed: the landing arm pads itself (`padding="section"`), the room arm is full-bleed (thread + composer + background own the region). The edge/inset choice is per-SECTION at the definition seam; chat's landing inset is section-internal composition. | `chat-landing-surface.tsx:40`, `chat-content.tsx` |

Everything else the matrix already carries stands unchanged: headers 7/8 on `ListPaneHeader` with
Refinery the outlier (#1206 in flight); `.shell-panel-body` structurally converged at 8px; CONTENT
padding cardinality 4+ with Analytics at zero (#1200 in flight); `SectionSelection` cardinality 1.

## 2. The thesis — push every axis up the enforcement ladder its variance allows

The measured drift maps EXACTLY onto the enforcement tier each axis sits at today:

- **Structural axes never drifted.** The `.shell-panel-header` band always renders (PanelChrome);
  `.shell-panel-body` pads 8px (shell.css). Cardinality 1 on both, forever, for free.
- **Type-forced axes never drifted.** `content` required with the `{planned}` arm; `context` required
  with `{kind:"none"}` explicit; `useSelectionTitle` required with the `NO_SELECTION_TITLE` sentinel;
  `list`+`selection` coupled by the union arm. No section ever shipped missing one.
- **Every optional slot and every convention drifted.** `listHeader` optional → Extensions shipped bare
  for an era (#1190). No CONTENT chrome exists → padding cardinality 4+ (#1200). Band anatomy is a
  convention → Refinery hand-rolled a retired idiom inside a defined slot (#1206). Empty/loading arms are
  prose law (§11) → analytics dead-ends, the shared shell renders text.

So the standard for each axis is placed at the HIGHEST tier its legitimate variance profile allows
(constitution §2.2 applied to the pane system): zero legitimate variance → the shell renders it
(STRUCTURAL); per-section data, zero legitimate absence → a required definition field (TYPE-FORCED),
with any legitimate opt-out spelled as a REASON-CARRYING arm in the house `{planned: "<reason>"}`
grammar — an explicit decision, never an absence; genuine per-section composition → CONVENTION + GATE,
with the gate's blind spots declared. Two lessons bound the design from below: the Refinery band proves
required-ness alone is insufficient (the slot was defined; the drift was INSIDE the returned JSX — only
a structural or component-identity enforcement reaches it), and the Extensions header proves optionality
of a universal obligation is a shipped defect waiting.

## 3. The per-axis standard

### 3.1 LIST header band — STRUCTURAL via data (the shell renders `ListPaneHeader`)

**Standard:** every list-bearing section's band is a `ListPaneHeader`. The section stops supplying JSX
and supplies DATA: `listHeader: () => ReactNode` is replaced by a required-on-the-list-arm hook field

```ts
// state/section-registry.ts — SectionWithList
readonly useListHeader: () => ListPaneHeaderView;
```

where `ListPaneHeaderView` is `{ title, accent?, count?, back?, action? }` — the exact props
`ListPaneHeader` takes today. The shell renders `<ListPaneHeader {...view} />` inside the band, in a
component keyed on the active section (the `SectionTopbarTitle`/`useSelectionTitle` precedent for a
per-section hook called by the shell — `app-shell.tsx:310`). The seven existing `*ListHeader` components
become `use*ListHeader()` hooks (their non-suspending count reads survive verbatim); `action` stays
`ReactNode` — the create verbs/kebab are feature JSX INSIDE the standard anatomy, exactly as today.

**Type home:** `ListPaneHeaderView` mints in a NEW tier-4 file `lib/list-pane-contracts.ts`
(`registry-contracts.ts` is at the 450-line cap; `#state` may import `#lib` — it already imports
`ContextDefinition` — while `#state` → `#components` would be an upward import).
`components/list-pane-header.tsx` derives its props from the view type; one shape, one home.

**Why this over the alternatives:**

- *Required `listHeader` slot only (type-forced JSX):* fixes the Extensions absence but NOT the Refinery
  drift — Refinery HAD the slot defined and filled it with the retired kicker idiom. Rejected as
  insufficient for the actually-observed failure.
- *Convention + a "roots in ListPaneHeader" gate:* an AST gate on returned JSX root is spoofable through
  wrappers and blind to a re-implemented lookalike; the structural shape makes the drift unspellable
  instead of detectable. Rejected (gates are the backstop tier, not the first resort — §2.2).
- *Fully shell-owned band with per-section static config (no hook):* the count is a LIVE query and the
  scoped modes (`accent`, `back`) are store-derived — the data is dynamic, so the seam must be a hook.
  The hook-returning-a-view IS the minimal dynamic shape.

**What it locks:** component identity (a non-`ListPaneHeader` band is unspellable), the
`LIST_PANE_TITLE_ID` landmark wiring (`panel-chrome.tsx:89` stops silently falling through on any
section), the #1136 display-step, and the mobile shed — all become properties of ONE render site.

**What stays convention (declared honestly):** the band must not suspend (E1). Not type-expressible; the
contract comment moves to `ListPaneHeaderView`'s doc block, and the structural seam reduces the audit to
one render site plus ten hooks. The build wraps no boundary around the band — a suspension there should
stay LOUD, not be absorbed.

**Enforcement:** presence = tsc (required field on `SectionWithList`); identity = structural (the shell
is the band's only author); the freed `.shell-panel-header` feature-writer wall already exists
(`context-definition-shape` arm 7).

### 3.2 LIST body anatomy — CONVENTION + the existing §14 seals, two outliers migrate

**Standard (already law, now enforced to its letter):** the data layer follows lockdown §14 — paginated
⇒ `createCollectionSurface` (G9 seals `useInfiniteQuery`), bounded-whole ⇒ suspense read — and the
presentation floor for a SIMPLE roster is `LibraryListLayout` (search input + empty-or-rows). The rich
list surfaces (chats, characters, corpus) legitimately compose their own toolbars — their search is
richer than the floor, not absent; that is conformance, not divergence.

- **Extensions migrates** to `LibraryListLayout` inside its existing `LibrarySurfaceShell`: it gains the
  search input (client-side filter over page titles + plugin names — the presets posture) and the typed
  `empty` slot, and its hand `Stack` dies. This answers the #1191 inventory question "does every
  roster-shaped LIST owe the omnibox": **yes to the search affordance** (the §4.1 LIST anatomy is
  "header → search → rows"; the composite gives it for free), **no to the corpus omnibox specifically**
  (the Autocomplete + target ToggleGroup is corpus's search-domain species, not the floor). Fork F2.
- **Analytics migrates** its presentation to `LibraryListLayout` (it keeps `useQuery` +
  `keepPreviousData` — the layout composite forces no suspense; its deliberate non-suspense posture is
  untouched) and its empty arms level up per §3.5.

**Enforcement:** G9/G6 stay the seals they are; the two migrations are one-time fixes; no new gate — the
species boundary is the QUERY SHAPE, which G9 already enforces, and presentation conformance below that
is reviewable convention (declared blind spot: a future hand-rolled simple roster is caught by review +
the §3.5 empty-floor gate arm, not by a dedicated anatomy gate).

### 3.3 CONTENT chrome — STRUCTURAL inset, TYPE-FORCED declaration, reason-carrying opt-out

**The owner's felt symptom** (#1200, matrix axis 3, cardinality 4+). Today the CONTENT region is a bare
`@container` (`region-anchor.tsx:22-29`) and every section hand-spells its own inset or forgets to.

**Standard:** a required definition field on `SectionDefinitionBase`:

```ts
/** Who owns the CONTENT region's inset. "inset" ⇒ the shell pads the region with --spacing-section
 *  (the corpus-convergence baseline); the edge arm names WHY this surface owns its own margins. */
readonly contentChrome: "inset" | { readonly edge: string };
```

The shell stamps the declared arm on the content region (`data-content-chrome="inset|edge"` on the
`RegionAnchor` wrapper in `section-content.tsx` — both the visible and the kept-hidden mounts) and ONE
shell.css rule applies `padding: var(--spacing-section)` under `[data-content-chrome="inset"]`. Sections
declaring `"inset"` DELETE their hand-spelled root padding in the same commit (half a migration is the
rot). The token is `--spacing-section`, uniformly — the corpus convergence commit's own choice
(`corpus-content.tsx:5-9`); presets' `padding="block"` and refinery's utility classes reclassify as
drift and die.

**The edge arm's occupants (all four real today — no speculative arm,
`feature-root-slot-lands-with-occupant.md`):**

| Section | `contentChrome` | The reason string records |
| - | - | - |
| chats | `{ edge: … }` | the room owns the full-bleed thread/composer/background; the landing arm pads itself (E11) |
| home | `{ edge: … }` | bespoke authored inset — section over the masthead, gutter down the sides (`home-surface.tsx:132+`) |
| extensions | `{ edge: … }` | the CONTENT region is a plugin-drawn page; the host must not shrink a guest's canvas |
| config | `{ edge: … }` | root-scroller species: the inset lives INSIDE the scroll container so the scrollbar hugs the pane edge (E10) |
| corpus · characters · analytics · databank · presets · refinery | `"inset"` | — |

**Why this over the alternatives:**

- *Convention + a padding gate:* the padding legally lives at varying depths (corpus's is on an inner
  Stack) — a static gate is either spoofable or a false-positive machine. Rejected.
- *A shell-owned JSX wrapper component with an opt-out prop:* equivalent semantics, worse mechanics —
  extra DOM, and the choice is invisible to instruments. The data-attribute form is a RENDERED RECEIPT:
  design-audit can census `data-content-chrome` against computed padding, closing the axis to silent
  regression. Rejected in favor of attribute + CSS.
- *Per-arm (not per-section) declaration:* chat's two arms tempt a finer grain, but the definition seam
  is per-section and chat's landing inset is ordinary section-internal composition; a per-arm vocabulary
  would be a new axis with one consumer. Rejected (E11 records the fact instead).

**The scroller caveat, priced:** shell-outside padding puts a section-root scrollbar 24px inside the
pane edge. Config is the known root-scroller and takes the edge arm with its inside-the-scroller idiom.
The build VERIFIES scroller anatomy per inset section (the matrix left databank's open-document arm
unmeasured); a section found to root-scroll either hoists its scroller inside the inset or takes the
edge arm with that reason — the declared arm keeps the choice loud either way.

**Enforcement:** declaration = tsc (required field — the migration is compiler-driven across all ten
defs); application = structural (one CSS rule, one attribute writer); edge-reason non-empty = a new
`section-registry-completeness` arm (the `{planned}` reason discipline, same gate, same grammar);
rendered truth = a design-audit census of `data-content-chrome` vs computed padding (instrument change,
named for the build; planted controls both directions).

### 3.4 CONTEXT pane — band required; availability DERIVED, not declared

**(a) The band identity becomes TYPE-FORCED.** `header` becomes required on `ContextTabsSpec<S>` and on
the `single` arm. Six of seven non-`none` contexts already comply (E2); Refinery adds a session-identity
band (its pane is about ONE artifact — the open session — precisely the class the P4 band exists for).
The variance proof is untouched (`header: (state: S) => ReactNode` stays contravariant); the claim
mechanism still replaces the band (#860). Cost: one new component. A legitimately bandless tabs pane has
no occupant today; if one appears it takes a reason-carrying arm then (not now).

**(b) `SectionPanelAvailability` DIES; availability derives from the definition's shape (E4/E5).**
`panels.list: "unavailable"` ⟺ the definition declares no `list`; `panels.context: "unavailable"` ⟺
`context.kind === "none"`. The field is a parallel declaration of a fact the definition already states —
the exact shadow-map class the lockdown exists to kill — and its one incident is a shipped capability
lie: Extensions' dead context toggle opening a "pick something" pane that picking cannot feed.
`use-shell-layout.ts` derives `listAvailable`/`contextAvailable` from the definition; home deletes its
`panels` block; the H3/arm L-b RULING SURVIVES — ITS INPUT CHANGES (a declared fact becomes a derived
one; no door onto a surface that does not exist, now unspellable rather than declarable). The
`kind:"none"` generic placeholder in `SectionContextHost` becomes dead code and dies with it.

*Visible chrome delta:* Extensions loses its detail-panel toggle (and, having a list but no context,
keeps its focus toggle via `anyPanelAvailable`). That is the defect closing, not a redesign.

*Rejected alternative:* keep the field and gate the coupling ("`kind:"none"` requires
`panels.context: 'unavailable'`"). A gate holding two spellings of one fact in sync is the tier below
deriving the fact once — rejected per the derive-don't-re-declare thesis.

**(c) `context.empty` stays OPTIONAL — deliberately.** The arm is unreachable for never-`null`
projections (corpus, analytics — E3) and ruled-out for presets (§7 D2). The F-12 contract already
encodes the honesty mechanism: an un-swept pane renders the deliberately-generic fallback and READS as
un-swept. Forcing the field would produce dead strings on unreachable arms — a lie tsc would then
protect. No change; this paragraph records the decision so the axis is closed, not forgotten.

**(d) `railLabel` stays optional** — the fallback (the section's rail label) is the honest name for a
section-about pane (corpus, analytics, refinery). Converged mechanism; no change.

### 3.5 Empty states — the 3-class floor, CONVENTION + GATE, cause-resolution where causes exist

**Standard (answers #1191's "is the four-arm taxonomy the new floor"):** the floor is the THREE-CLASS
ladder the three-states law already states and the best surfaces already implement (E8):

1. **LOADING** — a shape-matched `SkeletonRows`, never text, never a spinner (§3.6).
2. **TRUE-EMPTY** — a teaching `EmptyState` with a LIVE primary door (create/install/start).
3. **SCOPED-EMPTY** — names EVERY active narrowing axis (search text, filter chips, scopes) and offers
   each axis's exit; never claims the library is empty when a predicate is.

Extensions' four arms do NOT raise the floor to four: they are class 2 with the CAUSE resolved
(`useExtensionsEmpty` → one `EmptyState`, copy per reason). The LEVELING rule is: **a section whose
true-empty has multiple causes resolves the cause and teaches per-cause** (the extensions pattern is the
model), and a section with one cause owes exactly one arm. Leveling UP everyone to four literal arms
would mint dead states — maximal ≠ padded.

**Under the floor today:** analytics only (bare `Text`, doorless true-empty — E8). Its true-empty gains
an `EmptyState` with the honest door for "no rolled-up activity" (the door is a jump to Chats — activity
is made by chatting, the same cross-section jump grammar D62's region map sanctions); its search-empty
keeps the clear-search exit inside the standard component.

**Enforcement:** the existing `empty-state-has-action` gate covers mounted `EmptyState`s; its declared
blind spot — a hand-rolled bare-text empty arm — gets a new gate arm (`list-empty-floor`, home:
`section-registry-completeness` or a sibling): in a LIST-surface file, a zero-rows branch rendering
text not rooted in `EmptyState`/`SkeletonRows` is RED. Declared blind spot of THAT arm in turn: a
branch hidden behind a helper — the conformance rows (`mustFlag` on today's analytics shape, `mustPass`
on chats/databank) pin the reachable cases; review carries the rest.

### 3.6 Loading arms — fix the ONE shared home, then the floor is the composite

**Standard:** every LIST loading arm is a shape-matched `SkeletonRows`. The fix is one home:
`LibrarySurfaceShell` drops `loadingLabel` (text) for a skeleton fallback (row-shape + count params, or
a `fallback: ReactNode` the caller must fill with `SkeletonRows`) — presets, world-info and extensions
converge in the same commit (E7). Refinery's pane-level suspension gets an owned boundary: the list
surface mounts its query inside its own `LibrarySurfaceShell` (it already uses `LibraryListLayout`), so
a cold load skeletons the PANE instead of suspending the route; its band's suspending read dies with the
§3.1 hook conversion (the hook uses the non-suspending count read like the other seven).

**Enforcement:** structural at the composite for its consumers; convention elsewhere (the §11 law), with
the §3.5 gate arm's `SkeletonRows` allowance carrying the text-vs-skeleton distinction for LIST files.

### 3.7 Pane-open behavior + panel defaults — already converged where it must be; designed elsewhere

The open CONTRACT is cardinality 1 (`SectionSelection`; the mobile one-shell rule, back affordance and
overlay regimes are wholly shell-owned — `use-shell-layout.ts`). **No change.** `panelDefaults` stays a
per-section DESIGNED axis — every combination on the tree carries its ruling in the definition file
(presets both-docked O-19★; refinery both-collapsed D62; analytics list-collapsed; databank world-info
posture D-0) — the §4 grammar below records them as ruled divergences, not drift. Per-section CONTEXT
reveal choreography (`revealContextPanel` intents) stays feature-owned: a reveal is a product act on
shared rails, not chrome, and standardizing it has no drift receipt. Named non-goal.

### 3.8 LIST anchor containment — CONVENTION, one conformer added

Every `list()` mounts its surface through a feature-named `<Container>` anchor (UI-Arch §4 anchor tier);
extensions adds the missing ten-line `ExtensionsListAnchor` (E9). Not worth a gate; recorded in the §6
delta table so the sweep closes it.

## 4. The designed-divergence grammar (#1191 question 5)

How a section records a RULED divergence so the system permits it LOUDLY:

1. **Definition-seam divergences are REASON-CARRYING DATA, never absences or booleans** — the house
   `{planned: "<reason>"}` grammar, extended by `{edge: "<reason>"}` (§3.3). The reason string is
   gate-checked non-empty (`section-registry-completeness`), greppable, and — where it drives paint —
   stamped into the DOM for instrument census. A new standard axis that needs an opt-out mints its arm
   in this grammar **only with its first real occupant** (`feature-root-slot-lands-with-occupant.md`).
2. **Species-level divergences below the definition seam stay doc-recorded rulings** — the config
   collections species table (config-revamp-design.md §8.3) is the template: each divergence stated as a
   species fact with its verdict, in the design doc that owns the species, cited from the code header.
   This document's §3.7 table-of-rulings for `panelDefaults` is that mechanism applied here.
3. **Never a silent exemption:** an allowlist row, a bare optional, or an undeclared deviation is the
   drift channel this whole program closes. The classification duty is symmetric: this design marks
   presets' `padding="block"` as DRIFT (dies) and config's scroller inset as DESIGNED (edge arm) — every
   divergence in §6 carries one of those two verdicts, never a shrug.

## 5. Coupled-site inventory (walked, not remembered)

The §3 changes touch, by class:

1. **The registry contract** — `state/section-registry.ts` (`useListHeader` on the list arm;
   `contentChrome` on the base; `SectionPanelAvailability` + `panels` deleted); NEW
   `lib/list-pane-contracts.ts` (`ListPaneHeaderView`).
2. **All ten definitions** — tsc-forced by the two required fields + the deleted one (home's `panels`).
3. **Shell consumers** — `app-shell.tsx` (band render becomes the keyed hook component; `panels` reads
   die), `use-shell-layout.ts` (availability derivation), `section-content.tsx` (the
   `data-content-chrome` stamp on both Activity mounts), `section-context-host.tsx` (dead `kind:"none"`
   placeholder path), `shell.css` (the one inset rule), `components/list-pane-header.tsx` (props derive
   from the view type), `components/library-surface.tsx` (skeleton fallback).
4. **Feature surfaces** — the seven `*-list-header.tsx` → hooks; per-section wrapper-padding deletions
   (§6); extensions' `LibraryListLayout` + anchor; analytics' empty level-up; refinery's context band +
   owned boundary.
5. **Gates + conformance** — `section-registry-completeness` (edge-reason arm; the shared `registryDefinitionFact`
   reader sees the new fields), the new `list-empty-floor` arm, both with `mustFlag`/`mustPass` vitest
   rows (invisible to `pnpm check` — run the suites); `context-definition-shape` unchanged (arms are
   count/mint-based); `placeholder-copy-registry` untouched.
6. **The CT tier** — `tests/support/browser/ct-data-providers.tsx` `fakeSection` + real-registry mirror
   (`settings-section-three-coupled-sites.md`); the WHOLE shell CT family re-swept, not just touched
   surfaces (`arrival-default-retires-host-ct-premises.md` — the mount premise changes: bands render via
   hook, extensions loses a toggle, content regions gain an attribute + padding); the #1136
   `ListPaneHeader` CTs; repo-wide grep of retired literals (`listHeader`, `panels:`,
   `SectionPanelAvailability`, `loadingLabel`) across `tests/**` before claiming "no test asserts it".
7. **Instruments** — design-audit's pane census (reads `data-panel-available` — unchanged in meaning,
   now derived) and the new `data-content-chrome` × computed-padding census with planted controls.
8. **Docs** — lockdown §6a illustrative block + §15a delta note; `UI-Architecture-and-Layout.md` §4.1's
   LIST anatomy line (which still says "micro-caps title" — stale since #1136; truth-repair rides the
   build); this document graduates from draft when the program lands.

**Typecheck floors for the build lanes:** per-package `pnpm typecheck` (owns ui/client src AND
`tests/**/*.ct.tsx`) + `types:graph` (owns `tests/`+`scripts/`) — the three-program truth table in
`lane-standing-facts.md`; the registry change is exactly the shared-value class that hides stale
fixtures in unrelated suites.

## 6. Migration — per-section delta table and sweep order (#1191 question 6)

\#1200 and #1206 are DONE for this table's purposes: they conform to the CURRENT standard. The program
knowingly re-touches one of them: #1200's analytics wrapper (per-section `padding="section"`) is
superseded by the shell inset in S2 and its ~10-line wrapper dies there — acceptable, priced; the live
defect did not wait for this program. #1206's `ListPaneHeader` adoption converts to the hook form in S1
like the other seven — same-shaped edit, no wasted direction.

| Section | S1 (registry shape) | S2 (content chrome) | S3 (list body/species) | S4 (context) |
| - | - | - | - | - |
| chats | header → `useChatListHeader` view hook | declare `{edge}`; landing keeps its internal inset (E11) | — (conforms) | — |
| corpus | header → hook | `"inset"`; DELETE `corpus-content.tsx` wrapper padding | — (rich toolbar conforms) | — |
| characters | header → hook | `"inset"`; DELETE welcome + editor wrapper padding (2 arms) | — (conforms) | — |
| analytics | header → hook | `"inset"`; DELETE the #1200 wrapper | `LibraryListLayout` presentation; EmptyState + door on both empty arms | — |
| databank | header → hook | `"inset"`; delete outer-wrapper compensations; **verify the open-document arm** (matrix-flagged unmeasured) | — (conforms) | — |
| presets | header → hook | `"inset"`; `padding="block"` dies (drift verdict) | skeleton fallback via the shared shell fix | — |
| refinery | #1206's header → hook; the band's suspending read dies | `"inset"`; DELETE `px-gutter pt-block pb-gutter` Stack classes | owned `LibrarySurfaceShell` boundary in-pane | ADD the session-identity `header` band |
| extensions | header → hook | declare `{edge}` (plugin canvas) | `LibraryListLayout` + search; `ExtensionsListAnchor` | derived availability removes the dead toggle (E4) |
| home | DELETE `panels` (derived) | declare `{edge}` (bespoke authored inset) | n/a (pane-less) | — |
| config | header → hook (`useListHeader: () => ({title})`) | declare `{edge}` (root-scroller idiom, E10) | — (species baseline #925/#1043) | — (teacher lands per its own program) |

**Sweep order (three lanes, dependency-ordered):**

- **S1+S2 are ONE atomic lane** — the two required fields land with all ten definitions migrated, the
  shell render/derivation changes, the CSS rule, AND the per-section wrapper deletions in one commit:
  the field without the CSS is inert, the CSS before the deletions double-pads (tsc drives the def sweep;
  nothing can land half). This is the wide-but-mechanical leg; its floor runs the shell CT family + both
  type programs + the gate conformance suites + a rendered re-run of the matrix probe (the axis-3
  cardinality table must read `24px` on every inset section and the declared arm elsewhere).
- **S3** — the list-body leg (extensions species migration + search, analytics empties, the
  `LibrarySurfaceShell` skeleton fix, refinery's owned boundary) + the `list-empty-floor` gate arm with
  its conformance rows. Independent of S1/S2 except the shared-shell file; dispatchable second.
- **S4** — refinery's context band + the doc truth-repairs (§5 item 8) + the design-audit
  `data-content-chrome` census. Last; smallest.

**Build test plan (what proves what):** planted-control CT for the inset (a def declaring `{edge}` must
NOT receive shell padding — the fence that cannot fail otherwise); computed-padding reads on the real
resolver path (mounted shell, not a hand-authored fixture); the gate arms' `mustFlag` rows red on
today's shapes pre-fix (red-first at the gate tier); the retired-literal grep sweep (§5 item 6); the
matrix probe re-run as the closing receipt — target cardinalities: header component 1, content chrome 2
DECLARED arms (inset/edge) with zero undeclared spellings, loading arm 1 per species, empty floor met
on all 8 list-bearing sections.

## 7. Forks for the owner (defaults stated; work proceeds on the defaults)

- **F1 — the band goes structural-via-data (§3.1).** The shell renders `ListPaneHeader` from a
  section-supplied view hook; features stop authoring band JSX. DEFAULT: yes (the standing
  lock-the-extensible-shape rule; required-JSX provably wouldn't have stopped the Refinery drift). The
  lighter arm (required slot, convention on contents) is priced in §3.1 and rejected.
- **F2 — every roster LIST carries a search affordance; Extensions gains one (§3.2).** DEFAULT: yes
  (UI-Arch §4.1 anatomy + the composite provides it free). The counter-position — a small switcher
  doesn't need search — is a threshold nobody can gate; if the owner rules it, Extensions takes a
  reason-carrying divergence record instead of a silent absence.
- **F3 — the inset token is `--spacing-section` uniformly; presets' `block` demotes to drift (§3.3).**
  DEFAULT: yes (the corpus convergence baseline; 3 of 9 already there). If the owner wants a distinct
  editor-species inset, it becomes a SECOND declared arm with occupants named — never a per-section
  token choice.
- **F4 — Extensions' detail-panel toggle disappears (derived availability, §3.4b).** A visible chrome
  deletion, flagged because it is user-facing; DEFAULT: yes — the toggle opens a pane that lies today,
  and H3's own words ("never offer a door onto a surface that does not exist") decide it.

Not forked: the empty-state floor stays three classes with cause-resolution (§3.5 — leveling everyone
to four literal arms mints dead states, and the owner's maximal posture reads "completeness of the
required thing, never decoration around it"); the `panels` field deletion (a shadow-map kill squarely
inside standing law); the context band requirement (six of seven already comply).
