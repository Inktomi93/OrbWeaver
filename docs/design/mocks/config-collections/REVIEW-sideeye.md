---
kind: review
status: active
updated: 2026-09-05
---

# side-eye — the config-collections canvas (lane cb-mock-sideeye, 2026-09-05)

Subject: `<scratchpad>/config-collections/canvas.html` (7 desktop boards + 4 phone boards), rendered by
me at 1520 CSS px through the repo's own Playwright, driven through every `data-act` verb, in BOTH
themes. Shots: `<scratchpad>/config-collections/se/`. Live comparison receipts: snap runs
`main-2423685-2026-09-05T17-23-45-864Z` (config LIST, `nav=OK`) and
`main-2433359-2026-09-05T17-25-06-744Z` (config with the Tags band clicked, `nav=OK`).

---

## VERDICT: **BUILD WITH THESE CHANGES**

The move itself is right and I can prove the problem it solves. The live "before"
(`reports/runs/snap/main-2433359-.../snaps/cbmock-config-tags.png`) shows a 307 px LIST rendering 28 tag
rows, a sort control and a host sentence, while CONTENT holds a blurb, two insight rows, and the line
*"Pick one from the list to open its editor."* — roughly 60 % of the screen doing nothing while the
narrowest column does the library's work. That is the "mixed and looks weird". Board 2 fixes it.

Three things stop this from being "build to it":

1. **Board 1 is not Settings as it works today** (P1-1). The mock redesigns the settings arm too —
   different band register, different row anatomy, invented section names — and that unruled redesign is
   what *creates* the "two band kinds" problem Decision 5 then solves. On the tree there is exactly ONE
   band kind and both arms already share it.
2. **Decision 2 as drawn is a dead toggle that navigates** (P1-2). Clicking the on-row switch opens the
   editor; the switch has no role, no tab stop, and a 52×17 box.
3. **The library row is 67 % empty at pane width** (P1-4). The row anatomies were tuned for 307 px and the
   mock moves them to 628 px unchanged.

Everything else is fixable inside the shape the mock proposes. Do not redraw.

---

## Ranked findings

