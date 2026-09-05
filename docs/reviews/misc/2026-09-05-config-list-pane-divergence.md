---
kind: review
status: active
updated: 2026-09-05
---

# Config's LIST pane vs the app's other LIST panes — the measured divergence (#1169)

**Owner observation (#1169):** the Settings LIST is "built differently" from the chats / characters /
presets LIST panes. This is arm **(a)** of that row and nothing else: a **measured comparison receipt**
naming which anatomy axes actually diverge, which of those divergences are **species-legitimate** under
the #925 collections ruling, which are **drift**, and a **proposed** convergence build. **No taste was
landed** — the one mechanical change this lane made on the config LIST is named in
[§6](#6-what-this-lane-landed-and-what-it-refused).

Everything below is measured on ONE build of the working tree (lane
`cb-client-config-polish`, base `e131a704d`) through `pnpm snap <route> --dirty --eval`, four runs, one
per route, `nav=OK` on all four. Numbers are CSS px at the default desktop viewport (1280×800,
`pointer: fine`).

## 1. The census

| axis | `/chats` | `/characters` | `/presets` | `/config` |
| - | - | - | - | - |
| chrome band | `ListPaneHeader` | `ListPaneHeader` | `ListPaneHeader` | **`ListPaneHeader`** |
| band content | `Chats 6`, 30px | `Characters 10`, 30px | `Presets 1`, 30px | `Settings`, 30px — **no count** |
| leaf-row primitive | `ListRow` | `ListRow` | `ListRow` | **`ListRow`** |
| leaf rows in DOM | 6 | 10 | 1 | 9 |
| leaf-row height | 44 (48 promoted) | 44 | 44 | **35** |
| intermediate bands | 0 | 0 | 0 | **13 `Button`s** (`[data-slot=config-band]`) |
| search affordance | `Input` "Search chats" | `Input` + a sort `Toggle` group | `Input` "Search presets" | **`role="combobox"`** (the `@orb/ui` Command seal) |
| `data-voice` set in the aside | kicker · label | kicker | gloss · kicker · label · datum | **kicker · interactiveKicker · datum · gloss** |

Run slots (retained ≥24h): `agent-a2920956e177825e7-…T05-3[45]-*`; the config before/after pair used for
§6 is `…T05-33-41-757Z` (`--ref e131a704d`) and `…T05-32-00-770Z` (`--dirty`).

## 2. What is ALREADY converged — two axes the ticket's premise did not have

Both of these were re-derived against today's tree and both refute the "built differently" reading at the
axis a reader would reach for first:

1. **The chrome band is the same composite.** `config-section.tsx:79` passes
   `listHeader: () => <ListPaneHeader title={CONFIG_SECTION_LABEL} />` — the same
   `packages/client/src/components/list-pane-header.tsx` cluster chats / characters / presets / databank /
   corpus / analytics / extensions / refinery pass. There is no hand-rolled config band to converge; the
   `ListPaneHeader` mint already retired every private copy, config's included.
2. **The leaf row is the same primitive.** `config-list-group.tsx:288` renders `ListRow` for a SECTION row,
   with no density or size override — the same `@orb/ui` primitive, at the same defaults, that
   `chat-summary-row.tsx:195`, `character-card.tsx:136` and `PresetLibraryRow` render.

So the divergence is not "config declined the shared primitives". It is entirely in **the layer between
the band and the leaf**, which is a layer the other three panes do not have.

## 3. The divergences, judged

### 3a. SPECIES-LEGITIMATE (do not converge)

- **The intermediate group band (13 `Button` disclosures).** Config's LIST is a two-level **MAP** of a
  fixed registry — shelf → group → section — and its rows are a map of the pane BESIDE it, not a roster of
  entities you open. Chats / characters / presets are flat rosters of one entity kind. A disclosure band
  is the anatomy of the first thing and has no referent in the second. This is the same distinction the
  \#925 owner ruling drew for collections ("a genuinely distinct species, and that distinctness is
  legitimate — what was illegitimate was a band that did nothing at all"), applied one level up.
- **The band carries no count.** `ListPaneHeader.count` is documented as "a live census … omitted at 0 (a
  zero census is noise, not information)". Config's population is a compile-time registry: "Settings 13"
  counts groups the reader cannot create or delete. A census is information about a LIBRARY; config has
  no library at the pane level. (Its collections DO carry counts, on their own bands — correctly.)
- **The search is a `combobox`, not an `Input`.** The other three narrow ONE homogeneous roster in place.
  Config's search is an INDEX over groups · sections · leaves PLUS every collection's dynamic member rows,
  with a typed `@` filter grammar, and selecting a hit **jumps** (`openConfigTo`) rather than filtering.
  Those are different verbs; the Command seal is the affordance that matches the second one, and
  `library-surface.tsx` already records the reciprocal fact — its `beforeSearch` slot was deleted with the
  note that "a pane-scoped block above the search is exactly the chrome a mixed-kind config list can't
  keep".
- **`interactiveKicker` on the group band.** The uppercase tracked instrument register belongs to a band
  that NAMES A REGION, not to a row that names an entity. Chats / characters / presets have no such
  element, so there is nothing for it to disagree with.

### 3b. DRIFT (candidates for convergence, none landed here)

- **D1 — the 35px section row.** Config's `ListRow` measures **35px** against **44px** on all three other
  panes. Same primitive, same defaults: the difference is PAYLOAD (config's row is title-only; the others
  carry a portrait/subtitle/actions). That is not by itself a defect — but it means the config LIST is the
  one pane whose rows sit at the primitive's bare minimum, and it is the axis a reader's eye reads as "a
  different kind of list". **Open, and NOT measured here:** whether that row clears the coarse touch floor
  on a phone. The mobile stage lands on CONTENT (`panel-list-mode=collapsed`), so the LIST is not in the
  audited DOM at `--mobile` without a drive, and I refuse to assert a coarse number I did not take. This
  is the single highest-value follow-up measurement on the row.
- **D2 — the voice set is the widest of the four.** The config aside speaks four voices
  (kicker · interactiveKicker · datum · gloss) where chats speaks two and characters one. Each is
  individually justified in its own call site; nobody has judged the SET. A four-voice aside is the
  mechanism by which "nothing recedes" (UI-Density-Law §2.3's own words about the size×weight×tone
  matrix), and it is worth one deliberate pass.
- **D3 — the shelf kicker has no twin anywhere.** `CONFIG_SHELF_LABELS` renders as a bare
  `Text voice="kicker"` inside a `role="group"`, with the shelf's modified `Badge` beside it. No other
  LIST pane groups its rows at all, so this is the one anatomy element with no cross-pane precedent to
  measure against — which is exactly the condition under which a thing drifts unnoticed.

## 4. The proposed convergence build (NOT landed — this is the proposal half of #1169)

Stated as what config's rows would ADOPT and what they must NOT, so the row can be decided rather than
re-derived:

**Adopt**

- `ListRow`'s populated grammar for the SECTION row — specifically a `subtitle`/`meta` payload where the
  section has one honest thing to say (today only the `Save failed` marker uses `meta`). This is what
  closes D1 by giving the row content rather than by hard-coding a height, and it costs no primitive.
- One deliberate voice budget for the aside (D2), decided once and written into
  `config-list-group.tsx`'s header the way the band's other rulings already are.

**Must NOT adopt**

- `LibraryListLayout`. It is the search+rows+empty scaffold for a homogeneous library; config's list is a
  registry map with a jumping index. Its own header already says a mixed-kind config list cannot keep that
  chrome.
- A flat roster. Deleting the group band would delete the map — and the LIST's stated job (its surface
  header: "it is the one place the macOS negative control is refuted: the LIST ALWAYS shows where you
  are") is the map.
- The band count. See §3a.

**Sequencing.** D1 is measurable and mechanical and should be split out with its coarse-pointer
measurement attached. D2/D3 are taste and belong to a side-eye pass over the whole aside, not to a
convergence refactor.

## 5. Method, and what it cannot see

- Four `pnpm snap --dirty --eval` runs, one per route, identical expression, all `nav=OK`. Geometry is
  `getBoundingClientRect()`; the voice set is the distinct `data-voice` stamp inside the pane's `<aside>`.
- **Population caveat:** `/presets` had ONE row and `/chats` six on this stage db. Row HEIGHT is a
  per-row property and is safe at that population; anything about density-under-load is not, and nothing
  here claims it.
- **Coarse pointer is absent from this receipt by refusal, not by oversight** — see D1.

## 6. What this lane landed, and what it refused

- Landed on the config LIST: nothing that changes its look, except the #1211 fix (the empty-collection
  dashed card became a one-line gloss), which is its own row with its own before/after receipt and was
  ruled by that row's design verb, not by this comparison.
