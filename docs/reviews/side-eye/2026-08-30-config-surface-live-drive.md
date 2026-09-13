---
kind: review
status: draft
updated: 2026-08-30
---

# side-eye — the finished Config surface, live drive (#866 close-out)

> **Lane cb-config-eye, 2026-08-30.** Owner brief: *"there's some fugliness afoot and it looks like fresh
> arse"* — plus four riders: use the FULL instrument battery · the bar is excellence, not acceptability ·
> report EVERY finding including nits ("this is our bedrock, our Alamo") · work through it as a user would
> and report UX/IA and what feels crunchy. Pre-launch posture applies: judge against the correct end state,
> not against what is tolerable.
>
> **Environment:** fresh vite (restarted immediately before the drive after a 5h32m instance that had
> absorbed the night's merge train), `nav=OK` on every run, **0 page errors, 0 console errors, 0 failed
> requests, deadcss 0** across ~35 driven runs.

## VERDICT — DO NOT SHIP AS IS

The **mechanics are largely correct**: the hover reveal genuinely has zero layout shift, Reset works and is
honest, the modified stripe reads as a mark rather than a warning, and the coarse contract is honoured end
to end. What is wrong is **coherence and ink**. This is not one surface; it is six surfaces wearing the same
shell, and the two loudest objects on it are an OFF switch and a black slab.

---

## PART 1 — DEFECTS (a measured receipt per finding)

### P0

**F1 · Nine config-group rows are 16px tall — below every target-size floor, at BOTH pointer classes.**
`[data-slot=config-band]` measures **290.2 × 16.3px** desktop, **413 × 16.3px** mobile; row pitch **22.25px**.
No `::after` hit expansion (`content: none`). WCAG 2.2 AA 2.5.8 needs 24×24 **or** 24px undisturbed spacing —
pitch 22.25 < 24, so the spacing exception fails too. **Three independent instruments agree**: design-audit
desktop (9× P1, "short side is 16px"), design-audit `--mobile` (9× P1, "below the 32px hard floor"), and
Lighthouse target-size (*"Target has insufficient size (389px by 16.3px, should be at least 24px by 24px)"*,
node paths `data-slot=config-band` — product, not the dev overlay). The **sibling collection rows in the same
list are 32px desktop / 44px mobile**. Fix: one row height for the list; 32 desktop / 44 coarse.
Receipts: `reports/lighthouse-config/report.json`, `reports/design-audit/root.json`, `reports/snaps/cfg-mobile-list.png`.

### P1

**F2 · Theme cards are full-width slabs, one per row, and two of their three cells are the same colour.**
`ThemeSwatchCard` root carries `w-full` (`ui/src/content/theme-swatch/variants.ts:12`) inside a bare
`<Row className="flex-wrap">` (`appearance-looks-section.tsx:158`). Measured: three cards at **829×66**,
stacked; strip 827×40; cells 275.6 each. Cell1-vs-cell2 contrast from the live oklch values:
**Hearth 1.086:1 · Mocha 1.080:1 · Light 1.044:1** — all far below the 3:1 non-text floor (WCAG 1.4.11).
By construction: `bg-background` and `bg-card` are adjacent steps of one D71-derived ramp. So **66.7% of an
827px strip is one apparent colour**; under Light the Light card's swatch is invisible against the card body
while Hearth/Mocha render as giant black slabs.
**Recommended form:** not a horizontal three-cell strip. A theme is recognised by **base + ink + accent + a
shape**. Ship a small composed **mini-surface** — ~120×72 showing the card surface on the page surface, one
line of body ink, one accent chip, one hairline — as a fixed grid cell
(`repeat(auto-fit, minmax(min(180px,100%),1fr))`): 4-up at the content pane's 869px, 2-up at the context
pane's 384px, 1-up at 256px (correct — 1-up at 256 is a *list*, not a stretched card). Cell size never varies
between panes; only the count does.

**F3 · One concept, two anatomies: shipped themes are 829×66 cards, your themes are 60×20 chips.**
`ThemeSwatchStrip size="row"` = `h-5` with `size-5` cells = 60×20, mounted as a `ListRow` leading slot
(`appearance-looks-section.tsx:211`, and again at `character-appearance-tab.tsx:320`). Same atom, **14× area
difference**, split purely on provenance — the #920 ruling, visible. **Where the same mistake breeds:**
collection list rows (a populated collection is a `button`, an empty one is inert `text` — F5);
`config-welcome`'s `BuiltLibrary` vs `UnbuiltLibrary` (same four collections, two anatomies, split on
population); setting rows (four anatomies split on *conversion status* — F6). **Not** the same mistake: both
background grids are real `media-grid`s with sized cells (104×104 Settings, 122×122 character card) — only
the cell size disagrees.

**F4 · The LIST lies about the CONTENT's order — three Appearance sections sit inside an unmentioned fold.**
List order: Looks · Message style · Avatars · **Sizing & motion** · Message details · Background ·
**Reading typography** · **Effects** · Library. Content order (measured y): Looks 72 · Message style 482 ·
Avatars 1050 · Message details 1334 · Background 1751 · Library 2079 · **fold trigger 2183** ·
Sizing & motion 2215 · Reading typography 2788 · Effects 3227. "Sizing & motion" is 4th on the map and ~7th
in the territory, behind a collapsed disclosure the map gives no sign of. §3.2 calls the LIST "the map, with
scroll-spy"; a map that reorders and hides is not one.

**F5 · Three of four Collections rows are not interactive until they have content.**
`snap --aria`: `button "Tags 28"` but `text: Regex scripts 0`, `text: World Info 0`, `text: Rosters 0`.
Chevrons are `visibility: hidden` (correct — no dead affordance), but the row label is unclickable and
keyboard-unreachable. A first-run user cannot click "World Info" to open World Info. After creating one book
the row became a button. **Population must not decide interactivity.**

**F6 · One surface, four row anatomies and SEVEN control right-edges.**