| # | P | board / shot | what | receipt | recommendation | | | | | | | |
| - | - | - | - | - | - | - | - | - | - | - | - | - |
| 1 | **P1** | 1 · `se/dark-f0-dk.png` vs live `main-2423685/snaps/cbmock-config-live2.png` | **The "unchanged" Arrival board is a second, unruled redesign.** Live: 13 bands, ALL `data-voice=interactiveKicker`, ALL `text-transform:uppercase` 13 px / `letter-spacing 1.04px` / **32 px**, each with an icon and a chevron, no subtitle. Mock: settings bands become sentence-case 47.5 px rows with gloss subtitles ("Appearance / Hearth · comfortable"), no icon, no chevron; shelf headers gain a chevron + a count ("USER 5" — live has a bare kicker, no count); the Appearance sections are invented (mock: Looks·Density·Motion·Reading·Texture & blur; live: Looks·Message style·Avatars·Message details·Background·Library + a "CUSTOMIZE THIS LOOK" sub-kicker); shelf order differs (mock non-alphabetical, live alphabetical). | live eval, run `main-2423685`: every band `{tt:"uppercase", fs:"13px", ls:"1.04px", h:32, voice:"interactiveKicker"}`; mock geometry `se/measure.log` `deskSettingsRowHeights [35, 47.5]`, `deskDoorHeights [40]` | Redraw board 1 from the live pane, or state explicitly that the settings-arm redesign is a SECOND proposal wanting its own ruling. Every "consistency with the neighbour" claim in this canvas is currently measured against a fiction. | | | | | | | |
| 2 | **P1** | 4 · `se/dark-f3-dk.png` | **The on-row regex switch is a dead toggle that navigates.** `<span class="switch" aria-label="Runs in every chat">` — no `role`, no `tabindex`, no `aria-checked` — inside `div[role=button]`. Clicking it changed CONTENT's header from "Regex scripts" to "Strip stage directions". Box 52×17 (WCAG 2.5.8 wants 24×24 even at a fine pointer). | `se/measure2.log` → `HAZARD: {"before":"Regex scripts","afterSwitch":"Strip stage directions","switchHasRole":null,"switchTabindex":null}`; geometry `switchBox 52×17.4` | Draw it as a real `Switch` in **`ListRow`'s `actions` sibling slot** — `list-row.tsx:107-110` already states the contract: *"Rendered as a sibling of the clickable body, never nested inside it"*. It needs its own accessible name ("Runs in every chat — Strip stage directions"), its own tab stop, and click isolation. Breaks the no-dead-toggles law as drawn. | | | | | | | |
| 3 | **P1** | 2,4,6,7 · `se/dark-f1-dk.png` | **The create verb gets two homes, and one is drawn dead.** Every collection door contains `SPAN.plus[aria-label="New tag"]` — a labelled span, not a control (and a `<button>` inside a `<button>` would be invalid anyway) — while CONTENT carries the real `BUTTON.btn.primary "New tag"`. | `se/gap.mjs` → `createHomes: ["New tag @SPAN.plus","New script @SPAN.plus","New book @SPAN.plus","New roster @SPAN.plus","New tag @BUTTON.btn"]` | Pick ONE home. The duplication is pre-existing (live: the band carries a real `+` **and** the landing carries "New tag" — `cbmock-config-tags.png`), so this move is the moment to close it. Recommend: create lives in CONTENT's header only; the band is a pure door. §13 IA single-homing. | | | | | | | |
| 4 | **P1** | 2,6 · `se/dark-f1-dk.png`, `se/light-f1-dk.png` | **The library row is mostly void at pane width.** Ink-to-ink: tags **423 px of 628 = 67 %**; world-info entries 431/628 = 69 %; regex 330/628 = 53 % (its subtitle rescues the second line); phone tags 192/402 = 48 %. The eye has to cross a 423 px gap to pair "fantasy" with "12 uses". | `se/ink.mjs` output | Cap the row measure or pin a column. `ListRow`'s `subtitlePlacement="column"` exists for exactly this ("a whole DECK of rows shares one gloss left-edge"). For tags specifically, consider a multi-column auto-fit grid — a tag is a chip, not a table row. Verb: **layout: the four library row decks — receipt: ink-to-ink void ≤ 25 % at 628 px and at the docked-list minimum.** | | | | | | | |
| 5 | **P1** | 2,3 · `se/dark-f1-dk.png`, `se/dark-f2-dk.png` | **The facts have two simultaneous homes.** CONTENT chips = `["Used nowhere 3 →", "Most used fantasy · 12"]`; the CONTEXT About roster repeats **both verbatim** and adds two more. One is a door, one is inert — same information, two affordances, one screen. On an open member it is worse: the About roster (`Worn by 9 characters` · `Colour swatch` · `Merge folds into another tag`) is a mirror of the three fields on the form beside it, and "Colour: swatch" is not a fact. | `se/gap.mjs` → `chips` vs `ctxRoster` | Decide what the teacher is FOR. §3.5 says it teaches (summary · affects · related), not that it restates. Recommend: chips stay in CONTENT (they are doors, they belong next to the rows they filter); the About tab drops the census rows and keeps the lesson. | | | | | | | |
| 6 | **P1** | wi depth 3 · `se/drive-f5-wi-entry.png` | **The teacher lies at world-info depth 3.** Its band reads "The Spire" (the entry) while its body renders the BOOK's Applies arm — "Global / every chat · Sabine Veyra attached · Elias Thorn attached · Constant entries 3". Head and body disagree about the subject. | shot; the mock's `ctx()` uses `APPLIES[st.collection]` regardless of `st.entry` | Either the entry has its own arm (keys · fires when · which chats the book is in) or the band names the BOOK while an entry is open. A teacher whose title and body name different objects is a capability lie (#925's must-WORK bar). | | | | | | | |
| 7 | P2 | 7 · `se/dark-f6-dk.png` | **The empty board contradicts itself three ways and re-introduces a deleted box.** Header "Saved rosters **2**", door "SAVED ROSTERS **2**", CONTENT "No saved rosters yet.", CONTEXT "Most recent **Tavern night** · Rules 6". And the empty state is a **left-aligned dashed card** (`.empty { border:1px dashed; border-radius:8px; max-width:520px }`) — the shipped `EmptyState` is a **centered, boxless** teaching stack (`packages/ui/src/primitives/empty-state/variants.ts`: `flex flex-col items-center gap-block py-section text-center`, no border anywhere), and §8.4 records the ruled arm as "count(0) + create and **no box** (2026-08-03 · CD1)". | shot + the two source reads | Draw the empty arm with count 0 everywhere and no census in the teacher, using the real primitive's centered boxless form. | | | | | | | |
| 8 | P2 | 3,5,6 · `se/dark-f2-dk.png`, `se/drive-f5-wi-entry.png` | **A destructive verb sits in the primary slot.** "Delete" / "Delete entry" is outlined-red at exactly the x where the sibling boards put "New tag" / "New entry" / "New script". At book level the label is a bare "Delete" — book or entry is unstated while the entry list is on screen. | shots; `header()` puts `Delete` last in the same `.acts` cluster as the primary | Move destructive verbs to the kebab or a footer; if they stay, never at the create button's x, and always object-named ("Delete this book"). Nielsen 5 (error prevention). | | | | | | | |
| 9 | P2 | 2 · `se/dark-f1-dk.png` vs live `cbmock-config-tags.png` | **The mock silently drops a shipped capability.** The live tag library carries a host chrome line ("Manual order lets you drag rows.") **and a sort control ("Most used ▾")**. The mock's chrome row is search only. | live shot | Either carry the sort control into CONTENT's chrome row or state that it dies with the move. A silently-dropped affordance is how a "redesign" becomes a regression. | | | | | | | |
| 10 | P2 | 4,5 · `se/dark-f3-dk.png`, `se/dark-f9-ph.png` | **The six stage dots are unlabeled and their OFF state is invisible.** OFF dot vs its row background: **1.13:1 (Hearth) / 1.14:1 (Light)** — WCAG 1.4.11 wants 3:1 for a graphic you must perceive to understand the content. Nothing on any board names which dot is which stage, and the editor's own "Stages" control is the same six unlabeled 14 px squares. | `se/nontext.mjs`: `["regex stage dot OFF",1.13,…,"8x8"]` dark / `1.14` light; `["regex stage dot ON",6.82/5.08]` | Give the track a visible rest state (≥3:1) and name the stages — a labelled 6-cell toggle group in the editor, and a `title`/`aria-label` naming the fired stages on the row. | | | | | | | |
| 11 | P2 | phone lib · `se/dark-f8-ph.png` | **The phone top bar's action cell overflows and its targets are under the floor.** `.ph .top { grid-template-columns: 40px 1fr 40px }` with TWO buttons in the right cell → measured `.ib` at **20×40** and **32×40**. Even the un-squashed ones are 40×40 (< 44). The fact chips are **26 px tall and interactive** (`role=button tabindex=0`). | `se/measure2.log` → \`ib | 40x40 x4 · ib | 20x40 x2 · ib | 32x40 x2 · fact | 138x26 · fact | 173x26 · handle | 14x18 x17 · kebab | 28x28 x17\` | Give the phone header room for 2–3 actions (or move create to the list's foot). NOTE the honest split: the **kebab** at 28×28 will get its 44 px hit area from `@orb/ui` Button's pointer-conditional `::after` — that one is mock fidelity. The **drag handle, the switch and the fact chips are new elements with no such precedent** and are real. |
| 12 | P2 | phone · `se/phone-drive-3-entry.png` | **The phone back-stack is not legible.** Every rung shows one unlabeled `←` and the leaf's name. At depth 4 the screen reads "← The Spire ⓘ" with no trail, no parent name, and no sign you are four taps under "You". Desktop gets "← Back to entries / Ashen Spire / The Spire"; the phone gets nothing. | shot; `phone()` renders `ib("back","back","Back")` at every member/entry rung | Give the phone Back the same object name the desktop Back has ("Back to Ashen Spire") and put the parent in a sub-line under the title. | | | | | | | |
| 13 | P2 | phone sheet · `se/phone-drive-4-entry-sheet.png` | **The teacher sheet has no close affordance and its tab rail lands exactly on the app's tab bar.** Measured in the 430×860 phone: sheet occupies y 96→860; `.sheet .cells` at y 938 h62 vs `.tabbar` at y 941 h59 — the same band. So "Chats" and "Applies" are the same pixel across two states. Dismissal is a tap on the 96 px scrim strip only; the scrim's centre is intercepted by the sheet (my first drive timed out clicking it — `se/drive.log`). The 36×4 grab bar implies a swipe the mock cannot prove. | geometry in `se/drive2.log`; `se/drive.log` timeout | Add an explicit close (an ✕ in the sheet head), and either size the sheet to content or inset it so the tab bar stays visible/covered deliberately. | | | | | | | |
| 14 | P2 | 4 · `se/dark-f3-dk.png` | **Bulk mode gives one row three meanings and enable/disable two homes.** With bulk on, a row carries a run switch, a 16×16 checkbox, and is still a drill door — and the selection bar's Enable/Disable does the same job as the row switch at a different scope. Selection is only possible by hitting the 16 px checkbox; the row click still navigates. | shot; `library()` keeps `data-act=member` on the row in bulk mode; `cb 16×16` | In selection mode the ROW selects (every bulk UI convention), the drill moves to an explicit affordance, and the bar's verbs carry their scope ("Enable 2 selected"). | | | | | | | |
| 15 | P3 | 2 · `se/dark-f1-dk.png` | **17 always-visible kebabs make a noise column and 17 extra focus stops.** Live, the row kebab is hover-revealed (only the hovered "banter" row shows it in `cbmock-config-tags.png`). Focus order alternates row → More → row → More for the whole library. | `se/measure.log` focusables list (indices 15–48) | Keep the live reveal behaviour; the wide pane does not make 17 identical glyphs more useful. | | | | | | | |
| 16 | P3 | 3 · `se/dark-f2-dk.png` | "WORN BY · 9" lists three rows with no overflow door. As drawn, a count promises six rows that do not exist. | shot | Page it, or say "3 of 9 · show all". | | | | | | | |
| 17 | P3 | 3,6 · both themes | **The only text-contrast failure in the whole canvas** is the crumb separator "/": **3.68:1 (Hearth) / 2.84:1 (Light)** at 12.5 px. 694 text elements measured per theme, 3 failures, all this one glyph. | `se/measure.log`, positive control passed (planted 1.26 caught, planted 21 passed) | Raise it to the muted-fg token or make it `aria-hidden` decoration at ≥3:1. | | | | | | | |
| 18 | P3 | wi depth 3 | The crumb "Back to entries / **Ashen Spire** / The Spire" reads like a breadcrumb but only the leftmost node is a control, and the Back target and the middle node are the same place under two names. | `se/drive-f5-wi-entry.png` | Make the middle node a door, or drop it and let Back name the parent. | | | | | | | |
| 19 | P3 | 6 · `se/drive-f5-wi-entry.png` | World-info entry **Content is monospace** — narrative prose in a code voice. | shot | Prose voice for prose. | | | | | | | |
| 20 | P3 | all desktop | **16 distinct size/weight pairs**, several 0.5 px apart (12.5 / 12 / 11.5 / 11 / 10.5). Mock convenience, but a builder reading it as spec will invent off-ramp sizes. | `se/measure.log` `typeRamp` | State that the build takes the 7-step ramp + 5 voices; the canvas's px are indicative. | | | | | | | |
| 21 | P3 | 2 · Hearth | Dark tag swatches vanish: the sampled purple is 4.62:1 but "noir" `oklch(0.4 0.02 60)` and the greys sit near 1.1–1.5:1 on the row. The swatch is the tag's identity. | `se/nontext.mjs` `["tag colour swatch (fantasy)",4.62 dark / 3.82 light]` + palette read | Ring the swatch, or floor the palette's L in dark. | | | | | | | |

