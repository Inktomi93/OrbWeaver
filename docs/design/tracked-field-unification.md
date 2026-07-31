# Tracked-field unification + panel IA repair — the pool/meter/cast-field untangle

> **STATUS (2026-08-01): STAGES 1+2 SHIPPED** — stage 2 `98ee6da2` (merged): Sheet-tab dissolved,
> roster-expand = full panel takeover, RV-8 primitives swept (attributes/stat-profile/pack/journal/
> quests), per-carrier max override per the owner amendment (D113 ¶1 as amended), journal label + attribute-hint
> gloss read-halves closed. Remaining on the board: W-H side-eye pass, EXT-4.
> Original stage-1 note: **STAGE 1 SHIPPED** — `ea99b0e3`, merged to main `22cf37ea`, law minted as **D113** (`Core-Path-Registry.md`). §5 shapes are live; stage 2 (Status-absorbs-Sheet takeover view, GM editor polish, RV-8 primitives) remains open on the workboard.


**Status:** direction + spec APPROVED (owner, 2026-07-31 late — noun = **TRACKER**; widgets full-fold
+ hud_widgets table drop approved; appliesTo carrier classes approved; R4c journal-custom batches into
this lane's baseline regen). Nothing built.
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
| `subject` | applicability model (SETTLED, owner 2026-07-31): def-level default `appliesTo: all \| [actors]` **+ per-actor `grants` + per-actor `revokes`**; effective carriers = (all ? whole ROSTER : list) + grants − revokes. Covers column fields (everyone), personal fields (named actors), and one-off ad-hoc grants (the act-3 demon's "Bound Will") with ONE mechanism. Game-scoped widgets = `subject: game` (no carrier resolution). **Vocabulary ruling (owner): the people-group is the ROSTER — "cast" is not canon anywhere in the new surface.** | pools (per-actor) vs "cast fields" (per-game, legacy name) vs widgets (game-scoped) |
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
- **Status tab = the only list of people; expanding an entry IS the sheet** (SETTLED, owner
  2026-07-31 "works for me"). Collapsed row keeps today's quick edits (status line, conditions,
  meter value/max click-to-edit). Expanding is a **full panel takeover** — a character detail view
  with a breadcrumb back to the roster, NOT a five-line accordion — holding what Sheet held: title,
  level, wallet, attribute values on d20 (this is the surface d20 must not ship ugly on, RV-13).
  **Sheet-the-tab dissolves; sheet-the-view survives as the expanded state.** Pool-def rows move to
  the Game tab. Inventory STAYS its own tab (plane-shaped, not character-card-shaped). Build-time
  verify: the takeover pattern on mobile (panel = whole screen) — if it fights drawer navigation,
  fall back to the same card content as a modal (shell anatomy sanctions modal for settings-like
  surfaces). Nobody asks "Status or Sheet?" again — the answer is "the character."
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
  new state"), instead of per-concept assembly arms. The applicability model makes assembly
  **per-actor-aware**: a target's writable fields = its effective carrier set, so the schema never
  offers Mana on an actor that doesn't carry it — stronger prevent-at-schema than today.
- **RV-4/RV-12** — become "attributes get the same label+hint editor," not bespoke work.
- Migration reality: contracts + db (poolDefs/castFields/widgets converge), the 7-tools schema
  (poolDeltas + set_widget_value + castField writes converge or alias), reminder segs (one gloss
  path — fixes the R4b class for every axis at once), panel components, ~7 writable-field coupled
  sites. A LANE, not an evening. Old wire vocab may need read-compat for existing game rows.

## 5. The schema-level spec (drafted 2026-07-31 overnight — owner review pending)

Grounded in the actual current shapes (scouted with receipts; def/value homes verified):
pools `sheet.poolDefs {name,max,color,hint}` per-actor in `rpg_sheets.sheet`, values
`actorState[].pools {name,value,max}` · cast fields `features.castFields {key,label,kind,max?,hint?}`
per-game in `rpg_games.config`, values `presentCharacters[].customFields Record<string,string>`
(STRING record — meter values stored as strings today) · widgets `rpg_hud_widgets` own TABLE
{type,label,icon,position,accent,sort,binding:custom|pool|hp}, values `widgetValues` keyed by LABEL ·
attributes `statProfile.attributes {key,label,hint}` ≤12, values `sheet.attributes Record<key,int>`.

### 5.1 The unified def — `RpgFieldDef` (noun pending; lives in `config.fields[]`, ONE home)

```ts
{ key: string,                      // stable mint-once id; ALL addressing by key (kills the
                                    //   name/label dual-addressing — widgetValues-by-label dies)
  label: string,                    // display; renameable without breaking values
  shape: "meter" | "text" | "list", // list absorbs widget items[]
  write: "delta" | "set",           // resource vs observation — drives tool arm + panel read
  subject: "actor" | "game",        // game = one value on the snapshot (widgets); actor = per-carrier
  appliesTo: "party" | "npcs" | "everyone" | ActorRef[],  // actor-subject only; carrier CLASSES are
                                    //   honest to today (pools≈party-member lists, castFields≈npcs)
  max: int | null,                  // meters
  hint: string (≤120, default "") , // THE steering lever; add flow nudges it (R4b class)
  color: string | null, icon: string | null, sort: int,   // display chrome (absorbs widget chrome)
  pinned: boolean,                  // band visibility (absorbs BAND ORBS + binding:pool/hp widgets —
                                    //   a "pool widget" IS a pinned actor field; first-3-auto rule dies
                                    //   in favor of explicit pins, band renders pinned ∪ wallet)
  locked: boolean }                 // R6 prevent-at-schema; joins the fieldLocks registry by key
```

Per-actor exceptions live on the SHEET (actor-side state): `sheet.fieldGrants: key[]` +
`sheet.fieldRevokes: key[]`. Effective carriers = resolve(appliesTo) + grants − revokes.
Attributes stay in `statProfile` (settled) but adopt the same label+hint editor primitives.

### 5.2 Value storage — one shape, two homes (by subject)

`RpgFieldValue = { value: number | string, max?: number, items?: string[] }` (typed by shape —
meter:number, text:string, list:items). Actor-subject values: `actorState[].fieldValues:
Record<key, RpgFieldValue>` (replaces `pools[]` AND `presentCharacters[].customFields` — present
non-roster NPCs keep their values on the presentCharacters entry under the same record shape).
Game-subject values: `snapshotState.fieldValues: Record<key, RpgFieldValue>` (replaces
`widgetValues`). Sheet keeps NO values (authoritative max lives on the def; today's sheet/snapshot
max duplication dies).

### 5.3 Migration map (pre-launch reality: blobs + ONE squashed baseline — no incremental SQL)

- **`rpg_games.config` lift** (versioned, [[versioned-config-lift-drops-overrides]] discipline —
  stamp SCHEMA_VERSION): `features.castFields[]` → `fields[]` with `{subject:"actor",
  appliesTo:"npcs", write:"set"}`; statProfile untouched.
- **`rpg_sheets.sheet` lift**: each actor's `poolDefs[]` → game-level `fields[]` with
  `{subject:"actor", write:"delta", appliesTo:[thatActor]}`; identical defs (name,max,hint) across
  actors MERGE into one def with the union list (or "party" when it covers every party member);
  minted `key` = slugged name (name-addressing was the D86 rule, so name≡identity already).
- **`rpg_hud_widgets` table DROPPED at baseline regen**: `binding:custom` rows → game-subject defs;
  `binding:pool`/`hp` rows → `pinned:true` on the corresponding actor field (they were always just
  pins); chrome (icon/accent/position/sort) folds into the def. Baseline regen only on a quiesced
  tree ([[baseline-regen-on-shared-tree]]).
- **NO legacy machinery (owner ruling 2026-08-01: "we haven't launched — there shouldn't be legacy
  anything").** The snapshot schema changes CLEANLY to `fieldValues`; no lift-at-parse, no dual-shape
  era. Old dev-DB rows: wipe/reseed (the DB is expendable pre-launch), or a ONE-TIME throwaway
  normalization script — never committed runtime compat code.
- **Tool surface (R6's lane)**: `update_party` gains per-carrier `fields` writes typed by the def's
  `write` axis (delta fields take `{key, delta}`, set fields `{key, value}`); `set_widget_value`
  retires into the game-subject arm; `constrainExtractionSchema` emits per-actor key enums from the
  carrier resolution (the model can never write a field an actor doesn't carry). NO wire-compat era
  (same no-legacy ruling): the old arms are REPLACED outright; pre-migration turns in an expendable
  dev DB don't constrain the design.
- **Reminder**: ONE gloss seg builder for all fields (label value/max (hint)) — R4b's pattern
  generalized; per-plane special-casing dies.
- Coupled-site sweep: the ~7 writable-field sites ([[rpg-writable-field-coupled-sites]]) + panel
  components + `mergeFeatures` threading + gates (knob-wire/bus-coverage rows).

### 5.4 Sizing + sequencing

Contracts + db schema + lifts ≈ M · tool surface (inside R6) ≈ M · unified GM-tab editor + Status
absorption (RV-8 primitives) ≈ L · sweep + tests ≈ M. One serialized lane (or worktree), AFTER
tonight's R1; the spec is the gate — build nothing per-concept once it's approved.

## 6. Open before build

1. ~~The name~~ — **SETTLED: "Tracker"** (owner 2026-07-31). "Add tracker"; GM-tab section =
   Trackers; RpgFieldDef renames to RpgTrackerDef at build.
2. ~~Schema spec~~ — **APPROVED as drafted** (§5; owner 2026-07-31): widgets full-fold + table drop
   YES, appliesTo classes YES. Also batch **R4c** (journal `custom` type + label + per-game hints)
   into this lane's baseline regen — owner go.
3. ~~Sheet dissolution detail~~ — SETTLED (§3): expand = sheet view, full panel takeover with
   breadcrumb; mobile behavior verified at build time (modal fallback sanctioned).
4. Default-name hygiene — no more "Pool 4"/"Meter 3": the add flow requires a name (and nudges a
   hint) before persisting.
5. **The hint editor is non-negotiable in the unified def editor** — today the proven steering lever
   (R4b) is unauthorable from the UI for cast fields entirely.