| Group | SettingRows | inline descriptions | ⓘ | ⋯ | control right edges |
| - | - | - | - | - | - |
| Appearance | 20 | 1 | 20 | 20 | 1216, 1227 |
| Chat behavior | 15 | **51** | 15 | 15 | 1187, 1216, 1227, **1256** |
| Admin | 0 | **39** | **41** | 0 | 1227, 1256 |
| Jobs | 0 | 4 | 0 | 0 | 1127, 1227 |
| Automation | 0 | 1 | 0 | 0 | 1227 |
| Connections | 0 | 0 | 0 | 0 | **773** |
| Personas / Plugins / Backup | 0 | 0 | 0 | 0/1 | 1256 / 1126 / — |

Four states: **converted** (row + ⓘ + ⋯, no prose) · **half** (ⓘ but no ⋯, prose still inline — Admin: 41
hints over 39 descriptions) · **legacy** (no ⓘ, prose inline) · **bespoke** (no row anatomy). Visible
consequence: the ⓘ gutter runs Appearance's full height, stops halfway down Chat behavior, vanishes on five
panes; the control column jumps between **x=613 (Connections), 1016 (converted), 1255 (legacy)**. **The single
largest reason the surface reads as unfinished.**

**F7 · The elevation illustrations depict nothing — every step is 1.03–1.12:1.**
Flat 0.132 vs 0.158 → **1.031:1**. Layered ladder 0.132→0.185→0.205 → **1.077** and **1.040** per step,
**1.120** end to end. Lifted 0.158 vs 0.205 → **1.086**. §7.8 says the diagram *"is ALLOWED TO EXAGGERATE…
an under-drawn diagram teaches nothing."* It is under-drawn: **Flat and Layered are two identical empty dark
rectangles**, and Lifted reads as "two columns", not as lift.

**F8 · Five of eight chat-style previews render an identical picture, and it isn't a message pair.**
Bubble · Echo · Whisper · Ripple · Tide all draw two grey rounded blobs top-left with **no text lines at
all**. Only Flat / Document / Hush differentiate. Hush's gloss promises a "speaker's color stripe" the
preview does not draw. Under Light the blobs go near-invisible. **A preview identical across five of eight
options is worse than none — it actively asserts the skins are the same.**

**F9 · The density "segment" wraps into two stacked mismatched buttons.**
Comfortable **114×34 @ (1022, 2394)**, Compact **89×34 @ (1022, 2434)** — stacked, 25px width apart, inside a
bordered box. Cause: control column is 200px and 114 + gap + 89 = **207px**. A **7px overflow** turned a
segment into a broken-looking stack. Its live preview is a full-width box at x=387 while the control sits at
x=1022 — **635px apart**, with the label at a third position.

**F10 · The OFF state of a switch is the loudest object on the page.**
OFF track `oklch(0.99 0.005 60 / 0.12)`, OFF thumb **`oklch(0.955 0.004 75)` opaque**; ON track
`oklch(0.72 0.175 52)`, ON thumb `oklch(0.19 0.03 50)`. Against the pane background `oklch(0.132)`:
**OFF thumb 17.61:1 · ON track 7.65:1 — an off switch is 2.3× louder than an on switch.** On "Message details
& actions" that is six bright white pills and one orange one: the pane's dominant ink announces what is
*disabled*. Polarity inverts under Light; the defect persists. Chrome-quiet/content-loud is inverted at the
token level.

**F11 · "NOT BUILT YET" is the kicker over three shipped features on the config landing.**
`config-welcome.tsx:221`: `<Section aria-label="Not built yet" kicker="Not built yet" level={2}>`. Intended:
"you haven't created one". Actual reading — and the meaning the same three words carry in
`config-group-placeholder.tsx:38` and `section-placeholder.tsx` **on the same app** — "this software does not
do this yet." Pre-launch, this is the first thing a new user reads about Regex, World Info and Rosters.

**F12 · The Tags landing card wears a banned side-tab accent border.**
`[aria-label="Tags"]::after` = `background: oklch(0.72 0.175 52)`, `width: 3px`, `height: 253px`,
`inset: 0 503.641px 0 0`, on a `rounded-base` (10px) card with a uniform 1px hairline. That is
`side-tab` / `border-accent-on-rounded` — an **absolute ban** in §6 — and it is the first visual on the
config landing.

**F13 · Backup's eleven checkboxes sit ~1210px from their labels, on the wrong side.**
"Tags" label ~30px at x=387; its checkbox at x=1240–1256. Eleven rows, 24px pitch, checkbox on the RIGHT.
Checkboxes conventionally lead their label; at this distance you cannot associate a mark with a row by eye.
No select-all/none, so clearing ten is ten clicks.

**F14 · The row-actions menu opens on top of three sibling controls.**
Menu rect `[1073, 730, 165, 110]`; the switches for `show-token-count` / `show-generation-time` /
`show-generation-cost` sit at x 1168–1216, y 758 / 802 / 846 — all three inside its footprint. VS Code (the
stated floor) never occludes the control column with its gear menu.

**F15 · The teacher shows raw wire values where the control shows labels.**
Avatar size control reads **"Medium"**; the About pane reads **"Using the default — md."** Recorded in §7.7 as
a "limitation"; it is a defect — the two halves of one setting disagree about its value's name, in the pane
whose whole job is explaining that setting.

**F16 · `@modified` returns 10 rows for 1 modified setting, and marks none of them.**
With exactly one setting modified (`show-model`), `@modified` returns: Appearance · Message details & actions ·
Show timestamps · Show message ID · Show model · Show token count · Show generation time · Show generation
cost · Show reasoning icon · Action cluster. It appears to filter by modified *section* then list every leaf.
Nine of ten are unmodified, none carries a modified mark, and the group result is mixed into the same flat
list as the leaves.

### P2