### A retraction (mine, mid-run)

I opened a finding that the mock's **"Saved rosters"** contradicts the ruled word, because the live band
says **"Rosters"** and `UI-Architecture-and-Layout.md` §4.2 names "Rosters — the ruled word … LANDED".
`docs/design/vocabulary-map.md:46` sanctions **both** ("Roster · Saved rosters" are the user-facing words
for `rosterPreset`). So the mock is not drifting — but the two surfaces disagree with each other. Downgrade
to: **pick one spelling for the band and use it in both places.**

---

## ARIA, as drawn

Everything here is a mock-drawing observation; where the shipped primitive already solves it I say so.

- **Nested interactive, 17×:** `BUTTON.kebab` inside `DIV[role=button][tabindex=0]`. `ListRow` already
  forbids this (`list-row.tsx:107-110, :137-139` — clickable body is a native `<button>`, `actions` is a
  sibling). Use the primitive; do not hand-roll the row.
- **The on-row switch has no role and no tab stop** (P1-2). It must be a `Switch` in `actions`.
- **The bulk checkbox** is `span[role=checkbox][aria-checked]` with **no tab stop and no accessible name**
  — a screen-reader user can hear "checkbox, checked" with no idea what it selects. Name it from the row's
  title.
- **The band's create `+` is an `aria-label`led SPAN** — invisible to AT and to the keyboard (P1-3).
- **No headings and no landmarks anywhere** except the empty state's `h2`
  (`se/measure.log` → `headings: []`, `landmarks: []`). The build owes: the library title as the
  region's heading, and the four regions' landmark roles the shell already provides.
