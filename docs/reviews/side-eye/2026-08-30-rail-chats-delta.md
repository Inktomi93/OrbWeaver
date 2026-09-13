---
kind: review
status: draft
updated: 2026-08-30
---

# side-eye — CHATS rail DELTA sweep (2026-08-30)

**Lane:** cb-rail-chats · **Mode:** FULL battery, DELTA framing against `../../history/reviews/side-eye/2026-08-22-rail-chats.md` ·
**Stack:** live `:5173` / `:8788`, main `64447bd2a`, stack restarted 13:05 · **Principal:** every
receipt below was taken as the single dev user **Traveler** (`Playing as Traveler` in the rail, host
of every room driven). A per-user-scoped empty read here is a statement about Traveler.

**Environment premise verified BEFORE measuring:** bare `pnpm snap /` → `nav=OK · page-errors=0 ·
failed-req=0 · console-errors=0 · boot CLS 0.0221 (virtualized 0.0000)`. No server respawn was
observed mid-drive; no step was re-taken for that reason.

**Fixture:** 6 seeded rooms (`CHATS 6`), 10 characters, 1 databank document. Non-game room driven =
**Example — Midnight Run**; RPG room = **Example — The Ashen Spire** (`mode: lite`,
`extractionMode: folded`, `chat_01m18ywnq2f268dvqzbza03tz4`). This is a 6-chat corpus, not the
896-chat import the 2026-08-22 sweep drove — **every scale-dependent claim from that review is
confirmed in FORM only here, and is marked as such.**

---

## Verdict: SHIP WITH FIXES

