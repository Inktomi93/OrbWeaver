---
kind: design
status: active
updated: 2026-08-14
---

# The Actions tab at 67 rows — information architecture (FORGE lane, 2026-08-08)

> **Status: BUILT (this lane, branch `wt/agent-forge-actions`).** The side-eye's gap-closure verdict on
> the Actions tab was "a database dump wearing a UI": 51 of its then-66 rows landed in one night (the
> D132 prose migrations — the turn-wire framings, the 11 game teaches, the extraction slots) and the
> tab's structure, readout, and teaching copy were all still sized for the original 15. ROW-27
> (`rpg.extract.stateTrackingGuide`, merged mid-lane) made it 67 rows / 41 extract. This document is
> the fix's architecture: what changes, what was REJECTED and why, and which invariants hold it up.
> Receipts for every finding: `reports/snaps/group-extract-tall.png` (the 40-row group as shipped),
> `reports/snaps/readout-update-party.png` (the false delivery path); the BUILT state:
> `reports/snaps/forge-ia-rest.png` + `forge-ia-extract.png`.

## 0. The constraints that shape everything

- **D132** — templates have ONE home and it is presets. Splitting rows back out to settings or a
  second tab is not on the table; the tab must carry 67 rows WELL.
- **§5.0 / §16 row 31** — the list is a FIXED PRODUCT ENUM, not a manageable collection: no toggles,
  no grips, no Add. Whatever structure lands must not read as management chrome (the CT pins the
  absences by accessible name).
- **§6.6 / D117 registration cost** — a new template stays "one slot member + one def row". Any
  grouping mechanism must be REGISTRY DATA, never a client-side list of names.
- **UI-Arch §4.2** — CONTEXT is detail/config OF the active artifact. A readout cluster that renders
  the same bytes for every selected row is not context, it is wallpaper — and here it was FALSE
  wallpaper (the P1).
- **The config workspace's collection-group grammar** is the sibling precedent for "a library is not
  a glance": collapsed disclosure bands as the map, expansion one click away, a filter box past
  `COLLECTION_LARGE_GROUP` (= 30) members (`packages/client/src/lib/collection-contracts.ts:43`).
  The Actions tab is NOT a collection (no create/import/bulk chrome applies), but the
  band + disclosure + count + filter grammar is the house answer to this exact shape of problem.
- **X-7 anti-echo** (`docs/reviews/side-eye/2026-08-03-scoped-recheck.md`): one noun must not be
  said three ways at three levels on one screen. Any sub-heading I add has to SUBTRACT its noun from
  the rows below it (the "The scene plane — " ×5 prefixes, the 40 identical `extract` chips).

## 1. The delivery truths (derived from the live assembly code, not from the old readout)

Per-kind, where a row's bytes actually reach a model — each with its receipt:

| kind | delivery truth | receipt |
| - | - | - |
| steer / voice / studio | a fired action; `role:"system"` rides the `guided_instruction` MARKER (loud injection fallback when the marker is absent/off); user/assistant roles ride a depth-N injection | `assembly/context.ts:489-537` |
| nudge | appended as the NEWEST USER TURN when the action fires with nothing typed — never the marker | `verbs/turn.ts:1841,1971,2065` (`appendUserTurn`) |
| format | the wire's own shape decides: the note frames wrap injections at assembly, the continuation cue appends a trailing user row, the new-chat marker lands above the first canon row | `assembly/context.ts:540-560`, the framing resolvers |
| teach | the GAME TURN's steering reminder — ONE depth-0 system injection, composed per turn, only while a game is on | `domain/rpg/substrate/reminder.ts:1-4` |
| extract | the STATE ROUND — a separate extraction call after the beat (or the folded turn's terminal tools, D112); these bytes never enter the chat prompt | `entry/compose/rpg.ts:343,958` |

The old readout rendered the steer-family MARKER cluster for every selection ("Guided instruction ·
position SETUP · 10 of 12 · role system" over `update_party`'s tool description), and its glosses
("every macro here resolves in chat", "…fill in when you click") are false for teach/extract/format
rows. Also derived: the chat macro engine PASSES UNKNOWN MACROS THROUGH (`kit/macro/evaluator.ts:136`),
so a bound preview of an extract row keeps `{{trackerCatalogue}}` literal — the TEXT was honest, only
the standing copy around it lied.

## 2. The architecture

### 2.1 Sub-clusters for the 41 extraction rows — registry-declared, disclosure-banded, collapsed

`TemplateDef` gains an optional **`cluster`** field over a closed contracts union:

```
TEMPLATE_CLUSTERS = ["round", "scene", "party", "planes", "tools", "refs"]
```

Membership (8 · 9 · 5 · 5 · 8 · 6 = 41):

- **round** — the call's framing & passes: `deceptionSurface`, `systemHeader`, `toolRoundHeader`,
  `reconcilePass`, `foldedReconcile`, `lockedPaths`, `reconcileDoctrine`, and ROW-27's
  `stateTrackingGuide` (a cross-plane doctrine like the reconcile rule it precedes; its `fires` gloss
  was differentiated from the doctrine's — the two were byte-identical, the identical-truncation class
  again, one night old)
- **scene** — `scene.*` (9)
- **party** — the actor-tracker teaching + its planes: `party.resources`, `party.states`,
  `party.trackerScope`, `plane.party`, `plane.trackers`
- **planes** — the remaining write planes: `plane.inventory`, `plane.quests`, `plane.journal`,
  `journal.customType`, `journal.customLabels`
- **tools** — `tool.*` (8)
- **refs** — `refs.*` (6)

The cut follows what a HOST TUNES TOGETHER, not the id dot-prefixes (which is why `plane.party` sits
with the party teaching and `plane.journal` with the journal rows). Labels live client-side in a
tsc-exhaustive `Record<TemplateClusterId, string>` beside `TEMPLATE_KIND_LABEL` (same shape, same
enforcement: a new cluster id fails typecheck until labeled). Default label copy (owner-taste;
escalated with these as defaults): "Round framing" · "The scene plane" · "Party & trackers" ·
"Inventory, quests & journal" · "Tool descriptions" · "The ref block".

**Rendering**: inside the State-tracking `Section`, each cluster is a DISCLOSURE BAND in the config
collection-group anatomy — a ghost `Button` (chevron + kicker-voice text + mono count), body
conditionally rendered below. Collapsed by default (the owner's 2026-08-02 ruling verbatim: "the
band is the map; expanding is one click"). The band is a button with `aria-expanded`, NOT a heading
— matching the config workspace, and keeping the CT's fixed-enum absences intact (no `switch` role,
no `/^Add\b/`, no `/^Reorder/` names).

**The teach group (11 rows) stays flat.** Clustering is COUNT-DRIVEN, the same way the config filter
is: 11 human-labeled rows are scannable; 41 are not. The threshold precedent is
`COLLECTION_LARGE_GROUP` — no group here except extract exceeds it.

**Anti-echo consequences** (X-7): with a band naming the noun, (a) the per-row `extract`/`teach` KIND
CHIP leaves the LIST entirely — under a kind-titled kicker it discriminates nothing on ANY row, 41
identical chips were eating the row's right third, and the drill-in header keeps the chip where it
does discriminate; (b) the `fires` glosses drop their now-redundant cluster prefixes
("The scene plane — when to advance the clock" → "When to advance the clock", the `refs.*` and
`party.*` equivalents likewise).

### 2.2 The tab-level filter (67 > 30)

One filter input above the groups (config grammar: search glyph + `Input`, `aria-label` "Filter
templates"). Matching is a pure model function over `label + fires` (case-insensitive substring).
While a filter is active: non-matching rows drop, kind groups with no matches vanish (the existing
empty-group rule), and clusters holding matches render EXPANDED — a filter that leaves its matches
behind collapsed bands would be lying. Clearing restores the collapse state. Filter state is local
to the view (it survives drill round-trips because the drill replaces the view's RETURN, not the
component).

### 2.3 The readout: DELIVERY PATH becomes per-kind (the P1)

`ActionsReadout` renders the delivery section FOR THE SELECTED ROW, dispatched over an exhaustive
`Record<TemplateKind, …>` (house §5.5 — a new kind fails tsc, so "unknown → print nothing" is
unrepresentable; a STALE selected id already falls back to the first registry row):

- **steer/voice/studio** → today's marker cluster verbatim (health · position · role · the
  `openSectionInPrompt` cross-link). It remains the load-bearing "will my steer LAND" fact.
- **nudge / format / teach / extract** → a static delivery statement carrying that kind's truth from
  §1, plus the selected row's own `fires` line as the specific condition. No marker chrome, no
  position row — those are facts about a channel these rows do not ride.

The two glosses become per-kind the same way: the UNBOUND arm's "every macro here resolves in chat"
holds only for the steer family; teach rows state the names-only identity resolution on game turns;
extract rows state that braced tokens are DATA spliced at the state round (binding a chat resolves
identity macros only); format rows state assembly-time filling. The BOUND arm's "…fill in when you
click" tail gets the same per-kind spelling (fire/assembly/game-turn/state-round).

The header's marker cross-link chip STAYS as standing tab chrome — its label already scopes itself
("Guided instruction"), and without the marker every guided row genuinely dies.

### 2.4 The tool rows get human labels (the P2 grammar fix)

`template-rows.ts:44-48`'s own stated law: a label a person reads. The seven `tool.*` rows re-label
(defaults, escalated): `update_party`→"Party update" · `update_inventory`→"Inventory update" ·
`update_scene`→"Scene update" · `set_tracker`→"Set tracker" · `upsert_quest`→"Quest upsert" →
DEFAULT "Quest update" · `add_journal_entry`→"Journal entry" · `no_changes`→"No changes". The wire
name is NOT lost: every one of these rows' `fires` gloss already carries it verbatim ("The
update\_party tool's description…"), which is exactly the secondary/code-voice ride the finding asked
for — no new registry field needed. ("Journal entry", deliberately not "Add journal entry": the CT's
fixed-enum probe is `/^Add\b/`, and a label starting with "Add" would collide with the absence it
pins.) The drill-in header and the readout kicker inherit the human label for free.

### 2.5 The teaching sentence (the P2 copy fix)

"…{{input}} is where your steer lands" is true for 9 rows and false for 51. The tab header states
the TAB's truth (default copy, escalated): *"Every prompt template this preset authors — select a
row to see where it lands, drill in to edit it."* The `{{input}}` teaching already lives where it is
true per-row: the drill-in's token vocabulary and its no-`{{input}}` warning.

### 2.6 The fork keeps your place (the P2 eject fix)

Mechanism of the defect: `PresetForm` is keyed `entityId={presetId}`; the built-in's copy-on-write
retarget calls `selectPreset(to)`, the whole editor remounts under the fork's id, and
`ActionsView`'s LOCAL `drilledId` dies — mid-sentence, the author is dumped at the top of the
66-row list. Fix: the drill id moves into a second `createDrillSelectionStore` axis beside the
template selection (`state/preset-template-selection-store.ts` — the G27 factory door, primary-only,
device-transient). The drill target is a REGISTRY id, so re-anchoring to "the forked preset's same
slot" is automatic; the restored drill-in seeds from the fork's server row, which the retarget just
wrote with the author's own bytes. Focus lands on the drill-in's Back affordance via the existing
`useFocusOnSwap` — one Tab from the field, versus re-finding a row in a 66-row list. (The caret
itself cannot survive a suspense remount; position preservation is the finding's ask.)

### 2.7 Perf (the 131ms long frame) — MEASURED

The cost was 67 `ListRow`s each wrapping a `form.Subscribe`, all mounted in one tab-switch commit.
Collapsed-by-default clusters cut the resting mount to 26 rows + 6 bands (15 guided/format/nudge +
11 teach). Measured on the isolated stage (`pnpm snap --isolated --ref <sha>`, a long-task observer
installed in-page around a real Actions-tab click, same instrument both sides):

- **before** (main `809fdf96c`, flat 67 rows): ONE long task, **87ms**, at the click.
- **after** (this branch `753e1d5cf`, banded): **zero long tasks** — the commit dropped below the
  50ms long-task floor entirely.

Windowing therefore does NOT join the design (rejected-alternative #4 stays rejected on the measure).

## 3. Rejected alternatives (each with its why)

1. **Flat sub-kickers (headings only, everything mounted)** — fixes scanability, leaves the 131ms
   commit and the 40 dead chips untouched, and adds seven h-level headings under one kicker. The
   finding is three defects with one shared root (unstructured mass); this arm fixes one.
2. **A second drill level (cluster → rows page)** — navigation depth against §3's ONE-flat-tab-level
   owner decision, and a Back-stack for what disclosure does in place.
3. **Deriving clusters from the slot-id dot-prefixes** — insider-knowledge parsing; `plane.party`
   belongs with the party teaching, which no string-split can know; a typo'd prefix would mint a
   silent new group. Declared data + a two-sided contract test instead.
4. **Virtualizing the list now** — machinery (windowed rows inside a form-subscribed list) for a
   commit the collapse already cuts by \~60%. Joins only on a red re-measure.
5. **Splitting the tab (Actions / Game)** — a sixth editor view is an owner call, D132 named ONE
   home, and the two-call split (teach vs extract) is already the kind grammar's job.
6. **A persisted expansion store** — no cross-region reader exists (the readout doesn't care what is
   expanded); local state is the correct home. The config groups persist because a 400-row LIBRARY
   is a standing workspace; a fixed enum is not.
7. **A new `TemplateDef.toolName` field for the wire names** — the `fires` gloss already carries
   each tool's wire name verbatim; a second field would be a second home for one datum.
8. **Removing the marker cross-link chip from the header** (as another per-kind falsehood) — its
   label self-scopes ("Guided instruction…"), and marker health is the one fact that can silently
   kill nine rows at once. It stays; the READOUT stops echoing it for rows it doesn't govern.

## 4. Invariants & coupled sites

- **Contracts**: `TEMPLATE_CLUSTERS` union + `cluster?` on `TemplateDef`; the 7 label rewrites.
  Two-sided cluster census in `tests/contracts/preset/index.contract.test.ts`: every `extract` def
  declares a cluster, no non-extract def does — an unclustered extract row would render mis-filed
  above the bands, and the type system alone cannot see it.
- **Row model** (`template-rows.ts`): cluster labels Record (tsc-exhaustive) · per-kind delivery
  vocabulary Record (tsc-exhaustive) · cluster grouping + filter matching as pure functions (unit
  tested at `tests/client/features/preset/lib/template-rows.test.ts` — a NEW path, absent from the
  test-baseline deletions ledger, verified).
- **CT coupled sites** (`actions-view.ct.tsx`): KIND\_HEADERS stays (kickers unchanged) · F-01/R-7
  geometry now measures with all clusters EXPANDED first (collapsed rows are unmounted) · the
  fixed-enum absences must hold WITH the new bands mounted · the Customized-chip census unchanged ·
  new pins: clusters collapsed at mount, band expand reveals rows, filter narrows + auto-expands,
  drill survives an entityId remount (the fork), no snake\_case row names.
- **Readout CTs** (`readout-binding.ct.tsx` + new `actions-readout.ct.tsx`): the default selection
  is the FIRST registry row (a steer), so the existing "Delivery path" + "resolves in chat"
  assertions stay green by construction; new cases select a teach and an extract row and pin the
  per-kind truth + the ABSENCE of the marker cluster (red-first against the old component).
- **Shared literals swept across `tests/`** (the shared-value law): the seven old tool labels ·
  "Every macro here resolves in chat" · "{{input}} is where your steer lands" · "Delivery path" ·
  the changed `fires` strings ("The scene plane —" family) · "fill in when you click".
- **Registration cost after this change**: one slot member + one def row, plus `cluster:` on the row
  iff the row is `extract` — enforced two-sidedly, stated here so D117's cost stays honest.

## 5. Verification floors (named, run in-lane)

`tests/client/features/preset/components/actions-view.ct.tsx` FULL ·
`tests/client/features/preset/surfaces/preset-editor-surface.ct.tsx` FULL ·
`tests/client/features/preset/components/readout/readout-binding.ct.tsx` +
`…/readout/actions-readout.ct.tsx` (new) · `tests/client/features/preset/lib/template-rows.test.ts`
(new) · `tests/contracts/preset/index.contract.test.ts` + `tests/contracts/prose/index.contract.test.ts`
· `pnpm typecheck` + `pnpm typecheck:graph` + `pnpm typecheck:tests-dom` · biome/eslint scoped ·
`pnpm check:structure` · whole-tree `npx knip --cache` · depcruise (a new store axis file is an
import-graph change) · the tab-switch perf re-measure (`snap --isolated`, long-task observer,
before/after numbers in the lane report).