- **`aria-current` is correct — exactly one per location on every board** (`door=location`). But note
  the LIVE band carries `aria-expanded="true"` (`main-2433359` html receipt); once the rows leave the
  LIST, a door that reports expanded state is a lie — drop it with the chevron.
- **Focus order is sane** (LIST top→bottom, then CONTENT header, then chips, then rows) and the focus ring
  is real (`button:focus-visible,[tabindex]:focus-visible { outline: 2px solid var(--primary); offset 2 }`).
- **Meaning by colour alone:** the switch is saved by its "On"/"Off" text; the stage dots are not (P2-10).

---

## The five decisions

| # | Decision | Verdict | Why a user feels it |
| - | - | - | - |
| 1 | Search always visible; the 30-member window and `max-h-96` die | **AGREE** | The gate existed because three bands shared one scroll column (`collection-contracts.ts:50-54` says so); in CONTENT the pane IS the scroller. A search that appears only past 30 items is a search you learn twice. **But the canvas never draws the >30 case** — its biggest library is 17 rows. Virtualization, the filtered-count line, and a sticky header at 300 tags are undrawn and are the build's real risk. |
| 2 | The "Runs in every chat" switch returns to the row | **AGREE with the verb, REJECT the drawing** | Right instinct — at 628 px the row has room, and seeing which scripts run without opening five editors is the whole point of a library. As drawn it is a dead span that navigates (P1-2), and it collides with bulk (P2-14). Fix: real `Switch` in `ListRow.actions`, click isolated, named; bulk verbs carry their scope. |
| 3 | Tags stay sortable (drag under 30); facts sit above the rows as doors | **AGREE on desktop · UNRESOLVED on touch** | Manual order is a real affordance and the live surface already teaches it ("Manual order lets you drag rows"). But the mock draws the same **14×18** grip on the phone inside a vertically-scrolling list — drag and scroll fight, and there is no long-press or reorder-mode drawn. Also: the live **sort control is dropped** (P2-9), so the mock trades a working sort for an unproven drag. |
| 4 | CONTENT's header reuses the LIST band's grammar | **AGREE, with a correction to the sentence** | What the mock actually draws is `ListPaneHeader`'s grammar (18 px title + count + action cluster), NOT the band's (uppercase 13 px kicker + count + `+`). Say `ListPaneHeader`; it is the right composite and its reuse in CONTENT is a reuse, not a second composite. One caveat: three header buttons + search + two chips = **six controls above the first row** on the regex board (`headerButtons: ["Select scripts","Import JSON","New script"]`) — at the edge of the ≤4 working-memory rule. Demote Import into the kebab. |
| 5 | Two band kinds in one LIST (settings = disclosure w/ chevron, collection = door w/o) | **DISAGREE WITH THE PREMISE** | On the tree there is **one** band kind and both arms already share it: all 13 live bands are `interactiveKicker`, uppercase, 32 px, chevroned, icon-led (run `main-2423685`). The mock creates the split by demoting the settings band to a sentence-case row (P1-1) and then argues for the split it created. The real question is only *"does a collection band keep its chevron"* — and the answer is no, it has nothing to disclose. Keep ONE band anatomy, drop the chevron and `aria-expanded` on collection bands, let `aria-current` + the count carry the difference. That is a small, honest delta; the drawn one is a settings redesign. |

