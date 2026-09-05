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
  #925 owner ruling drew for collections ("a genuinely distinct species, and that distinctness is
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
