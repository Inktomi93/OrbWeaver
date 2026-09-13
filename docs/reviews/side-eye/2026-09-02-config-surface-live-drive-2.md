---
kind: review
status: draft
updated: 2026-09-02
---

# side-eye — the Config surface, maximal re-drive (#1099)

> **Lane cb-config-eye-2, 2026-09-02.** Same brief as the 2026-08-30 drive, verbatim, deliberately
> unchanged so the two reports compare: use the FULL instrument battery · the bar is EXCELLENCE, not
> acceptability · report EVERY finding including nits ("this is our bedrock, our Alamo") · work through
> it as a user would and report UX/IA and what feels crunchy · pre-launch posture — judge against the
> correct END STATE, not against what is tolerable.
>
> **Why this exists:** the instrument fleet was truth-repaired between the two drives. This report's
> third deliverable is the INSTRUMENT DELTA — what the old fleet mismeasured or structurally could not
> see, named against the row that fixed it.
>
> **Predecessor:** [`2026-08-30-config-surface-live-drive.md`](2026-08-30-config-surface-live-drive.md)
> (read in full before this one; findings are referenced as F1–F36 / E1–E8 / nits 1–56 / R1–R8).

## Environment + run health

Vite serving `:5173` is **pid 3858659, started 01:16:02, 2m54s old at first drive** (the brief named pid
3857966 — that is the supervisor, not the server; the actual listener was age-verified before any
receipt was taken). Server `:8788` pid 3858309. Main tip `4f3840283`. Box load-avg 2.02 at start.
Isolated stage staged a detached worktree at `4f3840283f9f` on `:5273/:8888`.

**Run health, every one of ~40 driven runs:** `nav=OK` · `nav-actions-failed=0` · `steps-failed=0` ·
`page-errors=0` · `console-errors=0` · `failed-req=0` · `vite-dep-churn=0` · `deadcss=0` · `emptycss=0` ·
`environment-fails=0` · `sandbox-trace-noise=0`. Console *warnings* are non-zero and triaged in a table
at the end of Part 3 — no row is disposed of as "it's dev mode".

**One environment fault, reported mid-run:** the chrome-devtools MCP was wedged for ~12 minutes
("The selected page has been closed"); the orchestrator identified the cause (its own probe page
closed, killing the shared selected-page pointer) and re-opened one. Both Lighthouse arms were then
taken. No product receipt was affected.

---

## VERDICT — DO NOT SHIP AS IS

**The 08-30 verdict stands, and the ledger is worse than "unchanged".** Of the 36 numbered defects in
that report, **two are fixed, four changed, and thirty still stand** — most of them byte-identical:
the 16px group rows measure 16.0px again, the theme cards are 828.8×66 again, the density segment is
114×34 over 90×34 at (1022, 2393) again, the OFF switch is 17.673:1 against a 7.669:1 ON switch again,
"Using the default — md." is still what the teacher says while the control says "Medium".

What the re-drive adds is not more of the same. It is **five defects the 08-30 fleet could not see**,
and the two largest are structural:

1. **Clicking a settings group makes the pane jump.** The Looks section mounts ~230ms late and pushes
   the entire Appearance body down 372px — a **0.1656 non-virtualized layout shift**, the app's own
   `[cls]` flagger calling it `OVER BUDGET`, reproduced in four independent runs including a real
   Playwright click, with a frame strip that shows the jump.
2. **The CONTEXT pane on Config is navigation, and it is the LIST again.** With both panes docked, the
   context pane's "RELATED" list renders the same nine Appearance sub-sections as the list pane, 900px
   away, at a larger size, with no selection state. `design-audit` files it as **8 × `duplicate-action-door`**
   — and that rule only fires in the `both-docked` arm, which the 08-30 drive never measured.

And one house-law ban is being missed by the very detector written to catch it: the Tags landing card's
3px accent side-tab is present, unchanged, and `design-audit` reports `side-tab candidates=0` on that
surface because the accent-border census reads `border-*-width` only and this codebase paints accent
edges with a `::after` bar.

**The mechanics remain good** — the hover reveal still costs zero horizontal layout, focus is
`:focus-visible` at every one of 20 measured stops, Reset is still honest, the coarse contract still
holds, and the teacher's tab strip was correctly rebuilt as a `toolbar` + `aria-current` (a real fix).
What is wrong is still **coherence and ink**, plus a first-paint that visibly moves under the cursor.

---

## PART 0 — DELTA vs the 2026-08-30 drive

### The 36 numbered defects

