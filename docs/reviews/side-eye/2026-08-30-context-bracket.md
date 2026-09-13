---
kind: review
status: draft
updated: 2026-08-30
---

# Context bracket (#860) — live-drive review

**Lane:** cb-bracket-eye · **Subject:** `facd32a60` + `31625cecb` on `main`, driven live on `:5173`
(server pid 316563 started 09:39:51, after `facd32a60`; vite pid 3399908 is 4h44m old but
`pnpm stack status` reports `served=fresh` for `character-context-band.tsx` — the commit-2 module is
the one being served, and every run reported `page-errors=0 console-errors=0 nav=OK`).
**Mock:** `docs/design/mocks/context-bracket/` (DESIGN.md read in full; all seven artboards viewed).
**Scope:** the CONTEXT pane only, in three sections — Chats (`Example — Midnight Run`), the game room
(`Example — The Ashen Spire`), Characters (`Sabine Veyra`).

## Verdict: SHIP WITH FIXES

The bracket is real and it works. The column is one composition in all three sections, the keyboard
contract is the best in the app, and the four things the brief asked me to verify as fixed are fixed —
with **one exception**: #861's *voice* half did not land, and I can prove it with pixels. The band
reads as one slot with three contents; the foot rail's kicker is unmistakably the rail's own heading.
What is not shippable as-is: one WCAG failure inside the bracket (the locked Map cell), a name printed
twice in every overlay state, and the Characters pane rendering the same identity twice on one screen.

## Per-target verdicts (rank order from the brief)

| # | Target | Verdict |
| - | - | - |
| ① | **Chats** (`Example — Midnight Run`, dock+dock 1280 · 768 · 430) | **SHIP WITH FIXES.** The band is the cleanest of the three: `h2` title (16px/600, 2-line clamp, `text-balance`), chips below it, never beside. Foot rail: kicker on top, 5 cells, no clip, no overflow at any tested width. Fixes owed: the unlabeled memory glyph (F11), the chip-casing/affordance inversion (F12), the duplicate name in overlay (F4), the no-op Members chip (F18). |
| ② | **Game room** (`Example — The Ashen Spire`) | **DO NOT SHIP the locked Map cell** (F1, WCAG 1.4.3 fail on an element the build explicitly argues is *enabled*). Everything else about the room is sound: GAME STATE rail owns the selection with the ember fill + 2px bar, the CHAT rail recedes structurally, the ground measures 0 on a tall body so the foot never jumps. But the receded rail's *voice* is measurably absent (F2), the band's title is a 13px truncated span where the other two are 16px headings (F3), and the pane is the app's densest chrome (F7). |
| ③ | **Characters** (`Sabine Veyra` → Show detail panel) | **SHIP WITH FIXES.** The six-cell rail is correct and fits at 430 coarse (measured, F-verified below). The pane's problem is not the pane — it is that it duplicates the content hero it sits beside (F5), and `design-audit` says so independently. Plus the 10.5px Own-look trigger (F6). |