---

## Taste and flow (the blunt call)

**Boards 2 and 3 look good.** Quiet, legible, unfussy, and they read as the same product as the shell in
BOTH themes. The Light arm is not an afterthought — it is arguably the better of the two. The move puts
the work where the room is, and a cold first-timer landing on board 2 knows exactly what this screen is
and what to do first. That is the review's main positive and it is not faint praise.

**But the tags library looks empty and stretched.** Two ink columns pinned to opposite edges of a 628 px
row with 423 px of nothing between them; seventeen hairlines; a vertical stripe of seventeen identical
kebabs at the right margin. It reads like a spreadsheet with two columns and no middle, and it is worse
in Light where the void is brighter. World-info's book list has the same shape at 69 %. Regex is the one
library the wide pane genuinely improves, because its subtitle (stage dots · pattern · edited) fills the
middle — which is the tell for what the other three need.

**The regex board is where the eye doesn't know where to start.** Three header buttons, a full-width
search, two fact chips, then five rows each carrying an order numeral, a grip, a title, six dots, a mono
pattern, a date, a switch, a label, and a checkbox. Nine elements per row. It is not ugly, it is BUSY,
and the busiest thing on it — the six dots — is the one element that explains nothing.

**Two homes, three times** (§13 IA): create (band `+` and CONTENT primary), the facts (chips and the About
roster, verbatim), and enable/disable in bulk (row switch and selection bar). Plus one mis-homed concept:
at an open member the teacher restates the form beside it instead of teaching.