| # | 08-30 finding | Verdict | Receipt |
| - | - | - | - |
| F1 | Nine config-group rows are 16px tall | **STILL STANDING** (byte-identical) | `[data-slot=config-band]` = **290.2 × 16.0px**, row pitch **22px**; `tap-target` P1, "9 affected of 9 judged; short side 16px", at BOTH pointer classes; Lighthouse (desktop + mobile) `target-size`: *"Target has insufficient size (389px by 16px, should be at least 24px by 24px) … Safe clickable space has a diameter of 20px instead of at least 24px"* — the spacing exception now measures 20px, i.e. it fails harder than the 22.25px pitch of 08-30 |
| F2 | Theme cards are full-width slabs, two of three cells the same colour | **STILL STANDING** (byte-identical) | Three cards at **828.8 × 66** stacked; strip **826.8 × 40**; three cells at **275.6** each. Canvas-decoded contrast cell1↔cell2: **Hearth 1.090:1 · Mocha 1.078:1 · Light 1.044:1** (floor 3:1, WCAG 1.4.11). 551.2px of 826.8px = **66.7% of every strip is one apparent colour** |
| F3 | One concept, two anatomies (829×66 cards vs 60×20 chips) | **STILL STANDING** | `theme-swatch-card` 828.8×66 in Looks; `theme-swatch-strip size="row"` unchanged in the character tab. `cohort-anatomy` P2 fires in EVERY arm on `[data-slot=config-list]`: "2 of 4 at 75px, 2 at 32px" (desktop), "2 of 4 at 87px, 2 at 44px" (mobile) |
| F4 | The LIST lies about CONTENT order — three sections inside an unmentioned fold | **STILL STANDING** | LIST order (from the live DOM): Looks · Message style · Avatars · **Sizing & motion** · Message details · Background · **Reading typography** · **Effects** · Library. CONTENT `h3` order at rest: Looks · Message style · Avatars · Message details & actions · Background · Library — the three bold ones are absent until the fold opens (their rows appear at y 2274 / 2846 / 3296 only after "Customize this look") |
| F5 | Collections rows not interactive until they have content | **STILL STANDING** (2 of 4 now) | `snap --aria`: `button "Tags 28"`, `button "World Info 1"`, but `text: Regex scripts 0` and `text: Rosters 0`. World Info flipped to a button only because the 08-30 lane left one book behind. Population still decides interactivity |
| F6 | One surface, four row anatomies and seven control right-edges | **STILL STANDING** (now **eleven** edges) | Per-pane census below. Anatomies: converted (Appearance 20 rows/20 ⓘ/20 ⋯) · half (Admin **41 ⓘ, 0 ⋯, 60 inline prose**) · legacy (Connections/Backup/Automation: 0 ⓘ, 0 ⋯) · bespoke (Plugins **126 prose paragraphs**). Chat behavior alone carries **four** control right-edges |
| F7 | The elevation illustrations depict nothing | **STILL STANDING — worse than described** | Settled measurement (1200ms after the fold opens): **Flat** = one 257×40 plate at `oklch(0.132 0.006 60)`; **Layered** = every descendant `background-color: rgba(0,0,0,0)`, `box-shadow: none` — **it paints nothing at all**; **Lifted (glow)** = a 257×40 plate at `oklch(0.158)` plus two bars (78×17, 153×17) carrying the full 4-layer `--shadow-overlay`. Two of three "illustrations" contain zero elevation information |
| F8 | Five of eight chat-style previews render an identical picture | **STILL STANDING** (verbatim) | `reports/snaps/cb-config-eye-2-chatstyle.png`: Bubble · Echo · Whisper · Ripple · Tide all draw **two grey rounded blobs top-left and no text lines**. Only Flat / Document / Hush draw line art. Under `--theme Light` the blobs go pale-beige on white (`cb-config-eye-2-appearance-light.png`) |
| F9 | The density "segment" wraps into two stacked mismatched buttons | **STILL STANDING** (byte-identical) | Comfortable **114 × 34 @ (1022, 2393)**, Compact **90 × 34 @ (1022, 2433)** — stacked, 24px width apart, inside a `role="group"` whose width is **200px**. 114 + gap + 90 = 207 > 200 |
| F10 | The OFF state of a switch is the loudest object on the page | **STILL STANDING** (byte-identical, now machine-detected) | OFF track `oklch(0.99 0.005 60 / 0.12)`, OFF thumb `oklch(0.955 0.004 75)` **opaque = 17.673:1** vs the pane; ON track `oklch(0.72 0.175 52)` = **7.669:1**. **2.30× louder off than on.** `design-audit` now files this itself: `quiet-state` P2 — *"the OFF state is louder than the ON state"* (OFF 12.58:1 vs ON 7.06:1), in **every** appearance/theme/pane arm |
| F11 | "NOT BUILT YET" is the kicker over shipped features | **STILL STANDING** (2 features, and it is an `h2`) | `snap --aria` on the landing: `region "Not built yet"` → `heading "Not built yet" [level=2]` → `heading "Regex scripts" [level=3]` + `heading "Rosters" [level=3]`. It is a **sibling h2 of the pane's own h2** ("The parts every chat is built from"), so the heading tree itself asserts the features are unbuilt |
| F12 | The Tags landing card wears a banned side-tab accent border | **STILL STANDING** (byte-identical) | `[aria-label="Tags"]::after` = `content:""`, `background: oklch(0.72 0.175 52)`, `width: 3px`, `height: 252px`, `inset: 0px 503.641px 0px 0px`, `position: absolute`, on a `border-radius: 10px` card with a `1px oklch(0.99 0.005 60 / 0.08)` hairline. §6 absolute ban (`side-tab` + `border-accent-on-rounded`). **And the detector cannot see it** — see the Instrument Delta |
| F13 | Backup's eleven checkboxes sit ~1210px from their labels, on the wrong side | **STILL STANDING** | Checkboxes at **x = 1238, 18 × 18, 24px pitch** (y 193/217/241/265/289/313/…), labels at x = 387 → **~851px** apart, checkbox on the RIGHT, no select-all/none. `cb-config-eye-2-backup.png` |
| F14 | The row-actions menu opens on top of three sibling controls | **CHANGED** (3 → 1) | Menu rect `[1072, 1019, 166, 110]`; exactly **one** sibling switch (x 1168, y 1089) now falls inside its footprint. Still occludes a control |
| F15 | The teacher shows raw wire values where the control shows labels | **STILL STANDING** (verbatim) | Control reads **"Medium"** (`span` at x 1029, 15px); About pane reads **"Using the default — md."** (`snap --aria`: `region "About"` → `paragraph: Using the default — md.`) |
| F16 | `@modified` returns N rows for 1 modified setting, marks none | **STILL STANDING** (10 → 5, same mechanism) | Exactly one setting is modified (the chat-display style). `@modified` + Enter returns **5 options**: `Appearance` (group) · `Message style` (section) · `Chat display` (the modified one) · `Color quoted speech` · `Auto-fix unfinished formatting`. **3 of 5 are unmodified; 0 of 5 carry a modified mark** (no "modified" token anywhere in the option markup) |
| F17 | Trailing glyphs top-aligned, disagreeing by 2px | **STILL STANDING** (byte-identical) | Row `[data-setting=avatar-size]` y 1133 h 32 → centre **1149**. `⋯` (Actions for Avatar size) 16×16 @ y 1137 → centre **1145** (−4). `ⓘ` 12×12 @ y 1137 → centre **1143** (−6). Row `align-items: flex-start` |
| F18 | The ⋯ and ⓘ hit areas overlap | **NOT RE-MEASURED** (the 1px grid scan was not repeated) | Geometry consistent with 08-30: `⋯` box x 1222 w 16, `ⓘ` box x 1244 w 12 — **6px of bare gap** between the two glyph boxes, the same adjacency that produced the overlap. `design-audit` did not raise it separately (it is inside the `tap-target` population) |
| F19 | Every setting row is two lonely islands with an ocean between them | **STILL STANDING** (byte-identical, now machine-detected) | Measured over 15 Appearance rows at 869px: gap **min 543 · median 647 · max 703px**, i.e. **63–77% of the row**. `design-audit` now files it itself: **8 × `row-void` P2** ("504px of 829px (61%) between 'Show avatars in chat' and its control", worst "564px of 829px (68%)"). Present in every appearance preset, both themes, and every pane state **except `both-docked`** (see New Findings) |
| F20 | Picker grids are N tab stops instead of one radiogroup | **STILL STANDING** | Twenty consecutive Tab stops measured with `activeElement` at each: the LIST alone consumes stops 4–20 (Appearance + its nine sub-items + five groups + …). Theme/style/elevation cards remain individual `button`s (`aria-pressed`), not a `radiogroup` with roving focus. The teacher's own tab strip DID get roving focus (tabIndex 0 / −1) — the pickers did not |
| F21 | Appearance sub-buttons are ARIA siblings of the top-level groups | **STILL STANDING** (verbatim) | `snap --aria`: inside `group "User"` → `button "Appearance" [expanded]`, then `button "Looks"` … `button "Library"`, then `button "Backup & Restore"` — **one flat level**, no nested `group`, no `aria-owns`, no level |
| F22 | Switch label position inverted between panes | **NOT RE-MEASURED** (tag member editor not driven this pass) | — |
| F23 | Shelf kicker and group row both CAPS, 2.5px apart | **STILL STANDING** | Appearance content type census: `10.5px/600/uppercase` ×9, `13px/500/uppercase` ×16, `13px/500` ×49. `design-audit` `flat-type-hierarchy` P3: "10.5px, 13px, 15px, 16px (ratio 1.5:1)" — identical string to 08-30 |
| F24 | The surface has no display voice; largest text is 16px | **STILL STANDING** | Visible Appearance content maxes at `16px/500` (`h3`). The only larger text in the subtree (`24px/600` "Six rooms, still warm.", `20px/600` "Example — …") sits at rect 0,0 inside the inert sibling-section trees — not on screen. Connections' account balance is still the largest thing a user sees (**"$23.84"**, was $30.32) |
| F25 | The autosave receipt is a 29px grey word off the content grid | **STILL STANDING** (byte-identical) | `p "Saved"` at **x 363, 31 × 13px, font 10.5px, `oklch(0.74 0.008 65)`** — the content column starts at x 387, so it sits **24px outside the grid**, bottom-left |
| F26 | Mobile page margins asymmetric by 3× | **NOT RE-MEASURED at 430px content-column level** | Mobile shots taken (`cb-config-eye-2-config-mobile.png`); the content column reads visually centred at the landing. Marking as unverified rather than claiming a fix |
| F27 | Card grids are ragged in every arm | **STILL STANDING** (byte-identical) | Chat-style cards: row 1 **270.9 × 117** ×3 · row 2 **270.9 × 130** ×3 · row 3 **410.4 × 117** ×2. Container is `display: flex`, `grid-template-columns: none`, `gap: 8px` — a flex wrap with `flex-1`, which is exactly why the last row's two cards stretch 139px wider than their siblings |
| F28 | Three empty-state boxes eat 129px of the LIST and offer no action | **STILL STANDING** (2 boxes now) | `cb-config-eye-2-personas.png`: "No scripts yet." and "No saved rosters yet." render as bordered boxes inside the LIST; `snap --aria` confirms both as `paragraph` with no adjacent door. World Info's box is gone only because it has content. **New:** under `--appearance-preset maximal` these boxes become **2 × `nested-card` P3** — card inside card |
| F29 | Empty-state honesty sweep | **STILL STANDING** | "No scripts yet." / "No saved rosters yet." are still absolute statements over owner-scoped reads. "Nothing here yet — import a theme file, or start one in the builder below." still names two doors; the import door is the **unlabelled ⬆ icon above the sentence** (visible at x 1199, y 368 in `cb-config-eye-2-appearance-top.png` while the copy sits at y 404 and says "below") |
| F30 | `label-content-name-mismatch` on 8 nodes | **STILL STANDING** (8 → 8 desktop / 11 mobile) | Lighthouse a11y **96** desktop and mobile, same two failures. Nodes: `config-band` "TAGS 28" and "WORLD INFO 1", the theme card "Hearth current", and every `aria-pressed` chat-style card. Still a QUESTION, not a verdict — `theme-swatch.tsx` deliberately pins the name to the theme name |
| F31 | `undersized-ui-text` ×9 — 10.5px interactive text | **STILL STANDING** | `undersized-ui-text` P2 ×2 populations: "8 affected of 16 judged" on `[data-slot=chat-style-cards] > button`, plus 1 on the Background control. Both pointer classes, every appearance preset, both themes |
| F32 | Two LoAFs on config interactions, style/layout in-frame | **STILL STANDING** (magnitudes now pinned) | Unthrottled console: group-expand `long frame 165ms · blocking 114ms` + `forced synchronous style/layout 10ms`; fold-open `long frame 117ms · blocking 66ms` + `reflow 9ms`. Under motion-audit's 4× throttle the same click is a **51–52ms LoAF with 6ms forced style/layout inside `dispatchDiscreteEvent`**, reproduced in 4 of 5 valid arms. `perf-meter`: first Appearance click = **180ms long task / 184ms click / 124ms blocking / 150ms worst rAF gap**; second and third visits 24–32ms with 0 rAF gap. Attributed to the **#908** class per the brief |
| F33 | "Go to Jobs ↗" uses an external-link icon for internal nav | **STILL STANDING** | The rail/list row for Connections still carries the ↗ external-link glyph (`cb-config-eye-2-personas.png`, `⧉ CONNECTIONS`) |
| F34 | "Unfavorite Traveler" painted with the destructive token | **STILL STANDING** | `cb-config-eye-2-personas.png` — the heart affordance beside "Traveler" renders in the destructive hue |
| F35 | "Delete" is the quietest control in the Jobs row | **NOT RE-MEASURED** (Jobs schedule rows not driven this pass) | — |
| F36 | Import offers no warning about what it does to existing data | **STILL STANDING** (copy improved, substance unchanged) | Import copy now reads *"Restore a backup, or bring your SillyTavern library over. Drop a full .zip export … or a single character card — or pick an unzipped backup / SillyTavern profile folder."* — it describes what it ACCEPTS and still says **nothing about merge vs overwrite**, and there is still no confirm step |

