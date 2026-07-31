# Tracked-field unification + panel IA repair — the pool/meter/cast-field untangle

**Status:** direction AGREED (owner, 2026-07-31); schema-level spec NOT yet written; nothing built.
**Scope:** rpg panel Status/Sheet/Game tabs + band, the field def contracts, the 7-tools write surface.
**Evidence:** eyes-on live drive 2026-07-31 (`reports/snaps/untangle-*.png`, dogfood konbini game +
seeded d20/freeform games) + code recon. Supersedes **RV-14** (the rename) — the name problem dissolves
in the merge. Reshapes **RV-8** (CRUD program) and **R6** (tool assembly).

---

## 1. The tangle, as observed (receipts)

**One concept, four names.** The same "labelled number tracked on someone" is called:
- **pool** — Sheet tab section header POOLS
- **meter** — Sheet tab's add affordance ("Add meter" → creates a pool named "Pool N")
- **meter field** — Game tab, CAST FIELDS — TRACKED ON NPCS ("+ Text field / + Meter field")
- **band orb** — Game tab BAND ORBS section (a pinned pool) + 3-letter abbreviations in the band

**One lifecycle, three tabs.** For a single pool:
- DEFINE (name, hint "what this pool means…", max) → **Sheet** (`sheet.poolDefs`, per-actor)
- LIVE VALUES (current/max bars, conditions, status) → **Status** roster card
- VISIBILITY (pin to band) → **Game** tab BAND ORBS ("define pools on the Sheet tab, then pin them
  here") — a teaching string that documents the three-tab dance instead of fixing it
- …and the sibling concept (cast fields) defines on a **fourth** surface (Game tab), because its defs
  are per-GAME (`features.castFields`) while pool defs are per-ACTOR (`sheet.poolDefs`)

**Sheet is almost useless** (owner verdict, confirmed on sight): subject picker + Level + wallet chips
+ pool DEF rows. On freeform it even punts its own content away ("This game steers on prose —
attributes are defined in the Game tab") while on d20 it shows six attribute value tiles (all "1",
no add, no rename, no hint editing — RV-4/RV-12). A tab whose content migrates to another tab
depending on profile is not a home, it's a hallway.

**Observed rot the tangle causes:** the seeded game carries a live **"Pool 4", max 10** — an
"Add meter" default-name orphan persisted into state. And the same class live-reproduced on the GM
tab: clicking "+ Meter field" instantly persists **"Meter 3", max 100** with only an inline-rename
focused after the fact. Default-named defs are what both add flows produce by design.

**Live-drive findings (2026-07-31, claude-in-chrome on :5173, seeded freeform game):**
- **Status roster IS already the living table** — value AND max are click-to-edit per pool
  (`"Mana value — Click to edit"` / `"Mana max — Click to edit"` in the a11y tree). The §3 direction
  strengthens: Status needs absorption, not creation.
- **Cast-field def rows have NO hint editor.** Row grammar on the GM tab is `kind-chip · name
  (inline rename) · max · delete` — nothing expands, nothing else is editable. The `hint` exists in
  schema and is the PROVEN steering lever (spike §4d, R4b), and **no host can author one from the
  product.** The write-half fix (R4b) ships a gloss no UI can populate for cast fields.
- **Band rule discovered:** "BAND ORBS — PIN BEYOND THE FIRST 3: the first 3 pools always show. Pin
  more to surface them as band orbs" — auto-first-3 + explicit pins, managed as pill toggles on the
  GM tab (a third surface in the pool lifecycle, as charged).
- Stat-profile arm text varies by profile ("Freeform — this game steers on prose, with no attribute
  vocabulary" vs d20's chip row) — fine per RV-13, but the freeform arm offers no path TO d20,
  which RV-13's branch-and-save direction will need.
- Minor (W-H): at panel widths below ~1280 the meta tabs render icon-only and the game-tab strip
  x-scrolls with a visible scrollbar.

## 2. The unified concept

**ONE def — the tracked field** (final user-facing name = owner's call; "tracker" is the working
placeholder). Axes, not siblings:

| Axis | Values | Today's concepts it absorbs |
|---|---|---|
| `subject` | per-actor def vs game-wide def (applies to roster/NPCs) | pools (per-actor) vs cast fields (per-game) vs widgets (game-scoped) |
| `shape` | meter (value/max) · text · list | meter fields, text fields, widget lists |
| `write` | **delta** (spend/restore — a resource) vs **set** (observe — a state) | poolDeltas vs set-value; KEEP THIS LOUD — it drives the tool arg shape, the model's mental model, and the panel read (bar you drain vs gauge that tracks) |
| `hint` | the gloss — REQUIRED-encouraged (steering lever per §4d of the spike; R4b class) | pool hint, cast-field hint, attribute hint |
| `pinned` | surfaces in the band | band orbs |
| `locked` | removed from the write surface (R6 prevent-at-schema) | lock flags |

**Attributes stay OUT of the merge** — they're the sheet's definitional skeleton (the d20 structure,
RV-13), not per-beat state. They share the label+hint editing UI, nothing else.

**Wallet stays wallet** (first-class per rebuild-era ruling), though it renders in the band like a
pinned field.

## 3. The IA repair

**One home per concept** (the §13 blunt-taste law): a concept's DEFINITION, VALUES, and VISIBILITY
should be reachable from ONE primary surface, with authority split host/player where needed.

- **Game tab (GM console) = definitions & rules.** ALL tracked-field defs — create/rename/hint/max/
  subject/pin/lock — in ONE section with ONE vocabulary and ONE add flow (subject picked inside it),
  replacing Sheet's "Add meter", Game's "+ Text field / + Meter field", and the BAND ORBS pin section.
  Stat-profile attribute defs (add/rename/hint — RV-4/RV-12) live here too, same editing primitives.
- **Status tab = the living table, and the primary daily surface** (owner: "do more inline on
  status"). Roster cards grow inline edit for current values AND max (quick-adjust), conditions,
  status — plus an expand: the card's expanded state absorbs what Sheet held (title, level, wallet,
  attribute values on d20). **Sheet tab dissolves.** Its subject-picker/level/wallet/attribute-values
  content moves into the expanded Status card; its pool-def rows move to the Game tab. One tab fewer,
  zero content lost, and "not being able to set max here" stops being a sentence anyone says.
- **Band = pure display** of pinned fields (+ wallet). Pinning toggles on the def row (Game tab) and
  optionally right on the Status card (pin glyph) — both write the same `pinned` flag.

Player-vs-host authority: value edits on your own character = player; defs, locks, pins, others'
values = host (existing permission grammar, unchanged).

## 4. What this supersedes / reshapes

- **RV-14 (rename)** — SUPERSEDED: "cast fields" ceases to exist as a concept; the one name ships
  with the merge (owner supplies it).
- **RV-8 (CRUD program)** — reshaped: build ONE field-def editor + ONE inline value-edit primitive
  against the unified def, not per-concept editors. Sequencing: this doc's schema spec FIRST, then
  RV-8 builds against it.
- **R6 (per-game tool assembly)** — reshaped: one def kind → one constraint path + one description
  template parameterized by axes (write:delta → "spend/restore" guidance; write:set → "record the
  new state"), instead of per-concept assembly arms.
- **RV-4/RV-12** — become "attributes get the same label+hint editor," not bespoke work.
- Migration reality: contracts + db (poolDefs/castFields/widgets converge), the 7-tools schema
  (poolDeltas + set_widget_value + castField writes converge or alias), reminder segs (one gloss
  path — fixes the R4b class for every axis at once), panel components, ~7 writable-field coupled
  sites. A LANE, not an evening. Old wire vocab may need read-compat for existing game rows.

## 5. Open before build

1. **The name** (owner) — the single user-facing noun.
2. **Schema spec** — the unified def + value storage + migration map (poolDefs/castFields/widgets →
   fields), incl. whether `set_widget_value`/`poolDeltas` alias or merge on the tool surface.
   Interacts with R1/R6 build order: decide the shape BEFORE R6 assembles tools per-concept.
3. **Sheet dissolution detail** — d20 attribute VALUES need a good expanded-card layout (RV-13 makes
   d20 the flagship; this must not ship ugly).
4. Default-name hygiene — no more "Pool 4"/"Meter 3": the add flow requires a name (and nudges a
   hint) before persisting.
5. **The hint editor is non-negotiable in the unified def editor** — today the proven steering lever
   (R4b) is unauthorable from the UI for cast fields entirely.