**F17 · Trailing glyphs are top-aligned, not centred, and disagree with each other by 2px.**
Row `[data-setting=avatar-size]` y=1134 h=32 → centre **1150**. `⋯` y=1138 h=16 → centre **1146** (−4).
`ⓘ` y=1138 h=12 → centre **1144** (−6). The label's centre is 1150. Both glyphs share y=1138 because the row
is `items-start` and the reveal wrapper carries `mt-tight`. Present on all 20 Appearance and 15 Chat-behavior
rows. The modified rail on the same row **is** centred — three alignment strategies in one row.

**F18 · The ⋯ and ⓘ hit areas overlap; the ⋯ loses ~8px of its own target.**
Grid-scanned with `elementFromPoint` at 1px steps: `⋯` glyph 16×16, effective hit **28×29 spanning x 1216–1243**;
`ⓘ` glyph 12×12, effective hit **28×29 spanning x 1236–1263**. The overlap 1236–1243 resolves to the ⓘ,
leaving the ⋯ **~20×29 usable**. Below the 24px floor; design-audit measured 22×22 for the pair.

**F19 · Every setting row is two lonely islands with an ocean between them.**
Label-right → control-left gap, Appearance at 1280: **546–706px, median 654px**. Worst: `show-model` — 75px
label, 48px control, **706px of nothing = 81% of the row.** The direct measurable consequence of the teacher
sweep: prose came out and nothing replaced it. Number-one contributor to "feels emptier and more ragged".

**F20 · Every picker grid is N tab stops instead of one radiogroup, and every row costs two extra stops.**
Tab chain: Hearth → Mocha → Light → Actions for Shipped looks → More info → Import a theme file → Actions for
Your themes → More info → New theme → Actions → More info → Bubble… `:focus-visible` true at every stop
(good). But 3 theme + 8 style + 3 elevation cards are **14 stops** a `radiogroup` with roving focus would make
3, and the ⋯/ⓘ pair adds **2 stops × 20 rows = 40 stops** on this pane alone.

**F21 · The Appearance sub-buttons are ARIA siblings of the top-level groups.**
Inside `group "User"` the tree reads `button "Appearance" [expanded]`, then `button "Looks" … button
"Library"`, then `button "Backup & Restore"` — one flat level. No nested `group`, no `aria-owns`, no level.
A screen-reader user cannot tell where Appearance's children end.

**F22 · Switch label position is inverted between panes.** Appearance / Chat behavior: label left, switch far
right. Tag member editor: **switch left, label right**. Same control, opposite anatomy, two clicks apart.

**F23 · The shelf kicker and the group row are both CAPS, 2.5px apart in size.** Shelf `p` = 10.5px/600/
uppercase/0.84px tracking; group button = 13px/500, also caps. The only voice difference between "USER" and
"APPEARANCE" is 2.5px. Page sizes: **10.5 / 13 / 15 / 16 (ratio 1.5:1)** — design-audit raises
`flat-type-hierarchy` independently.

**F24 · The surface has no display voice: its largest text is 16px — except an account balance at ~24px.**
Section headings `h3` = 16px/500; a Select's value = 15px; a label = 13px. A section title is 1px bigger than
a dropdown's text. The one genuinely large thing on the surface is **"$30.32"** on Connections.

**F25 · The autosave receipt is a 29px grey word off the content grid.** `p "Saved"` at **x=363, 29×13px,
10.5px** — the content column starts at x=387, so the only save feedback on the surface sits **24px outside
the grid**, bottom-left, at the smallest size in the ramp. On mobile it lands on the tab-bar boundary.

**F26 · Mobile page margins are asymmetric by 3×.** At 430px the content column runs x **24 → 356**: left
margin 24px, right margin **74px**. The pane visibly sits left of centre.

**F27 · Card grids are ragged in every arm.** Desktop chat-style: **271×117 (row 1) · 271×131 (row 2) ·
410×117 (row 3)** — two widths, two heights, gaps 9px and 7px. Mobile: 8 cards at 162 wide but Whisper is
**144 tall vs 131** and sits at y=863 while its row-mate Hush sits at **y=869**. Row pitch 138 / 139 / 145.

**F28 · Three empty-state boxes eat 129px of the LIST and offer no action.** "No scripts yet." / "No books
yet." / "No saved rosters yet." — three bordered boxes at 75px each in a 290px list, centred 11px muted text,
**no door**. The `+` that would fix it lives in the header row above. The CONTENT pane states the same
emptiness *with* a working button.