**Score: 2 fixed · 4 changed · 26 still standing · 4 not re-measured.**

### The eight excellence recommendations (E1–E8)

| # | Verdict |
| - | - |
| E1 (rebuild the row as a measure-capped two-column form) | **NOT DONE** — `row-void` 8× at 63–77% |
| E2 (pick ONE selection idiom; retire the filled teacher tab) | **PARTLY DONE** — the teacher tab is fixed (see below); the other seven idioms are intact (list left-rail+tint, expanded-group fill, picker ring, density ring-in-box, tab underline, background check badge, search-suggestion fill) |
| E3 (invert the switch) | **NOT DONE** — 17.673:1 off vs 7.669:1 on, thumb still 32 of a 48 track |
| E4 (give the surface a display voice) | **NOT DONE** — `flat-type-hierarchy` prints the identical string |
| E5 (section-first teacher with drill-on-focus; ship the gloss back) | **NOT DONE** — the ⓘ is still per-leaf; no inline gloss returned |
| E6 (one picker-cell primitive) | **NOT DONE** — five picker families still disagree (theme 828.8×66 · chat-style 270.9×117/130 and 410.4×117 · elevation 271×76 · density 114/90×34 · background 103.6×103.6) |
| E7 (the panes are 60–90% empty) | **NOT DONE** — Personas content ends at y≈340 of a 752px pane; Workloads content bottom 815 of a 752 pane; Tags/World Info panes render at exactly pane height with 9 prose paragraphs |
| E8 (Personas leads with a notification preference) | **NOT DONE** — order is still Notifications → YOUR PERSONAS → This chat, and "YOUR PERSONAS" is still a caps kicker between two sentence-case `h3`s |

### The 56 nits — spot verdicts

