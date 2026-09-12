---
kind: review
status: draft
updated: 2026-09-06
---

# side-eye — #980 config control grammar, re-derived against the post-#1725 surface

> **Lane cb-config-sideeye, 2026-09-06.** Owner word: *"we can keep it and maybe hit it with side eye."*
> This is a RE-DERIVATION of #980's six open items against TODAY's config surface, which was redesigned
> yesterday (#1725 — a collection's member rows left the LIST pane and the library now opens in CONTENT).
> Every verdict below carries a rendered receipt taken today; nothing is inherited from the two prior
> drives except the original finding text it re-judges.
>
> **Sources re-read in full first:** `docs/reviews/side-eye/2026-08-30-config-surface-live-drive.md`
> (F10 F12 F13 F22 F23 F24 · E2 E3 E4), `docs/reviews/side-eye/2026-09-02-config-surface-live-drive-2.md`
> (the re-drive's delta table), `docs/design/mocks/config-collections/DESIGN.md` and its
> `REVIEW-sideeye.md` (the approved #1725 boards and the eight build obligations in §5).

## Environment, and what it is honest to claim from it

Rendered receipts were taken from the LIVE dev stack (`:5173`), read-only, per the orchestrator's
mid-run correction withdrawing the brief's stale-vite fence. `pnpm stack status` reported
`status=up server-pid=1695481 healthz=ok vite-pid=3443764 served=fresh`; every run reported
`nav=OK page-errors=0 console-errors=0 failed-req=0 deadcss=0`.

**The tree moved under the drive and it is stated rather than smuggled.** Runs 1–2 were taken at
`sha=9c6464f863e9` (the ref the brief pinned); runs 3–8 at `ae53c7f2ccd3`, then `301547c24d59`, as two
merge trains landed on main mid-drive. Their diffs are `notification-bell` · `bug-report-*` ·
`coarse-pointer-now` · `macro-textarea` · a gate suppression baseline · two server test files.
**None touches the config feature, `Band`, `ListRow`, `PickerCell`, `Switch`, `Field` or `Text`**, so
every receipt below is comparable across the three shas. No SendMessage was sent: nothing lied.

**The load rule.** The brief permits rendered measurement only at a 1-minute load below 24. Load sat
at 55–82 for the whole window. One bounded `until` wait was run (**301s**, 82.0 → 47.7, never reaching
24\) before proceeding under the brief's fallback clause. Load at each run is recorded in the table
below from snap's own `load=` axis. **This matters for exactly one arm and no other:** snap labelled
`app-snapshot=load-suspect` on six of nine runs (boot-timing evidence, which this review does not use
and does not quote). Every claim here is a computed style, a rendered geometry, a framebuffer contrast
or a deterministic rule verdict — none of which is a rate — so load bounds nothing in this report. The
one run that carried the whole deterministic scan happened to land **at load 22.7, in budget**
(`app-snapshot=measured`, `budget-factor=1.00`).

| run | what | sha | load |
| - | - | - | - |
| `main-1896562-2026-09-06T13-26-31-199Z` | config arrival: map · aria · selection census · CONTENT ramp · side-tab sweep | 9c6464f86 | 63.7 |
| `main-1907549-2026-09-06T13-27-53-328Z` | Tags library in CONTENT: LIST ramp · row boxes · shot | 9c6464f86 | 45.8 |
| `main-1922535-2026-09-06T13-30-09-966Z` | four collection bands, every paint channel | ae53c7f2c | 40.1 |
| `main-1931103-2026-09-06T13-31-32-435Z` | tag member editor: switch orientation · row anatomy · shot | ae53c7f2c | 39.3 |
| `main-1942558-2026-09-06T13-33-01-893Z` | true ink void (Range-measured) · Backup checkbox split · shot | ae53c7f2c | 28.8 |
| `main-1952313-2026-09-06T13-34-20-275Z` | **`--design-audit`, desktop, driven to Backup** | ae53c7f2c | **22.7** |
| `main-1969884-2026-09-06T13-35-55-511Z` | Chat behavior: switch geometry + framebuffer contrast | 301547c24 | 57.7 |
| `main-1994369-2026-09-06T13-38-16-177Z` | coarse arm (`--mobile --viewport 430x860`): library geometry · bands | 301547c24 | \~44 |
| `…T13-39` (run8b) | coarse `--design-audit` + corrected checkbox hit probe | 301547c24 | \~44 |

Screenshots cited below live in each run's own slot under `snaps/`; the immutable receipt for every
run is its `run.json` in the same slot.

## VERDICT

**SHIP WITH FIXES — but #980 as written is no longer the right row.** Three of its six items are
genuinely closed and should be struck; two are live and one of those got materially *worse* under
\#1725; one is unchanged since 2026-08-30. And the redesign introduced a new defect squarely inside
\#980's own remit — **the LIST no longer marks where you are** — which is now the most important thing
on the row.

## The six items, re-derived

| # | item | original receipt | TODAY's verdict | recommended next step |
| - | - | - | - | - |
| **F10 / E3** | OFF switch state subordinate | `2026-08-30-config-surface-live-drive.md:119-126` (OFF thumb 17.61:1 vs ON track 7.65:1, "2.3× louder off than on"); re-confirmed `2026-09-02-…-2.md:88` | **FIXED** — landing `5023241e2` (#1090, the ink) + `aad98e225` (#1109, the knob). Rendered today on Chat behavior: OFF thumb `oklab(0.74 … / 0.8)` = `muted-foreground/80` over a 12% track; ON thumb `oklch(0.19 0.03 50)` on `oklch(0.72 0.175 52)` measuring **FILL 7.06:1 PASS** (framebuffer, `--contrast-pixel`, 31,16,7 on 247,127,32). Track 48×32, thumb 18×18 = **56% of track height**, which is E3's own "\~55% with visible travel" ask. `design-audit`'s `quiet-state` rule — which fired P2 in *every* arm on 2026-09-02 — now reports `judged=0 … excluded(noOwnFill=1)`, i.e. it no longer convicts. Receipt: `main-1969884-…` | **STRIKE from #980.** Both halves landed with CT framebuffer pins in all three seeds. |
| **F12** | remove the banned Tags side-tab accent | `2026-08-30-…:133-138` (`[aria-label="Tags"]::after` = 3px × 253px accent bar on a `rounded-base` card); byte-identical at `2026-09-02-…-2.md:90` | **DEAD** — its carrier no longer exists. `config-welcome.tsx` (the landing card that wore it) was deleted at `6b00c37fd`; the Tags landing became the library at `37b8e2d52` (#1725). Proven, not assumed: a full-page `::after` sweep for any pseudo ≤6px wide, ≥40px tall with a painted background returns **`[]`** on the config landing AND in the Tags-library state (runs `main-1896562-…`, `main-1907549-…`), and `design-audit` reports `side-tab candidates=1 judged=1 affected=0` and `border-accent-on-rounded candidates=1 judged=1 affected=0` — full verdicts, not withheld. | **STRIKE from #980.** |
| **F13** | Backup checkboxes attached to their labels, no \~1210px split | `2026-08-30-…:139-143`; re-measured at \~851px `2026-09-02-…-2.md:91` | **LIVE, and now machine-detected.** The orange-checkbox half IS fixed (`3b86ae427` / #1110): all eleven render `oklch(0.66 0.005 70)`, a neutral, not the ember. **The split is untouched and larger than the 09-02 reading:** checkbox left edge **x=1398**, label right edge **x=461–492** → **906–937px of bare gap**, checkbox on the RIGHT, 11 rows, 18×18 boxes, still no select-all/none. `design-audit` files it independently as **8 × `row-void` P2** at **71–76%** ("724px of 990px (73%) between 'Characters' and its control"). Receipts: `main-1942558-…` (eval + `snaps/cbse980-backup.png`), `main-1952313-…` | **BUILD.** `ExportLibrarySection` puts `SettingCheckboxRow` inside a bare `w-full` `Fieldset`, so `Field orientation="horizontal"` docks each control in a 200px column at the pane's right edge with nothing capping the row. The fix already exists in the tree and is not being used here: `align="track"` (#932, `field/variants.ts` compound) or a measure cap on the fieldset. A bulk checkbox list should lead with its mark anyway. |
| **F22** | standardize switch label/control orientation | `2026-08-30-…:190-192` ("Appearance/Chat behavior: label left, switch far right. Tag member editor: switch left, label right"); **NOT re-measured** on 2026-09-02 | **LIVE — and #1725 promoted it into CONTENT.** `tag-member-surface.tsx:237` still renders `<Row align="center" gap="field"><Switch/><Text voice="gloss"/></Row>`: measured today at **switch x=561, label x=615 — control LEFT, label RIGHT**. It now sits in the CONTENT pane 40px under a `Field` row ("Folder type") whose label is ABOVE its control, in a pane where every other control is label-above. **Three control orientations in one 720px form.** The gloss is also not a `<label>`, so clicking the sentence does not toggle. Two more spellings of the same row exist: `regex-context-body.tsx:107` (label-left/switch-right by a hand-rolled `Row justify="between"`, no `Field`, no shared track) and `world-info/components/attachment-rows.tsx:64,107` (switch in `ListRow`'s `actions` slot). Receipts: `main-1931103-…` (eval + `snaps/cbse980-tag-member.png`) | **BUILD, narrowed.** One line: route the three hand-rolled rows through `SettingSwitchRow` (which is already `Field orientation="horizontal"`, label-left). The tag row is the only POLARITY inversion; the other two are mechanism drift, not visual drift. |
| **F23 / F24 / E4** | restrained display/section/row hierarchy, no competing CAPS 2.5px apart | `2026-08-30-…:193-201`; identical string at `2026-09-02-…-2.md:96-97` | **LIVE for F23, CHANGED for F24.** F23 is byte-identical for the third pass running: LIST census today = shelf kicker **10.5px/600/CAPS ls=0.84px ×4** vs group band **13px/600/CAPS ls=1.04px ×13** — same weight, same case, **2.5px apart**, the only difference being tracking. F24 has *partly* moved: the collection library pane now opens with a real **20px/600** title ("Tags"), so a display step exists — but the settings panes did NOT get one. Appearance CONTENT still maxes at **16px/500** with steps 10.5 / 13 / 15 / 16 (**ratio 1.52:1**, the same number as 08-30). `voice="display"` and `voice="title"` are used **zero times** across `features/{config,settings,tag,regex,world-info,workloads}`. So the surface now has *two* hierarchies: collections get 20px, settings get 16px. Receipts: `main-1907549-…` (LIST ramp), `main-1896562-…` + `main-1922535-…` (CONTENT ramps) | **RE-FILE NARROWER, two rows.** (a) the shelf kicker and the band label are one voice pair and need one step of real separation — the cheapest honest fix is dropping the band label out of CAPS, since the shelf is the caps register. (b) give the settings pane the same 20px subject step the library pane just got; the inconsistency is now the defect, not the flatness. |
| **E2** | collapse eight selection idioms to two | `2026-08-30-…:274-280` | **CHANGED — 8 → 5 rendered, target 2.** Census below. Two are the ruled pair and correct; three are not. Notably **idiom 2 ("expanded group = filled bar") is RETIRED**, but not the way #980 wanted: it was replaced with *nothing* (see the new finding). `design-audit`'s own `selection-idiom` rule reached **NO VERDICT** in both the desktop and coarse arms (`withheld(unmatchedSelected=1)` on a Backup checkbox), so the instrument does not adjudicate this — the hand census is the receipt. Receipts: `main-1896562-…`, `main-1922535-…`, `main-1952313-…` | **RE-FILE NARROWER.** Three targets, not eight: unify `media-grid`'s ring with `PickerCell`'s, drop the tabs' second (gradient `::after`) selection layer, and decide whether `bg-accent`-fill highlight is allowed to mean both "hovered candidate" and "selected". |
| **planted controls** | rendered controls for extreme pane width, theme polarity, fine/coarse pointer, long labels | #980 row text | **PARTLY DONE — coarse and width are covered by CTs; polarity and long labels are not, on this evidence.** The coarse floor is pinned (`tests/ui/touch-target-floor.suite.ct.tsx`), the switch geometry is pinned at both pointers in `switch.ct.tsx`, and the switch ink is pinned **from the framebuffer in all three seeds** — that is the polarity pin done right, and it is the model. What has no such pin is the thing this review measured: the library row's ink-to-ink void is a pure width property (86% at 990px, 48% at 382px) and nothing pins it at either end. | **RE-FILE NARROWER** as one row: a width-matrix pin on the library row (both ends + the crossover), which is DESIGN.md §5 obligation 6 and was never landed. Drop the theme-polarity plank — `switch.ct.tsx` shows the house already knows how. |

## NEW — the defect #1725 introduced, inside #980's own remit

**\[P1] A collection library fills CONTENT and the LIST gives no sign of where you are.**

Every `[data-slot=config-band]` on the surface paints identically in every state. Measured across all
four collection bands while Tags was the location (`main-1922535-…`), and across all thirteen bands
with Backup expanded (`main-1952313-…`):

```
Tags 28          aria-current="true"   bg rgba(0,0,0,0)  color oklch(0.92 0.004 75)  fw 500  ::before none  ::after none
Regex scripts 0  aria-current=null     bg rgba(0,0,0,0)  color oklch(0.92 0.004 75)  fw 500  ::before none  ::after none
World Info 0     aria-current=null     bg rgba(0,0,0,0)  color oklch(0.92 0.004 75)  fw 500  ::before none  ::after none
Rosters 0        aria-current=null     bg rgba(0,0,0,0)  color oklch(0.92 0.004 75)  fw 500  ::before none  ::after none
Backup & Restore aria-expanded="true"  bg rgba(0,0,0,0)  (only hover:/focus-visible: classes carry paint)
```

Byte-identical, and identical again on the coarse arm (`main-1994369-…`, all four bands 44px,
all `bg rgba(0,0,0,0)`). A settings group still gets a *derived* mark — its chevron rotates and its
child section row wears the ruled left-rail-plus-tint — but **a collection band has no chevron and no
child rows any more**, so the whole 990px CONTENT pane can be the Tags library while the LIST shows
four indistinguishable doors. `snaps/cbse980-tags-library.png` is the picture of it.

Why it hurts: the LIST is the FINDING pane (UI law §4.2, physics 1). Losing the location marker is a
Nielsen-1 (visibility of system status) failure, and it lands hardest on the reader who arrived by
`⌘K` rather than by clicking the band. `Band` structurally *cannot* fix it at a call site — it
`Omit`s `selection` from `ButtonBaseProps` (`packages/client/src/components/band.tsx:57`), so no
consumer can ask for a selected skin. The fix belongs in `Band` (a `current` arm reusing the ruled
row idiom), not in `config-list-collection-group.tsx`.

DESIGN.md §3.1 ratified `aria-current` for exactly this state and said "two band kinds do NOT exist".
The ARIA landed; the paint did not. This is a **RENDERED-WRONG** row against the approved boards.

**\[P1] The library row's void got worse, not better, when the rows moved to CONTENT.**

DESIGN.md §5 obligation 6 is explicit: *"Rows at pane width carry more air than at 307px — the width
matrix … is owed before the row anatomy is called converged (side-eye P1-4)"*, and the mock review set
the bar at **ink-to-ink void ≤ 25%**. Measured today with `Range.getBoundingClientRect()` on the real
glyph runs (`main-1942558-…`), first three rows:

```
comedy    ink 30→86    "5 uses" ink 934→982   void 848px of 990  =  86%
rpg-ready ink 30→98    "4 uses" ink 934→982   void 836px of 990  =  84%
fantasy   ink 30→82    "3 uses" ink 934→982   void 852px of 990  =  86%
```

Against 08-30's F19 (63–77% in the 307px LIST) that is **\~10 points worse and \~200px larger in
absolute terms.** The coarse arm is the control that proves it is a width property, not a bug:
382px row → **48%**. A point measurement at one width would have missed this in either direction.

*Instrument note, so this is not re-measured wrong later:* the row title span is
`min-w-0 flex-1 truncate`, so its **box** runs 30→928 and a `getBoundingClientRect` census reports a
6px gap and a clean row. Only a Range over the text node sees the void. My own first measurement made
exactly that mistake (`main-1931103-…` reports `maxGap: 6, gapPct: 1`) and is retracted below.

## The selection-idiom census on the current tree

Sources: `packages/ui/src/primitives/*/variants.ts` + `packages/ui/src/styles/globals.css`, corroborated
by a rendered census of every element carrying `data-selected` / `data-checked` / `aria-current` /
`aria-selected` / `data-active` / `data-pressed` with a non-zero box (runs `main-1896562-…`,
`main-1922535-…`).

| # | idiom | paint | where | 08-30 number | status |
| - | - | - | - | - | - |
| 1 | **row: left rail + tint** | `data-selected:border-l-primary` (2px) + `data-selected:bg-primary/10` — rendered `2px oklch(0.72 0.175 52)` + `oklab(… / 0.1)` | `list-row/variants.ts:42,203`; settings section rows, library rows | (1) | **RULED — keep** |
| 2 | **grid cell: inset ring + check** | `data-checked:border-primary` + `data-checked:ring-2 ring-inset ring-primary` + a `bg-primary` check badge | `picker-cell/variants.ts`; themes, chat-style, elevation, **and density** | (3) + (4) | **RULED — keep.** #929/E6 merged five picker geometries into one `PickerCell` behind `RadioGroupPickerItem`; the density "segment" (F9) is gone with them |
| 3 | media tile: **ring + glow + gradient `::after` + check** | `data-selected:ring-2 ring-primary data-selected:shadow-glow` *plus* `[data-slot=media-grid-cell][data-selected]::after` gradient border ring (`globals.css:358`) *plus* `selectedBadge` | `media-grid/variants.ts:17,31`; Background tiles | (6) | **LIVE — a third grid idiom.** Same job as #2, three extra layers. Rendered today with a `103×103` gradient `::after` |
| 4 | tab: **underline + gradient `::after`** | `indicator` = 2px `bg-primary` sliding bar + `[data-slot=tabs-tab][data-active]::after` gradient ring (`globals.css:377`) | `tabs/variants.ts:40`; teacher tabs, Jobs strip | (5) + (7) | **LIVE — two layers for one state.** The 08-30 "solid filled accent block" teacher tab (7) IS fixed; what replaced it carries a second, redundant selection layer |
| 5 | **accent fill** | `bg-accent` (+ `inset-ring-2 inset-ring-ring` on the button/toggle arms) | `command/variants.ts:46` (search suggestions), `option-strip`, `table`, `button` `selection="on"`, `toggle` `data-pressed` | (8) | **LIVE.** Deliberately one reading across Button/Toggle; the problem is that `bg-accent` is *also* the hover paint on every band and menu item, so "candidate" and "chosen" are the same colour |
| — | ~~expanded group = filled bar~~ | — | — | (2) | **RETIRED — by deletion, not by unification.** See the P1 above: no band paints anything |

**Rendered on the config surface: five. Ruled: two.** The gap is #3, #4's second layer, and #5's
overlap with hover. That is a much smaller and more actionable list than "eight", which is why E2
should be re-filed rather than carried.

## Is it coherent and quiet?

**Quiet: yes, and this is a real change.** The pane no longer shouts. The switch rack that made the
08-30 report open with "the two loudest objects on it are an OFF switch and a black slab" now reads as
grey knobs on grey tracks with one ember per ON state; the Backup checkbox column is neutral instead of
eleven ember squares; `undersized-ui-text` went from 9 findings to `candidates=50 judged=50 affected=0`;
`all-caps-body`, `crushed-tracking`, `wide-tracking`, `text-below-ramp`, `off-grid-text`, `contrast`,
`gray-on-color`, `aria-name` and `tabindex-positive` are all clean at full verdicts. The whole desktop
scan is **p0=0 p1=1 p2=9 p3=2**, and nine of those twelve are one defect (the Backup fieldset) counted
per row. On loudness the surface has genuinely arrived.

**Coherent: no, and it is coherent in a new way now.** The 08-30 verdict was "six surfaces wearing the
same shell". That is no longer true — the collections all wear one library anatomy, the pickers all
wear one cell, the rows all wear one `ListRow`. What is wrong today is different and narrower: **the
surface is quiet to the point of being mute.** It stopped shouting and, in the same motion, stopped
saying where you are.

The three worst remaining things, in order:

1. **The unmarked location.** Four identical doors, one of them is where the whole content pane came
   from, and nothing says which. This is the direct cost of retiring idiom 2 without landing its
   replacement, and it is the first thing to fix.
2. **The 86% row void.** The library rows were tuned for a 307px column and shipped into a 990px pane
   unchanged. A tag name and its own count are 848px apart. `docs/design/mocks/config-collections/DESIGN.md`
   §5 obligation 6 named this before the build started and it was not honoured. The same shape is what
   makes Backup unreadable (`row-void` ×8, 71–76%). One fix — cap the row measure or pin the columns —
   answers both.
3. **The control grammar still forks inside a single pane.** The tag member editor holds label-above
   fields, a control-left/label-right switch, and a gloss that looks like a label but is not one, in
   720px. Two other collection features hand-roll the same row a third and fourth way. `SettingSwitchRow`
   exists and is correct; three call sites simply do not use it.

Honourable mention, not in the top three but worth a row: at 430px the **filter box on a 28-row library
is the smallest control in its own control row** (\~100px, placeholder clipped to "Filter tags..") while
`Most used ▾` takes 116px beside it — `snaps/cbse980-tags-coarse.png`.

## Taste verdict, per surface driven

- **Config arrival / Appearance** — fine. Nothing offends; the LIST reads cleanly, the shelf kickers do
  their job, the pickers look like one family for the first time. It is a little *characterless* — the
  largest text on a settings pane is 16px, so nothing tells your eye where the pane starts — but it is
  not ugly.
- **Tags library (desktop)** — **looks unfinished.** A 990px pane holding rows whose ink occupies \~100px
  of it, with a 850px hole down the middle of every row, reads as a table someone forgot to give
  columns. The insight chips ("LABELLING NOTHING 0 of 28 / IN USE 28") stack as two lonely lines above
  a 28-row list. The eye lands on the New tag button (correct) and then has nowhere to go.
- **Tags library (coarse, 430px)** — **the better design of the two.** Same component, and at 382px the
  void closes to 48%, rows hit their 48px spec, and it reads like a real list. That is the tell: the
  desktop arm is not a different problem, it is the same anatomy past its usable width.
- **Tag member editor** — **quiet and slightly ragged.** Two tiny grey swatches with "Not set — uses the
  theme default" printed twice under them, a three-line gloss that makes the left edge lurch, one switch
  facing the wrong way, and a bare "Merge into…" button floating with nothing around it. Content ends at
  y≈465 of a 900px viewport. Nothing here is *wrong* exactly; it just does not look like anyone stood
  back from it.
- **Backup & Restore** — **the worst-looking pane on the surface, and it is one defect eleven times.**
  Eleven labels on the far left, eleven checkmarks on the far right, \~920px of black between. You
  cannot tell by eye whether "Themes" is checked. Everything else in the pane (the copy, the dropzone,
  the Import folder door) is fine.

**Cold-first-timer read:** a new user landing on the Tags library would understand it — the title, the
filter, New tag and the rows are all legible and correctly ordered. They would not be able to tell,
looking at the LIST, that Tags is the thing they are inside.

**IA / single-homing (§13):** clean on the two things that were duplicated before. Create now has one
home (CONTENT's control row; the band's `+` is gone, closing the mock review's P1-3), and the members
have one home (CONTENT; the LIST disclosure is retired). No concept was found living in two places on
this pass.

## Retractions

- **Mine, this pass: "the expanded Backup band paints a grey fill."** I read that off
  `snaps/cbse980-backup.png` and it was wrong — the drive's own click left the pointer resting on the
  band, so I was looking at `hover:bg-accent`. The computed census over all thirteen bands
  (`main-1952313-…`) reports `backgroundColor: rgba(0, 0, 0, 0)` for every one of them, expanded
  included. The corrected finding is *stronger* than the wrong one: no band paints an active state at
  all. Filed under the house law that the eye is not a colorimeter.
- **Mine, this pass: "the library row has no void (maxGap 6px, 1%)."** Measured with
  `getBoundingClientRect` over a `flex-1 truncate` span, which reports the box, not the ink
  (`main-1931103-…`). The Range-based re-measure (`main-1942558-…`) gives 84–86%. The first number is
  void.
- **Mine, this pass: "the checkbox `::before` proves the tap-target finding is a false positive."** My
  first hit probe scored `e.contains(cb)` as ownership, which is true for *every ancestor* — the probe
  could not fail. Corrected (`e === cb || cb.contains(e)`), the coarse arm returns `ownedRadius: 8`,
  i.e. the element owns only a 16px square despite a computed `::before` of 44×44. **I am NOT
  retracting the design-audit finding.** See the open question below.
- **Inherited, and I re-confirm it:** the 09-02 report's R5 (the background grid is not ragged) holds —
  nothing this pass contradicts it.
- **Inherited, and I overturn it:** `2026-09-02-…-2.md:98` records F22 as "NOT RE-MEASURED (tag member
  editor not driven this pass)". It is now measured and it is live.

## One open question for the orchestrator, not a verdict

`design-audit` files `tap-target` against the eleven Backup checkboxes in **both** arms — desktop
`P1, 10 affected of 11 judged, short side 18px`; coarse `P2, 11 of 11, short side 32px` — while
`SELECTION_CONTROL` gives every checkbox a `before:size-touch-target` pseudo that computes to **28×28
at a fine pointer and 44×44 at coarse** (`packages/ui/src/lib/selection-control.ts:11-14`). Those three
numbers cannot all be right. My corrected `elementFromPoint` probe sides with the instrument (owned
radius 8px at coarse, i.e. the pseudo is not taking the hit), which would mean the shared touch-target
pseudo does not work on this control — a much bigger row than #980. I did not have budget to isolate
it and I will not guess. **Recommend a one-run probe of `SELECTION_CONTROL`'s hit area** (checkbox vs
switch vs radio, both pointers) before anyone either fixes or dismisses the tap-target rows.

## What is genuinely working — do not touch

- **`PickerCell` (#929/E6).** Five picker geometries became one, in a real grid with `items-stretch`,
  with selection as a 2px *inset* ring so picking cannot nudge a neighbour. F9 and F27 died with it,
  and `undersized-ui-text` went to zero because the cell's description takes the label step. This is
  the model for how the remaining idioms should be merged.
- **The switch, end to end (#1090 + #1109 + #1684).** Bounded from both sides with framebuffer receipts
  in all three seeds, a 56% knob, and a token-derived height so the resting landing is a whole device
  pixel at every font scale. It closed F10 and E3 together.
- **The #1725 library anatomy itself.** The control row (`Filter tags` · `Most used ▾` · `New tag` ·
  overflow kebab), the insights, the kebab as a row *sibling*, the `← Back to Tags` drill and the
  `Rosters 0` / `Regex scripts 0` bands being real buttons at zero (which closes F5) — all built to the
  approved boards. The move was the right call and the shape is right; it is the row's internals and
  the band's paint that did not come with it.

## The single biggest opportunity

**Spend the paint you just saved.** The quieting campaign worked — the surface has no contrast
failures, no accent inflation and no type-ramp violations. But quiet was implemented partly by
*deletion*, and the band that lost its fill got nothing back. One small, cheap move fixes the top two
findings and finishes #980's actual thesis: give `Band` a `current` arm painted with the ruled row
idiom (left rail + `bg-primary/10`), and cap the library row's measure so its two ink clusters sit in
one reading. That is one primitive change and one layout change, and it converts "quiet but mute" into
"quiet and legible".

## Instrument coverage

| instrument | RAN / SKIPPED |
| - | - |
| `snap --map` / `--aria` | RAN — `main-1896562-…` (129 elements, 0 DOM fallbacks), `main-1907549-…` (CONTENT tree) |
| `snap --eval` (computed style, geometry, Range ink, hit probe) | RAN — all nine runs |
| `snap --contrast --contrast-pixel` | RAN — `main-1969884-…`, `[data-slot=switch-thumb]` FILL 7.06:1 PASS |
| `snap --design-audit` desktop | RAN — `main-1952313-…`, at load 22.7 (in budget); **NO VERDICT** (`withheld` on `reveal-coverage`, `quiet-state`, `selection-idiom`) |
| `snap --design-audit --mobile` | RAN — run8b; **NO VERDICT** (`quiet-state`, `selection-idiom` withheld); p2=2 |
| coarse-pointer arm (`--mobile --viewport 430x860`) | RAN — `main-1994369-…` |
| Screenshots, actually looked at | RAN — `cbse980-tags-library.png`, `cbse980-tag-member.png`, `cbse980-backup.png`, `cbse980-tags-coarse.png` |
| Console triage | RAN — 0 errors, 0 page errors, 0 failed requests, deadcss 0 on every run. The bottom-right `15 ⚠ 0` chip is vite-plugin-checker; `.cache/stack/client.log` reports `[ESLint] Found 5 errors` (strict-boolean-expressions on `any`), i.e. a stale/racing worker count, dev chrome, not product |
| Source census (`variants.ts`, features) | RAN — the selection-idiom and type-voice tables |
| Appearance presets (`maximal` / `compact` / `reading`) | **SKIPPED** — budget. #980's items are geometry and paint-polarity, both of which the CT pins cover across scales; but a `reading` arm on the library row would be the honest next width sample |
| `--theme Light` polarity arm | **SKIPPED** — budget. Partly covered: the switch's polarity is pinned from the framebuffer in all three seeds (`switch.ct.tsx`), which is the only #980 item where polarity was ever claimed to invert |
| `--motion` / `--perf` / `--lighthouse` / `--filmstrip` | **SKIPPED** — out of scope for a control-grammar re-derivation, and every rate would have been `load-suspect` at the loads available |
| Pane-state arms (context panel open) | **SKIPPED** — budget; every run was taken at the arrival default `list=docked context=collapsed`, stated rather than assumed |
| Retained-section inventory (`--map --include-hidden`) | **SKIPPED** — the desktop audit reports `dom-retained-hidden=390` of 768 walked; none was scored, and no verdict here rests on hidden DOM |