Design health, scoped to the context bracket: **29/40** (good band). The table is in
[§ Nielsen](#nielsen-scored-context-pane-only) — but the score gates nothing; the finding list is the
deliverable.

## MOCK ⇄ RENDERED delta table

Both sides shot at the same viewport class (mock artboards are 384×800 docked / 430×860 phone at true
size; live shots are the element-only bracket at 383×800 and the 430-coarse pane).

| # | Element | Mock | Rendered | Class |
| - | - | - | - | - |
| 1 | Head band position/fill/seam, all three contents | one slot, raised fill, hairline seam | identical in all three (`bg-sidebar-accent/40`, band `y=2`, seam at the rail) | **MATCH** |
| 2 | Kicker position | ON TOP of its cells, hairline rule between | on top; chat `kicker y=717`, cells `y=746` | **MATCH** (#861 structural) |
| 3 | Foot rail pinned to the pane's foot | pinned | `y=717`, `h=83` in BOTH a short-body (chat, ground 405px) and a tall-body (game, ground 0px) room | **MATCH** |
| 4 | Active cell treatment | ember fill + 2px bar | `bg oklab(.72 .108 .138/.15)`, `border-bottom 2px oklch(0.72 0.175 52)` | **MATCH** (#850 half) |
| 5 | Locked Map cell | padlock, dimmed, opens onto its reason | padlock, `opacity .6`, `title="Maps unlock with the map arc"`, `aria-disabled=false`, arrow-reachable | **RENDERED-WRONG** — the dim lands at 3.54:1 (F1) |
| 6 | Chat chips: members · **memory** · preset | three labelled pills | members pill (CAPS), **bare unlabeled glyph**, preset pill (sentence case) | **RENDERED-WRONG** (F11, F12) |
| 7 | Game band title | short place name, title voice | `voice="label"` 13px/500 span, `truncate`, ellipsised | **RENDERED-WRONG** vs the ruling's own head-band contract; DELIBERATE-WITH-CITE vs "the Waystone itself: Unchanged" (DESIGN.md, Coupled sites). Fork for the orchestrator (F3) |
| 8 | Character roster: five cells | Overview · Links · Look · History · Trust | six: Overview · **Chats** · Links · Look · History · Trust | **MOCK-STALE-SANCTIONED** — DESIGN.md records the correction (#501, 2026-08-30) |
| 9 | Character sub-line "Warden of the outer stair ·@sabine" | tagline + handle | `@sabine` only | **MOCK-STALE-SANCTIONED** — DESIGN.md's contract says "handle line"; the artboard drew a datum the spec does not claim |
| 10 | Character chips "Own look · 1 chat · 1,257 tokens" | three pills | `Own look` = kicker-cased trigger + swatch (no pill); `1 chat` / `1257 tokens` = pills | **RENDERED-WRONG** (F12) — and the number loses its separator (F13) |
| 11 | Character band portrait | ~108px square hero portrait | ~36px avatar | **DELIBERATE-NO-CITE → QUESTION.** Defensible (the content hero already carries a big portrait) but nothing records the decision |
| 12 | Character Overview body: Origin(Source/Added/**Tokens**) · Activity(Last chat/**Chats**) · Tags(pills + Add tag) | six rows + tag affordances | Origin(Added/Source) · Activity(Last chat) · Tags(Applied: Empty) | **MOCK-STALE-SANCTIONED** for Tokens/Chats (they moved to the band chips — correct de-dup). **RENDERED-WRONG** for "Last chat": the mock names the chat (`Example — Midnight Run · 3h`), live prints only `Aug 2, 2026` (F-minor, folded into F13) |
| 13 | RpgRoom foot rail order: … Activity · **Game** | Game last | Members · This chat · Preview · **Game** · Activity | **RENDERED-WRONG** (F15) — live is internally consistent across rooms, the mock is right on taste |
| 14 | Receded rail with no fill | bare ground under the cells | `bg-sidebar-accent/15` + `pb-row` floor + top hairline | **RENDERED-WRONG in effect** — the fill measures 1.001:1 against the pane (F2) |
| 15 | Phone: dismiss inside the band's corner | X at the band's top-right | X at the band's top-right, `data-slot=context-bracket-dismiss` | **MATCH** |
| 16 | Phone: cells 52px | 52 | **56px** at coarse (`CONTEXT_CELL_FLOOR_AT_COARSE`, the first token step ≥52) | **DELIBERATE-WITH-CITE** (context-rail.tsx `min-w-0` note) |
| 17 | Phone artboards draw no app-level bottom tab bar | sheet's foot rail is the last strip | the shell's Home/Chats/Characters/You bar sits directly under it | **RENDERED-WRONG in effect** (F9) — the mock could not show this collision |

## Findings

### P1

**\[P1] F1 — the locked `Map` cell's caption fails WCAG AA, and the build's own argument says it must not.**
`context-rail.tsx` states the case explicitly: the locked cell is *"deliberately NOT `aria-disabled` … a
real cell wearing a lock, where mouse, keyboard and AT all get the same answer."* Measured, it is a live
control (`aria-disabled="false"`, `tabindex="-1"` roving, arrow-reachable, `.click()`-able) painted at
`opacity: .6`, and its caption lands at **3.54:1** against a sibling at **7.59:1**. WCAG 1.4.3's
disabled-control exemption is exactly what the build renounced — so the floor applies in full.
*Why it hurts:* a low-vision user cannot read the name of the one cell they will most want explained,
and the visual says "disabled" while the semantics say "enabled" — the two-stories problem the build set
out to kill, re-introduced on the colour axis.
*Fix:* `quieter: the locked cell — receipt: the caption at ≥4.5:1 with the lock glyph carrying the
"unavailable" signal instead of the ink.* Drop `opacity-60`from the cell root and dim only the glyph +
the`::after`, or hold the caption at `text-muted-foreground`and mark the state with the padlock alone.
*Receipt:*`snap --contrast … 3.54:1 FAIL (text · font 13px · need 4.5 · pixel-sample · dimmed α0.60)`;
`design-audit`independently:`P1 contrast \[data-slot=context-bracket] > div.flex… 3.53:1 · dimmed α0.60`;
computed `{opacity:"0.6", disabled:"false", clickable:true}`. Shot `reports/snaps/cbbe-game-bracket.png`.
*Instrument note:* Lighthouse/axe scored **100 accessibility** over this exact state in both device arms —
axe's `color-contrast`rule does not composite ancestor`opacity\`, so it read the undimmed 7.59:1. Our
pixel-sample is right; the green is a blind spot, not a clearance.

### P2

**\[P2] F2 — #861 is fixed STRUCTURALLY and not PERCEPTUALLY: the receded rail's fill is 1.001:1 and its
kicker is *brighter* than the owning rail's.**
The build's stated mechanism (context-rail.tsx `RAIL_OWNERSHIP_CLASSES`): *"the receded rail had NO fill
at all … So the receded rail wears a quieter step of the same fill, its kicker stays at the muted ink
while the owning one lifts."* Framebuffer decode of `cbbe-game-bracket.png` (mode over each strip,
383×800 element shot, DPR 1):

| Surface | Pixel | vs pane bg `rgb(15,13,14)` |
| - | - | - |
| Pane background (ROSTER strip) | `rgb(15,13,14)` | 1.000 |
| Band + OWNING top rail (`/0.40`) | `rgb(21,19,17)` | **1.045:1** |
| RECEDED foot rail (`/0.15`) | `rgb(16,13,13)` | **1.001:1** |

A 1-RGB-point step is "no fill at all" by any perceptual measure — the exact condition #861 filed. And
the kicker step inverted rather than landed: `CHAT` (receded, muted/70 on the darker surface) measures
**8.25:1**; `GAME STATE` (owning, full muted on the lighter surface) measures **8.03:1**. #861's own
numbers were 8.50 vs 4.97; the fix compressed the gap but the receded kicker is *still the brighter of
the two*. The `/70` alpha was cancelled by the lighter fill behind the owning one.
*Why it hurts:* the whole point of the ownership axis is that a glance tells you which rail holds the
view. It does not — what actually rescues the foot rail today is the `pb-row` floor and the top hairline,
neither of which is the mechanism the ledger records.
*Fix:* `bolder: the OWNING rail's fill — receipt: owning-vs-pane ≥1.15:1 and receded-vs-pane ≥1.05:1 in a
framebuffer decode, plus receded-kicker contrast strictly BELOW owning-kicker contrast, both arms.* The
axis has to be measured composited, not chosen as an alpha.
*Receipt:* the table above; `snap --contrast '\[data-edge=bottom] …kicker span' → 8.25:1`/`'\[data-edge=top] …kicker span' → 8.03:1\`.

**\[P2] F3 — the head band's NAME voice forks three ways for one slot.**

| Content | Element | Size/weight | Clamp | Truncated? | Band height |
| - | - | - | - | - | - |
| Chat | `h2` | 16px / 600 | `line-clamp: 2` | no | 78px |
| **Game** | plain `span` | **13px / 500** | none | **yes, ellipsis** | 208px |
| Character | `h2` | 16px / 600 | `line-clamp: 2` | no | 93px |

DESIGN.md: *"One slot, three contents — never a second head. The band owns the name's budget."* The slot
is one; the name is not. In a docked game room the room has **no heading anywhere** — the topbar has
yielded (correctly, #846) and the band's title is an unlabelled 13px span. `snap --aria
'[data-slot=context-bracket-band]'` returns a single flat `text:` node for the whole game band: no
`heading`, so a rotor cannot reach the room's name.
Worse, they are *different names*: the topbar/list call the room `Example — The Ashen Spire`; the band
prints the scene LOCATION (`rpg-takeover-header.tsx` renders `location`), which for this game is a whole
sentence — `The Ashen Spire — the throne hall, a fire built off the draft-line and the last of the rations
on it` — hard-ellipsised at 383px, and at 1024 overlay both strings are on screen at once.
*Fork for the orchestrator:* DESIGN.md's "Coupled sites" says the Waystone is **Unchanged**, so the
truncation is inherited, not a #860 regression. But the ruling promoted that band into the slot whose
contract is naming the artifact. One of the two has to give.
*Fix (my recommendation):* `typeset: the game band's first line — receipt: an h2 at the band voice
(16px/600, 2-line clamp) carrying the ROOM's name, with the scene location demoted to the when-line's
voice beneath it.*
*Receipt:* the table; `--aria`band excerpt;`reports/snaps/cbbe-game-bracket.png`, `cbbe-game-1024.png\`.

**\[P2] F4 — every OVERLAY state prints the artifact's name twice, 45px apart.**
The #846 yield (`shell.css:722`) keys on `.shell-grid[data-context-mode="docked"]`. At 430 coarse and at
1024×768 the pane resolves to `overlay`, so the topbar keeps the title and the band prints it again
directly underneath. `cbbe-chat-430.png`: topbar `Example — Midnight Run` at y≈23; band
`Example — Midnight Run` at y≈68. That is the #846 injury inverted — one concept, two homes, adjacent,
at the width where space is scarcest (§13 IA single-homing).
*Why it hurts:* 45px of a 740px phone screen spent saying the same thing twice, while the room's actual
content is a sheet away.
*Fix:* `distill: the topbar identity while the context pane is OPEN in any mode — receipt: exactly one
rendered instance of the room/character name at 430, 768 and 1024 overlay.* The docked rule is right; it
just needs `\[data-context-mode="overlay"]`too (the sheet covers the content the topbar describes anyway).
*Receipt:*`reports/snaps/cbbe-chat-430.png`, `cbbe-char-430.png`, `cbbe-game-1024.png\`.

**\[P2] F5 — the Characters pane renders the same identity the content hero already renders, on one screen.**
At 1280 dock+dock (`reports/snaps/cbbe-char-1280.png`) the portrait, the name, `@sabine`, the Own-look
trigger, the chat count and the token count all appear **twice**, ~500px apart, plus a third print of the
name in the content header row (`Sabine Veyra Character · 1257 total · 1017 permanent`). The token datum
appears in two framings for one number. `design-audit` fires on this without being asked:
`P3 duplicate-action-door … (2x button "own look")` and `… (2x button "chats")`, desktop AND mobile.
*Why it hurts:* the mock never drew the content column, so this collision was invisible at design time —
and it is exactly the duplication the chat room solved by making the topbar yield. Characters yields
nothing. A first-timer cannot tell which "Own look" is the real one.
*Fix:* `distill: the character hero's identity row while the context pane is docked — receipt: one
rendered "Own look" trigger, one chat-count door, one token datum per screen at 1280 dock+dock; the
design-audit duplicate-action-door rows go to zero.*
*Receipt:* screenshot above; `reports/design-audit`rows quoted; the band`--aria\` tree.

**\[P2] F6 — the new character band breaks the 11px readable floor the SAME commit pair refused to break.**
`context-rail.tsx` says it plainly: *"voice=LABEL, not `gloss` … the 10.5px `micro` step — under the 11px
readable floor. The mock draws its captions at 10.5px and is NOT followed on this axis: the readable-floor
ruling stands."* The rail honoured it. The band did not: `design-audit` reports
`P2 undersized-ui-text [data-slot=character-context-band] > d… 10.5px interactive text (floor 11px)`
(desktop AND mobile), and the identical row for `[data-slot=chat-context-band]`. So both new bands ship
sub-floor interactive text while the rail beside them holds the line.
On mobile the chat band's chip also fails geometry: `P2 tap-target [data-slot=chat-context-band] … 40×44px`
(short side 40 < 44).
*Fix:* `typeset: both context bands' chip/trigger text — receipt: design-audit undersized-ui-text clean on
`chat-context-band`and`character-context-band`, desktop + mobile; the mobile chip at ≥44px short side.*
*Receipt:* `reports/design-audit\` chat-desktop, chat-mobile, char-desktop, char-mobile logs.

**\[P2] F7 — at the `reading` appearance preset the bracket is 79% chrome and slices a caption mid-word.**
`snap --appearance-preset reading` at 1280×800, game room: band **327px** + top rail **157px** (folded
3+3) + foot rail **99px** = **583 of the pane's 740px**. The viewport gets ~157px — enough for the
`ROSTER — 4` kicker and one half-card. The foot rail reports `overflowX: true` and paints `Acti` with
`vity` cut at the pane edge — no ellipsis, no scrollbar, no affordance.
Companion arms are clean: `defaults` and `maximal` are byte-equivalent in geometry (band 208, rails 82/83,
no overflow); `compact` is 196/74/75 with 42px cells, no overflow.
*Why it hurts:* `reading` is a shipped profile, not a stress test. A user who turns up type size gets a
pane that is mostly frame and a navigation label chopped in half.
*Fix:* `adapt: the bracket column at the reading preset — receipt: the four preset arms all show
viewport ≥ 40% of the pane height and `overflowX:false`on both rails at 1280.* Candidates: cap the band
(scroll it, or drop the orbs to the body), and let the meta rail fold at 5 cells when the track overflows
rather than only at 6.
*Receipt:*`reports/snaps/cbbe-game-reading.png`, `cbbe-game-maximal.png`, `cbbe-game-compact.png\`.

**\[P2] F8 — the meta rail overflows with no affordance at 1024×768.**
`toolbar` `scrollWidth 316` vs `clientWidth 290` — 26px hidden of a 56px `Activity` cell, i.e. roughly
half the last cell is off-track behind the pane edge. The `RAIL_TRACK_CLASSES` note argues "degrade to a
scroll, never into an ellipsis", and the count-gated fold (`RAIL_WRAP_CELLS = 6`) deliberately excludes
the five-cell rail after #861's ragged 3+2. Both decisions are defensible; the *combination* leaves the
five-cell rail with a silent clip at a mainstream laptop size.
This is the \[\[count-gate-standing-in-for-fit]] shape again, one level up: the FOLD is count-gated (right)
but nothing answers "what if the scroll track is the only arm and it overflows".
*Fix:* `adapt: the meta rail's overflow arm — receipt: at 1024×768 and at the reading preset the last
cell is either fully visible or visibly scrollable (edge fade / persistent thin scrollbar), asserted with
`--expect-no-overflow`on the toolbar or a measured fade.*
*Receipt:*`reports/snaps/cbbe-game-1024.png\`; the 1024 rails eval.

**\[P2] F9 — on the phone the pane's foot rail and the app's section bar stack as two near-identical strips.**
`cbbe-game-430.png`: the CHAT rail (Members · This chat · Preview · Game · Activity, icon over caption,
56px cells) occupies y≈591–684; the shell's own bottom tab bar (Home · Chats · Characters · You, icon over
caption) occupies y≈684–740. Two strips of the same species, touching, ~150px of a 740px screen — 20% of
the phone is navigation chrome, and nothing distinguishes "tabs of this pane" from "sections of the app".
The mock's phone artboards do not draw the app bar, so this collision could not be seen at design time.
*Why it hurts:* Casey taps the wrong strip. Jordan cannot tell them apart at all.
*Fix:* `layout: the phone sheet's foot — receipt: at 430 coarse the two strips are separable at a glance
(a real gap + a distinct treatment for the pane rail, or the sheet extends over the app bar while open).*
*Receipt:* `reports/snaps/cbbe-game-430.png`, `cbbe-chat-430.png`, `cbbe-char-430.png\`.

**\[P2] F10 — the pane's primary navigation costs a 111ms blocking frame; opening the pane costs 560ms.**
`motion-audit / --open-chat "…Ashen Spire" --click 'Show detail panel' --selector '#context-cell-rpg.inventory' --full-motion` → `verdict=FAIL · worst-blocking 111ms (budget 50) · 1 LoAF with style/layout in-frame ·
17ms forced style/layout inside the click frame`. CLS is **0** (non-virtualized) and **0/302 frames
dropped**, 17 active animations all compositor-clean — so the *geometry* is perfect; the cost is the
query-backed panel mount.
`perf-meter` on the same chain: opening the detail panel = `2051ms long tasks, worst 560ms, blocking
474ms, rAF gap 350ms`; each rail-cell switch = `176–272ms click duration, 10–13ms input delay, rAF gap
133–183ms`. The 272ms `Scene` switch breaches the 200ms INP budget.
*Why it hurts:* this is the one thing the pane exists to do. It is also precisely why manual activation
was ruled (#102) — the ruling stops the cost multiplying, it does not pay it down.
*Fix:* `optimize: the context-cell mount path — receipt: motion-audit worst-blocking ≤50ms and
perf-meter click duration ≤200ms on a rail-cell switch.* Prefetch the neighbouring cell's query on focus
(arrows already move focus without committing), or render the panel shell before the data.
*Receipt:* `reports/perf-meter/perf-meter.json\`; motion-audit log above.

### P3

**\[P3] F11 — the chat band's memory chip is an unlabeled glyph where the mock draws a word.**
Mock: `● Memory idle` as a labelled pill. Live: a bare squiggle between `3 MEMBERS` and `Built-in preset`.
Its accessible name is fine (`button "Memory — idle"`), so Sam is served and Jordan is not — the reverse
of the usual failure. *Fix:* `clarify: the memory chip — receipt: the visible word matches the accessible
name at ≥1280 docked (the band has the room the topbar row did not).*
*Receipt:* `cbbe-chat-1280.png`, `cbbe-chat-430.png`; `--aria\` band excerpt.

**\[P3] F12 — both bands' chip rows mix two grammars, and the inversion points the wrong way.**
Chat band: `3 MEMBERS` (caps micro, button) · glyph (button) · `Built-in preset` (sentence-case pill,
**inert text** with a `title`). Character band: `● OWN LOOK` (caps trigger, **the only button**) ·
`1 chat` (pill, inert) · `1257 tokens` (pill, inert). In both, the pill shape marks the items you cannot
click and the bare caps marks the one you can. The mock drew all three as one pill family.
Also: a `title`-only explanation ("The preset that governs generation for you in this room") is not
load-bearing copy — it is unreachable on touch and to most AT.
*Fix:* `polish: both bands' chip rows — receipt: one shape for inert data, a visibly distinct shape for
the actionable chip, in both bands, at both themes.*
*Receipt:* `cbbe-chat-1280.png`, `cbbe-char-1280.png`, `cbbe-char-light.png`; `--aria\` trees.

**\[P3] F13 — `1257 tokens` prints without a separator; `Last chat` loses the chat's name.**
Mock: `1,257 tokens` and `Example — Midnight Run · 3h`. Live: `1257 tokens` and `Aug 2, 2026`. The house
already prints `1257 total · 1017 permanent` unseparated in the hero, so this is a house-wide format
question, not a band bug — but four-digit runs without a separator read as ids, and "which chat" is more
useful than "which day".
*Fix:* \`polish: token counts and the Last-chat datum — receipt: grouped digits in both mounts; the last
chat named, with its age.\*

**\[P3] F14 — the pool orbs orphan-wrap 4+1 at ≤306px and in the reading preset.**
At 1024×768 (306px pane) and at `reading`, `HP · STA · WAR · SUP` fill row one and `SILVER MARKS` sits
alone at the far left of row two with the whole right half empty — the same ragged-void shape #861 filed
against the rail's 3+2 fold, now in the band. *Fix:* `layout: the orb row — receipt: no orphan row at 306
and 383 in all four preset arms (balance the wrap or scroll the row).*
*Receipt:* `cbbe-game-1024.png`, `cbbe-game-reading.png\`.

**\[P3] F15 — the `Game` cell splits the meta four; the mock puts it last.**
Live (both rooms): `Members · This chat · Preview · Game · Activity`. Mock RpgRoom:
`Members · This chat · Preview · Activity · Game`. Live is internally consistent — which is worth
something — but the crowned host-only door wedged between two generic meta tabs reads as an accident.
*Fix:* \`layout: the meta rail order — receipt: Game seated last in both rooms.\*

**\[P3] F16 — the phone sheet offers two dismisses 45px apart.**
`cbbe-char-430.png`: the topbar's context toggle (`Hide details`) at y≈23 top-right, and the band's
`X` at y≈80 top-right. One action, two adjacent homes. The band X is the right one (it is where the thing
it closes is); the topbar toggle is the shell's. *Fix:* \`distill: the phone's sheet exits — receipt: one
dismiss in the sheet's own chrome at 430.\*

**\[P3] F17 — the rail's trail button is a caption-less cell in a rail whose law is "icon + caption always".**
`button "Character actions"` (34×34) sits inside the rail's cell row, outside the `toolbar`, with a glyph
and no caption, beside six captioned cells — so it reads as a seventh cell that forgot its word, and it
is a second tab stop in a rail advertised as one. Named correctly for AT; wrong for the eye.
*Fix:* `polish: the rail trail — receipt: the trail is visually separated from the cell track (a divider
or an inset), or it takes a caption like its neighbours.*
*Receipt:* `cbbe-char-1280.png`(x≈1256),`cbbe-char-430.png`; `--aria\` rail excerpt.

**\[P3] F18 — the band's Members chip is a no-op at rest.**
`openMembersCell()` writes `setContextTab("members")`, and `members` is the tab the pane opens on
(`--aria` shows `region "Members"` with `aria-current="true"` on the Members cell at first paint). So the
most prominent actionable chip in the chat band does nothing visible until you have navigated away from
the default. *Fix:* `clarify: the members chip — receipt: it reads as a datum (not a button) while
Members is current, or it carries the `aria-current\` state its target cell carries.\*

**\[P3] F19 — one control, two names: `Show detail panel` (desktop) vs `Show details` (narrow).**
Measured via `--map` at 1280 and at 430/768. Same button, same action, two accessible names — a screen
reader user who learns one will not find the other. *Fix:* \`clarify: the context toggle — receipt: one
accessible name at every width.\*

## Verified fixed (for the orchestrator's issue closures)

- **#846 — the room stays named, in exactly one place.** `.shell-grid[data-context-mode]` measured:
  collapsed → topbar prints `Example — Midnight Run` + the roster chip + the recall glyph
  (`cbbe-chat-probe.png`); docked → topbar sheds all three and the band's `h2` carries the name
  (`cbbe-chat-1280.png`). The name is never absent. **Caveat: overlay is not covered — see F4.**
- **#861(a) — the kicker sits ON TOP of its cells.** Chat: kicker `y=717 h=23`, cells `y=746`. Game top
  rail: kicker `y=210`, cells `y=238`. It prints `NAME · SELECTION` on the owning rail (`Chat · Members`,
  `Game state · Status`) and the bare name on the receded one (`Chat`) — so it can no longer be read as a
  dangling section header. **Caveat: the fill/voice half did not land — see F2.**
- **#861(b) — no ragged 3+2 wrap at 1024×768.** The six-cell GAME STATE rail folds **3+3**; the five-cell
  CHAT rail does **not** fold (it scrolls). Measured `rows/perRow`: top `2 / [3,3]`, bottom `1 / [5]`.
- **#850 (selected-state half) — the game rail's active cell wears the ember fill + 2px bar.**
  `background-color: oklab(0.72 0.107741 0.137902 / 0.15)`, `border-bottom: 2px oklch(0.72 0.175 52)`,
  caption at `oklch(0.955 …)`; resting cells transparent with a 2px transparent border (no reflow on
  state change).
- **The mount-time `scrollIntoView` bug.** Seeded focus on the last focusable before the bracket in
  document order, then one `Tab`: focus lands on **`Status`**, the state rail's active cell,
  `aria-current="true"`, `tabindex="0"`, `:focus-visible = true`. It does not land past the rail.
- **#112 — one tab stop per rail, arrows move, Enter selects, `aria-current` on the owner.**
  Measured chain: Tab → `Status` (cur=true, ti=0) → ArrowRight → `Inventory` focused, **`aria-current`
  still Status, panel still `context-cell-rpg.status`** → ArrowRight → `Scene` → **Enter** → `aria-current`
  \= Inventory, panel = `context-cell-rpg.inventory`. Next Tab exits the rail into the viewport body.
  Non-active cells carry `tabindex="-1"`; exactly one `region` is visible at a time.
- **The dead-zone / ground contract.** Chat (short body): viewport 232px, **ground 405px**. Game (tall
  body, `scrollH 797 > clientH 425`): **ground 0px**. Foot rail at `y=717 h=83` in BOTH. `motion-audit`
  reports `cls-non-virtualized=0` and `perf-meter` `shift 0` across two rail-cell switches — the foot
  does not move between states.
- **Phone floors.** Every cell is **56px** tall at coarse (≥ the mock's 52). The **six-cell Characters
  rail fits at 430**: `scrollWidth 357 == clientWidth 357`, `overflowX:false`, zero clipped captions,
  min cell 53×56. The sheet's dismiss is inside the band's top-right corner in all three sections.
- **Light theme.** `data-theme="light"` resolved; framebuffer decode of the Characters bracket
  (decoded BEFORE looking, per the standing rule): band/rail `rgb(239,234,229)`, body `rgb(243,239,235)` —
  a warm light palette, matching the recorded Light values. Contrasts: kicker 6.48:1, captions 11.29:1,
  active caption 11.29:1 — all PASS.
- **Contrast, owner theme, chat pane:** band title 15.99:1 · owning kicker 8.07:1 · selection half
  16.36:1 · active caption 10.58:1 · resting caption 8.12:1 — all PASS. The only FAIL in the whole
  bracket is F1.

## Pre-existing, in view but not caused by this change

- **23 `tap-target` P1s in the game room, all rooted at `[data-slot=rpg-status-tab]` /
  `[data-slot=rpg-status-card]`** (22px short sides on status rows/chips). These are the Status BODY, not
  the bracket — the same class as #850's 28 known Game-tab targets, on a different tab. Reported so the
  count is not mistaken for a bracket regression; they should get their own row.
- **`label-content-name-mismatch` (Lighthouse, both arms)** — every node is a LIST-pane row
  (`list-row-body` buttons whose `aria-label` is the title while the visible text includes the preview
  snippet) or the character-filter overflow chip. Zero nodes inside the bracket.
- **`P3 wide-tracking` on `[data-slot=save-bar-meta]`** and **`P3 flat-type-hierarchy` (page)** — the
  content column's editor chrome, present in every Characters arm.

## Taste & flow verdict (the call no instrument makes)

**Does it look like shit? No — and that is the honest headline.** This is the most coherent the context
pane has ever looked. Put the three element shots side by side and you see one object: the same band at
the top, the same hairline seam, the same kicker-over-cells rail welded to the bottom edge. The
question the brief asked — *does the band read as ONE slot with three contents, or three headers?* — is
answered by the geometry: band `y=2` in all three, identical fill, identical seam. **One slot.** The one
thing that breaks it is typographic, not structural: the game band's name is 13px where the other two are
16px headings (F3), so the slot looks the same and *sounds* different.

**Is the foot rail's kicker unmistakably the rail's own heading?** Yes. `CHAT · MEMBERS` sitting on a
hairline directly above five captioned cells cannot be read as a dead section header any more — the
breadcrumb grammar plus the physical adjacency does it. #861's complaint is answered by the *layout*.
It is not answered by the *voice*, and the build's ledger entry credits the voice (F2). Fix the fill or
amend the record; do not leave a ledger claiming a mechanism the pixels do not have.

**Does the receded rail read as a control group?** Marginally. What sells it is the `pb-row` floor —
nothing ends on the pane's edge any more, and that alone changes the read from "orphaned label" to "the
bottom of the panel". The fill contributes nothing (1.001:1). It survives; it is not yet good.

**Where it flows weird.** Three places, in order:

1. **Characters at 1280 dock+dock is genuinely cluttered.** The name `Sabine Veyra` is on screen four
   times (list row, content header, hero field, band heading) and `OWN LOOK` twice. The eye has no idea
   which column is the subject. `design-audit` agrees without prompting. The chat room solved this and
   Characters did not.
2. **The phone bottoms out into two identical strips.** A first-timer at 430 sees ten icon-over-caption
   cells in two rows and cannot tell which four are the app and which five are this pane.
3. **The game room's chrome-to-content ratio.** At 1280 the band (208) + rail (82) is 290px of a 800px
   pane before a single roster row; at `reading` it is 583 of 740. The pane is beautiful and it is mostly
   frame.

**Cold-read (the 5-second test).** Chat pane: passes — a title, three chips, a labelled list, a rail with
words. Character pane: passes on its own, fails in context (you cannot tell it apart from the hero).
Game pane: the Waystone is striking and the rails are legible, but a cold user reading
`The Ashen Spire — the throne hall, a fire built off the draft-line and the las…` in 13px grey has no
idea whether that is the room's name, a scene note, or the last thing that happened.

**One-home audit (§13).** Four collisions found: the artifact name in every overlay state (F4); the
Characters identity (F5); two sheet dismisses on the phone (F16); two accessible names for the context
toggle (F19). Against that, the change *removed* a real one — the topbar/band title twin while docked.
Net positive, with four to close.

## What's genuinely working — do not touch

1. **The keyboard model.** One tab stop per rail, arrows move focus without committing, Enter selects,
   `aria-current` only on the rail that holds the view, `:focus-visible` true at every stop, `region`
   panels named by their cell. This is the best keyboard surface I have measured in this app, and the
   manual-activation choice is visibly correct — ArrowRight past three cells mounted nothing.
2. **The ground / dead-zone contract.** Ground 405px on a short body, 0px on a tall one, foot rail at
   `y=717` in both, `cls-non-virtualized = 0` and `shift = 0` across selection changes. The foot never
   moves. That is a hard geometric promise and it is kept.
3. **The `defaults` / `maximal` / `compact` preset arms and the Light theme.** Byte-stable geometry, no
   overflow, every contrast PASS, the ember active state legible in both polarities.

## The single biggest opportunity

**Make the ownership axis measurable, then measure it.** Every remaining structural complaint in this
review is one decision made in *alpha space* and never checked in *pixel space*: the owning fill
(1.045:1), the receded fill (1.001:1), the receded kicker that came out brighter, the locked cell's
`opacity: .6` landing at 3.54:1. `RAIL_OWNERSHIP_CLASSES` / `KICKER_OWNERSHIP_CLASSES` /
`CELL_OWNERSHIP_CLASSES` are already "ONE map per axis so the two states can never be tuned apart" — the
missing half is a CT that decodes the composited framebuffer and asserts the ORDER (owning surface >
receded surface > pane; owning kicker contrast > receded kicker contrast; every enabled cell ≥4.5:1).
Land that and F1, F2 and the locked-cell class can never silently regress again.

## Retractions

- **I initially read the receded foot rail as the more strongly differentiated surface.** A raw
  single-pixel pair (`rgb(16,13,13)` foot vs `rgb(25,23,20)` "viewport") suggested the receded rail was
  the *darker, more distinct* material and the owning rail was flat. Wrong: the 25,23,20 sample was a
  ROSTER CARD, not the pane. Mode-sampling the true pane background (`rgb(15,13,14)`, the `ROSTER — 4`
  strip) inverted the conclusion — the receded rail is 1.001:1 against the pane, i.e. effectively no
  fill, which is what F2 now says. The lesson: sample the surface, not the region.
- **The `❗2 ⚠0` badge occluding the `Activity` cell in the first screenshots is the vite-plugin-checker
  overlay, not the product** — and `.cache/stack/client.log` shows those two TypeScript errors settling
  to `Found 0 errors` twice afterwards. No live type error is implied by anything in this review. All
  later shots removed the overlay with an ephemeral in-page `.remove()` in the probe browser only.
- **Lighthouse's accessibility 100 does not clear F1.** I nearly filed the green as a receipt. axe's
  `color-contrast` rule does not composite ancestor `opacity`, so it read the Map cell at its undimmed
  7.59:1. Our pixel-sample and design-audit agree at ~3.54:1. Cited as an instrument blind spot, not a
  disagreement.
- **The mock's five-cell Characters rail and its "Warden of the outer stair" tagline are NOT findings.**
  Both are artboard state the spec text overtakes (DESIGN.md records the six-cell correction under #501;
  its Character contract says "handle line", not "tagline"). Classified MOCK-STALE-SANCTIONED.

## Nielsen (scored, context pane only)

| # | Heuristic | Score | Key issue |
| - | - | - | - |
| 1 | Visibility of system status | 3 | `aria-current` + kicker breadcrumb + ember bar all agree; but a 560ms pane open with no progress signal |
| 2 | Match system ↔ real world | 3 | plain nouns throughout; the game band names a location where the user expects a room |
| 3 | User control & freedom | 3 | Escape/dismiss present; two dismisses on the phone (F16) |
| 4 | Consistency & standards | **2** | one control, two names (F19); one slot, three name voices (F3); one chip row, two grammars (F12); Game seated differently from the mock (F15) |
| 5 | Error prevention | 3 | manual activation is exactly the right call here and it is implemented |
| 6 | Recognition over recall | 3 | icon + caption on every cell; the memory chip is a glyph with no word (F11) |
| 7 | Flexibility & efficiency | 3 | full arrow navigation, one tab stop; no cell shortcuts |
| 8 | Aesthetic & minimalist | **2** | Characters duplicates the hero (F5); the game band is 26–44% of the pane; `reading` is 79% chrome (F7) |
| 9 | Error recovery | 3 | the locked cell opens onto its reason rather than dead-clicking — good; its label is unreadable (F1) |
| 10 | Help & documentation | 3 | `Pick a field on Sabine Veyra to inspect it here.` is a genuinely good empty state; the preset chip's only explanation is a `title` |
| | **Total** | **28/40** | good band, bottom edge |

## Instrument coverage table

| # | Instrument | Status |
| - | - | - |
| 1 | `snap --map` | **RAN** — selector discovery at 1280 / 768 / 430; found the `Show detail panel` ⇄ `Show details` label split (F19) |
| 1 | `snap --aria` | **RAN** — bracket trees for all three sections (`reports/snaps/`; excerpts inline) |
| 1 | `snap --contrast` (in-viewport) | **RAN** — 11 measurements, 1 FAIL (F1); tall-viewport arm N/A (the bracket is height-bounded by design, nothing sits below the fold) |
| 1 | `snap --matrix` | **SKIPPED** — the 8-variant sweep was replaced by explicit named arms that cover the same axes plus the ones matrix does not (1024×768, four appearance presets, `--theme Light`, docked-vs-overlay). Reduced-motion is covered by the global killer + `--full-motion` in motion-audit |
| 1 | `snap --json` manifests | **SKIPPED** — no run exceeded the 200-message console cap; `console-errors=0` on every run read directly |
| 1 | `snap --scenario` | **SKIPPED** — every check was reachable in a single argv-ordered chain; no multi-checkpoint state needed |
| 2 | `pnpm design-audit <route>` desktop | **RAN** — chat (2 findings), game (33), characters (7) |
| 2 | `pnpm design-audit --mobile` | **RAN** — chat (3), game (32), characters (8). Note: all six runs write the same `reports/design-audit/root.json`, so only the last survives on disk; per-arm logs kept in the lane scratch |
| 3 | `pnpm motion-audit` | **RAN** — `verdict=FAIL`, worst blocking 111ms, CLS-non-virtualized 0, 0/302 frames dropped, 0 dirty animations. First attempt was an **INSTRUMENT-ERROR** (exit 2, `--selector` clicked a bracket that did not exist on the landing surface) — retried with nav flags; the first run is not a verdict |
| 4 | `pnpm perf-meter --click` | **RAN** — `reports/perf-meter/perf-meter.json`; 4 steps, 4 breaches, worst long task 560ms |
| 5 | `lighthouse_audit` desktop + mobile (MCP) | **RAN** — snapshot mode over the LIVE docked game-room bracket (navigated via `__orb.nav.openChat` first, so this is not the landing page). A11y **100** both arms, Best-Practices 100, SEO 83. `reports/lighthouse-cbbe/`, `reports/lighthouse-cbbe-mobile/`. Blind spot recorded in Retractions |
| 6 | `__orb` suite (`.renders()`, `.shell()`, `.motion()` via motion-audit) | **RAN** — `region:context` 5 renders / 1 mount / avg 14ms on a character open (healthy); `region:content` 28 renders (pre-existing content-column churn, out of scope). `.flags()` **SKIPPED** — motion-audit's own trace superseded it |
| 7 | Console triage table | **RAN** — see below |
| 8 | The PNGs, actually looked at | **RAN** — 7 mock artboards + 11 live captures read as images, not just measured |
| 9 | Keyboard walk (`--key Tab` chain, arrows, Enter) | **RAN** — full chain with `:focus-visible` at every stop. Skip-link arm **SKIPPED** — it is shell chrome, outside the briefed scope |
| 10 | Appearance-preset arms | **RAN** — `defaults` (the baseline runs), `maximal`, `compact`, `reading`. `diagnostics` **SKIPPED** — no metadata chrome under judgment here |
| 10 | Theme arms (`--theme Light`) | **RAN** on Characters (a non-carried surface), with a framebuffer decode taken before the PNG was viewed. **Deliberately not run inside the chat/game rooms**: those carry their own themes (D44 takeover), where a theme arm is byte-identical by design. `--theme none` **SKIPPED** — the fresh-account state adds nothing to a chrome-geometry review |
| 11 | Pane-state arms | **RAN** — context collapsed (`cbbe-chat-probe.png`), context docked (1280, all three sections), context overlay (1024×768, 768×800, 430 coarse). List collapsed rides the 1024/768/430 arms. Both-hidden **SKIPPED** — with the context pane hidden there is no bracket to review |
| — | `pnpm record` (transition strip) | **SKIPPED** — motion-audit + perf-meter answered the jank question numerically (111ms blocking, 0 dropped frames, 0 CLS); no transition was in visual doubt |
| — | `snap --diff` / `--baseline` | **SKIPPED** — no committed baseline exists for a surface that landed today |
| — | Prod-build CLS arm | **SKIPPED** — CLS is 0 on every dev arm; the #836 declared-limit recipe applies to a Lighthouse mobile CLS figure, and this pass took no navigation-mode Lighthouse run |

### Console triage

| Message | Disposition |
| - | - |
| `[frame] long frame 147–192ms · blocking 88–107ms` on boot | **known** — boot commit; excluded from the verdict, and `boot-console-warnings=0` after `--checkpoint`-equivalent settling |
| `[drop] 54–134ms rendered frame mid-animation · svg[aria-label=Orbweaver] / [data-slot=weave-veil]` | **known-ruled** — the boot logo animation, pre-existing, not the bracket |
| `[perf] slow commit region:context 16–28ms (mount)` | **INVESTIGATE — folded into F10.** The context region's mount is the measurable half of the 560ms pane open |
| `[cls] shift 0.3136 / 0.3494 input-adjacent (excluded from CLS)` | **known** — the pane-open track change; `input-adjacent`, and `CLS 0.0449 (virtualized 0.0000)` is the scored number. The FLIP machinery is doing its job |
| `[cls] shift 0.0221 unexpected … CLS 0.0224` on boot | **known** — landing-surface settle, under the 0.1 budget, not the bracket |
| `[css] dead class — .base-ui-disable-scrollbar on [data-slot=scroll-area-viewport]` | **known-ruled** — Base UI's own class, pre-existing |
| `DEADCSS my-6 (×1)` in the game room | **INVESTIGATE (low).** `rg 'my-6'` across `packages/client/src` + `packages/ui/src` returns **zero** matches, so the class is not ours — it arrives from a vendored renderer or a dynamic string. Filed as a tooling curiosity, not a bracket finding |
| `console-errors` / `page-errors` / `failed-req` | **0 on every one of the ~25 runs** |

## Issue summaries (paste-ready, one paragraph per item)

**F1 — locked Map cell fails WCAG AA (P1).** The context bracket's locked cell is deliberately not
`aria-disabled` (context-rail.tsx: "a real cell wearing a lock, where mouse, keyboard and AT all get the
same answer") and is arrow-reachable and clickable, but it renders under `opacity: .6`, putting its
caption at 3.54:1 against a 4.5:1 floor while its sibling `Journal` measures 7.59:1. Because the control
is genuinely enabled, WCAG 1.4.3's disabled exemption does not apply, and the dim also tells the eye
"disabled" while the semantics say otherwise — the two-stories problem the design set out to kill.
Lighthouse/axe scored 100 over this exact state because axe does not composite ancestor opacity, so the
green is a blind spot rather than a clearance. Fix by dimming the glyph and the lock ornament rather than
the cell root, keeping the caption at or above 4.5:1.

**F2 — #861's voice half did not land (P2).** The build records that the receded rail now "wears a
quieter step of the same fill" and that "its kicker steps quieter", but a framebuffer decode of the game
room's bracket puts the receded rail at rgb(16,13,13) against a pane background of rgb(15,13,14) —
1.001:1, i.e. perceptually the same "no fill at all" condition #861 filed — while the owning rail sits at
1.045:1. The kicker step inverted rather than landed: the receded "CHAT" measures 8.25:1 and the owning
"GAME STATE" name half measures 8.03:1, so the receded kicker is still the brighter of the two (#861's
original numbers were 8.50 vs 4.97). What actually rescues the foot rail in the render is the new `pb-row`
floor and the top hairline, not the fill or the ink. Either retune the two fills and the two kicker inks
so the composited order is provable, or amend the ledger to credit the mechanism that is really doing the
work; a CT that decodes the framebuffer and asserts the ordering would stop this class recurring.

**F3 — the head band's name voice forks three ways (P2).** DESIGN.md rules "one slot, three contents"
and "the band owns the name's budget", but the chat and character bands render an `h2` at 16px/600 with a
two-line clamp while the game band renders a plain 13px/500 span with a hard ellipsis — and that span
carries the scene LOCATION, not the room's name. In a docked game room the topbar has correctly yielded
(#846) and the band exposes no heading at all, so `snap --aria` returns one flat text node and a rotor
cannot reach the room's name; at 1024 overlay the topbar's "Example — The Ashen Spire" and the band's
"The Ashen Spire — the throne hall, a fire built off the draft-line…" are both on screen and disagree.
DESIGN.md lists the Waystone as Unchanged, so this is a fork: either the game band takes the band's name
voice with the room's name as an `h2`, or the ruling's head-band naming contract is amended to exempt it.

**F4 — overlay panes print the name twice (P2).** The #846 yield in shell.css keys only on
`[data-context-mode="docked"]`, so at 430 coarse and at 1024×768 — where the pane resolves to `overlay` —
the topbar keeps the title and the band prints the identical string 45px beneath it. That is the #846
injury inverted, at the width where screen space is scarcest, and it applies to chat rooms and characters
alike. Extending the same rule to the overlay mode costs nothing: while the sheet is open it covers the
content the topbar was describing.

**F5 — the Characters pane duplicates the content hero (P2).** At 1280 with both panes docked the
portrait, name, handle, Own-look trigger, chat count and token count all render twice about 500px apart,
with a third print of the name in the content header row; `design-audit` fires `duplicate-action-door`
twice ("own look", "chats") on both the desktop and mobile arms without being asked. The mock never drew
the content column, so the collision was invisible at design time — and it is precisely the duplication
the chat room solved by making the topbar yield. The hero's identity row should stand down while the
context pane is docked, exactly as the topbar does.

**F6 — the new bands break the 11px interactive-text floor the rail refused to break (P2).**
context-rail.tsx explicitly declines to follow the mock's 10.5px captions because the readable floor
outranks the artboard, yet the two new bands shipped in the same commit pair render interactive text at
10.5px: `design-audit` reports `undersized-ui-text` on `character-context-band` and `chat-context-band` in
every arm, and on mobile the chat band's chip also measures 40×44px against the 44px short-side floor.
One commit pair, two opposite decisions on the same axis.

**F7/F8 — the reading preset and the 1024 width (P2).** At the shipped `reading` appearance preset the
game bracket spends 583 of the pane's 740px on band + rails, leaving roughly 157px of viewport, and the
five-cell meta rail overflows so that "Activity" paints as "Acti" cut at the pane edge with no ellipsis,
no scrollbar and no fade. The same overflow occurs at 1024×768 (scrollWidth 316 vs clientWidth 290 —
about half the last cell hidden). The fold is count-gated to six cells (correct, after #861's ragged
3+2) and the track degrades to a scroll (correct by ruling), but nothing answers the case where the
scroll is the only arm and it silently clips; an edge fade or a persistent thin scrollbar closes it.

**F9 — two near-identical strips stack at the phone's foot (P2).** At 430 coarse the pane's meta rail
(five icon-over-caption cells, 56px) sits directly on top of the shell's own section bar (four
icon-over-caption cells), about 150px of a 740px screen and nothing to tell them apart. The mock's phone
artboards do not draw the app bar, so this could not be seen at design time. Separate them visually, or
let the sheet extend over the app bar while it is open.

**F10 — the pane's primary navigation breaches its budgets (P2).** motion-audit returns FAIL with a
111ms blocking LoAF (budget 50ms) and 17ms of forced style/layout inside the click frame when a rail cell
is switched, and perf-meter measures the pane open at 2051ms of long tasks (worst 560ms, 350ms rAF gap)
and a 272ms Scene switch against a 200ms INP budget. Geometry is blameless — CLS-non-virtualized is 0,
0/302 frames dropped, 17 active animations all compositor-clean — so the cost is the query-backed panel
mount. Prefetching the focused-but-uncommitted cell (arrows already move focus without selecting) or
rendering the panel shell before the data would pay it down.

**Verified fixed — #846.** With the context pane collapsed the topbar prints the room name plus the
roster and recall chips; with it docked the topbar sheds all three and the band's `h2` carries the name.
The name is never absent, and while docked it has exactly one home. One gap remains: the yield does not
extend to the overlay mode (filed as F4).

**Verified fixed — #861 (structural half).** The kicker now sits on top of its cells in both rails
(chat: kicker y=717, cells y=746; game top rail: kicker y=210, cells y=238), prints "NAME · SELECTION" on
the rail that holds the view and the bare name on the one that does not, and the cell row pays a floor so
nothing ends on the pane's edge. The ragged wrap is gone: at 1024×768 the six-cell state rail folds
evenly 3+3 and the five-cell meta rail does not fold at all. The voice half is filed separately as F2.

**Verified fixed — #850 (selected-state half).** The game rail's active cell wears the ember fill
(`oklab(0.72 0.107741 0.137902 / 0.15)`) and a 2px `oklch(0.72 0.175 52)` bottom bar with foreground ink,
while resting cells keep a transparent 2px border so the state change causes no reflow. Separately, 23
`tap-target` P1s remain in the game room, all rooted at `rpg-status-tab`/`rpg-status-card` — the Status
body, the same class as #850's known 28 Game-tab targets, not introduced by the bracket and owed their
own row.

**Verified fixed — the mount-time scrollIntoView bug and the #112 rail contract.** Seeding focus on the
last focusable before the bracket in document order and pressing Tab once lands on the state rail's active
`Status` cell (`aria-current="true"`, `tabindex="0"`, `:focus-visible` true) rather than past it into the
viewport body. Arrows move focus without committing (ArrowRight to Inventory leaves `aria-current` and the
visible region on Status), Enter commits, non-active cells carry `tabindex="-1"`, the next Tab exits the
rail, and exactly one `region` panel is visible at a time. Phone floors hold too: cells are 56px at coarse
and the six-cell Characters rail fits at 430 with `scrollWidth == clientWidth` and zero clipped captions.