Re-measured and **STILL STANDING**: 1 (⋯ 16×16 vs ⓘ 12×12, 6px apart) · 6 (menu items 152×32) ·
7 (no separator between Reset and the two Copy items — three flat `menuitem`s) · 8 (disabled "Reset to
default" at `opacity: 0.5`) · 12 ("Lifted (glow)" is the one enum member with a parenthetical) ·
13 ("CUSTOMIZE THIS LOOK advanced · your changes, on top of Hearth ⌄") · 14 ("ADD BACKGROUND ⌄" and
"CUSTOMIZE THIS LOOK ⌄" are identical clothes 170px apart — both visible in
`cb-config-eye-2-background.png`) · 15 (the add-background door is below the grid, not a `+` tile in it) ·
16/17 (three label voices in Looks; "Your themes" and "Theme builder" adjacent with different anatomies) ·
18 (unselected theme card border `oklch(0.99 0.005 60 / 0.08)`) · 19 (under Light the card body keeps the
app's colour while the swatch shows the theme's — the Light card's first two cells are invisible against
it) · 21 (the trail "SETTINGS · ABOUT" restates the tab immediately below) · 25 (number fields right-align
to 1256, **40px past** the converted rows' 1216) · 26/27/28/29/30 (Connections: control column at a
different x, the only italic on the surface, "Image embedding *optional*", four button weights, "Protocol"
as an unlabelled child) · 33/34/35 (Tags list unit-word stagger, permanent "Manual order lets you drag
rows.", uniform grey dots) · 41 (`###` placeholder, the only textarea) · 44 ("Messages (reading surface —
use sparingly)") · 45 (Surface texture still a Select showing "None") · 47 (row heights 16 / 22 / 24 / 32 /
34 / 44 / 54 / 76 / 117 / 130) · 51 ("Add a search filter" is a solid orange square and `design-audit --mobile` flags it at **short side 40px**) · 55 ("Nothing here is required, and nothing here is spent
once" — verbatim, still aphoristic) · 56 ("The parts every chat is built from").

**CHANGED:** 23 — the teacher's two tabs were 92px of an 800px pane; they are now **182px each of a
367px pane = 99% of its width**. Different problem, same class.

**Not re-measured this pass** (say so rather than guess): 2–5 (persona popover internals), 9–11
(shelf/card gap asymmetries), 20/22 (teacher title size, AFFECTS bullet), 24 (context-bracket tab-size
comparison), 31/32 (Jobs button weights and badge systems), 36–40 (tag editor and world-book internals),
42/43/46 (disabled ⓘ opacity, Effects fieldset, fold ink inheritance), 48–50 (search popover border,
repeated group name, `@modified` chip), 52–54 (mobile Saved position, truncation).

### Retractions I inherited and re-tested

- **R5 ("the background grid's second row is shorter") — the 08-30 retraction was CORRECT and I
  re-confirm it.** 15 cells, all exactly **103.6 × 103.6**, `object-fit: cover`, two clean rows (8 + 7).
  My own first read of `cb-config-eye-2-background.png` said "ragged"; the measurement killed it. The
  apparent raggedness is image content, nothing else.
- R1/R2/R3/R4/R6/R7/R8 were not re-probed; nothing in this pass contradicts them.

---

## PART 1 — DEFECTS (a measured receipt per finding)

Only findings **NEW to this drive** are numbered here (G-series). Everything from Part 0 marked STILL
STANDING is a live defect at its original severity and is not re-listed.

### P1

**G1 · Clicking a settings group makes the whole pane jump — the Looks section mounts ~230ms late and
pushes 372px of content down.**
Reproduced four times, including with a **real Playwright click** through `pnpm record`:
`[cls] shift 0.1656 input-adjacent · <section> moved 0px,372px · <section> moved -387px,-676px · [data-slot=setting-row] moved -387px,-564px · [data-slot=setting-row] moved -387px,-608px · [data-slot=setting-modified-rail] moved 0px,372px · CLS 0.1660 (virtualized 0.0000) OVER BUDGET ·
observed 0.1660`. The 6-tile frame strip
(`reports/recordings/cb-config-eye-2-fold-click2.png`) shows it directly: tiles 1–3 render the
Appearance pane starting at **"Message style"** with a "Loading your themes…" line where Looks should
be; tiles 4–6 have the Looks section (header + three 66px theme cards + the builder row ≈ 372px) in
place and everything below shifted down. `__orb.renders()` corroborates the churn: `region:content`
commits **11 times** (1 mount + 10 updates, totalMs 155, **maxMs 104**) to settle one static pane.
**Why it hurts:** the user clicks a group and the thing they were about to read walks out from under
the pointer a third of a second later. It is the single crunchiest moment on the surface.
**Fix:** `reserve: the Looks theme-list region — receipt: a QueryBoundary reserved box the height of
three cards + the builder row, and a re-run of the record strip showing tiles 1–6 with no vertical
delta.` This is precisely the class #885 shipped reserved boxes for on 21 sites; this one was missed.
**Caveat, stated:** Chrome excludes the shift from CLS because it is input-adjacent, so no CLS *gate*
will ever catch it. Judge it on the observed number, which is what #1071 exists to make possible.

**G2 · The CONTEXT pane on Config is navigation, and it duplicates the LIST verbatim.**
With both panes docked (`snap --panels both-docked`, `cb-config-eye-2-both-docked.png`), the context
pane renders `RELATED` → **Looks · Message style · Avatars · Sizing & motion · Message details &
actions · Background · Reading typography · Effects · Library** — the same nine jump targets the LIST
shows 900px to the left, at **16px** instead of the list's 13px, with **no selection state** (the list
marks "Looks" as current; the context copy marks nothing).
`design-audit --panels both-docked` files it as **8 × `duplicate-action-door` P3** — one per section
(`2x button "looks"`, `2x button "avatars"`, …) — and that rule reports **zero** in every other pane
arm, which is why 08-30 never saw it.
**Why it hurts:** two homes for one concept, both on screen at once (§13 IA single-homing), and it
breaks the shell physics outright — `UI-Architecture-and-Layout.md` §4.2: *"CONTEXT … Never navigation
— actions ON the artifact only."*
**Fix:** `distill: the context pane's RELATED list — receipt: design-audit --panels both-docked reports
0 duplicate-action-door, and the context pane carries only About/Applies content for the selected
setting.` If a cross-section jump is wanted, it belongs in the LIST, which already has it.

**G3 · Two `@orb/ui` primitives and one feature component still animate `transition-all` — the app's
own flagger calls it a §3.7 violation.**
Console, on the fold interaction: `[anim] animating non-compositor scrollbarColor (guide §3.7 —
transform/opacity/filter, plus paint-only colour on an interactive state) · [data-slot=density-preview]
· OVER BUDGET` and the same line for `[data-slot=collapsible-panel]`. Computed:
`[data-slot=collapsible-panel] transition-property: all, duration 0.36s`;
`[data-slot=density-preview] transition-property: all, duration 0.13s`.
Sites: `packages/ui/src/primitives/collapsible/variants.ts:17` · `packages/ui/src/primitives/accordion/variants.ts:17` ·
`packages/client/src/features/app-shell/components/appearance-sizing-section.tsx:84` ·
`packages/ui/src/primitives/progress/variants.ts:20`.
**This is a sweep that stopped four files short of done** — the same codebase already carries the
corrected idiom with a comment naming the bug: `packages/ui/src/primitives/toast/variants.ts:30`
("The transition NAMES ITS THREE PROPERTIES — `transition-all` was a bug, not a shorthand"),
`packages/ui/src/lib/overlay-motion.ts:10` (same sentence), and
`packages/ui/src/primitives/tabs/variants.ts:37` records that #1069 removed it from the tabs indicator.
**Fix:** `animate: collapsible-panel, accordion-panel, density-preview, progress-indicator — receipt:
transition-property names its properties at each site, and the [anim] scrollbarColor line disappears
from a fold-open drive.`

### P2

**G4 · The `Layered` elevation illustration paints nothing at all.**
Measured 1200ms after the fold settles, so this is not an animation artifact: the `Layered` card's
every descendant computes `background-color: rgba(0, 0, 0, 0)` and `box-shadow: none`. `Flat` paints
one 257×40 plate at `oklch(0.132 0.006 60)`; `Lifted (glow)` paints a 257×40 plate at `oklch(0.158)`
plus two shadowed bars. So the middle option of a three-option picker is an empty rectangle, and the
user picking "Layered" is choosing from a picture of nothing.
This sharpens F7 rather than replacing it (§7.8 explicitly allows the diagram to exaggerate).
**Fix:** `bolder: the three elevation illustrations — receipt: each of the three renders a measurably
different plate/shadow stack, with the per-step contrast ≥ 1.5:1 rather than the current 1.03–1.12:1.`

**G5 · Three accessible names are welded together with no separator, and one of them is a primary door.**

- The fold trigger's accessible name is **"Customize this lookadvanced · your changes, on top of Hearth"**
  (`snap --map` on the content pane; it resolves only as a DOM-path fallback, i.e. it has no stable
  semantic identity either).
- The search token suggestion reads **"@modifiedonly settings that differ from their default"**.
- Every `@modified` result reads label+group welded: **"Message styleAppearance"**,
  **"Color quoted speechAppearance"**, **"Auto-fix unfinished formattingAppearance"**.
  `snap --map` no longer welds hidden text (#877), so these are the browser's real computed names, not an
  instrument artifact.
  **Why it hurts:** a screen-reader user hears "Customize this lookadvanced"; voice control cannot target
  any of the three.
  **Fix:** `clarify: the fold trigger, the search-token suggestion, the search result row — receipt: an
  explicit aria-label on each, or a visually-hidden separator, verified with snap --aria.`

**G6 · The `both-docked` arm is the only pane state where the row void closes — and it is not the
default.**
`row-void` fires **8×** at 63–77% in: the default arm (`panel-context=collapsed`), `context-only`,
`focus`, all four appearance presets, and the Light theme. It fires **0×** in `both-docked`, where the
content pane narrows to ~520px. So the 654px void is not a taste problem, it is a *width* problem, and
the state a user lands in is the worst one.
**Fix:** this is E1's receipt, not a separate fix — `layout: the setting row — receipt: max-w on the
row block so row-void reports 0 in ALL FOUR pane states, not just both-docked.`

**G7 · `<img>` elements in the background grid declare no intrinsic box.**
Console: `[space] <img> has no reserved box (no width+height, aspect-ratio or explicit height) — its
load will shift the page · [data-slot=media-grid-image]`.
**Honest disposition:** the *cell* is fixed at 103.6 × 103.6, so no shift can actually occur here — the
flagger is naming a real authoring gap with no visible consequence on this surface. It is still worth
closing because the same component is used where the cell is not fixed.
**Fix:** `harden: media-grid-image — receipt: width/height or aspect-ratio on the img, and the [space]
line gone from a Background drive.`

**G8 · Under `--appearance-preset reading`, five gloss texts drop below the ratified leading floor.**
`tight-leading` P3 ×5 at `line-height: 1.22` on the Looks section gloss and four chat-style card
glosses — plus `off-grid-text` doubling (3 → 6) and an `off-grid-transform` P3 on a setting row.
These appear **only** in the `reading` arm. The 08-30 drive ran `defaults` only and named this its "one
genuine coverage gap"; the gap was real and it was hiding findings.

**G9 · Under `--appearance-preset maximal`, the LIST's empty-state boxes become nested cards.**
`nested-card` P3 ×2 on `[data-slot=config-list]` — "a card-like element (shadow/border +
radius/background) is nested inside another". Only in `maximal`. §3 says nested cards are *always*
wrong. This is the elevation=glow arm turning F28's two bordered empty-state boxes into cards inside
the list card.

### P3

**G10 · The Jobs group's id is `workloads`.**
`snap --goto settings:jobs` refuses (correctly, loudly) with the real list: *"expected one of: personas,
appearance, chat-behavior, workloads, backup, connections, automation, admin, tags, regex, worldInfo,
rosterPreset, plugins"*. The user-facing word is "Jobs"; the id is the insider word. Two other ids
(`worldInfo`, `rosterPreset`) are camelCase while the rest are kebab. A cosmetic-but-real vocabulary
drift against `docs/design/vocabulary-map.md`.

**G11 · The Backup pane's "Include" group label is sentence-case where every other group label on the
surface is a caps kicker.** `cb-config-eye-2-backup.png` — "Include" at 13px sentence case heading
eleven checkbox rows, while "YOUR THEMES" / "COLLECTIONS" / "SETTINGS · ABOUT" are caps. Sixth voice.

**G12 · Eleven checked orange checkboxes are the loudest ink in the Backup pane, and they mark the
DEFAULT state.** Same polarity error as F10/E3, in a different control: the all-selected default paints
a column of eleven saturated squares at x 1238.

---

## PART 2 — INSTRUMENT DELTA (what the 08-30 fleet mismeasured or could not see)

This is the dividend of the correctness week. Each row names the change and what it bought or cost.

| # | The old fleet | The current fleet | What it changed on THIS surface |
| - | - | - | - |
| 1 | `design-audit` had no `quiet-state` rule; F10 needed hand-rolled oklch→sRGB math | **`quiet-state` P2** fires deterministically | F10 is now machine-detected in **every** arm: *"OFF 12.58:1 vs ON 7.06:1"*. It can no longer be argued away as taste |
| 2 | `row-void` did not exist; F19's 654px was a hand census over 20 rows | **`row-void` P2**, 8 findings with per-row percentages | Turns E1 from a recommendation into a measured population, **and** reveals it is pane-state-dependent (0 in `both-docked`) — a fact no hand census would have found (G6) |
| 3 | `cohort-anatomy` did not exist; F3/F6 were a hand-built table | **`cohort-anatomy` P2** | Fires in every arm on `[data-slot=config-list]` with the exact split ("2 of 4 at 75px, 2 at 32px") |
| 4 | `duplicate-action-door` did not exist, and the pane-state axis was not driven | **`duplicate-action-door` P3 ×8 in `both-docked` only** | **G2** — the single largest IA finding of this drive, invisible to the 08-30 method by construction |
| 5 | Population accounting did not exist; a `findings=0` read as clean | **`population-verdict=` + per-rule `candidates/judged/withheld/excluded`** | Every run this pass printed `population-verdict=complete`. Four **SURFACE-AXIS** rows print `NO-VERDICT` on every run (`panel-list`, `panel-context`, `focus`, `drive`) — that is the instrument saying "I measured one configuration of four", which is why the pane-state arms were run |
| 6 | Censuses capped silently (#1038) | `capPush` tallies what it drops; `tap-target` prints `withheld-cap=4` beside `affected=9` | The 9 config-band rows are a complete population, not a truncated one |
| 7 | `[anim]` convicted the Base UI collapsible height animation (#1069) | Console now prints *"Base UI lifecycle height — the ratified panel-height allowance (guide §4.2 item 3), **not a §3.7 violation**"* | The fold's height animation is correctly NOT a finding — and the *same* line exposes the `scrollbarColor` violation next to it, which is real (**G3**). #1069 landed and works |
| 8 | motion-audit's interaction CLS gated on the input-EXCLUDED number (#1071) — a documented false PASS | RESULT prints `cls-budget-basis=observed-non-virtualized` and the report line reads *"judging 0.0102 on the observed-non-virtualized total"* | The fold interaction is honestly clean (0.0102–0.0471 across six matrix cells). It also means the pane-mount shift (**G1**) is now *statable* — the old fleet would have reported "CLS clean" and stopped, which is exactly what 08-30's F32 said |
| 9 | `hover-contrast` did not exist | Ran on every desktop arm: `hover-pass=ok hover-candidates=107 hover-rules=17 hover-judged=55 hover-subjects-forced=52`, 0 findings | A genuine clean, with a stated denominator. **Caveat (#1073, live known-defect):** the landing run publishes `excluded(noHoverChange=1)`, which that row says can be a FALSE exclusion for group-variant hover paint. One subject on this surface is therefore unproven, not clean |
| 10 | The appearance-preset axis was `defaults` only — 08-30 called it "the one genuine coverage gap" | Four presets driven | The gap was hiding **G8** (5 × `tight-leading`, `off-grid-transform`, doubled `off-grid-text` under `reading`) and **G9** (2 × `nested-card` under `maximal`). The gap was real |
| 11 | Theme arms were hand-driven | `--theme Light` shims non-mutatingly; RESULT prints `theme-light=1293 theme-dark=8` | Polarity confirmed by the instrument, not by my eye. Findings are **theme-invariant**: identical 17 findings under Hearth and Light |
| 12 | — | `snap --matrix` now plans pairwise over the discovered appearance contract | **NO VERDICT on this surface.** `MATRIX PLAN cells=16 pairs-uncovered=0`, `MATRIX INPUT declared=41 executable=36 dependencies=5 reached-rows=17 themes=5`; ran 5 cells (v02 and v04 with `appearance-fails=1`, traces retained) then **INSTRUMENT ERROR** at v06: *"snap matrix discovery/planning failed: locator.evaluate: Timeout 30000ms exceeded — waiting for `[data-slot="message-row"] … [data-slot="message-bubble"]`"*. The matrix's appearance-row reachability probe requires a **chat message row**, which does not exist on the isolated stage's fresh db, so the matrix cannot complete for any non-chat surface on a clean stage. **Reported as NO VERDICT, not as clean** |
| 13 | — | `motion-audit --matrix` earns its STATIC-EXPECTED | `cells=6 pairs-uncovered=0 required-twins=3 static-expected=1 static-candidate=v05 static-control=v04` — the reduced-motion mobile zero-frame cell is sanctioned only beside its live full-motion mobile control, exactly as the contract requires. One cell (v06) is `INSTRUMENT-ERROR` (frame population absent), correctly refusing a verdict rather than reporting 0% dropped |

### The one place the current fleet is still blind, and it is on this surface

**`side-tab` / `border-accent-on-rounded` cannot see the way this codebase paints accent edges.**

- The defect: `[aria-label="Tags"]::after` — a 3px × 252px accent bar pinned to the left edge of a
  10px-radius, 1px-hairline card (F12, measured above). Both §6 bans, textbook shape.
- The detector on that exact surface: `POPULATION side-tab candidates=0 judged=0 affected=0 withheld()
  excluded()` and the same for `border-accent-on-rounded`. Reads as clean.
- The mechanism, read at source: `tooling/src/ui-audit/ops/walker/census-decor.ts:220-259` collects
  accent-border candidates from **the element's own `borderTopWidth/RightWidth/BottomWidth/LeftWidth`**
  and skips anything whose `maxW < 2`. It never inspects `::before`/`::after` — unlike the radial
  census 20 lines below it, which sweeps `["", "::before", "::after"]`.
- **Positive control, same instrument, same page family:** on the *Appearance* pane the census reports
  `side-tab candidates=1 judged=1 affected=0`, so the collector is alive; it is mechanism-mismatched,
  not dead. On the landing there is genuinely no element with a ≥2px CSS border — because this codebase
  expresses accent edges as pseudo bars and rings.
- This is a `RULE-AUTHORING.md` mechanism-match failure, and it publishes `candidates=0 … excluded()`,
  which is indistinguishable from "clean" to a reader. Per the standing FIX-TOOLS-AS-WE-FIND-THEM-LYING
  ruling this deserves its own P2 instrument row.

---

## PART 3 — UX / IA: the errands, the taste verdict, and what feels crunchy

### The blunt taste verdict, per surface driven

**Looks (the first thing you see).** It looks like a colour-picker demo, not a theme chooser. Three
828×66 horizontal bars stacked; two thirds of each bar is one indistinguishable dark (1.09:1, 1.08:1)
and the last third is a screaming saturated block — orange, then **blue**, then dark orange. The two
loudest objects on the entry screen of Settings are a giant orange rectangle and a giant blue
rectangle, and neither tells you anything about the theme except its accent. Under `--theme Light` it
is worse in a way that reads as a rendering bug: Hearth and Mocha become two black slabs on a white
page, and the *Light* card's own swatch is invisible against the card body it sits on. You change
themes by reading names.

**Message style.** The one place the surface has real craft — eight cards, clean ring on the selected
one, glosses that actually explain. And then five of the eight draw the identical picture. When the
picture is the whole point of a *visual style* picker, five identical pictures is worse than no
pictures: it asserts the options are the same. The grid is also visibly a flex wrap pretending to be a
grid — 3 + 3 + 2 with the last two 139px wider than everything above them.

**The setting rows.** Evacuated. A 75px label on the left, a 48px switch 650px away on the right, and
nothing at all in between, forty times. It does not read as clean; it reads as a page whose middle
column failed to load. And because the control column moves between panes (Connections at one x,
Appearance at another, Admin at a third, Chat behavior at four different ones *inside one pane*), you
re-learn the traverse every time you switch groups.

**The ink is inverted.** The brightest ink on the Message-details pane is six near-white pills that
mean "off". The brightest ink on the Backup pane is eleven orange squares that mean "default". The
brightest ink on Personas is a giant orange switch for a notification preference. The surface's visual
hierarchy consistently spends its loudest register on states that carry no information.

**Config landing.** Actually good, and the best-written copy in the app — except that it announces
"Not built yet" as an `h2` over two shipped features, and repeats the tag list that the LIST is
rendering two inches to the left.

**Cold first-timer test.** From `cb-config-eye-2-appearance-top.png` alone: you can tell this is
settings, you can tell "Looks" is selected, and you would guess the three bars are themes. You would
*not* guess that "Sizing & motion" and "Effects" — both in the left map — live behind a collapsed
disclosure 2200px down, or that the ⓘ column is where the explanations went.

### The errands

**Errand A — change a setting, regret it, restore it.** Still fails at discovery, with a smaller
sample. One setting is modified; nothing at the group or shelf level says so; `@modified` returns five
rows of which three are not modified and **none carries a mark**; the only signal is a 2px orange rail
at x 379 next to the row itself. Once you find the row, Reset is correct and honest.

**Errand B — change theme and change it back.** Instant, and "current" moves correctly. Crunchy: the
only confirmation is a 10.5px grey "Saved" 24px outside the content grid, ~900px from where you
clicked; and under Light you are picking between two black slabs and one invisible one.

**Errand C — background on/off.** The grid is genuinely good work — 15 cells at exactly 103.6 × 103.6,
`object-fit: cover`, no distortion, clean 8+7. Crunchy: the "None" tile is a warm orange gradient plate
with a check badge (it reads as a *colour*, not an absence); no tile carries a visible name; and
"ADD BACKGROUND ⌄" is dressed identically to "CUSTOMIZE THIS LOOK ⌄" 170px below it — an *add* door and
a *disclose-advanced* door in the same clothes, in one screenshot.

**Errand D — new theme from the current one.** The door's label tracks the current theme
("New theme from Hearth…" / "New theme from Light…"), which is a nice touch. The empty state still says
"import a theme file, or start one in the builder **below**" while the import door is an **unlabelled
⬆ icon 36px above that sentence**.

**Errand E — find a half-remembered setting.** Search works; the result rows are
"Message styleAppearance" with no separator and no section, so they cannot tell you the target is
inside a collapsed fold.

**Errand F — Personas.** Leads with a notification toggle whose ON switch is the loudest object in the
pane, then "YOUR PERSONAS" (caps) between two sentence-case `h3`s, then a pane that is empty from
y≈340 to y≈752.

**Errand G — Settings on a phone.** Drill-down works. The teaching block is **188px** of prose and the
first settings row starts at **y 361 of a 740px viewport** — 31% of the first screen before the first
row (an improvement on 08-30's ~38%). The group rows are still 16px at coarse (P1). "Add a search
filter" is still a 40×48 solid orange square, the loudest thing on the screen, for a secondary filter.

### Information architecture

- **Two homes for one navigation** — G2, the context RELATED list vs the LIST.
- **Two homes for one fact** — the Tags landing card renders "Most used: comedy 5, rpg-ready 4 …"
  while the expanded LIST renders the same rows two inches left. Unchanged.
- **Same click, two meanings** — clicking a settings group swaps CONTENT; clicking a *collection* only
  expands the LIST (`--goto settings:worldInfo` expands the group and leaves CONTENT on the landing;
  `nav=OK`, faithfully). One list, two behaviours. Unchanged.
- **Map/territory name drift, now three-way** — LIST "Message details" · CONTEXT "Message details &
  actions" · CONTENT `h3` "Message details & actions". LIST "Jobs" · id `workloads`.
- **Wrong depth** — Density and Surface elevation are still five moves deep behind a fold the map does
  not mark; "Library / Rows per page" is still a pagination setting living in Appearance and is still
  the one row that kept its inline description.

### Per-pane anatomy census (desktop 1280, `[aria-label="Settings content"]`)

| Pane | SettingRows | ⓘ | ⋯ | inline prose ¶ | control right-edges (count) |
| - | - | - | - | - | - |
| Appearance | 20 | 20 | 20 | 5 | **1216** (20) · 658 · 937 · 798 · 1227 |
| Chat behavior | 15 | 15 | 15 | **96** | **1216** (11) · 1227 (5) · 1187 (2) · 1256 (2) |
| Admin | 0 | **41** | 0 | **60** | 1227 (34) · 1256 (19) · 441 (7) |
| Backup | 0 | 0 | 0 | 9 | 525 · 1256 |
| Personas | 0 | 0 | 1 | 5 | 1256 (3) · 427 · 516 · 1084 · 1124 · 1144 |
| Automation | 0 | 0 | 0 | 7 | 1227 · 1256 |
| Connections | 0 | 0 | 0 | 7 | **773** (7) · 1256 (2) · 482 · 1097 · 1210 |
| Jobs (`workloads`) | 0 | 0 | 0 | 12 | 1227 (4) · 1256 (4) · 1127 (2) · 1185 (2) |
| Plugins | 0 | 0 | 0 | **126** | 529 (9) · 1128 (9) · 1203 (9) · 1243 (9) |
| Tags / World Info | 0 | 0 | 0 | 9 | 1020 · 1021 · 506 · 542 |

**Eleven distinct control right-edges across the surface; four inside Chat behavior alone.**

### Console triage

| Warning | Disposition |
| - | - |
| `[frame] long frame 138–142ms · blocking 88–92ms @ main.tsx` (every run) | **INVESTIGATE — boot, not config.** Present on every route; the #908 class per the brief |
| `[frame] long frame 190–227ms · blocking 131–138ms @ view-transition.ts 179–186ms` + `[reflow] forced synchronous style/layout 12–13ms` (every `--goto settings:*`) | **INVESTIGATE — config-specific.** The section view-transition forces a synchronous reflow in-frame. #908 class, but this one is reproducible on demand |
| `[frame] long frame 117–165ms · blocking 66–114ms · dispatchDiscreteEvent @ react-dom_client.js` + `[reflow] 9–10ms` (group click, fold click) | **INVESTIGATE — config-specific.** Matches motion-audit's 51–52ms LoAF under 4× throttle and perf-meter's 180ms first-click long task. F32, live |
| `[drop] 52–101ms rendered frame mid-animation · svg[aria-label=Orbweaver] · [data-slot=weave-veil]` | **Known, not config** — the boot splash animation. Present on every route |
| `[drop] 165ms rendered frame mid-animation · [data-slot=config-band] · OVER BUDGET` | **CONFIG-SPECIFIC, live.** The group-row expand drops frames. Part of G1/F32 |
| `[perf] slow commit region:content 103–119ms (update)` | **CONFIG-SPECIFIC, live.** The Appearance pane's settle commit; corroborated by `__orb.renders()` maxMs 104 over 11 commits. Part of G1 |
| `[cls] shift 0.1656 … CLS 0.1660–0.1885 (virtualized 0.0000) OVER BUDGET` | **G1.** Reproduced 4×, including under a real Playwright click |
| `[anim] Base UI lifecycle height — the ratified panel-height allowance … not a §3.7 violation` | **RATIFIED, not a finding.** #1069 landed and is working |
| `[anim] animating non-compositor scrollbarColor · density-preview / collapsible-panel · OVER BUDGET` | **G3.** Real; four source sites named |
| `[space] <img> has no reserved box · [data-slot=media-grid-image]` | **G7.** Real authoring gap; no visible consequence here because the cell is fixed 103.6² — stated rather than hand-waved |

No warning is disposed of as "it's dev mode".

---

## RETRACTIONS (my own, this pass)

- **R-a — "opening the fold produces a 0.1885 non-virtualized CLS."** Taken from a run where I opened
  the fold with a scripted `element.click()` inside `--eval`. A synthetic click is not trusted input,
  so Chrome did not mark the shift `hadRecentInput` and `__orb.motion()` scored it. **Re-run with a real
  Playwright `--click`: `shifts: []`, `observedCls 0`.** The magnitude was real; the attribution to the
  fold was wrong. The shift that survives is G1, on the section MOUNT, and it reproduces under real
  clicks.
- **R-b — "the OS-reduced-motion arm jolts with 0.1656 CLS."** Read off matrix cell v06, whose own
  RESULT line says `verdict=INSTRUMENT-ERROR` ("the frame population is ABSENT — this run is not a
  verdict"). A clean re-measure of the same arm at `--window 6000` gives
  **`cls-observed-non-virtualized=0.0171`**, well under budget. Retracted.
- **R-c — "the background grid is ragged / the tiles have different aspect ratios."** My own read of
  `cb-config-eye-2-background.png`. **Wrong.** 15 cells, all exactly 103.6 × 103.6, `object-fit: cover`.
  The 08-30 retraction R5 was right and I re-confirm it. Geometry claims from a PNG still need the
  measurement.
- **R-d — the first elevation measurement showed three illustration children at `height: 0`.** That was
  taken mid-`collapsible` height animation. The settled measurement (G4) is the one that stands, and it
  is a *different* and worse fact: `Layered` paints nothing at all.

---

## WHAT IS GENUINELY WORKING (do not touch)

1. **Focus.** Twenty consecutive Tab stops measured with `activeElement` read at each: `fv=true` and a
   1px outline at **every single one**, including the nine sub-items inside an expanded group. Nothing
   regressed.
2. **The hover reveal still costs zero horizontal layout.** Row `x` and `width` are byte-identical
   (387 / 869) before and during hover, and the ⋯ buttons do not appear in `snap --map` at rest — i.e.
   they are still opacity-hidden in reserved geometry, not `display`-swapped.
3. **The teacher's tab strip was rebuilt correctly.** It is now a `toolbar` with `aria-current="true"`
   on the selected item and roving focus (`tabIndex` 0 / −1), and the selection paint is a 15%-alpha
   tint (`oklab(0.72 0.107741 0.137902 / 0.15)`), not the solid accent block 08-30 called "the heaviest
   accent block on the surface for the lowest-stakes state". This is exactly the #112 idiom.
4. **The background media grid.** 15 cells at exactly 103.6 × 103.6, `object-fit: cover`, zero
   distortion, clean wrap. No reading-surface violation anywhere: `text-over-art candidates=72
   judged=0 excluded(flatBackdrop=72)`, `distorted-image excluded(objectFitCropsOrLetterboxes=1)`.
5. **Contrast holds everywhere it was measured**, in both themes: config-band 15.76:1 (Hearth) /
   12.23:1 (Light) · chat-style card 17.14:1 / 15.56:1 · theme card label 15.73:1 / 16.26:1. All PASS.
   The one refusal (`[data-slot=setting-row] label: OFF-SCREEN — NO VERDICT`) is reported as a refusal,
   not a pass.
6. **Loud, honest refusals from the app's own nav bridge.** `--goto settings:jobs` refuses with the
   real id list rather than silently landing somewhere. That is the behaviour that makes a driven
   review trustworthy.

---

## THE SINGLE BIGGEST OPPORTUNITY

**Unchanged from 08-30, and now with a measured population behind it: cap the row's measure and put the
one-line gloss back in the space you already have.** `row-void` gives you the exact list — 8 rows at
63–77% — and G6 gives you the proof it is a width problem, not a taste problem: the same rows report
**zero** void the moment the context pane narrows the content column. One change resolves E1, F19, the
830px-away ⓘ, the eleven control right-edges, and E5's arrival cost.

**The new second priority is G1**, because it is the only defect on this surface that a user *feels*
rather than merely reads: a reserved box for the theme list turns "click a group and watch the page
walk" into "click a group and read".

---

## INSTRUMENT COVERAGE

| Instrument | Status |
| - | - |
| `snap --map` | **RAN** — config landing (54 elements, 2 DOM fallbacks), Appearance content pane. `map-dom-fallbacks=2` on the landing, and the fold trigger resolves only as a DOM path (G5) |
| `snap --aria` | **RAN** — config list (35 lines), full body on the teacher drive (201 lines), World Info landing (85 lines) |
| `snap --contrast` | **RAN ×2 arms** — Hearth + `--theme Light`, 4 selectors each; 6 PASS, 2 OFF-SCREEN refusals reported as NO VERDICT. Supplemented by canvas-decoded oklch→sRGB math for the swatch cells and switch states |
| `snap --eval` | **RAN** — ~30 probes: band geometry + pitch, theme card/strip/cell geometry and colours, switch states, row-void census, glyph alignment, type census, elevation illustrations (settled), density segment, menu footprint, checkbox geometry, media-grid cells, `__orb.motion()`, `__orb.renders()`, keyboard walk |
| `snap --expect-*` | **SKIPPED** — the layout questions this pass were geometric measurements, not assertions; `--expect-no-overflow` was covered by the 08-30 pass (R8) and nothing in the diff touches that surface |
| `snap --json` | **SKIPPED** — console never approached the 200-message cap (max 99 in one matrix cell) |
| `snap --matrix` | **RAN — NO VERDICT.** `cells=16 pairs-uncovered=0`, `declared=41 executable=36 dependencies=5 themes=5`; 5 cells completed (2 with `appearance-fails=1`, traces retained under `reports/traces/`), then INSTRUMENT ERROR at v06 (the appearance-row probe waits on a chat `message-row` that does not exist on the fresh isolated-stage db). Reported as NO VERDICT, not as clean |
| `snap --isolated` | **RAN** — detached stage at `4f3840283f9f` on `:5273/:8888` for the matrix |
| `design-audit` desktop | **RAN ×3 surfaces** — config landing (`findings=7 p0=0 p1=1 p2=4 p3=2`, census 416, `population-verdict=complete`), Appearance (`findings=17 p1=1 p2=15 p3=1`, census 851, complete), + the pane/preset/theme arms below |
| `design-audit --mobile` | **RAN ×2** — Appearance (`findings=4`, list drilled off-canvas, the R2 lesson respected) and the config LANDING with the list on screen (`findings=5 p1=1` — the 16px rows at coarse, plus the 40px search-filter square) |
| `design-audit` appearance presets | **RAN ×4** — `maximal` 19 · `compact` 14 · `reading` 24 · `diagnostics` 17, all `population-verdict=complete`. **This closes the one coverage gap 08-30 declared**, and it found G8 and G9 |
| `design-audit` theme arm | **RAN** — `--theme Light`: 17 findings, `theme-light=1293 theme-dark=8`. Findings theme-invariant |
| `design-audit` pane-state arms | **RAN ×3** — `both-docked` (19, and the ONLY arm with `duplicate-action-door` ×8 and zero `row-void`), `context-only` (24), `focus` (22); the default arm is `list docked + context collapsed`. All `population-verdict=complete` |
| `motion-audit --matrix` | **RAN** — `cells=6 pairs-uncovered=0 required-twins=3 static-expected=1 instrument-errors=1 violations=3`. CLS judged on the **observed** non-virtualized total (0.0102–0.0471, budget 0.1); 3 FAILs are the 51–52ms LoAF with style/layout in-frame |
| `motion-audit` reduced-motion re-measure | **RAN** — `--os-reduced-motion --window 6000`: `cls-observed-non-virtualized=0.0171`, killing my own R-b |
| `perf-meter` | **RAN** — `--goto config --click Appearance --cycles 3`: first click **180ms long task / 184ms duration / 124ms blocking / 150ms rAF gap**; cycles 2–3 at 24–32ms, 0 rAF gap. `reports/perf-meter/perf-meter.json` |
| `record` (webm + gif + frame strip) | **RAN** — rail → Appearance → fold, real Playwright clicks. `reports/recordings/cb-config-eye-2-fold.{webm,gif}` + `-click1/2/3.png`. The strip is G1's receipt |
| Lighthouse desktop | **RAN** (after the MCP was un-wedged) — snapshot mode on the live Appearance pane, both panes docked: a11y **96**, best-practices 100, SEO 100, agentic 100; 2 failures, both product node paths (`config-band`, theme/style cards), dev-overlay ruled out by node path |
| Lighthouse mobile | **RAN** — identical scores, identical two failures (7 target-size nodes, 11 label-content-name-mismatch nodes) |
| `__orb` suite | **RAN** — `.motion()`, `.renders()` (11 content commits, maxMs 104), `.shell()`, `.resetEvidence()`, `.nav.section()/.openConfig()`. `.animations()` covered via motion-audit's animation census |
| Console triage | **RAN** — table above, 10 classes, zero "dev mode" dispositions |
| PNGs actually looked at | **RAN** — 8 read in full (appearance top, chat-style element shot, Light arm, mobile landing, personas, connections, backup, background, both-docked) + the 6-tile record strip |
| Keyboard walk | **RAN** — 20 Tab stops with `activeElement`, `:focus-visible` and outline width read at each |
| Hover-state paint | **RAN** via `design-audit`'s forced-state pass (`hover-subjects-forced=52`, 0 findings); the real-pointer oscillation class was NOT probed (no hover-reveal layout swap exists here — the reveal is opacity in reserved geometry) |
| Prod-build CLS arm | **SKIPPED** — G1 is an interaction-mount shift reproducible in dev under real clicks; the #836 prod arm answers a different question (Lighthouse mobile boot CLS), and nothing in this pass turned on it |
| `--contexts` / multi-user arm | **SKIPPED** — no per-principal visibility question on this surface; the empty-state scoping finding (F29) is a copy defect, already stated, and the multi-user fixture was not up |

### Artifact slots (name your run — these are mine)

`reports/snaps/cb-config-eye-2-*.png` (12) · `reports/snaps/cb-config-eye-2-matrix-v0{1..5}-*.png` ·
`reports/design-audit/cb-config-eye-2-appearance-{desktop,maximal,compact,reading,diagnostics,light,pane-both-docked,pane-context-only,pane-focus}.json` ·
`reports/recordings/cb-config-eye-2-fold.{webm,gif}` + `-click{1,2,3}.png` ·
`reports/perf-meter/perf-meter.json` ·
`reports/lighthouse-cb-config-eye-2-{desktop,mobile}/report.{json,html}` ·
`reports/traces/cb-config-eye-2-matrix-v0{2,4}-*.{zip,har}`.

## STATE LEFT BEHIND (dev db only)

Nothing written. The one world-info book named "New book" (0 entries) that the 08-30 lane created is
still present and is what flipped F5's World Info row from `text` to `button` — **delete it before the
next drive, or F5's population premise stays contaminated.** One setting is modified in the dev db (the
chat-display style, set to Flat) — that was already the case when this drive started and was not
changed. No files written outside `reports/`, the scratchpad, and this review.

---

## Issue summary for #1099

Re-drove the Config surface with the full repaired instrument battery against main tip `4f3840283`
(vite pid 3858659, age-verified; `nav=OK`, 0 page errors, 0 console errors, 0 failed requests,
deadcss 0 across ~40 runs). **Verdict unchanged: DO NOT SHIP AS IS.** Of the 08-30 report's 36 numbered
defects, **2 are fixed, 4 changed, 26 still stand** (most byte-identical: 16px group rows, 828.8×66
theme cards with 1.09:1 swatch cells, the 114×34-over-90×34 density stack, a 17.673:1 OFF switch vs a
7.669:1 ON switch, "Using the default — md." vs "Medium"), and 4 were not re-measured. All 8 excellence
recommendations are un-actioned except the teacher tab strip, which was correctly rebuilt as a
`toolbar` + `aria-current` + roving focus. **Twelve new findings (G1–G12)**, three of them P1: (G1) the
Looks section mounts ~230ms late and pushes 372px of content down on every settings-group click —
0.1656 non-virtualized shift, the app's own `[cls]` flagger calling it OVER BUDGET, reproduced 4× incl.
under a real click, with a frame-strip receipt; the reserved-box class #885 shipped on 21 sites and
missed here. (G2) with both panes docked the CONTEXT pane renders the LIST's nine Appearance
sub-sections verbatim — `design-audit` files 8 × `duplicate-action-door`, and shell law says CONTEXT is
never navigation. (G3) `transition-all` survives at four sites (`collapsible/variants.ts:17`,
`accordion/variants.ts:17`, `appearance-sizing-section.tsx:84`, `progress/variants.ts:20`) and the
console flags `animating non-compositor scrollbarColor` — the same codebase already carries the
corrected idiom with comments calling `transition-all` a bug. **Instrument delta:** the repaired fleet
paid for itself — `quiet-state`, `row-void`, `cohort-anatomy` and `duplicate-action-door` now catch
by machine what 08-30 measured by hand or missed entirely; #1071's observed-CLS basis is what makes G1
statable; the four appearance presets (08-30's declared coverage gap) found `tight-leading`×5 +
`off-grid-transform` under `reading` and `nested-card`×2 under `maximal`. **Two instrument rows to
file:** (a) P2 — `side-tab`/`border-accent-on-rounded` are mechanism-blind to `::after` accent bars
(`census-decor.ts:220-259` reads `border-*-width` only) and report `candidates=0` on the exact surface
carrying the §6-banned 3px×252px bar on the Tags card; positive control: the same census reports
`candidates=1` on Appearance, so the collector is alive, not dead. (b) P2 — `snap --matrix` is
unusable on non-chat surfaces on a clean isolated stage: its appearance-row reachability probe times
out waiting for a chat `message-row`, so the run is INSTRUMENT ERROR / NO VERDICT. Four self-retractions
published (a synthetic-click CLS attribution, a reading taken from an instrument-error cell, an
eyeballed "ragged grid" the measurement killed, and a mid-animation elevation measurement).
Full report: `docs/reviews/side-eye/2026-09-02-config-surface-live-drive-2.md`.