**F29 · Empty-state honesty sweep (the #924 class, across the rest of the surface).**

| Empty state | Copy | Verdict |
| - | - | - |
| Collections list ×3 | "No scripts yet." / "No books yet." / "No saved rosters yet." | **Scoped read stated as absolute.** These are owner-scoped (`regex.listScripts`, `worldInfo.listBooksWithUsage`, `rosterPreset.list`); in a multi-user deployment a member sees "No books yet" while books exist. Same class as #924. |
| Collections landing kicker | "Not built yet" | **Two facts collapsed** (F11). |
| Looks | "Nothing here yet — import a theme file, or start one in the builder below." | Honest, but **names two doors and provides neither** — the import is an unlabelled ⬆ icon *above* the sentence. |
| Personas → This chat | "Open a chat to choose who you play as there…" | **Honest and well-scoped — the best copy on the surface.** No door, though. |
| Tag member → Applies | "Nothing to attach — a tag applies wherever you put it…" | Honest. |
| World book (created live) | icon + "No entries yet" + guidance + a **New entry** button | **The gold standard.** Every other empty state should look like this. |

**Two of seven lie by collapsing facts; three more are honest-but-doorless; one is exemplary.**

### P3

**F30 · `label-content-name-mismatch` on 8 nodes** (Lighthouse a11y 96/100, desktop AND mobile): the
`config-band` "Tags 28" button and every `aria-pressed` picker card. Visible text (label **+ gloss**, or
"Tags"+"28" without a space) is not a substring of the accessible name. **A QUESTION, not a verdict** —
`theme-swatch.tsx:59` explicitly rules that `aria-label` pins the name to the theme name alone so "Hearth"
stays one findable control, and voice control works. Either accept the axe divergence with a comment, or move
the gloss to `aria-describedby`.

**F31 · `undersized-ui-text` ×9 — 10.5px interactive text** on all 8 chat-style card glosses and one
background control (floor 11px), both pointer classes.

**F32 · Two LoAFs on config interactions, both with style/layout in-frame.** Group expand:
`duration 161ms, blockingDuration 109ms, styleAndLayoutStart 3635` (>0). Fold open: `129ms / 71ms`, same
signature, both from `dispatchDiscreteEvent`. Over the 50ms budget; the group-expand click is a visible stall.
CLS clean (`nonVirtualizedCls 0`; both shifts carry `hadRecentInput: true`); `animations: []`.

**F33 ·** "Go to Jobs ↗" uses an external-link icon for internal navigation.
**F34 ·** "Unfavorite Traveler" is painted with the destructive token `oklch(0.65 0.19 25)`; red means destroy
everywhere else.
**F35 ·** "Delete" on a Jobs schedule row is the quietest control in its row — bare text, beside a bordered
"Edit" and a loud orange switch. Danger hierarchy inverted. Sibling: Plugins' `Remove <plugin>` is the only
red *filled* button on the surface and it is **permanently visible**, which is exactly the "no jank visible at
rest" bar the owner set.
**F36 ·** Import offers no warning about what it does to existing data. The Backup dropzone is styled like a
benign avatar upload; restoring a library is destructive-adjacent with no confirm and no merge/overwrite
statement.

---

## PART 2 — THE EXCELLENCE CRITIQUE

Ranked by leverage; each is a **rebuild** recommendation, per the pre-launch framing.

**E1 · The row is the wrong shape. Rebuild it as a measure-capped two-column form, not a full-bleed bar.**
The highest-leverage single change. A 654px void between a 75px label and a 48px switch is not "clean", it is
*evacuated*: the eye traverses the whole pane to bind a name to a control, and because the control column
moves between panes (613 / 1016 / 1255) it re-learns that traverse per pane. macOS caps at a label gutter plus
a control column; VS Code caps at a reading measure and left-aligns. **Ship:** one grid,
`max-w-(--reading-measure)` on the row block, label column sized to the longest label in the *section*, control
column immediately adjacent, trailing ⓘ/⋯ pinned to the **block's** right edge, not the pane's. The ⓘ then
sits ~40px from the control it annotates instead of 830px.

**E2 · Pick ONE selection idiom. There are currently eight.** (1) list item = orange left border + tint;
(2) expanded group = filled bar; (3) picker cards = 2px orange ring; (4) density segment = ring on one button
in a box; (5) Jobs tab strip = underline + tint; (6) background tile = orange check badge; (7) teacher tab =
**solid filled accent block**; (8) search suggestion = light fill. **Ship two:** a ring for cells in a grid, a
left-rail + tint for rows in a list. Retire the rest — especially the filled teacher tab, the heaviest accent
block on the surface for the lowest-stakes state.

**E3 · Invert the switch. The quiet state must be the quiet one.** 17.61:1 OFF vs 7.65:1 ON is backwards. An
opaque near-white 32px thumb in a 48px track also reads as a fat pill — the thumb is 2/3 of the track, so
there is almost no visible travel. **Ship:** OFF = muted track, muted thumb (~3:1 against the page, not 17:1);
ON = accent track with a *light* thumb; thumb ~55% of track height with visible travel. Removes most of the
perceived noise from Message details, Chat behavior and Plugins at once.

**E4 · Give the surface a display voice.** Max 16px, four steps, ratio 1.5:1. The pane title, the section
heading and a dropdown's value are within 3px of each other, and the largest object on the surface is an
account balance. **Ship:** a real step for the pane subject, sections at ~16/600, labels at 13, gloss at 11
(which also clears F31). Two steps of separation, not one.

**E5 · The teacher's premise is wrong — ship section-first with drill-on-focus (#926).**

**Measured arrival cost** — rows self-explanatory from label + control alone, no hover:

- **Message details & actions: 4 of 8.** Opaque: Show message ID (*whose*?), Show model, Show reasoning icon,
  Action cluster (value "Reveal on hover" — of what?).
- **Avatars: 3 of 5.** Opaque: Avatar aspect (indistinguishable from Avatar shape), Avatar ring.
- **Chat & message handling: 2 of 11.** Opaque: Send continues the reply, Empty Enter generates a reply,
  Auto-continue, Auto-continue rounds, Auto-swipe short replies, Custom stopping strings (placeholder `###`),
  Offer choices in new chats, Reactions in new chats, Characters can react in new chats.

**8 of 24 = 33% self-explanatory at rest.** Two thirds of what is on screen means nothing until you gesture at
it one row at a time — and it is worst in Chat behavior, exactly the pane you visit rarely and have forgotten.

**The coarse arm.** The ⓘ *is* mechanically a real substitute: at coarse it grows to **44×44**, tapping opens
the teacher, and the ⋯ is correctly `display: none`. But the teacher opens `data-context-mode=overlay`,
**430px wide at x=0 — full-screen**, covering every setting. Learning an 8-row section on a phone is 8
full-screen round trips with the answers held in working memory. The gesture exists; the affordance is worse
than desktop.

**Collection members.** The teacher handles them differently and worse: for the `comedy` tag it opens on
**Applies, not About** (so `defaultTab` silently depends on subject kind), its trail degrades from
"Settings · Appearance · Avatars" to just **"Settings"**, and its content is a null-state. For a collection
member the teacher teaches nothing and costs a pane.

**Ship option 2 — section-first with drill-on-focus.** (a) It is the only option correct *at rest at both
pointer classes*: option 1 (follow the visible set) needs scroll-sync, and the teacher is
`data-context-mode=collapsed` by default in config — it is OFF when you arrive, so scroll-sync buys nothing
until opened. Option 4 is refuted by the 33%. (b) It fixes the collection-member case for free: a section
lesson exists where a member lesson does not. (c) It is the smallest change — the ladder already falls back to
the section's `teach`; you change *when* the leaf level engages.

**And option 3 should ship TOO.** Every good settings surface — macOS, VS Code, GitHub, Figma, Discord —
puts a one-line gloss under the label and keeps depth elsewhere. S3 removed them because rows felt heavy; the
measured outcome is a 654px void per row, so rows did not get *tighter*, they got *emptier*. A single 11px
gloss capped at the reading measure costs zero vertical rhythm (32px rows with a 16px label become 48px —
exactly the height the collection rows already use) and takes 33% to ~85%. **The teacher then becomes what it
should be: Affects, Related, default-vs-current and Reset — the things a gloss genuinely cannot carry.**

**E6 · Rebuild the visual controls as one family. Right now they are four people's work.** Chat-style cards
(271×117, ring, centred label, centred 2-line gloss, blob art) · elevation cards (271×76, ring, centred label,
no gloss, invisible art) · density segment (200px column, wrapped stack, bordered box, detached full-width
preview) · theme cards (829×66, ring, left label + right meta, three-cell strip) — plus a fifth, the
background grid (104×104 tiles, no captions). **Ship one picker-cell primitive**: fixed cell, art region on
top at a fixed aspect, name below-left, optional meta below-right, ring for selected, `radiogroup` with roving
focus. Theme, chat style, elevation, density and background all become variants. **Kills F2, F7, F8, F9, F20
and F27 together.**

**E7 · The panes are 60–90% empty and nothing designed lives in the void.** Personas: content ends y=347 of
1400\. Jobs: 720 of 1500. Tag editor: 460 of 1000. The teacher: 4 lines in a 700px column. Not "clean" —
unfinished-looking. The CONTENT law says nothing-selected must be a designed landing state; the same
discipline should apply to a thin pane: either it earns its width (E1's measure cap plus a second column for
the section's teaching) or it should not be that wide.

**E8 · Personas leads with a notification preference.** Order is Notifications → Your personas → This chat.
The roster is the subject; a notify toggle is trivia. Reverse it. (And "YOUR PERSONAS" is a caps kicker while
its two siblings are sentence-case `h3`s, while the LIST calls it "Your personas".)

---

## PART 3 — UX / IA: the errands, and what fought me

**Errand A — change a setting, regret it, restore it without knowing which one. FAILS at discovery.**
Toggle "Show model" → nothing on screen indicates a change (the modified mark is a 2×24px orange tick at
x=379, ~900px down; the LIST group and sub-item carry no roll-up) → search `@modified` → **10 results, none
marked** → guess → scroll → hover → ⋯ → Reset. **Missing: a modified count on the group row and the shelf, and
a modified marker on the search result.** Once the row is known the reset is clean — Reset is correctly
disabled with `title="Already at its default."` when unmodified, enabled when modified, and clears the rail.
That part is good work.

**Errand B — change theme and change it back.** Door found immediately. Picking applies instantly, "current"
moves, "Saved" flickers bottom-left at 10.5px. **Crunchy:** no undo, no confirmation beyond a 29px grey word
900px from where you clicked; and under Light the three cards become two black slabs and one invisible one, so
you change back by reading *names*, not swatches.

**Errand C — background on, adjust, remove; then a different one on a character.** The grid is a genuine
improvement — 15 tiles, 104×104, clean 8-up. **Crunchy:** the "None" tile renders as a warm orange gradient
plate with a check badge — it looks like a *colour*, not an absence; **none of the 15 tiles carries a visible
name** (accessible names exist), so you pick by squinting; and "ADD BACKGROUND ⌄" is styled identically to
"CUSTOMIZE THIS LOOK ⌄" — an *add* affordance and a *disclose-advanced* affordance in the same clothes.
Fit/Scrim/Blur correctly hidden at kind=none. Both pickers teach the same grammar; only the cell size
disagrees (104 vs 122).

**Errand D — new theme from the current one.** Door is clear and its label tracks the current theme. But the
empty says *"import a theme file, or start one in the builder below"* and **the import door is an unlabelled
⬆ icon *above* that sentence.** The copy points down; the control it names is up and unlabelled.

**Errand E — find a half-remembered setting.** Three routes, all work, all under-informative. List search
`avatar` → suggestions show `<Label> <Group>` — **the section is missing from the trail**, so "Surface
elevation / Appearance" does not tell you it is inside "Sizing & motion" inside a collapsed fold. ⌘K lands
correctly (fold opens, section scrolls in) but **anchors on the section**, so the target row lands clipped at
the bottom edge with no flash-ring. `@modified` is not rendered as a chip.

**Errand F — switch persona, then per-chat, then work out "default".** With one persona the popover is
redundant: the head says "Traveler / Playing as · pinned — your default everywhere" and the row 40px below
says "Traveler" + a "playing as" pill + a pin — the same two facts twice, once as words and once as icons.
The contextual block correctly does not render with no chat open. **Crunchy:** the solid pin is an
`img "Pinned — your default persona"` — **not interactive** — while the faint pin elsewhere is a button. Two
pins, two element types, nothing says which are clickable. The account foot surfaces **"owner"** and
**"oidc"** as badges; `oidc` is a protocol acronym leaking to the user. "Log out" is styled identically to
"Manage personas in Settings".

**Errand G — Settings on a phone.** Drill-down works (list slides off-canvas, back chevron, correct title).
Three problems: the config landing puts **~350px of prose above the first settings row** (38% of the first
screen); the group rows are still **16px** at coarse; and the ⓘ opens the teacher **full-screen**, so learning
any row means losing every row.

### Information architecture

- **Wrong depth.** *Density* and *Surface elevation* are among the most-reached-for appearance settings and
  are five moves deep: Settings → Appearance → scroll ~1900px → open "Customize this look" → scroll →
  Sizing & motion. *Library / Rows per page* is a pagination setting living in Appearance — and the one row on
  that pane that kept its inline description and the old full-width layout.
- **Two homes for one word.** "World info" is a Chat-behavior sub-section (scan depth, token budget) **and** a
  Collections entry (books). "Databank" is a Chat-behavior sub-section **and** a rail section. No
  disambiguation in either label.
- **Two homes for one fact, both visible at once.** The Tags landing card renders "MOST USED: comedy 5,
  rpg-ready 4…" while the expanded LIST renders the same rows two inches left.
- **Same click, two meanings.** Clicking a settings group swaps CONTENT. Clicking a *collection* only expands
  the LIST — content stays on the landing until you click "Open Tags →". One list, two behaviours.
- **Map/territory name drift.** LIST "Message handling" → CONTENT "Chat & message handling". LIST "Message
  details" → CONTENT "Message details & actions". LIST "Your personas" → CONTENT "YOUR PERSONAS" caps kicker
  among `h3` siblings.
- **Scale:** the LIST has no sticky group headers, so expanding Tags (28 rows) pushes App / Collections /
  Extensions entirely off-screen. Triple the settings and the map becomes a scroll you lose your place in.

### #925 — the collections axis, confirmed and made precise

Tested by creating a world book live. **The axis is that the `collection` arm models a FLAT, UNORDERED set of
self-editing members. Two of the three are not that.**

- **Tags** — flat, unordered, a tag *is* its own editor. **Fits.**
- **Rosters** — flat, unordered, leaf with a form editor. **Fits** (the control was right).
- **Regex** — flat but **ordered**: rules run in sequence, so position is *semantics*. Its sort control is a
  Tags affordance ("Most used" / "Manual order lets you drag rows") — the wrong control for semantic ordering.
- **World Info** — **not flat.** Selecting a book puts a second surface in CONTENT: title + rename pencil
  (pinned 1150px away), "0 entries", "Backfill titles", "New entry", and a centred EmptyState with its own
  door. The book's *entries* have no home in the config geometry, so they grow a second list inside CONTENT —
  a third level the LIST cannot map and the scroll-spy cannot light.

**Refuted alternatives:** not volume (Tags has 28 and works), not editor mount (all four mount identically).
**It is set-vs-tree, with ordering as the minor sibling.** Consequence for the teacher: for a collection member
it defaults to a *different tab*, degrades its trail to one word, and renders a null-state — the collection arm
breaks the teacher seam too.

---

## PART 4 — NITS (no severity earned; all with receipts)

1. `⋯` is 16×16 and `ⓘ` is 12×12 — adjacent glyphs, different sizes, 6px apart.
2. Personas band: two icon buttons at 34px, "New persona" at 32px; text button y=163, icons y=162.
3. Persona popover: head avatar 32×32, switch-row avatar 24×24 — same persona, 40px apart.
4. Persona popover row height 34px — below 44 at coarse (the You sheet uses the same lens).
5. Persona popover: pin at x=402, popover ends 437, badge ends 394 — 8px gap left, 19px right.
6. Row-actions menu items are 151×32 — under 44 (desktop-only, menu is coarse-hidden).
7. No separator between Reset (a state change) and the two Copy items.
8. Disabled "Reset to default" renders at `opacity: 0.5` — the only 0.5-opacity text on the surface.
9. Shelf-to-first-row gap 19.1px; last-row-to-next-shelf 24.0px. Asymmetric by 4.9px on all four shelves.
10. Chat-style card horizontal gaps: 8px rows 1–2, 9px row 3.
11. Chat-style card row gaps: 9px then 7px.
12. Elevation labels "Flat", "Layered", **"Lifted (glow)"** — one enum member carries a parenthetical.
13. "CUSTOMIZE THIS LOOK **advanced** · your changes, on top of Hearth ⌄" — caps kicker, a lowercase word doing
    a badge's job with no badge chrome, a middot, and a caption, in one trigger line.
14. "ADD BACKGROUND ⌄" and "CUSTOMIZE THIS LOOK ⌄" are identical affordances for unrelated jobs.
15. The "Add background" door is *below* the grid rather than a `+` tile *in* it.
16. Looks uses three label voices in one section: "Shipped · picking applies it" (10.5 sentence, muted) /
    "YOUR THEMES" (caps kicker) / "Theme builder" (13px sentence label).
17. "Your themes" and "Theme builder" are adjacent rows with different anatomies.
18. Unselected theme card border is `oklch(0.99 0.005 60 / 0.08)` — an 8%-alpha hairline on a 0.205 card; the
    three cards read as one band with gaps.
19. Under Light the theme card body keeps the *app's* card colour while the swatch shows the *theme's* — the
    Light card is a near-white strip over a dark body.
20. The teacher's subject title "AVATAR SIZE" is 10.5px caps while its summary is ~17px — the title is the
    smallest text in the pane.
21. The teacher's band label "SETTINGS · ABOUT" restates the selected tab immediately below it.
22. The teacher's AFFECTS list is a bulleted list of one; the bullet is near-invisible at x=905, text at 913.
23. The teacher's two tabs occupy **92px of an 800px pane (11.5%)** for a two-way switch, the selected one a
    solid accent block.
24. Same context bracket, two tab sizes: config gets 2 tabs at ~192px each; the character card gets 6 at ~60px
    plus an overflow ⋯.
25. Number fields on Library / Chat behavior / Jobs right-align to 1255–1256 — **39px past** every converted
    row's control edge, into the ⓘ column's x-range.
26. Connections' control column starts at **x=613** — 403px left of every other pane.
27. Connections uses **italic** for a status gloss; italic appears nowhere else on the surface.
28. Connections has four button weights in one pane: filled, bordered, bare text, icon-only.
29. Connections: "Image embedding **optional**" — one row of eight carries a trailing qualifier at a smaller
    size.
30. Connections: the "Protocol" row is an unlabelled child of "Chat" — it just looks like a smaller label.
31. Jobs: "Run a job…" is accent-filled; "New schedule…" one section below is a bordered ghost.
32. Jobs / Connections: "Succeeded" and "Active" are green pills; "Bulk" is a grey/tan pill — two badge systems
    in one row.
33. Tags list: "5 uses" vs "1 use" — the unit word's width changes, so numerals stagger ~14px down 28 rows.
34. Tags list: "Manual order lets you drag rows." is permanently displayed while the sort is "Most used".
35. Tags list: the description says "Color-coded labels" and all 28 row dots render the same grey.
36. Tag editor: two 32×32 colour swatches with 154px and 165px captions below, pushing the controls 176px
    apart.
37. Tag editor: the selected row's `⋯` is visible at rest with a filled background; settings rows' `⋯` is
    invisible and bare.
38. Tag editor: "Closed folders … aren't built yet" — a second, *different* use of "not built yet" (F11).
39. World book: the rename pencil sits at x=1236 for a title at x=387.
40. World book: "Backfill titles" (disabled) gets equal billing beside the accent-filled "New entry".
41. `Custom stopping strings` placeholder is `###`; it is the only textarea on the surface (200×80 in a column
    of 32px controls).
42. `Auto-continue rounds` renders muted-disabled but its ⓘ stays at full opacity.
43. Effects: `Frosted glass` uses a `<p>` as the legend for four nested switches — no `fieldset`/`role=group`.
44. Effects: "Messages (reading surface — use sparingly)" keeps an inline parenthetical after the sweep
    removed every other inline gloss.
45. Effects: `Surface texture` is still a Select showing "None" — the same seen-not-read class as the four
    that were rebuilt, left un-rebuilt.
46. The fold's contents inherit `oklch(0.74)` and **15px** while the sections above inherit `oklch(0.955)` and
    **16px** — identical controls render dimmer and smaller inside the disclosure.
47. Row heights across the surface: 16 (list group) · 22 (list pitch) · 24 (backup checkbox) · 32
    (switch/select) · 34 (persona) · 41 (tag) · 44 (collection) · 54 (slider) · 99 (elevation) · 209 (density).
48. The search suggestion popover wears a **2px orange border** — the same accent weight as a *selected*
    picker card, on a transient list.
49. Search suggestions repeat the group name ("Appearance") on nine consecutive rows.
50. `@modified` renders as literal text rather than a token chip.
51. Mobile: "Add a search filter" is a 48×48 solid orange square — the loudest object on the mobile settings
    screen, for a secondary filter. design-audit also flags it at 40×48 (under 44 on the short side).
52. Mobile: "Saved" lands at (0, 676), on the bottom tab-bar boundary.
53. Mobile: "New theme from Hearth…" truncates and takes over half its row.
54. The `<p>` shelf labels duplicate their `role=group` accessible name — a screen reader hears "User, group"
    then "User".
55. Copy: "Nothing here is required, and nothing here is spent once" — aphoristic cadence (§6 tell).
    **Question, not a verdict** — may be deliberate owner voice.
56. Copy: "The parts every chat is built from" ends on a preposition. Same question.

---

## RETRACTIONS (what the lane got wrong, and the receipt that killed each)

- **R1 — "The modified stripe is not built."** Read `border-left-width: 0`, `padding-left: 0`,
  `::before content: none` on the row. **Wrong.** It is a separate `[data-slot=setting-modified-rail]` div at
  `border-left: 2px oklab(0.72 0.107741 0.137902 / 0.6)` plus an `sr-only` "Modified from its default." It
  ships and works. It is *not* §7.7's "permanently reserved, transparent at rest" mechanism — it is
  conditionally rendered and absolutely positioned at x=379, outside the row's box — but §7.7's OUTCOME is
  achieved: `rowX=387` and `lblX=387` are byte-identical on modified and unmodified rows. Benign deviation.
- **R2 — "design-audit --mobile is blind to the 16px rows."** It reported 9 tap-target P1s on plain
  `--goto config` and 0 after clicking Appearance. **Wrong** — on mobile the list drills away
  (`list.x = -422`, off-canvas). The instrument is correct; the lane was auditing a state where the rows are
  not on screen.
- **R3 — "The ⌘K jump does not scroll to the target."** Read `scrollTop = 0` off
  `[aria-label="Settings content"]` — **wrong element**, that is not the scroller. The screenshot proves the
  pane scrolled and the fold opened. The residual, smaller finding stands: the scroll anchors the *section*, so
  the target row lands clipped at the bottom with no flash-ring.
- **R4 — "The ⋯ hit area is offset down-right of the glyph."** Read `inset: 8px -20px -20px 8px`. **Wrong** —
  the grid scan shows both hit boxes centred on their glyphs (both centres x=1230). The real finding is the
  *overlap*, not an offset.
- **R5 — "The background grid's second row is shorter."** Eyeballed. **Wrong** — all 15 tiles are exactly
  104×104; the second row's images are simply darker.
- **R6 — "Collections rows have a ragged left edge / a dead disclosure affordance."** **Wrong on both** — every
  chevron sits at x=68 and every group icon at x=88; the empty collections' chevrons are `visibility: hidden`
  spacers, correctly reserved. The real finding (F5) is that those rows are not buttons.
- **R7 — "`StartFromThemeField` was never converted to the swatch atom."** Probed for a combobox, found none.
  **Wrong** — it is a `Menu`, and `character-appearance-tab.tsx:320` renders `<ThemeSwatchStrip>` per
  `MenuItem`; the strip exists only while the popup is open. The atom does have three mounts. Residual finding:
  its closed trigger shows no swatch while the Looks cards always do.
- **R8 — "The chat-style cards overflow at mobile."** `--expect-no-overflow` PASSES (`overflow=0x0,
  escapes=0`); they wrap 2-up at 162px.

---

## WHAT IS GENUINELY WORKING (do not touch)

1. **The hover reveal meets the owner's bar exactly.** `opacity-0 transition-opacity duration-(--motion-fast)
   ease-out-expo group-hover/setting:opacity-100 group-focus-within/setting:opacity-100
   has-[[data-popup-open]]:opacity-100 pointer-coarse:hidden` — opacity-only, house token, named group, pinned
   while the menu is open, gone at coarse. **Zero layout shift, empirically:** eight rows measured before and
   during hover are byte-identical in x, width and height; only y shifts, uniformly by exactly −540.00px (the
   scroll-into-view). No `display` swap, no reserved geometry, no reflow. The thing most likely to be wrong is
   right.
2. **The coarse contract is honoured end to end.** `⋯` is `display: none` at coarse; the `ⓘ` grows to 44×44;
   Reset is reachable through the About door. Exactly as ruled.
3. **Reset's honesty.** Disabled with `title="Already at its default."` when unmodified, enabled when modified,
   one direct write, rail clears on success. No two-writer drift.
4. **Focus is clean.** Twelve consecutive Tab stops measured, `:focus-visible = true` and a 1px ring at every
   one, inside and outside the fold.
5. **The world-book empty state** (icon + "No entries yet" + one sentence + a working door) is the best empty
   state on the surface and should be the template for the other six.
6. **`--goto`/⌘K landing** correctly opens a collapsed fold before jumping — a real piece of care.

---

## THE SINGLE BIGGEST OPPORTUNITY

**Cap the row's measure and put a one-line gloss back in the space you already have.** One change resolves the
654px void (E1/F19), the 33%-self-explanatory arrival problem (E5), the 830px-away ⓘ, and the
seven-control-right-edges raggedness (F6) — because a measure-capped row block pins the control and the
trailing glyphs relative to *itself* instead of to a pane whose width changes per group. It also lets the
teacher become what it was meant to be: Affects, Related, default-vs-current and Reset.

---

## INSTRUMENT COVERAGE

| Instrument | Status |
| - | - |
| `snap --map` | RAN — config root (52 elements, 3 DOM fallbacks), config-list, tags collection |
| `snap --aria` | RAN — settings list (38 lines), row menu, persona popover, ⌘K palette, teacher panes |
| `snap --contrast` | RAN — Light arm: field-label 15.56:1 PASS, chat-style card 7.37:1 PASS; one selector NOT FOUND (logged). Supplemented by direct oklch→sRGB math on swatch cells, elevation illustrations and switch states |
| `snap --expect-no-overflow` | RAN — mobile settings content PASS, overflow 0x0, escapes 0 |
| `snap --eval` | RAN — ~20 probes: row geometry, hit-area grid scan, computed styles, `__orb.motion()`, `__orb.animations()`, pane widths, per-group census |
| `snap --matrix` | SKIPPED — replaced by hand-driven arms (1280, 1400/1500/2400/2600, 430, 900) × (Hearth, Light) × (fold closed/open); the 8 fixed variants would not cover the pane-state and fold arms |
| `snap --json` | SKIPPED — console never hit the 200-message cap |
| `design-audit` desktop | RAN — `findings=39 p0=0 p1=29 p2=9 p3=1`, census 773, reached 116 |
| `design-audit --mobile` | RAN ×2 — `--goto config` (p1=9 tap-target, p2=1, p3=1); `--goto config --click Appearance` (p2=9, p3=1; 0 P1 explained by the off-canvas list, R2) |
| `motion-audit` | RAN — `/` boot: LoAF 16 in ring, worst blocking 533ms, **non-virtualized CLS 0.0224 vs 0.1 budget PASS**, 0 non-compositor-clean animations |
| `perf-meter` | SKIPPED — the interaction question was answered by `__orb.motion()` after the two real config interactions (F32) |
| Lighthouse desktop | RAN — a11y **96**, best-practices 100, SEO 100, agentic 100; 2 failures (`label-content-name-mismatch`, `target-size`), both product node paths, dev-overlay ruled out |
| Lighthouse mobile | RAN — identical scores, identical failures |
| `__orb` suite | RAN — `.motion()`, `.animations()`, `.resetEvidence()`, `.shell()`, `.nav.section()`. `.renders()` skipped — no render-churn symptom |
| PNGs actually looked at | RAN — 25 screenshots read |
| Keyboard walk | RAN — 12 Tab stops with `activeElement` read at each |
| Appearance presets | **PARTIAL — `defaults` only.** Density/elevation arms driven through the app's own controls instead. `compact` / `reading` / `maximal` / `diagnostics` NOT run. Given F46 and F47 a `compact` arm is likely to surface more. **The one genuine coverage gap.** |
| Theme arms | RAN — Hearth (no `data-theme`, default) and `--theme Light`. Mocha skipped — same polarity as Hearth; its token values were read from the live registry |
| Pane-state arms | RAN — both open (1280 + context 384), context collapsed (default), list collapsed (900px → `56px 0px 844px 0px`), mobile drill-down (list at x=−422) |

**Console triage:** `[frame] long frame 145ms · blocking 94ms @ main.tsx` and `[drop] 67–101ms rendered frame
mid-animation · svg[aria-label=Orbweaver]` are both **INVESTIGATE**, pre-existing and not config-specific
(corroborated by motion-audit's 533ms worst-blocking). `[cls] shift 0.0221–0.0327 unexpected` judged and
dismissed with the receipt (`nonVirtualizedCls 0` on click-driven shifts, all `hadRecentInput: true`; the
0.0224 boot shift is well under the 0.1 budget). Mount-time `[perf] slow commit` 18–28ms within tolerance for
a 773-element census. **Errors 0 · page errors 0 · failed requests 0 · vite-dep-churn 0 · deadcss 0.**

## STATE LEFT BEHIND (dev db only)

`show-model` was toggled and **reset back to default** via the row menu (rail cleared, verified). One
world-info book named **"New book"** (0 entries) exists in the dev db, created deliberately to test the #925
depth axis — useful evidence for whoever verifies it; delete when done. No files written outside `reports/`
and the scratchpad.