The transcript is in materially better shape than the last sweep found. The message plate is now a
**fully opaque** surface in the shipped default (`oklch(0.21 0.012 48)`, `backdrop-filter: none`) —
the reading-surface risk that dominated the last review is designed out of the default arm, and I
have the framebuffer to prove it. The cold-open freeze (#489) is genuinely fixed. Mobile went from
"the transcript is the smallest thing on screen" to 59% of the viewport. Keyboard traversal through
the transcript, the per-row action cluster, the dice strip and the composer is `fv=true` at every
stop.

Five things should not ship as-is, and one of them is structural: **in an RPG room the context-panel
tab strip stops being a tablist and moves 700px down the panel.**

**Design health: 27/40 — "mid" band.** Calibration only; the band gates nothing. The finding list is
the deliverable.

---

## Per-area verdicts

| Area | Verdict |
| - | - |
| Chats landing (list pane + empty CONTENT) | **PASS** — census honest under filter, search-empty state exemplary, "Skip to chats" now exists. Top-heavy chrome is a standing taste call. |
| Non-game room — transcript reading surface | **PASS, strongest area** — opaque plate, 62ch across every arm/pane-state, contrast 11–16:1 |
| Non-game room — composer + message actions | **PASS** — semantic groups, named controls, 48×48 coarse targets, full keyboard path |
| Context panel — Members (incl. B10 "Add cast…") | **SHIP WITH FIXES** — two confusable adjacent add-doors; picker empty state good |
| Context panel — This chat (rules/injections/#821) | **SHIP WITH FIXES** — sections and glosses read well; the injection preview clamp is broken |
| Context panel — Game (RPG) | **DO NOT SHIP AS-IS** — tablist semantics lost, strip relocated, 18–22px targets |
| RPG room transcript + dice strip | **PASS** — colorized dialogue 10.95:1, dice chips keyboard-reachable and named |
| New-chat picker | **PASS with a P3** — doubled accessible name on the primary button |
| Responsive 430 / 768 / 1280 / 1920 | **PASS except one** — measure and overflow hold everywhere; the room header truncates at 1280 with both panes docked |

---

## Design-health score (Nielsen, 0–4)

| # | Heuristic | Score | Key issue |
| - | - | - | - |
| 1 | Visibility of system status | 3 | census is honest under filter now (`0 of 6`); RPG tab selection is carried by accent fill alone, not `aria-selected` |
| 2 | Match system ↔ real world | 2 | "Add cast…" opens a dialog titled "Saved casts"; `›` means "generate a variant"; "RUN Roll d20" is doubled verb |
| 3 | User control & freedom | 3 | search + month both clear now; Esc closes dialogs; no regressions found |
| 4 | Consistency & standards | 1 | the SAME five context tabs are `tablist`/`tab`/`aria-selected` at the panel TOP in a normal room and plain buttons in a `toolbar` at the panel FOOT in an RPG room |
| 5 | Error prevention | 3 | save gated on a name; nothing destructive reachable un-confirmed. Not stress-tested — read-only discipline, no sends |
| 6 | Recognition over recall | 2 | the single-variant `›` chevron carries no visible label at all; `Map 🔒` still unexplained; `Talks 50` still unitless to a sighted user while the accname says "talks at level 50 of 100" |
| 7 | Flexibility & efficiency | 4 | ⌘K, month anchor, character chips, roving transcript, per-row Tab cluster, "Skip to chats" — genuinely strong |
| 8 | Aesthetic & minimalist | 3 | ~240px of list-pane chrome above the first of 6 rows; the RPG context panel stacks a stat header + 5 dials + a 6-item strip + host console + stat editor + a nav strip |
| 9 | Error recovery | 4 | search-empty quotes the query verbatim and offers a working reset |
| 10 | Help & documentation | 2 | the This-chat tab's per-section glosses are excellent and route the user onward ("Presets → Prompt / Macros"); the room itself still explains nothing |

---

## Findings

### \[P1] The context-panel tab strip loses tablist semantics AND relocates in an RPG room

**What.** The same five controls, the same `aside[aria-label="Chats details"]`, two rooms, measured
back to back at 1280×800:

| | Example — Midnight Run (non-game) | Example — The Ashen Spire (RPG) |
| - | - | - |
| container | `role=tablist` · `aria-label="Detail"` | `role=toolbar` · `aria-label="Chat"` |
| y | **56** (panel head) | **754** (panel foot) |
| control role | `tab` | none — plain `<button>` |
| `aria-selected` | `"true"` / `"false"` per tab | **absent on all five** |

`snap --aria 'aside[aria-label="Chats details"]'` in the RPG room returns no `tablist` node at all —
the Members content renders as a bare `region "Members"` under `toolbar "Game state"`.

**Why it hurts a user.** Two separate injuries. **Sam:** in an RPG room a screen-reader user is never
told which detail view is current (the selection is carried only by the accent fill — meaning by
colour alone, §9) and cannot arrow between the views; #208 closed on "real tablist semantics" and
that fix does not hold in the room type where the panel is most complex. **Everyone:** a user who
clicks "Game" at y=79 and then wants "Members" has to find the strip 700px lower. §7-4, and §14 —
the shell's geography is invariant; a section must not re-home its own navigation.

**Fix.** `harden`: render ONE tab strip implementation for the context panel in both room types —
`role=tablist` + `role=tab` + `aria-selected`, at a single fixed position. If the RPG surface needs
the foot position, move BOTH; do not fork by room type. Receipt: the table above with identical rows.

**Receipt.** `scratchpad/cbrc-24.log` (RPG: role null, `aria-selected` null, y=754, chain
`toolbar[Chat]>DIV>DIV>DIV`) · `cbrc-25.log` (non-RPG: role `tab`, `aria-selected` `true`/`false`,
y=56, chain `tablist[Detail]>DIV>DIV`) · `reports/snaps/cbrc-ctx-members.png` ·
`reports/snaps/cbrc-rpg-gametab.png`.

---

### \[P2] The room header title truncates to 58% at 1280 with both panes docked

**What.** Measured on `p[data-slot=text].text-title` carrying the room name:

| viewport | panes | rendered width | natural width | shown |
| - | - | - | - | - |
| 1280×800 | list docked + context docked | **116px** | 201px | **"Example — …"** |
| 1280×800 | list collapsed + context docked | 201px | 201px | full |
| 1280×800 | list docked + context collapsed | 201px | 201px | full |
| 1920 | list docked + context docked | 201px | 201px | full |
| 768 | both auto-collapsed | full | — | full |

Every seeded room is named `Example — <something>`, so in the failing state the header renders the
one part of the title that is **identical across all six rooms**. The `title` attribute is set, so a
hover recovers it; nothing else does.

**Why it hurts a user.** 1280 with both panes docked is an ordinary laptop working state, and the
CONTENT header is the only place the room is named. It fails exactly when the user has opened the
detail panel — i.e. when they are configuring the room they can no longer identify.

**Fix.** `layout`: the title is being squeezed because the topbar's global trailing cluster (⌘K jump,
notifications, focus mode, panel toggle — ~200px) shares the CONTENT header's row. Let the title take
the slack, or move the global chrome into the shell topbar's own trailing region so it does not
compete with the artifact's name. Receipt: `titleW == scrollW` at 1280 in all four pane states.

**Receipt.** `scratchpad/cbrc-trunc.log` (`{list:docked, ctx:docked, vw:1280, titleW:116,
natural:201, truncatedPct:58}`) · `cbrc-trunc2.log` (vw:1920 → 100%) · `cbrc-panes.log` (the two
non-truncating pane states) · crop `reports/snaps/cbrc-header-trunc-crop.png`.

---

### \[P2] The injection preview's line-clamp is inert — the second line is guillotined mid-glyph

**What.** `[role=tabpanel] "This chat" → INJECTIONS → Injection 2` preview paragraph, computed:

```
-webkit-line-clamp: 1        (a clamp requires display:-webkit-box)
display:            flow-root ← overrides it; the clamp never engages
-webkit-box-orient: vertical
overflow:           hidden
text-overflow:      clip
height:             25px      scrollHeight: 38px      line-height: 13.125px
```

25px of box over 38px of content = **1.9 lines**, so line 2 renders and is then sliced horizontally
through its own x-height with no ellipsis. The rendered crop shows an ellipsis at the end of line 1
*and* a half-cut line 2 beneath it — text mutilated in two contradictory ways at once. Injection 1
(shorter body) does not clip, so the defect only shows on longer values.

**Why it hurts a user.** This is visible text damage on a shipped surface, and the preview exists
precisely so the user can identify an injection without expanding it. It also makes the panel's
height non-deterministic per row, which is adjacent to the #830 height work.

**Fix.** `polish`: give the preview the clamp the design system owns (`Text` `lines` variant, or a
`line-clamp-*` on an element whose `display` is not overridden). Sites:
`packages/client/src/features/chat/components/injections-manager.tsx:200`
(`<Text voice="gloss" className="line-clamp-1 px-block pb-block">`) and the same spelling at
`packages/client/src/features/chat/components/room-overrides-form.tsx:100`. Note the `Text`
primitive's own header (`packages/ui/src/primitives/text/variants.ts:162-181`) already says a lone
clamp "stays a `line-clamp-*` className" — the className is present and losing to `display`.
Receipt: `scrollHeight === clientHeight` on both injection previews, ellipsis on the last rendered
line only.

**Receipt.** `scratchpad/cbrc-12.log` (computed block above) · `cbrc-13.log` (census: Injection 2
`clipped:true`, h 25 vs sh 38; Injection 1 `clipped:false`) · crop
`reports/snaps/cbrc-inj-crop-crop.png`. Chat LIST row previews were checked and are **fine** —
they use `truncate`/`display:block`, not a clamp (`cbrc-15.log`).

---

### \[P2] The CAST header offers two confusable add-doors, 4px apart, one of them unlabelled

**What.** In `group "Cast"`, measured at 1280 and at 430 coarse:

| control | desktop box | mobile box | accessible name | what it does |
| - | - | - | - | - |
| "Add cast…" | 108×32 @ x=1126 | 108×44 @ x=262 | `Add cast…` | opens a dialog titled **"Saved casts"** |
| person-plus glyph | 34×34 @ x=1238 | 48×48 @ x=374 | `Add a character` | adds one character |

Gap between them: **4px**. Both are person-glyph affordances in the same header row. Tap targets pass
the coarse floor on both (#810–#813 hold).

**Why it hurts a user.** §13 IA lens. The #490-8 fix established "exactly ONE add-character door";
B10 landed a second, near-synonymous door beside it. A first-timer cannot predict which is which —
and the labelled one's verb ("Add cast…") does not match its destination's noun ("Saved casts"),
which is the one clue available. Note this is a **judgment call, not a detector hit**: design-audit's
`duplicate-action-door` correctly does NOT fire, because they are genuinely different actions.

**Fix.** `clarify` + `distill`: name the door for its destination ("Saved casts…" / "Cast presets…"),
and either give the glyph a visible label or fold "add one character" into the same dialog as its
first option. Receipt: a cold-read screenshot where the two doors are distinguishable without hover.

**Receipt.** `scratchpad/cbrc-09.log` (both boxes) · `cbrc-mobmem.log` (mobile boxes) ·
`reports/snaps/cbrc-ctx-members.png` · `reports/snaps/cbrc-members-mobile.png` ·
`reports/snaps/cbrc-addcast.png` (the "Saved casts" dialog).

---

### \[P2] The variant control degrades to a bare unlabelled chevron in a single-variant room

**What.** In every room whose last assistant message has ONE variant — which is every fresh room —
the variant strip renders as a single `button "Generate a variant"`: **34×34, transparent
background, empty `textContent`, and an empty parent `textContent`** (no "Variant" kicker, no
`N / N` count). It floats over the raw background art in the gap between the transcript plate and
the composer at every viewport (1280: 995,629 · 768: 618,814 · 430: 388,492).

The #490-2 fix ("Variant" kicker + count, verified in `../../history/reviews/side-eye/2026-08-22-verify-chat-char-fixes.md` §2) is
real — but it only applies to the multi-variant strip. The single-variant case was never covered.

**Why it hurts a user.** §7-6. A right-pointing chevron on a floating chip universally means "next" —
here it means "generate another version of this reply", an action that costs a model call. There is
no visible text of any kind. A cold first-timer's most likely reading is "next page", and the actual
consequence is a generation. It is the only affordance in the app I found whose visible label is the
empty string.

**Fix.** `clarify`: give the single-variant state the same visible micro-label treatment as the
multi-variant strip ("Variant 1 / 1" + the generate action), or swap the chevron for a glyph that
means *generate* (the composer's wand/refresh vocabulary already exists 40px below it). Receipt: a
430/768/1280 shot in which the control's purpose is readable without hover.

**Receipt.** `scratchpad/cbrc-03.log` (`{label:"Generate a variant", text:"", box:[995,629,34,34],
bg:"rgba(0,0,0,0)", parentText:""}`) · `reports/snaps/cbrc-room-midnight.png` ·
`cbrc-room-mobile.png` · `cbrc-room-768.png`.

---

### \[P2] RPG stat-profile and trackers rows are 18–22px interactive targets

**What.** `design-audit / --goto chats --open-chat "Example — The Ashen Spire" --context-tab Game`
returns **28 × P1 `tap-target`** at `pointer=fine` across `[data-slot=rpg-stat-profile]`,
`[data-slot=rpg-trackers-editor]` and `[data-slot=rpg-game-tab]` — short sides of **22px, 18px and
12px** against the 24px fine-pointer floor.

Corroborated with a four-cardinal `elementFromPoint` probe rather than box math, per the standing FP
discipline: e.g. `button "Strength hint"` (312×18) and `button "Attribute 1 label"` (271×18) own
their centre point and only **2 of 4** edge offsets. These are real inline-edit affordances, not the
known slider-thumb-in-a-wide-track FP class (#281) and not Base UI's hidden 1×1 inputs.

**Why it hurts.** Casey and anyone with imprecise pointing: an 18px-tall click target that also holds
editable text is a miss-and-lose-your-place control. The stat profile is host-console editing, so the
cost of a mis-click is a wrong edit, not just a wasted click.

**Fix.** `polish` + `adapt`: raise the stat/tracker row hit areas to the 24px fine floor (the
pointer-conditional `::after` recipe in `packages/ui/src/primitives/button/variants.ts:16-20,76-82`
already exists for exactly this). Receipt: `design-audit … --context-tab Game` at zero P1
tap-targets, and the same at `--mobile`.

**Receipt.** `scratchpad/cbrc-da-rpg.log` (28 rows, `pointer=fine`) · `cbrc-19.log` (four-cardinal
hit-test) · `reports/snaps/cbrc-rpg-gametab.png`.

---

### \[P3] The new-chat picker's primary button has a doubled accessible name

**What.** `--map '[role=dialog]'` on the New chat dialog returns
`button "Pick a characterPick a character to start"` — an sr-only "Pick a character" concatenated
with the visible "Pick a character to start". It is also the **only `[dom]` fallback selector** in
that dialog (the other 15 controls resolve semantically), i.e. the one control with no stable
accessible identity.

**Why it hurts.** Sam hears the instruction twice. `map-dom-fallbacks` > 0 is itself the a11y smell
the map exists to surface.

**Fix.** `clarify`: drop the sr-only duplicate; the visible text already names the state.

**Receipt.** `scratchpad/cbrc-newchat.log` (MAP, 16 elements, 1 DOM fallback) ·
`reports/snaps/cbrc-newchat.png`.

---

### \[P3] The `reading` appearance preset ships justified body text with no hyphenation

**What.** `design-audit --appearance-preset reading` on the room returns **44 × P3 `justified-text`**
("justified text without hyphenation creates rivers of white") on `message-bubble`,
`message-row-body` and `message-content-column`. Zero in the default, `compact`, `maximal` and
`diagnostics` arms — the preset turns on `data-justify-body-text`.

**Why it hurts.** The one appearance profile named for reading is the one that degrades the reading
surface's word spacing, at 21.6px type where the rivers are widest.

**Fix.** `typeset`: pair the justify setting with `hyphens: auto` at the same site, or drop justify.
Receipt: `design-audit --appearance-preset reading` clean of `justified-text`.

**Receipt.** `scratchpad/cbrc-da-reading.log` (`findings=45 p3=45`, rule census: 44 `justified-text`

- 1 `flat-type-hierarchy`).

---

### \[P3] `+8 More` face-filter button's accessible name omits its visible count

**What.** Lighthouse `label-content-name-mismatch` (the ONE failing audit, desktop and mobile):
visible label `+8\n\nMore`, accessible name `More — Filter by another character`. The other 9 nodes
in that audit are the chat list rows — the known, previously-ruled false positive (accname is the
title, subtitle/meta ride `aria-describedby`) and are **not re-filed**.

**Fix.** `clarify`: `aria-label="8 more — filter by another character"`.

**Receipt.** `reports/lighthouse-cbrc-desktop/report.json` audit
`label-content-name-mismatch`, item 0 snippet.

---

### \[P3] One 151ms long task remains on the cold room open (#489 residue)

**What.** `perf-meter --cycles 3`: cycle 1 = 267ms of long tasks, worst **151ms**, click duration
32ms, input delay 2ms, worst rAF gap 133ms. Cycles 2–3 = **zero** long tasks, 33ms rAF gap.
`motion-audit` (4× CPU): 1 LoAF, 143ms blocking, attributed to `ViewTransitionCallback` in
`packages/client/src/lib/view-transition.ts` (186ms script + 14ms forced style/layout). CLS raw /
virtualized / non-virtualized all **0**.

Against the 2026-08-22 baseline (same tools): worst blocking **579ms → 143ms**, long tasks
**596ms → 267ms**, click duration **248ms → 32ms**, dropped frames 42.86% → 88.98% *(headless,
advisory only — not read as a verdict either time)*. `__orb.renders()` still shows
`chat:transcript` 1 mount + 11 updates / 330ms over an open-plus-panel window.

**Fix.** `optimize`: the remaining cost is inside the view-transition callback. Receipt: worst
blocking ≤50ms at 4× on a cold open.

**Receipt.** `scratchpad/cbrc-perf.log` · `cbrc-motion.log` · `cbrc-orb.log` ·
`reports/perf-meter/perf-meter.json`.

---

### \[P3] Dead vendor class `.base-ui-disable-scrollbar`

`[css] dead class — no rule defines it, so the style never applied · .base-ui-disable-scrollbar on [data-slot=scroll-area-viewport] · route /`. Vendor-emitted; harmless but it is noise in every room
console. Receipt: `reports/snaps/cbrc-console.json`.

---

### \[INSTRUMENT] design-audit `duplicate-action-door` false-positives on repeated list-row actions at coarse pointer

**What.** `design-audit --mobile` on the room reports P3 `duplicate-action-door` —
*"the same action is offered from 2 structurally distinct places on one plane (2x button 'more
message actions')"*. Measured: there are **three** such buttons, each the action cluster of a
**different message row** (`chain: button > message-actions-row > message-actions-slot >
message-name-row`, three distinct hosts). At coarse pointer the reveal cluster is always-visible, so
every rendered row's actions land "on one plane" and the rule fires. It does not fire on desktop,
where only the hovered row's cluster is visible.

**Why it matters.** Per-row repeated actions in a list are the correct pattern, not a duplicate door.
The rule as written will fire on every virtualized list in the app at `--mobile`, which is where the
tap-target and duplicate-door lenses are most load-bearing — a rule that cries wolf there gets
ignored there. Filed per the standing "fix tools as we find them lying" rule; P2 as an instrument
row regardless of the P3 surface severity.

**Fix.** Exclude candidates whose differing ancestors are sibling rows of the same list/virtualizer
(the walker already emits ancestor paths — the three hosts share the identical
`message-name-row` shape at different indices).

**Receipt.** `scratchpad/cbrc-da-mobile.log` (the finding) · `cbrc-07.log` (three buttons, three
distinct `message-name-row` hosts at y=-929 / -884 / 93).

---

## ARIA-navigability

**What is already right — do not "fix" these:**

- Transcript structure is correct and rich: `log "Conversation messages" → list → listitem →
  article "<speaker>"`, per-message `button "Edit message" / "Fork chat here" / "Add a reaction" /
  "More message actions"`. The hover-reveal is **opacity-based in reserved geometry**
  (`parentOpacity: "0"`, `display: flex`, `visibility: visible`) — not a display swap, so it is
  immune to the hover-oscillation class and the controls stay in the a11y tree at rest.
- **Every collapsible trigger now carries `tabindex="0"`** — the 2026-08-22 P1 (`tabindex="-1"` on
  the enabled tool-call disclosure) is **fixed**.
- Keyboard walk from page top in the RPG room, `fv=true` at all 15 stops:
  `LI (message row) → Edit message → Fork chat here → Add a reaction → More message actions →
  Generate a variant → Run Roll d20 → Run Roll d6 → Run Roll 2d6 → Run Roll d100 → Chat options →
  Draft your line → Try another reply → Generate reply → …`
- Cast rows expose `Mute <name>` / `Make <name> speak next` / `Talkativeness: <name> — talks at
  level 50 of 100` — the `%`-that-summed-to-150 defect is gone (#490-9).
- Topbar controls all named: `Hide list panel`, `Members — 3`, `Memory — idle`,
  `⌘K jump — the command menu`, `Notifications`, `Enter focus mode`, `Show detail panel`.
- `map-dom-fallbacks=0` on every room/panel map except the new-chat dialog (1) and the RPG Cast
  group (1).
- Lighthouse **a11y 100 / best-practices 100 / SEO 100 / agentic 100**, desktop and mobile.

**Concrete fixes owed:**

| Element | Problem | Exact fix |
| - | - | - |
| RPG context tab strip (`toolbar[aria-label="Chat"]`) | five plain `<button>`s, no `role=tab`, no `aria-selected`; current view signalled by accent fill only | render the same `role=tablist`/`role=tab`/`aria-selected` markup the non-RPG room uses |
| `button "Pick a characterPick a character to start"` (new-chat dialog) | doubled accname from an sr-only span; only `[dom]`-fallback control in the dialog | drop the sr-only duplicate |
| `button "More — Filter by another character"` | visible `+8 More`, accname omits `8` | `aria-label="8 more — filter by another character"` |
| `button "Add a character"` (Cast header glyph) | icon-only, 4px from a labelled sibling with a near-synonymous purpose | visible label, or fold into the "Saved casts" dialog |
| `button "Generate a variant"` | empty `textContent` AND empty parent text — no visible label at all | visible micro-label, keep the accname |
| `group "Cast"` (RPG room) | resolves only by DOM path in `--map` (1 fallback) | give it a unique accessible identity |

---

## Taste & flow verdict

**The room looks good, and this time the instruments agree.** The transcript is the best surface in
the app: warm per-speaker colorisation, italic narration that is genuinely distinguishable from
dialogue at a glance, 62 characters of well-led prose, and a plate that reads as a lit page floating
on the scene rather than as a box. The art does what the house law asks — it lives in the gutters,
the top band and the right bleed (`[data-slot=art-bleed]` is a real `linear-gradient(to left, …)`
mask, not a wash), and it stops at the reading surface.

**My eye called that wrong on first look and the framebuffer corrected it** — see Retraction 1. That
reconciliation is the most valuable line in this review, and it runs the opposite direction from the
last sweep's: there, the instrument invented a failure the eye had forgiven; here, the eye invented a
failure the instrument disproved. Both times the lesson is the same — decode, don't squint.

**The list pane is still top-heavy, and at 6 chats it is comic.** From the top of the pane to the
first chat row is roughly **240px** — a header band, a three-avatar character filter with a `+8 More`
tile, a search field, a "Show chats from" label and a bare native month input — 30% of an 800px
viewport of furniture, above six rows. The filters still have no shared home and no single statement
of what is currently narrowing the list. This is unchanged from 2026-08-22 and it is a taste call,
not a defect; I am re-stating it because the proportion got worse as the corpus got smaller, which is
the tell that the chrome is fixed-cost rather than content-scaled.

**The RPG context panel is the densest thing in the app and it is fighting itself.** In one 384px
column: a two-line truncated scene header, a "Last recorded beat" chip, five stat dials (one of which,
SILVER MARKS, has no denominator while its four neighbours do), a six-item GAME STATE strip **with no
visible selected state and a `Map 🔒` nobody explains**, a "HOST CONSOLE — HOST ONLY" band, a
scrolling stat-profile editor, and then a five-item nav strip at the foot. The working-memory count
at rest is far past four. Both of the 2026-08-22 complaints about this panel — no selection state on
the GAME STATE strip, and two navigation strips stacked in one column — are **unchanged**, and the
tab-strip relocation (P1) makes the second one worse rather than better.

**Does a cold first-timer know what to do?** On the landing, yes — "No chat selected / Pick a thread
from your chats, or start a new one" with one primary button is honest and well-composed. In the
room, mostly: the composer's transport glyph trio is still only decodable by hover, and the floating
`›` is genuinely unreadable. In the "Saved casts" dialog, **the hierarchy is inverted**: the empty
state's emphasised CTA is "Start a new chat" — which abandons the room you opened it from — while the
thing you can actually do here, "Save current cast", is a dim ghost button below a name field, with
no hint that typing a name is what enables it.

**One home per concept.** Two live violations, both new since the last sweep: the CAST header's two
add-doors (P2 above), and the context-panel tab strip having two different homes depending on room
type (P1). The 2026-08-22 "add a character offered twice simultaneously" finding is **fixed** — the
cast-bar twin is gone and only the CONTEXT door remains, plus B10's new sibling.

**Minor rhythm note.** At 1280 the room column has three left edges: cast bar and scroller at
x=340, composer textarea at x=347, message plate at x=380. The 40px plate indent is the avatar
gutter and reads deliberately; the 7px composer offset does not.

---

## What is genuinely working — do not touch

1. **The message plate is opaque in the shipped default, and it is the right call.**
   `[data-slot=message-bubble]` computes `oklch(0.21 0.012 48)`, `opacity: 1`,
   `backdrop-filter: none`, no mask. The framebuffer agrees with zero ambiguity: across the whole
   reading column the non-glyph population on **every** text row is the single value `24,23,30`
   (555 px, 1 distinct value) — the art contributes literally nothing to the reading backdrop.
   `snap --contrast --contrast-pixel`: body **15.90:1**, dialogue **11.04:1**.
2. **The reading measure and overflow hold across every arm.** 62ch at owner default / maximal /
   diagnostics / reading (at 21.6px) · 63ch compact · 62ch at 768 · 62ch in all three pane states ·
   `--expect-no-overflow` PASS (all four sides judged, 0 escapes) on every one of ~14 runs, at 430,
   768, 1280 and 1920, in dark and Light, and under reduced motion.
3. **The cold-open fix (#489) is real.** Click duration 248ms → **32ms**, input delay **2ms**, long
   tasks 596ms → 267ms, worst blocking 579ms → **143ms** at 4× CPU, and cycles 2–3 have **zero** long
   tasks. CLS 0 across raw, virtualized and non-virtualized.
4. **Mobile is a different product than the last sweep described.** Cast bar 3 rows/115px → **1 row /
   40px**; transcript ~110px → **436px of a 740px viewport (59%)**; composer icon row on one line;
   message actions 48×48; `design-audit --mobile` returns **zero** tap-target findings on the
   non-game room.
5. **The search-empty state.** `CHATS 0 of 6` · icon · "No matches" · `No chat matches "zzzqqqxx".` ·
   a working "Clear search". §5 done properly, and the census stays honest under the filter.
6. **Reduced motion is implemented correctly** — `transition-property: none` under the media query
   (measured `none` vs `scale`/`all`), which is the post-#257 mechanism, not the duration clamp.

---

## The single biggest opportunity

**Make the context panel one surface.** Everything expensive in this review lives there: the tab
strip forks by room type (P1), the title it sits beside gets crushed at 1280 (P2), the CAST header
grew a confusable second door (P2), the injection preview clips (P2), and the RPG arm stacks two
navigation strips and 28 sub-floor targets in 384px. One panel chrome — one tab strip, one position,
one set of semantics, one header that owns the artifact's name — would close a P1, two P2s and most
of the taste complaints in a single pass, and it is the only change here that gets cheaper the sooner
it happens: every new context tab (Rules, Plugin panels, Game) currently pays the fork again.

---

## Retractions — five, all mine, all from this run

1. **"Art bleeds through the transcript prose."** My first look at `cbrc-room-midnight.png` read the
   shop awning as showing through the paragraph, and I nearly filed the §0 reading-surface family
   again. **Wrong.** The plate is computed opaque AND the framebuffer proves it: row 350, x 480→1035,
   **1 distinct RGB value** (`24,23,30`) across 555 pixels; every text row's non-glyph population is
   the flat 0.0090 luminance. What I saw was art *beside* the plate (x<478 and x>1035), mis-localised
   by eye. The eye is not a colorimeter — including mine.
2. **"Non-virtualized CLS 0.336 on opening the detail panel."** `__orb.motion()` after an
   `--open-chat … --context-tab Members` chain reported `cls 0.3699 / nonVirtualized 0.3364`.
   **That was my instrument, not the app.** `--context-tab` drives a store action through the dev
   bridge, so the resulting shift never gets `hadRecentInput`. Re-run with a REAL
   `--click '[aria-label="Show detail panel"]'`: every shift carries `hadRecentInput: true`, and
   `cls / nonVirtualized / virtualized` are all **0**, worst blocking 19ms. (`cls-recent-input-window-is-a-race`
   named this exact trap; I walked into it anyway.)
3. **"Reduced motion does not fire — `transition-duration` is 0.13s under `reduce`."** **Wrong
   lens.** #257 / `503fe3c64` deliberately replaced the duration clamp with
   `transition-property: none !important` (the duration clamp was arming `transition: all` and
   minting 1,063 bogus `scrollbar-color` transitionstarts per room open). Measured properly:
   `transitionProperty` is `none` under `reduce` and `scale`/`all` without it. The ruling stands and
   my finding was void. Also void: my note that `data-reduced-motion` is absent from `.shell-grid` —
   it is not the mechanism.
4. **Every scanline contrast number my own decoder produced is void.** A "worst backdrop under text"
   estimator I wrote for this run reported **1.97:1** and *"159 of 173 rows below 4.5:1"* on the
   **provably uniform, provably opaque** default plate — because antialiased glyph edges sweep
   through every luminance between plate and glyph, so a p99-of-the-dark-population lands on a glyph
   edge, not on the plate. Its planted negative control (raw art, no text) correctly REFUSED, which
   is the only reason I caught it. **Do not quote any per-scanline ratio from this review.** The
   numbers that stand are `snap --contrast --contrast-pixel` (a committed instrument with its own
   pinned control) and the zero-variance flat-backdrop finding, which is a *shape* claim, not a ratio.
5. **"Two `role=group`s are named `_r_c8_` / `_r_c9_`."** I read `aria-labelledby` **ID values** as
   accessible names in an ad-hoc eval. The ARIA tree shows the real names are `People` and `Cast`.
   No finding. (`aria-label-attribute-is-not-the-accname` — the same lesson, one attribute over.)

---

## Prior-sweep items re-checked (2026-08-22 → today)

| 2026-08-22 finding | Status today | Receipt |
| - | - | - |
| P1 dialogue over art with a defeatable scrim | **DESIGNED OUT of the default** — plate now opaque, `backdrop-filter: none` | flat-backdrop decode + `--contrast-pixel` 15.90/11.04 |
| P1 tool-call disclosure keyboard-unreachable (`tabindex="-1"`) | **FIXED** | every `[data-slot=collapsible-trigger]` has `tabindex="0"` (`cbrc-26.log`) |
| P1 first chat open blocks 579ms | **FIXED** (#489) — 143ms at 4×, 32ms click, cycles 2–3 clean | `cbrc-perf.log`, `cbrc-motion.log` |
| P2 search has no clear affordance | **FIXED** (#490-1) | `0 of 6` + "Clear search" (`cbrc-empty.log`) |
| P2 variant strip reads as pagination | **FIXED for multi-variant** (#490-2); **NOT covered for single-variant** → new P2 above | `cbrc-03.log` |
| P2 list count lies under filtering | **FIXED** (#490-3) — `0 of 6` | `cbrc-empty.log` |
| P2 "Jump to month" re-roots | **RENAMED** to "Show chats from" (#490-4); re-root behaviour not re-tested (6-row corpus can't reproduce it) | `cbrc-01.log` map |
| P2 mobile transcript ~35% of screen | **FIXED** — 59%, cast bar 1 row | `cbrc-07.log`, `cbrc-room-mobile.png` |
| P2 ArrowRight from in-row action drops focus to `<body>` | **not re-tested** — Tab path verified clean at 15 stops; arrow-key arm not driven this run | — |
| P2 inline `<code>` renders 3 dead Tailwind classes | **FIXED** — `deadcss=0` on every room run | RESULT lines |
| P2 "add a character" has two doors | **FIXED** as filed (cast-bar twin gone); **B10 introduced a new confusable pair** → new P2 | `cbrc-09.log` |
| P2 "Talks 50%" 10.5px / sums to 150% | **FIXED** (#490-9) — no `%`, accname "talks at level 50 of 100" | ARIA tree |
| P3 flat type hierarchy | **UNCHANGED** — still P3 on every arm (10.5/13/15/16px, ratio 1.5:1) | every design-audit run |
| P3 "Jump to month" is a bare native `<input type=month>` | **UNCHANGED** — still renders `--------- ----` (#522 ruled the native control stays) | `cbrc-landing.png` |
| P3 skip link reaches CONTENT, never LIST | **FIXED** — `button "Skip to chats"` present | `cbrc-01.log` map |
| P3 landing fires a redundant `chat.listChats {limit:1}` | **UNCHANGED** — boot still fires `{limit:8}`, `{limit:1}`, `{limit:30}`, `{limit:30,forward}` | `cbrc-01.log` console |
| GAME STATE strip has no visible selection; `Map 🔒` unexplained | **UNCHANGED** | `cbrc-rpg-gametab.png` |
| two nav strips stacked in the context panel | **UNCHANGED, and worse** — see P1 | `cbrc-24.log` |

Already-open rows observed and **not re-filed**: **#830** (This-chat tab settles tall — measured
3,949px scrollHeight in a 679px pane at 384px width today, injections expanded), **#824** (Collapsible
height animation, owner decision), **#818** (plugin per-anchor CTA). The #821/#822/#823/#829 fixes are
visibly landed — field-override and injection rows are collapsed, section kickers carry counts, and
today's `2026-08-30-this-chat-cls-verify.md` owns that verdict; I did not re-measure its CLS.

---

## Instrument coverage

| # | Instrument | Status |
| - | - | - |
| 1 | `snap --map` | **RAN** — chats landing `aside` (18), message list (4), details panel (21), New-chat dialog (16), Saved-casts dialog (4), `header` (2). `map-dom-fallbacks=0` except the New-chat dialog (1) and the RPG Cast group (1) |
| 1 | `snap --contrast` (+ `--contrast-pixel`) | **RAN** — prose 15.90:1 · dialogue 11.04:1 (default), 13.50/11.83 (reading), 15.93/10.95 (maximal), 15.90/11.04 (Light) · cast bar 16.50:1 · composer 8.53:1 · chat header 8.34:1 · Light landing: title 14.82:1, subtitle 7.01:1, search 4.99:1. **All PASS**, `contrast-fails=0` on every run |
| 1 | `snap --aria` | **RAN** — transcript (59 lines), details panel non-RPG (29 lines), details panel RPG (41 lines), Saved-casts dialog |
| 1 | `snap --expect-*` | **RAN** — `--expect-no-overflow` PASS (4 sides, 0 escapes) on ~14 runs across 430/768/1280/1920, 5 appearance arms, Light, reduced-motion, 3 pane states, 2 dialogs |
| 1 | `snap --matrix` | **SKIPPED** — superseded by explicit arms (4 viewports × 5 appearance presets × 2 themes × 3 pane states × reduced-motion), each with its own receipt |
| 1 | `snap --json` | **RAN** — `reports/snaps/cbrc-console.json` for the lossless console census |
| 1 | `snap --checkpoint` | **RAN** — boot window split out (6 boot warnings excluded from the interaction verdict) |
| 1 | `snap --watch` | **SKIPPED** — no streaming turn was driven (see live-model row) |
| 1 | `snap --scenario` | **SKIPPED** — argv-ordered step chains in single calls covered every multi-step flow driven |
| 2 | `design-audit <route>` desktop | **RAN** ×4 — non-game room (1×P3) · non-game room + panel open (1×P3) · RPG room + Game tab (**28×P1, 10×P3**) · reading arm (45×P3) |
| 2 | `design-audit --mobile` | **RAN** — non-game room: 2×P3, `pointer=coarse`, **zero tap-target findings**; one `duplicate-action-door` FP filed as an instrument row |
| 3 | `motion-audit` | **RAN** — cold chat open at 4× CPU: 1 LoAF / 143ms blocking / CLS 0 raw+virt+non-virt / `dirty-animations=0`. Verdict FAIL on blocking; dropped-frame 88.98% headless is **advisory and not read as a verdict** |
| 4 | `perf-meter --click` | **RAN** — `--cycles 3`, `breach-steps=3 worst-longtask=151ms worst-click=56ms`, cold-only |
| 5 | Lighthouse desktop | **RAN** — `reports/lighthouse-cbrc-desktop/` — a11y 100, BP 100, SEO 100, agentic 100; 37 passed / 1 failed |
| 5 | Lighthouse mobile | **RAN** — `reports/lighthouse-cbrc-mobile/` — identical scores and identical single failure. **Caveat stated:** snapshot mode reported the desktop viewport for both, so this arm is a duplicate; the real coarse-pointer receipt is `design-audit --mobile` |
| 6 | `__orb.renders()` | **RAN** — `region:content` 21 updates/366ms · `chat:transcript` 1 mount + 11 updates/330ms · `region:context` 1 mount + 5 updates/30ms · `region:list` 3/2ms |
| 6 | `__orb.motion()` | **RAN** — twice, and the first read RETRACTED (see Retraction 2). Real-click arm: CLS 0/0/0, worst blocking 19ms |
| 6 | `__orb.animations()` | **RAN** — `[]` (0 active, so 0 compositor-dirty); corroborated by `motion-audit dirty-animations=0` |
| 6 | `__orb.rpg()` / `.shell()` | **RAN** — game mode `lite`, `extractionMode: folded`, delivery `tool-round`/`local-engine-fold-guard`; shell pane modes read at every arm |
| 7 | Console triage | **RAN** — see table below. **0 errors, 0 page errors on every run** |
| 8 | The PNGs, actually looked at | **RAN** — 11 read: landing, landing Light, room, room Light, room reading, room mobile, room 768, RPG room, RPG Game tab, ctx Members, ctx This-chat, members mobile, New-chat, Saved-casts, injection crop, header crop |
| 9 | Keyboard walk | **RAN** — 15-stop forward walk from page top in the RPG room, `fv=true` at every stop; collapsible `tabindex` census. **Arrow-key arm inside the row action cluster NOT re-driven** (2026-08-22 P2 unverified) |
| 10 | Appearance arms | **RAN** — owner live state (probed, not assumed: `data-elevation=flat`, `data-blur-*` on, no `data-texture`, no `data-theme`), `maximal`, `compact`, `reading`, `diagnostics`. This arm found the P3 justify defect and the plate-opacity fork |
| 10 | Theme arms | **RAN** — `--theme Light` on the LANDING (real polarity flip, 3 contrast PASSes) and inside the ROOM (byte-identical plate — **expected**, D44 carried-theme takeover, `<html>` carries `data-theme=light` while the room suppresses it). `--theme none` not taken separately: the owner's live state already carries **no** `data-theme` |
| 11 | Pane-state arms | **RAN** — docked+collapsed · collapsed+collapsed · collapsed+docked · docked+docked, at 1280 and 1920, plus 768 (auto-collapse) and 430 (single-pane). **This arm is the only reason the P2 header truncation was found** |
| — | `record` (transition strip) | **SKIPPED** — the jank questions were answered numerically by `motion-audit` + `perf-meter` + `__orb`; no transition needed frame-by-frame adjudication |
| — | Streaming / send / error states | **SKIPPED, with reason** — `live-model-connection-policy` requires a brief to name the connection to select before any live turn, and this is a review-only lane with no such instruction. **Untested as a result: the streaming transcript, the send error state, and any mid-turn transient.** |
| — | `snap --isolated` / `--dirty` | **SKIPPED** — sibling lanes named in the brief; live `:5173` only, stage band never touched |
| — | `snap --contexts` / `--as` | **SKIPPED** — no host-vs-member question in scope; the multi-user fixture was not booted |
| — | ad-hoc framebuffer decode | **RAN, then RETRACTED** — see Retraction 4. Its planted negative control is the only reason the lie was caught |

### Console triage (post-checkpoint interaction window: 17 warnings, 6 boot warnings, 0 errors, 0 page errors)

| Message | × | Disposition |
| - | - | - |
| `[perf] slow commit region:content Nms (update)` | 7 | **INVESTIGATE** — folded into the #489-residue P3; `__orb.renders()` gives the mechanism (21 content updates) |
| `[perf] slow commit region:content/list/context (mount, nested-update)` | 3 | same finding |
| `[frame] long frame … @ main.tsx` | 1 | **known-ruled** — the boot eval |
| `[frame] long frame … commitRootWhenReady / performWorkUntilDeadline` + matching `[reflow] forced synchronous style/layout` | 4 | **INVESTIGATE** — same P3; matches the `motion-audit` style-in-frame LoAF |
| `[drop] Nms mid-animation · svg[aria-label=Orbweaver] · [data-slot=weave-veil]` | 3 | **known boot** — the splash mark, every cold run; surface owner is the boot splash, not Chats |
| `[drop] Nms · aside[aria-label=Chats list] · [data-slot=theme-scope] · <html>` | 1 | **accepted** — the list-pane FLIP mount; CLS contribution is 0 under a real click |
| `[drop] Nms · <html> · [data-slot=skeleton]` | 1 | **accepted** — first-paint skeleton |
| `[cls] shift 0.0221 · CLS 0.0221 (virtualized 0.0000)` | 1 | **accepted** — boot only, non-virtualized 0.0221, well under 0.1; identical to the value `2026-08-30-this-chat-cls-verify.md` recorded |
| `[css] dead class · .base-ui-disable-scrollbar on [data-slot=scroll-area-viewport]` | 1 | **P3 filed above** — vendor-emitted dead class |

**"It's dev mode" was not used as a disposition for any row.**

---

## Issue summaries (NEW vs already-filed)

**NEW — P1 · context-panel tab strip forks by room type.** In an RPG room the five detail tabs render
as plain `<button>`s inside `role=toolbar[aria-label="Chat"]` at y=754, with no `role=tab` and no
`aria-selected`; in a non-RPG room they are `role=tab` inside `role=tablist[aria-label="Detail"]` at
y=56 with `aria-selected` set. Screen-reader users in RPG rooms get no current-view announcement and
no arrow navigation (selection is carried by accent fill alone), and every user has the strip move
700px when switching room type. Contradicts #208's recorded outcome ("real tablist semantics"), which
holds only outside RPG rooms. Receipts: `scratchpad/cbrc-24.log`, `cbrc-25.log`,
`reports/snaps/cbrc-ctx-members.png`, `cbrc-rpg-gametab.png`.

**NEW — P2 · room header title truncated to 58% at 1280 with both panes docked.** `titleW 116px` vs
`scrollWidth 201px` renders "Example — …", the prefix every seeded room shares; full at 1920 and in
the other three pane states. The topbar's global trailing cluster shares the CONTENT header row.
Receipts: `scratchpad/cbrc-trunc.log`, `cbrc-trunc2.log`, `reports/snaps/cbrc-header-trunc-crop.png`.

**NEW — P2 · injection preview line-clamp inert; line 2 sliced mid-glyph.**
`-webkit-line-clamp: 1` with `display: flow-root` (clamp needs `-webkit-box`), box 25px over 38px of
content, `text-overflow: clip` → an ellipsis on line 1 AND a horizontally-cut line 2. Sites:
`injections-manager.tsx:200`, `room-overrides-form.tsx:100`. Receipts: `scratchpad/cbrc-12.log`,
`cbrc-13.log`, `reports/snaps/cbrc-inj-crop-crop.png`.

**NEW — P2 · CAST header has two confusable add-doors 4px apart.** "Add cast…" (108×32/108×44) opens
a dialog titled "Saved casts"; an unlabelled person-plus glyph (34×34/48×48) adds a character. Both
pass tap-target floors (#810–#813 hold); the defect is discriminability and door/destination naming.
Receipts: `scratchpad/cbrc-09.log`, `cbrc-mobmem.log`, `reports/snaps/cbrc-addcast.png`.

**NEW — P2 · single-variant rooms render the variant control as an unlabelled floating chevron.**
`button "Generate a variant"` — 34×34, transparent, `textContent: ""`, parent `textContent: ""` — over
raw background art at all viewports. #490-2's kicker+count covers only the multi-variant strip.
Receipt: `scratchpad/cbrc-03.log`.

**NEW — P2 · RPG stat-profile/trackers rows are 18–22px interactive targets.** 28 design-audit P1
tap-targets at `pointer=fine`, corroborated by four-cardinal `elementFromPoint` (e.g.
`button "Strength hint"` 312×18 owns its centre and 2 of 4 edge offsets) — not the #281 slider FP
class. Receipts: `scratchpad/cbrc-da-rpg.log`, `cbrc-19.log`.

**NEW — P2 (instrument) · design-audit `duplicate-action-door` false-positives on repeated list-row
actions at coarse pointer.** Three per-message "More message actions" buttons in three distinct
`message-name-row` hosts are reported as one duplicated door because the coarse reveal makes every
row's cluster visible simultaneously. Will fire on every virtualized list at `--mobile`. Receipts:
`scratchpad/cbrc-da-mobile.log`, `cbrc-07.log`.

**NEW — P3 cluster · small a11y/copy fixes.** New-chat picker primary button has a doubled accname
(`"Pick a characterPick a character to start"`, the dialog's only `[dom]` fallback); `+8 More`
accname omits its count (the one failing Lighthouse audit's non-FP node); the `reading` appearance
preset ships 44 `justified-text` findings with no `hyphens: auto`; `.base-ui-disable-scrollbar` is a
dead class on every room console.

**NEW — P3 · #489 residue.** One 151ms long task on cold room open, attributed to
`ViewTransitionCallback` in `packages/client/src/lib/view-transition.ts` (143ms blocking at 4× CPU).
Down from 596ms/579ms; cycles 2–3 are clean. Receipts: `scratchpad/cbrc-perf.log`, `cbrc-motion.log`.

**ALREADY FILED — observed, not re-filed:** #830 (This-chat tab height — measured 3,949px today),
\#824 (Collapsible height animation), #818 (plugin per-anchor CTA), #522 (native month control stays).
**Unchanged from 2026-08-22 and not re-filed as new:** flat type hierarchy (P3 on every arm), the
GAME STATE strip's missing selected state and unexplained `Map 🔒`, the redundant boot
`chat.listChats {limit:1}`, and the ~240px of list-pane chrome above the first row.

---

## Artifacts

- Screenshots (`reports/snaps/`): `cbrc-landing.png`, `cbrc-landing-light.png`,
  `cbrc-room-midnight.png`, `cbrc-room-light.png`, `cbrc-room-reading.png`, `cbrc-room-mobile.png`,
  `cbrc-room-768.png`, `cbrc-room-rpg.png`, `cbrc-rpg-gametab.png`, `cbrc-ctx-members.png`,
  `cbrc-ctx-thischat.png`, `cbrc-members-mobile.png`, `cbrc-addcast.png`, `cbrc-newchat.png`,
  `cbrc-panes-nolist-ctx.png`, crops `cbrc-inj-crop-crop.png`, `cbrc-header-trunc-crop.png`
- Lighthouse: `reports/lighthouse-cbrc-desktop/`, `reports/lighthouse-cbrc-mobile/`
- Lossless console: `reports/snaps/cbrc-console.json`
- perf/motion JSON: `reports/perf-meter/perf-meter.json`
- design-audit JSON: `reports/design-audit/root.json` (overwritten per run — the tables above are the
  durable record)
- Probe logs: `scratchpad/cbrc-*.log` (session scratchpad, ephemeral — the numbers quoted above are
  the durable record)
- **Retracted analysis scripts (do not reuse):** `reports/cbrc-px.mjs`, `cbrc-px2.mjs`,
  `cbrc-px3.mjs`, `cbrc-px4.mjs`, `cbrc-px5.mjs` — the scanline estimator of Retraction 4. Kept only
  so the retraction is reproducible.