**The phone library and member screens are good.** The sheet is not: it covers the app's tab bar with its
own tab rail at the identical y, has no close button, and is 762 px tall for 3 rows of content.

**Board 1 is pleasant and airy and it is a different product from the one running on :5173.** That is the
finding that matters most, because everything else on this canvas is judged against it.

---

## What the mock cannot show — the build owes these receipts

1. **Widths.** Every board is 1440 with both panels docked → CONTENT is **678 px**, not "full pane width".
   The build owes list-collapsed, context-collapsed, both-collapsed, and the docked-list minimum. A point
   measurement never proves a range property, and every row anatomy here re-balances with the width.
2. **Scale.** 17 tags, 5 scripts, 3 books, 5 entries. Nothing here shows 300 tags, a 22-entry book
   (the mock's own data claims "Salvage lanes · 22 entries" and never opens it), or Ashen Spire's stated
   14 entries against the 5 it lists. Virtualization, the filtered count, and a sticky header are unproven.
3. **Long content.** No 60-character tag, no emoji/RTL name, no book title that wraps. Which of
   title/subtitle/datum truncates first at 628 px and at the minimum is undrawn.
4. **Coarse-pointer geometry from the real tokens.** The mock draws raw px; the build's floor comes from
   `control-md` (3 rem coarse). The drag handle, the on-row switch and the fact chips are the three
   elements with no pointer-conditional precedent to inherit.
5. **States.** No hover, no focus-within, no selected row, no loading/settling/failed arm (the design
   input's S5), no "which member am I editing" signal anywhere except the CONTENT header.
6. **Motion.** Nothing is drawn about what animates when CONTENT swaps library→member, or whether the
   LIST re-lays out at the same time. The §4 desync law applies: if the LIST's group folds while CONTENT
   slides, the two must share a duration or the fold must be instant.
7. **The teacher at every rung.** Only About/Applies are drawn populated; "Learn" is a tab with no body on
   any board.

---

## Coverage — what I drove, and what I did not

| Instrument / arm | Status |
| - | - |
| All 11 frames screenshot, **Hearth** | RAN — `se/dark-f0..f10-*.png` |
| All 11 frames screenshot, **Light** (via `#theme`) | RAN — `se/light-f0..f10-*.png` |
| `[data-act=open]` collection doors (tags, regex, worldinfo, rosters) | RAN — `se/drive-f0-after-tags-door.png`, `se/drive-f6-empty-to-regex.png` |
| `[data-act=member]` rows | RAN — `se/drive-f0-tag-member.png` |
| `[data-act=entry]` (world-info depth 3) | RAN — `se/drive-f5-wi-entry.png` |
| `[data-act=back]` (both rungs) | RAN — `se/drive-f5-wi-back1.png`, `-back2.png`, `se/drive-f0-back-to-library.png` |
| `[data-act=settings]` (return to the settings arm from a library) | RAN — `se/drive-f0-back-to-settings.png` |
| `[data-act=bulk]` toggle on/off | RAN — `se/drive-f3-bulk-off.png` |
| `[data-act=ctx]` phone Detail-panel sheet + scrim dismissal | RAN — `se/phone-drive-4-entry-sheet.png`, `-4b-after-scrim-tap.png` |
| Phone full back-stack list→library→member→entry→back→back→pop | RAN — `se/phone-drive-1..7-*.png` |
| WCAG text contrast, every text-bearing element, both themes, canvas-composited sRGB | RAN — 694 elements/theme, 1 distinct failure; **positive control planted and caught** (1.26 FAIL / 21 pass) — `se/measure.log`, `se/measure2.log` |
| Non-text contrast (dots, switch, checkbox, swatch, current tint), both themes | RAN — `se/nontext.mjs` output |
| Geometry census (row/band/target heights, ink-to-ink void, pane widths) | RAN — `se/measure.log`, `se/ink.mjs` |
| Phone tap-target census vs 44 px | RAN — 46 of 95 under 44 (`se/measure2.log`) |
| ARIA census (roles, names, nesting, focus order, landmarks, aria-current) | RAN — `se/measure.log` |
| Interaction-hazard probe (switch click, bulk row click) | RAN — `se/measure2.log` |
| **Mock-vs-LIVE delta** (`snap / --goto config`, + Tags band clicked) | RAN — runs `main-2423685-2026-09-05T17-23-45-864Z`, `main-2433359-2026-09-05T17-25-06-744Z` |
| `snap --design-audit` on the canvas | SKIPPED — the canvas is a static file with hand-rolled markup; the rule set judges `@orb/ui` mechanisms and would report the mock's scaffolding, not the design. The delta table against the live route is the substitute. |
| `--mobile` / real device emulation | SKIPPED — the mock's phone boards are 430×860 CSS divs inside a desktop page, so `pointer: coarse` cannot apply. All phone geometry above is CSS-px box math and is stated as such. |
| Motion / CLS / perf arms | SKIPPED — nothing in the canvas animates except a 120 ms background transition; there is no motion design to measure yet (item 6 of "cannot show"). |
| Lighthouse | SKIPPED — a fragment mounted via `setContent` is not the product page; axe findings would describe the canvas harness. |
| Live keyboard walk of the real `/config` collections | SKIPPED — out of scope (the subject is the mock); the mock's own focus order was read instead. |
| First drive attempt crashed | RETAINED — `se/drive.log`, the scrim-centre click timeout, which is itself finding P2-13's receipt. |

---

## For the row (paste)

side-eye on the config-collections canvas: **BUILD WITH THESE CHANGES**. The move is right and receipted —
the live before (`snap` run `main-2433359`) shows a 307 px LIST rendering 28 tag rows while CONTENT holds a
blurb and the line "Pick one from the list to open its editor", which is exactly the "mixed and looks
weird". Six P1s. (1) The "unchanged" Arrival board is not today's Settings: live, all 13 bands are one kind
— `interactiveKicker`, uppercase 13 px/1.04 px, 32 px, icon + chevron (run `main-2423685`) — while the mock
demotes settings bands to sentence-case 47.5 px rows with glosses and invents the Appearance section list,
which manufactures the "two band kinds" problem Decision 5 then solves; Decision 5's premise is therefore
inverted and the real delta is only "drop the chevron and `aria-expanded` on a collection band". (2) The
on-row regex switch is a labelled `<span>` with no role or tab stop inside `div[role=button]`, and clicking
it NAVIGATES (measured: header went "Regex scripts" → "Strip stage directions") — a dead toggle; it belongs
in `ListRow`'s `actions` sibling slot. (3) The create verb has two homes and the band's `+` is drawn as a
non-interactive span. (4) Library rows are 67 % void at 628 px (tags 423/628, wi entries 431/628) because
the anatomy was tuned for 307 px. (5) The facts are drawn twice, simultaneously, as a door and as a roster.
(6) At world-info depth 3 the teacher's title names the entry while its body answers about the book.
P2s: the empty board contradicts its own count three ways and re-adds a dashed box the shipped `EmptyState`
does not have; Delete sits at the create button's x; the live "Most used ▾" sort is silently dropped; the
six stage dots are unlabeled with a 1.13:1 OFF state; the phone header's action cell squashes buttons to
20×40; the phone back-stack shows one unlabeled ← at every rung; the teacher sheet has no close and lands
its tab rail on the app's tab bar. Contrast is otherwise excellent — 694 text elements per theme, one
failure (the crumb "/" at 3.68:1 Hearth / 2.84:1 Light). Full report + 30 shots:
`<scratchpad>/config-collections/REVIEW-sideeye.md` and `.../se/`.