- Refused: every axis in §3b. They are proposals in this document and nowhere else.

---

## 7. The cohort-anatomy census, at BOTH pointer classes — and the convergence (lane cb-config-list)

**Owner ruling (Nate, 2026-09-05 \~13:50Z, #1169): "receipt + full convergence"** — a cohort-anatomy census
across ALL FOUR LIST panes naming EVERY divergent axis, then config rows adopt `ListRow` +
`ListPaneHeader` + the shared voice **wherever the collections species does not forbid it**. §1–§6 above
are arm (a) and stand; this section is the census the ruling asked for and the build it decided.

Measured on ONE isolated stage pinned to `3b321d121` (the lane's merge base, `--isolated --ref`), through
one `snap --session` browser at the fine pointer and four `--mobile` runs at the coarse one. Every run
`nav=OK`. Fine: `device=fine:dpr1:1280x800`, LIST pane 307px. Coarse: `device=coarse:dpr3:430x740`, LIST
pane 430px — **the phone lands ON the LIST for all four routes with no drive**, because the mobile
one-shell rule makes the LIST the screen while nothing is selected and config's arrival default is
explicitly disabled on a phone (`useConfigArrivalDefault`'s third condition). That is why §5's refusal to
assert a coarse number is now discharged rather than repeated.

### 7.1 The census

| axis | `/chats` | `/characters` | `/presets` | `/config` | verdict |
| - | - | - | - | - | - |
| chrome band composite | `ListPaneHeader` | `ListPaneHeader` | `ListPaneHeader` | `ListPaneHeader` | CONVERGED |
| band census | `Chats 6` | `Characters 10` | `Presets 1` | `Settings`, none | SPECIES (§3a) |
| band primary action | New chat | New character | New preset | none | SPECIES — config has no PANE-level create verb; each collection carries its own on its band. Not unprecedented: corpus/analytics also pass no `action` |
| leaf-row primitive | `ListRow` | `ListRow` | `ListRow` | `ListRow` | CONVERGED |
| leaf-row height, FINE | 44 (48 promoted) | 44 | 44 | **35** | DRIFT-CANDIDATE (D1) → REFUSED, §7.3 |
| leaf-row height, COARSE | 48 | 48 | 48 | **48** | CONVERGED — the floor is met by the primitive, not by payload |
| rows with a subtitle | 6/6 | 10/10 | 1/1 | **0/9** | SPECIES — a section is not an entity; §7.3 |
| rows with a leading slot | 6/6 | 10/10 | 1/1 | **0/9** | SPECIES — no portrait for a section |
| rows with trailing actions | 6/6 | 10/10 | 1/1 | **0/9** | SPECIES — a section has no lifecycle verbs |
| rows with `meta` | 6/6 (time stamp) | 0 | 0 | **0/9 → 1/9 when modified** | DRIFT → **LANDED**, §7.4 |
| row-GROUPING disclosure bands | 0 | 0 | 0 | **14** | SPECIES (§3a) — and its twin is named in §7.2 |
| other disclosures in the pane | 1 (the phone month fold, coarse only) | 1 (the filter rail's expander) | 0 | 1 (the search combobox) | chrome, not grouping — the review's "0 intermediate bands" needed this split to stay true |
| band height (config) | — | — | — | 32 fine / 44 coarse, **all 14 identical** | CONVERGED — the `31` in §1's reading was the search combobox, not a band |
| `data-voice` set in the pane | kicker · label | kicker | (none) | datum · gloss · interactiveKicker · kicker | DRIFT (D2) → **LANDED**, §7.5 |
| search affordance | `Input` | `Input` + sort toggles | `Input` | `combobox` | SPECIES (§3a) |

Population on this stage: chats 6 · characters 10 (9 mounted at 430px — the roster is windowed) · presets
**1** · config 9 rows under the arrival group + 14 bands. Row HEIGHT is a per-row property and is safe at
that population; nothing here claims anything about density under load.

### 7.2 The owner's "click and expand" candidate — the premise is INVERTED, with a receipt

The #1169 comment names the PRESET list's click-and-expand idiom as a candidate model
(*"could use stuff from preset for click and expand, or adapt to the other lists"*). Re-derived on the
tree: the Presets LIST pane has **no disclosure at all** (census row above: 0). The idiom is in the preset
**editor's Actions view**, `packages/client/src/features/preset/components/actions-view.tsx:151-238` — and
that component's own header says what it is:

> One SUB-CLUSTER band + its disclosed rows (IA §2.1) — **the config collection-group band anatomy**
> (chevron · kicker-voice label · mono count), collapsed by default…

So the borrow already happened, and it ran **from config outward**, not toward it. Config's group band is
not the pane's odd anatomy; it is the anatomy another surface adopted. Two deltas of that borrow were
examined and both are refused with their reason:

- **`subtitlePlacement="column"` + a gloss on the row.** `TemplateListRow` pins a name column and gives
  the flexing rest to `def.fires`. A config section's only candidate gloss is `ConfigSubcategory.teach`,
  which is OPTIONAL and declared on a minority of sections (`APPEARANCE_READING_SUBCATEGORY` declares
  none, for one) — so a teach-derived subtitle would produce a RAGGED list, some rows two lines and most
  one. A ragged pitch is a worse read than a uniform short one, and inventing prose to fill the slot is
  padding, not convergence.
- **The band degrading to a static sub-header while a filter is active.** `TemplateCluster` does this so a
  collapsed band cannot hide a match and make the filter a liar. Config's search **jumps** rather than
  filters (§3a), so there is no state in which a config band could hide a match. Not applicable.

A settings-group band count (`Appearance 9`) was also considered and refused on §3a's own argument one
level down: a section count is a compile-time registry constant, and printing it as a census would be a
number dressed as information.

### 7.3 D1 — REFUSED as a height axis, with the two receipts §5 was missing

1. **The coarse pointer, the question §5 declined to answer.** All four panes measure **48px** at
   `device=coarse:dpr3:430x740`. `ListRow`'s default density is `min-h-control-md`, and `control-md` is
   POINTER-CONDITIONAL by construction (D62 P1: 3rem coarse / 2.125rem fine,
   `packages/ui/src/tokens/tokens.json`). The 35px is therefore a fine-pointer number and the finger floor
   is met by the primitive itself. **The 35 vs 44 gap is not a reachability defect**, and the pane that
   reads "different" reads that way for a mouse only.
2. **Every candidate payload is dishonest or unstable** — §7.2's two, plus a leaf count. The one honest
   thing a config section row has to say is the §7.4 datum, and it costs no height.

D1's legitimate half — "the config LIST is the one pane whose rows sit at the primitive's bare minimum" —
is answered by giving the row the fact it actually has, not by buying a second line.

### 7.4 LANDED — the section row says WHICH section differs from its default

`useConfigModified` derives BOTH grains in one pass (its own header says so) and the LIST spent only the
group one. So the mark propagated UP — shelf, then band — and stopped one level ABOVE the row that names
the location: a reader who had changed one setting was told "something under User changed", opened the
band, and got nine identical section rows. This is #1099 Errand A's own class ("restoring a setting you
regret started with a blind hunt through nine collapsed groups") one level down, and the verdict was
already in hand.

It rides `ListRow.meta` — the row's existing state slot, already the `Save failed` marker's home and
already part of the row's `aria-describedby` — with a stated precedence: **`Save failed` outranks
`Modified`**, because it is the actionable fact.

**The peers' `markers` + `Badge` grammar was built and MEASURED, then refused.** Run against the row-pitch
pin, the Badge arm produced `Set { 35, 42 }`: the modified row grew to 42px while its eight siblings
stayed at 35, making the LIST's pitch a function of the reader's settings. A chats row absorbs the same
badge only because it is already 44px with a portrait and a subtitle. That planted control is what makes
the row-pitch pin a defect proof instead of a fence.

### 7.5 LANDED — D2, the voice budget, and the ruling fork it touches

The pane's FOUR voices are not the defect; the absence of a judgment about them was. The budget now lives
in `config-list-group.tsx`'s header as its one home: `kicker` names a non-control region · `interactiveKicker`
names a control region · `datum` is a mono count · `gloss` is prose · **STATE IS A `Badge`, NEVER A VOICE.**

That last clause moves the band's `Modified` and `Not built yet` marks off `Text voice="kicker"`. It is
\#1214-2's landed shelf ruling ("as a `Text voice=kicker` it was typographically IDENTICAL to the shelf's
own name … a reader had no way to tell the name from the state") applied to the two sites one level down —
where the band's own label is `interactiveKicker`, i.e. the same micro-caps register.

**The ruling fork, stated.** The clause it edits is #1099 Errand A's own note in that file: *"`kicker` is a
text voice, not a box: the band's height is untouched."* The MECHANISM survives intact and is now provable
rather than argued — the band is `size="sm"`, i.e. `h-control-sm`, a FIXED height (32px fine / 44px coarse,
measured across all fourteen bands), so a \~30px Badge inside it cannot move it, and the CT asserts the
band's height against the resolved token. What changed is the clause's INPUT: the reason to prefer text was
never "text", it was "no growth", and a box in a fixed-height control does not grow it.

### 7.6 D3 — REFUSED; the twin exists once the scope is right

§3b's "the shelf kicker has no twin anywhere" is true of the four LIST panes and false of the surface the
owner named: `actions-view.tsx:151` renders `<Section kicker={TEMPLATE_KIND_LABEL[group.kind]}>` over a
stack of rows and sub-bands — a kicker naming a shelf of grouped rows, with disclosure bands beneath it.
That is config's shelf/band anatomy, drawn by the preset editor. The shelf's own state mark was already
converged to a `Badge` at #1214-2. Nothing to build.

### 7.7 Refused-with-receipt, in one list

- `LibraryListLayout` · a flat roster · the band count — §4's must-NOT list, unchanged and re-affirmed.
- D1 as a height axis — §7.3, on the coarse receipt.
- A `teach`-derived subtitle — §7.2, on the optionality of `ConfigSubcategory.teach`.
- A `Badge` in `ListRow.markers` — §7.4, on the measured `Set { 35, 42 }`.
- A settings-band count — §7.2, on §3a's own argument.
- An `aria-label` on the UNBUILT band arm. The obvious reading of #1214-1 is that it shares the modified
  marker's welding defect; run red-first against the unmodified source, the band already announced
  "Connections Not built yet" as two words, because that marker's box is not a bare inline span. The pin
  stays as an honestly-labelled FENCE over the box change this lane made.

### 7.8 Method, and what it cannot see

- One `snap --session` browser for the fine arm (`--panels list-only --idle`, one call per route) and four
  `--isolated --ref --mobile` runs for the coarse arm; geometry is `getBoundingClientRect()`, the voice set
  is the distinct `data-voice` stamp inside `aside[data-panel-side="list"]`, and disclosure counts exclude
  `aria-haspopup` triggers and anything inside `list-row-actions` (without that exclusion the chats pane's
  six row kebabs read as six intermediate bands — the first pass made exactly that mistake).
- The box was under load throughout (`load=31–54/24`); every run carries `app-snapshot=load-suspect`, which
  is a RATE caveat. Geometry is not a rate: the same numbers came back across seven separate runs.
- **Presets is one row on this stage db.** Its per-row anatomy is safe; nothing here claims anything about
  its behaviour at scale.
- Nothing on the tree carries `{ placeholder: true }` today, so the unbuilt band arm has no live subject
  and every claim about it in §7.7 is a CT receipt, not a rendered one.
