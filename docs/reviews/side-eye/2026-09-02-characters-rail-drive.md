---
kind: review
status: draft
updated: 2026-09-02
---

# side-eye — the Characters rail surface, full-battery drive (#1114)

> **Lane p-eye-characters, 2026-09-02.** The 08-30 riders, verbatim, so the reports compare: use the
> FULL instrument battery · the bar is EXCELLENCE, not acceptability · report EVERY finding including
> nits ("this is our bedrock, our Alamo") · work through it as a user would and report UX/IA and what
> feels crunchy · pre-launch posture — judge against the correct END STATE, not against what is
> tolerable. Judge, don't fix.
>
> **Predecessor:** [`2026-08-30-rail-characters-delta.md`](2026-08-30-rail-characters-delta.md)
> (28/40, SHIP WITH FIXES). PART 0 is the delta against it.
>
> **Method template + instrument-delta discipline:**
> [`2026-09-02-config-surface-live-drive-2.md`](2026-09-02-config-surface-live-drive-2.md).

## Environment + run health

Main tip `97a110dff` (Wed Sep 2 03:17:46 −0600). `:5173` served by **vite pid 3858659, started
01:16:02** — age-verified against the tip before the first receipt; the tip landed 2h01m AFTER the
vite start, so the served graph absorbed a merge era. Every receipt below was re-taken through
`--idle` and no page error, console error, failed request or dep-churn appeared in ~35 runs, so the
long-lived-vite corruption tell (`long-lived-vite-corrupt-graph`) is absent. Server `:8788` pid
3858309, healthz ok.

**Snap stage band NOT used** — `--stage-status` showed it held by sibling worktree
`agent-a963e6683c39fd730` (marker `d4f3601e2113`, `:8888`/`:5273`, 33m old). Never torn down. Every
rendered receipt is off live `:5173`, which serves main — the surface under review.

**Run health, all runs:** `nav=OK` · `nav-actions-failed=0` · `steps-failed=0` · `page-errors=0` ·
`console-errors=0` · `failed-req=0` · `vite-dep-churn=0` · `deadcss=0` · `emptycss=0` ·
`environment-fails=0` · `assertion-fails=0` · `map-fails=0` · `map-dom-fallbacks=0`. Console
*warnings* are non-zero and triaged in a table at the end — zero "it's dev mode" dispositions.

**One environment fault, reported mid-run (SendMessage to the orchestrator):** the sibling side-eye
lanes SHARE one scratchpad directory. A generic scratch name (`da-mobile.log`) served me the **Home
lane's** complete `design-audit` run as if it were mine — `section=Home`,
`out=…/agent-a87e651d679fbe637/reports/design-audit/p-eye-home-mobile.json` — because my own
invocation had been refused by the tool guard and never wrote a file. Nothing in the output announces
that it is not yours except the worktree path in the RESULT line. All my scratch and artifact names
are `p-eye-characters-*` from that point; every log quoted below was verified mine by its `out=` path.

**Probed appearance state (never assumed).** `<html>`: `data-blur-panels` · `data-blur-composer` ·
`data-blur-modals` · `data-reduced-motion=false` · **no** `data-theme` · **no** `data-texture` ·
**no** `data-shadow`; style `--font-scale:1 --blur-strength:14px --reading-line-height:1.55 --reading-letter-spacing:0em --reading-paragraph-spacing:0.75rem --reading-name-scale:1 --reading-body-scale:1`. `.shell-grid`: `data-section=characters data-list-mode=docked
data-context-mode=collapsed data-focus-mode=false data-elevation=flat`, style
`--width-shell-content: clamp(680px, 60dvw, 100dvw)`. **`data-density` is ABSENT** on `.shell-grid`
(the 08-30 pass recorded `data-density=comfortable`) — a delta I state without interpreting; it is
either an omit-at-default change or a regression, and it is a question for the fix lane, not a
finding I can prove either way from the rendered side.

---

## VERDICT — DO NOT SHIP AS IS

**The surface is well built and it lies about the user's data.**

Almost everything mechanical is right, and several of the 08-30 P1/P2s are verifiably dead: the
import dialog has an exit, the import button clears the coarse floor at exactly 44×44, the 28 dead
tag facets are gone, and the context pane's junk-drawer "Field" tab was correctly rebuilt as a
`toolbar` + `aria-current` + roving tabindex with **History as its own tab** — that last one is the
best single fix in the delta. Contrast passes everywhere I measured, in both themes, with margin.
There is no overflow anywhere. The selector map has **zero DOM fallbacks** — every interactive
element on this surface has a stable accessible identity, which is a stronger a11y result than most
surfaces in this app manage.

What is wrong is that **the first thing a visitor sees is false.** The landing's "Recently chatted"
card says `chatted 2d ago · 0 chats` about a character whose own detail pane, in the same session,
says `1 chat` and `Last chat: Aug 2, 2026`. "2d ago" is the **Added** date. So a list headed
"Recently chatted", annotated "sorted by last chat", is displaying the wrong field and a count that
contradicts the two other places the app prints it. That is not polish; that is the surface's
primary claim being wrong.

Second: **the four-way Opening selector has no state at all.** No `aria-pressed`, no `aria-current`,
no `aria-selected`, no `role` — and the only visual difference between the active opening and the
other three is a 1px border that composites to **1.189:1** against its backdrop, against a WCAG
1.4.11 floor of 3:1. Nobody, sighted or not, can reliably tell which opening is showing.

Third: **the primary action of the surface — opening a character — drops a quarter of its frames**
(14 of 55, 25.45%), and the interstitial is a bare "Loading character…" line over an empty pane
rather than a reserved box.

The taste call is separate and blunt: the CONTENT landing is a **917×752 pane holding one 136px-wide
card**, and the whole surface's largest text is **16px** while the list pane's own `<h2>` is
**10.5px uppercase**. It reads unfinished.

---

## PART 0 — DELTA vs the 2026-08-30 pass

### FIXED (six, each with a receipt)

| 08-30 finding | Receipt that it is dead |
| - | - |
| **\[P2] The Import dialog has no visible way out** | `snap --click '[aria-label="Import a character card"]' --aria` → `dialog "Import a character card"` → `heading` · `button "Choose File"` · `paragraph` · **`button "Cancel"`** |
| **\[P2] `Import a character card` is a 40px target on coarse pointer** | `snap characters --mobile --eval` → `{"n":"Import a character card","box":[44,44],"pointer":"coarse"}`; every header control measures 44 tall. Lighthouse **mobile** `target-size` score **1**; `design-audit characters --mobile` `tap-candidates=50 tap-judged=50 tap-affected=0` |
| **\[P2] The tag filter offers 28 facets, every one of which matches nothing** | Expanded filter block (`--click '[aria-label="Favorites, archived & tags — show more filters"]' --aria`) now contains exactly `button "Show only favorites"` · `button "Show archived characters"` · `button "Fewer filters …" [expanded]` · `status: 10 characters`. **Zero tag chips.** (A residual copy defect remains — nit 15) |
| **\[P2] Version history is buried at the bottom of a junk-drawer tab** / **the context pane lives under a tab called "Field"** | Context pane is now `toolbar "Character"` → `Overview · Chats · Links · Look · History · Trust`. **History is its own tab.** "Field" and "Options" are gone |
| **\[P3] Seeded characters report provenance that cannot be true** ("Made here") | Context Overview: `Source` → **`Example — shipped with Orbweaver`** |
| **The bulk-mode row checkbox "22px P1"** (#1067) | Not an instrument artefact any more and not a product defect: checkbox box `18×18`, `::before` **28px**, and `tap-target` reports `candidates=50 judged=50 affected=0` at **both** pointer classes. The ladder fix landed; the surface was never wrong |

### CHANGED

| 08-30 finding | Now |
| - | - |
| **\[P2] The `Own look` chip: `role="img"`, a sentence for a name** | Improved to `button "Own look"` with a proper name — but it still wraps a `<p>` inside the `<button>`, and "Own look" is still jargon a cold user cannot resolve. See nit 26 |

### STILL STANDING

| 08-30 finding | Receipt |
| - | - |
| **\[P3] The Characters list pane drops a frame on every section entry** | `record` console at 2317ms: `[drop] 68ms rendered frame mid-animation · aside[aria-label=Characters list] · OVER BUDGET`. Now quantified: `motion-audit / --selector '[aria-label="Characters"]'` → **9/64 frames dropped (14.06%)**, worst LoAF blocking 298ms |
| **\[P3] Section entry still breaches the long-task budget — and it is not the data** | Confirmed and worse than "long task": the offender is the boot splash, not the query. See F7 |
| **\[P3] Reading measure sits one character over the band** | `line-length candidates=42 judged=2 affected=0` — the rule finds only 2 prose subjects here, both clean. **NOT REPRODUCED** at this population; the 08-30 measurement was on a different corpus. Not claimed either way |
| **A 917×750 empty CONTENT void** | `main` = **917 × 752** at (363,48); visible content ends at y≈530 (`p-eye-characters-landing.png`). See F12 |
| **A flat type hierarchy / no display voice** | `flat-type-hierarchy` P3 in **every** arm: "10.5px, 13px, 15px, 16px (ratio 1.5:1)". See F9 |
| **\[P1] One character, three disjoint action menus** | **NOT RE-MEASURED at item level.** Both doors still exist (`button "Actions for Sabine Veyra"` in the row; `button "Character actions"` in the context pane) plus the bulk bar's `Tag · Archive · Delete`. I did not open all three menus this pass and do not claim the item sets |
| **\[P2] The spoiler toggle inverts its own state announcement** | **NOT RE-MEASURED** (the eye button was not driven) |
| **\[P2] The theme editor prints raw `oklch(...)` strings** | **NOT RE-MEASURED** (the `Look` context tab was not driven) |
| **\[P3] The tag-suggestion pill labels are 10.5px interactive text** | **NOT REPRODUCED**: `undersized-ui-text candidates=42/46 judged=42/46 affected=0` in every arm including the open-character drive. Either fixed or the rule's threshold moved; I state the zero, not a fix |

### INHERITED-ACCEPTED

`label-content-name-mismatch` — **10 nodes**, desktop AND mobile, the ten character rows. Snippet:
`<button aria-describedby="_r_2b_-subtitle" aria-label="Sabine Veyra" … data-slot="list-row-body">`;
axe explanation *"Text inside the element is not included in the accessible name"* (the handle
`sabine` is visible but not in the accname). This is the owner-ruled Label-in-Name exception the
08-30 pass recorded, and it is now **better** than then: the handle is programmatically bound via
`aria-describedby`, so it is a description rather than an orphan. Reported, not filed.

### RETRACTION I INHERITED AND KILLED

**"a working `Skip to characters` link puts a keyboard user on the first row in two keystrokes"** —
**FALSE on this tree.** Measured Tab walk with `activeElement` read at all 25 stops
(`p-eye-characters-kbd.log`): `Skip to characters` is **Tab stop 15**, after `Skip to content`, all
nine rail sections, `Settings`, `Playing as Traveler`, `Import a character card` and `New`. It saves
6 stops (15→22 becomes 15→16), not 20. The genuinely fast path is `Skip to content` (stop 1) +
Enter, which lands on `main "Characters content"` — the CONTENT pane, not the list.

---

## PART 1 — FINDINGS

### P1

**F1 · The "Recently chatted" card states a false fact, and the same two facts have three homes that disagree.**

One run, one character, one session:

| Where | What it says |
| - | - |
| CONTENT landing, `[aria-label="Recently chatted"]` | `heading: "Recently chatted"` · `note: "sorted by last chat"` · card innerText **`Sabine Veyra \| chatted 2d ago · 0 chats`** |
| CONTENT header, open character | `button "1 chat"` |
| CONTEXT pane, `[aria-label="Characters details"]` | `1 chat 1,257 tokens` · `ORIGIN → Added → 2d ago` · `ACTIVITY → Last chat → **Aug 2, 2026**` |

Today is **2026-09-02**. `Aug 2, 2026` is **31 days ago**. `Added` is `2d ago`. The landing's
"chatted 2d ago" is byte-identical to the **Added** value, not the last-chat value — so the card in
a list headed "Recently chatted" and annotated "sorted by last chat" is rendering the *added* date.
And the count disagrees outright: **0 chats** on the landing, **1 chat** in both other homes.

**Why it hurts a user:** the landing is the first and only thing in the CONTENT pane. Its whole job
is "here is who you were last talking to." It is showing the wrong field and a wrong number, so the
one piece of orientation the surface offers is misinformation — and a user who notices the
disagreement loses trust in every other number the app prints.
**Fix — `clarify` + the data seam:** the card reads the last-chat timestamp and the chat count from
the same projection the context pane's ACTIVITY block reads, or the heading and the "sorted by last
chat" note change to name the field actually shown. One home for "last chat", one for "chat count".
**Receipt:** `p-eye-characters-dates-landing.log` / `p-eye-characters-dates-ctx.log`, quoted above;
`p-eye-characters-landing.png`; `p-eye-characters-open.png`.

**F2 · The Opening selector's active state is a 1.189:1 hairline and carries no ARIA state whatsoever.**

All four `Opening N` buttons, measured:
`{"role":null,"pressed":null,"cur":null,"sel":null,"ti":0}` — **×4, identical.** No `role="tab"`, no
`aria-selected`, no `aria-pressed`, no `aria-current`, and `tabIndex: 0` on every one (four tab
stops, no roving focus, no arrow-key arm).

The only difference between selected and unselected is the border:

```
Opening 1:  border  oklch(0.99 0.005 60 / 0.08)  1px
Opening 2-4: border oklch(0.955 0.004 75)        0px
backgroundColor: rgba(0,0,0,0) on all four; ::before and ::after both content:none
```

Composited by canvas: border `rgba(255,255,242,0.0784)` over backdrop `rgb(15,12,10)` →
**`rgb(34,31,28)`**, contrast **1.189:1**. WCAG 1.4.11 non-text contrast floor for a state indicator
is **3.0**.

**Why it hurts a user:** a character with four openings has four buttons and no reliable way to tell
which one the preview below belongs to. A screen-reader user hears "Opening 1, button; Opening 2,
button; …" with nothing distinguishing them. A sighted user is looking for a 1.19:1 edge. Meaning by
paint alone (§9 Sam), below the non-text floor, on a control that changes what the panel underneath
shows.
**Fix — `clarify`:** this is exactly the shape the context pane already got right. Make it a
`toolbar` with `aria-current="true"` on the active button and roving tabindex (0 / −1), and raise the
selected state to a token that clears 3:1 — the app's own `aria-current` rail treatment already does.
**Receipt:** `p-eye-characters-open2.log`, `p-eye-characters-open3.log`, `p-eye-characters-border.log`.

**F3 · Opening a character drops 25% of its frames, and the interstitial is a bare text line over an empty pane.**

`pnpm motion-audit characters --selector '[aria-label="Sabine Veyra"] >> nth=0'`:

```
frames      raw 14/55 dropped (25.45%)
LoAF        4 in ring · style/layout in-frame on all four
              @3744ms 167ms · @4025ms 85ms/23ms blocking · @4110ms 65ms · @4248ms 67ms
CLS obs     non-virtualized 0.0233
  · shift @4338ms 0.0014 · [data-slot=character-greeting-bubble] moved 1px,-7px
  · shift @4387ms 0.0219 · [data-slot=character-greeting] moved 0px,84px
                          · [data-slot=button] moved 0px,84px · [data-slot=button] moved 94px,0px
```

The `record` 6-tile strip (`p-eye-characters-drive-click2.png`, 120ms/tile) shows why it feels bad:
tiles 1–2 render the CONTENT pane **empty except for a "Loading character…" line at the top-left**;
tile 3 onward has the whole editor. So the pane blanks, shows a bare sentence for ~240ms, then fills
— and 84px of the greeting block still moves after it has filled.

**Why it hurts a user:** this is THE action of the surface. A quarter of dropped frames plus a
blank-then-fill plus an 84px post-fill jump is the crunchiest thing on Characters. The CLS is under
the 0.1 budget, so no gate will ever catch it; judge the observed number and the strip.
**Fix — `reserve` + `optimize`:** a reserved box the height of the greeting block (the #885 class),
and a skeleton in the character-editor QueryBoundary instead of a bare "Loading character…" line.
**Receipt:** `p-eye-characters-motion-cardopen.log`; `reports/recordings/p-eye-characters-drive-click2.png`;
`record` console `4054ms [cls] shift 0.0219 input-adjacent · [data-slot=character-greeting] moved 0px,84px`.

### P2

**F4 · Entering the section from the rail drops 14% of frames.**
`pnpm motion-audit / --selector '[aria-label="Characters"]'` → `frames raw 9/64 dropped (14.06%)`,
2 LoAFs with style/layout in-frame (`@4176ms 158ms/102ms blocking`, `@4533ms 353ms/**298ms
blocking**`). CLS 0. The app's own flagger names the offender in the `record` drive at 2317ms:
`[drop] 68ms rendered frame mid-animation · aside[aria-label=Characters list] · OVER BUDGET`.
**Fix — `optimize`:** the list pane's entry commit is the cost; see F5/F6, which are its inputs.

**F5 · Seven `character.list` round-trips to paint a ten-character landing.**
One boot, from the console (network, not the cache census):
`{"archived":false,"limit":5,"sort":"recent"}` · `{"limit":1}` ·
`{"limit":30,"sort":"recent","archived":false,"direction":"forward"}` · `{"starred":true,"limit":24}`
· `{"archived":false,"limit":6,"sort":"starred","starred":true}` ·
`{"archived":false,"limit":12,"sort":"newest"}` — plus `{"limit":1,"archived":false}`, which
`__orb.queries()` still reports **`pending`** after `--idle`. Corroborated by the cache census: seven
distinct `["character","list"]` entries.
**Why it hurts a user:** seven overlapping reads of the same ten-row table, each with its own commit,
are the input to F4's 14% frame drop and F6's churn. On a 300-character library this multiplies.
**Fix — `optimize`:** one paged read + client-side derivations for "starred", "newest", "recent-5",
"recent-6"; the sort/limit permutations are projections, not separate resources.
**Receipt:** `p-eye-characters-landing.log` console block; `p-eye-characters-orb.log` queries census.

**F6 · `region:list` commits sixteen times to settle a static ten-row list.**
`__orb.renders()` at idle on the landing: `{"id":"region:list","count":16,"mounts":1,"updates":15,
"totalMs":73,"avgMs":5,"maxMs":38}`. `region:content` is 6 (1 mount + 5 updates). No user input
occurred. The console names three of them: `[perf] slow commit region:list 13ms (mount)` ·
`31ms (nested-update)` · `25ms (update)` · `15ms` · `29ms` across the drive.
**Fix — `optimize`:** fifteen updates is the seven-query fan-in arriving one at a time; F5's fix is
this one's fix.

**F7 · The boot splash drops frames on every single load, in every run.**
Four independent runs, unprompted:
`[drop] 58ms · svg[aria-label=Orbweaver] · [data-slot=weave-veil] · OVER BUDGET` ·
`[drop] 102ms · svg[aria-label=Orbweaver]` · `[drop] 94ms · [data-slot=weave-veil]` ·
`[drop] 65ms` · `[drop] 100ms` · `[drop] 68ms` · `__orb.flags()` →
`{"tag":"drop","at":3117,"offender":"[data-slot=weave-veil]","detail":"90ms rendered frame
mid-animation (budget 50ms)","overBudget":true}`. Budget is 50ms; the worst is **2×** it.
Accompanied every time by `[frame] long frame 143–146ms · blocking 93–96ms (budget 100ms) · @ main.tsx`.
`app-ready` measures **2841ms**.
**Why it hurts a user:** the very first motion the app ever shows a person stutters. It is the app's
handshake.
**Fix — `optimize` / `animate`:** the weave animation runs during the heaviest boot frame; either
defer its start past first commit or make it compositor-only for the boot window.
**Caveat, stated:** this is a dev build. The frame is a *rendered-frame* drop measured by the app's
own flagger, not a bundler artefact, and it reproduces on 4/4 loads — but the magnitude on a prod
bundle is unmeasured (the #836 prod arm was not taken; see the coverage table).

**F8 · The shipped-default glass panels put 8–13 text elements on a fractional device-pixel grid inside a promoted layer.**

`off-grid-text` P2, and the arm sweep proves the cause:

| Arm | `off-grid-text` findings |
| - | - |
| owner row (`data-blur-panels` on) | **8** |
| `--appearance-preset defaults` (a brand-new account) | **8** |
| `--appearance-preset maximal` | 8 |
| `--appearance-preset diagnostics` | 8 |
| `--theme Light` | 8 |
| `--appearance-preset reading` | 7 (+2 `tight-leading`) |
| driven (bulk mode) | **13** |
| `--panels context-only` / `focus` | 11–12 (+`promoted-layer-offset`, +`off-grid-transform`) |
| **`--appearance-preset compact`** | **0** |

`compact` is the only arm that sets `blurSurfaces: []` (`tooling/src/_shared/appearance-presets.json`).
Every finding names the same promotion context:
`inside a backdrop-filter layer ([data-slot=theme-scope] > div.shell-grid:nth-of-type(1) >
aside.shell-panel:nth-of-type(1))`, with offsets like `10.5px text lands top 0.000 / left 0.406
device px off the grid at DPR 1` and `13px text lands top -0.500 / left 0.188`.

**Why it hurts a user:** the browser re-snaps baselines every paint *outside* a promoted layer; inside
one it cannot, so those glyphs render permanently soft. This is `docs/design/integer-line-boxes.md`
Law 4. It is not an opt-in ornament cost — **`defaults` reproduces it**, so the shipped first-run
state has it.
**Fix — `polish`:** snap the list-pane's text-bearing boxes to the device grid, or drop the panel
blur off the elements that carry 10.5px/13px text.
**Receipt:** `p-eye-characters-da-{desktop,defaults,compact,driven,…}.log`.

**F9 · The surface has no display voice — its largest text is 16px, and the list pane's own `h2` is 10.5px.**

Heading census (`--eval` over `h1..h4`):

| Element | Computed |
| - | - |
| `h2` "Characters 10" (LIST pane title) | **10.5px / 600 / uppercase / ls 0.84px** |
| `h3` "View" · `h3` "Filters" · `h3` "Recently chatted" | 10.5px / 600 / uppercase / ls 0.84px |
| `h2` "Pick up where you left off" (CONTENT) | **16px / 600** |

The largest text anywhere on the surface — including the character's own opening prose — is **16px**.
The LIST pane's `<h2>` is *smaller than body text*. `flat-type-hierarchy` P3 fires in **every** arm
with the identical string, "10.5px, 13px, 15px, 16px (ratio 1.5:1)", against a ramp the rule itself
says "spans micro 10.5 → display 24 for a reason".
This is the same defect, at the same magnitude, as the Config report's F24 — **two rail surfaces, one
systemic cause.**
**Fix — `typeset`:** the section's own name is the display slot. Give the LIST `h2` a real voice step
and stop spending the caps-micro kicker on it.

**F10 · The bulk bar makes Delete the loudest control and orphans its own dismiss on a second row.**

```
Tag              box [153,712, 47,32]  bg rgba(0,0,0,0)          color oklch(0.92 0.004 75)
Archive          box [206,712, 71,32]  bg rgba(0,0,0,0)          color oklch(0.92 0.004 75)
Delete           box [283,712, 63,32]  bg oklch(0.72 0.19 25)    color oklch(0.2 0.03 25)
Clear selection  box [ 72,752, 34,34]  bg rgba(0,0,0,0)
```

Delete is the **only filled button in the bar** and it sits at the right edge, in the scan position
a user reads as "confirm". `Clear selection` is a 34×34 glyph on a **separate row 40px below the
bar**, left-aligned under the "1 selected" text, consuming a whole row to hold one dismiss.
**Why it hurts a user:** §5 error prevention — the irreversible action is the visually primary one.
And the bar's exit is the least discoverable thing in it.
**Fix — `quieter` + `layout`:** Delete becomes a ghost like its siblings (destructive intent is
carried by the confirm step, not by the bar's paint); `Clear selection` moves to the bar's right edge
on the same row.
**Receipt:** `p-eye-characters-bulkbar.log`; `p-eye-characters-bulk.png`.

**F11 · The token datum is printed unlabelled in one home and labelled in another.**
CONTENT header: `paragraph: 1,257 total · 1,017 permanent`. CONTEXT pane, same character:
`text: 1 chat 1,257 tokens`. Same number; only the second says what it counts. "permanent" is never
explained anywhere on the surface.
**Fix — `clarify` + `distill`:** one home for the token datum, with its unit, and a gloss on
"permanent" (the ⓘ vocabulary already exists on this surface).

**F12 · The CONTENT landing is a 917×752 pane holding one 136px card.**
`main` = `[363, 48, 917, 752]`. Visible content ends at y≈530 (`p-eye-characters-landing.png`,
`p-eye-characters-light.png`): the "RECENTLY CHATTED" header band spans the full 869px with its label
at x=387 and "sorted by last chat" at x=1166 — **1053px apart** — over a single 136×200 thumbnail at
the far left. Below the divider, one 10.5px sentence. Then ~270px of nothing.
**Why it hurts a user:** the pane that is supposed to teach a first-timer what this section is for
looks like a page that failed to load. See the taste verdict.
**Fix — `onboard`:** the landing needs either a real recently-chatted row (a grid, not one card) or a
designed teaching state that fills the pane. `empty-states-are-load-bearing`.

**F13 · The suggested-tags block is ten ungrouped consecutive tab stops.**
`paragraph: Suggested` then `button "Accept banter"` · `button "Dismiss banter"` · … ×5 pairs, with
**no `group`/`list` container and no count**. A screen-reader user hears ten buttons in a row with no
announcement of what set they belong to or how many there are. Compare the same surface's
`group "Tags"`, `group "View"`, `group "Filters"`, which are all correct.
**Fix:** wrap in `role="group"` with `aria-label="Suggested tags, 5"` (or a `list`/`listitem` pair).

**F14 · The context Overview region associates labels to values by position only.**
`region "Overview"` renders `paragraph: Origin` · `separator` · `paragraph: Added` ·
`paragraph: 2d ago` · `paragraph: Source` · `paragraph: Example — shipped with Orbweaver` ·
`paragraph: Activity` · `separator` · `paragraph: Last chat` · `paragraph: Aug 2, 2026` · … — a flat
run of paragraphs. Nothing binds "Added" to "2d ago" programmatically: no `dl`/`dt`/`dd`, no
`aria-describedby`, no `aria-labelledby`.
**Fix:** a description list, or `aria-labelledby` from each value to its label.

### P3 / nits (each measured)

15. **Expanding Filters reveals nothing the collapsed label didn't already list, and drops a third of
    its own promise.** Collapsed: `button "Favorites, archived & tags — show more filters"`. Expanded:
    `Show only favorites` · `Show archived characters` · `Fewer filters — **hide the tag vocabulary**`
    — and **there is no tag vocabulary** (all 10 characters are `UNCATEGORIZED`). The disclosure has
    no payload, and both labels promise tags that are not there.
16. **`duplicate-action-door` P3 — two buttons named "Sabine Veyra" on one plane** (the list row and
    the landing card), in every arm. `--map` has to emit `>> nth=0` to disambiguate her while every
    other character resolves uniquely. §13 IA: the CONTENT landing's one card is a second door to the
    LIST's top row, 900px away.
17. **"10 characters added this week — Elias Thorn, Calamity, Doomblade of the Ninth Epoch, Kohaku and
    7 more."** Three problems in one 10.5px sentence: the comma inside *"Calamity, Doomblade of the
    Ninth Epoch"* makes the comma-separated list read as **four** names; the claim covers **100%** of a
    10-character library, so "added this week" carries no information; and the copy asserts recency
    about seeded examples the app itself labels "shipped with Orbweaver". Em-dash, §6 copy tell.
18. **The landing card's metadata is the only `Geist Mono` on the surface, capped to the card width,
    and wraps with an orphaned separator.** `span` box `[387,430,136,40]`, `Geist Mono 13px/400`,
    `line-height 20px` — 136px forces two lines out of "chatted 2d ago · 0 chats", leaving **"·" at the
    end of line 1** with its right-hand operand on line 2. The card is 136px wide inside an 869px
    column.
19. **`paragraph: The first opening is always shown; mark alternates group-chats-only.`** — the second
    clause is not parseable English. "mark alternates group-chats-only" has no subject and no
    reachable referent on the surface.
20. **The field buttons carry the raw value, unresolved macros included, in their visible text.**
    `aria-label="Description"`, `textContent` = `"Description{{char}} is a sellsword who used to be a
    legend. "`. Same for Personality and Scenario. And the state — `"Filled, 1283 characters"` — is a
    **sibling** of the button, not part of it, so a user tabbing control-to-control never hears it.
21. **The import dialog's primary control is the browser default string.** Copy says *"Drop a
    SillyTavern character card (PNG or JSON), or click to browse"*; the button says **`Choose File`**.
    Two vocabularies for one action, one of them not ours.
22. **Mobile: ~262px of chrome above the first character on a 740px viewport (35%).** Five stacked
    bands — title bar, New/import row, search row, `VIEW` row, `FILTERS` row — before row 1
    (`p-eye-characters-mobile.png`). The `VIEW` and `FILTERS` caps kickers each consume a full ~50px
    row at 430px to label two controls and one control respectively.
23. **Six of ten sections live under a drawer called "You", beside the account block.** `--mobile --click '[aria-label="You"]' --aria` → `dialog "You"` → `group "Account and settings"` (persona,
    `inktomi93@gmail.com`, `Log out`) → `heading "Notifications"` → **`group "More"`** →
    `Corpus · Extensions · Databank · Presets · Refinery · Analytics`. Reachability is fine (see the
    retraction); the *naming* is not — "You" is identity, and six library sections are not you.
24. **`tight-leading` 1.22× vs the ratified floor 1.2308 under `--appearance-preset reading`** (×2
    populations). At `fontScale: 1.25` the leading ratio *drops below* the floor it clears at scale 1
    (default: 10.5px text at `line-height: 13px` = 1.238). The snapped-rem leading rounds the wrong
    way at that stop.
25. **The context trail restates the toolbar directly beneath it** — `CHARACTER · OVERVIEW` sits
    immediately above `Overview | Chats | Links | Look | History | Trust`.
26. **`Own look` has two homes** — the CONTENT header (`button "Own look"` at x≈1053) and the CONTEXT
    pane (`button "Own look"`), both wrapping a `<p>` inside a `<button>`. The phrase itself is
    unresolvable cold: it names a per-character theme override with no gloss.
27. **`Pick a field on Sabine Veyra to inspect it here.`** is stranded at the **bottom** of the
    Overview region, after Origin/Activity/Tags — i.e. the instruction for using the pane sits below
    everything it is meant to introduce.
28. **The multi-select control reads as a radio at its rendered size.** Measured `18×18` with
    `border-radius: 6px` — a squircle, not a circle (I misread it as circular from the PNG; see the
    retractions). At 18px, 6px is a third of the side and the affordance still reads round; a 4px
    radius would settle it. Nit, with the measurement, not a defect claim.
29. **`Calamity, Doomblade of the Ninth Epoch` truncates in every arm**, and **earlier** in bulk mode:
    `Calamity, Doomblade of the Ninth …` at rest → `Calamity, Doomblade of the N…` with the checkbox
    column present. The longest real name in the corpus never fits.
30. **`tag.listTagFilterVocabulary` is still `pending` after `--idle`** in the cache census, as is
    `character.list {limit:1, archived:false}`. Two queries that never settle at rest. Probably
    deliberate gating behind the collapsed filter block; stated as an observation, not a finding.
31. **The rail's group gaps are 64px where the runs break and 46px elsewhere** (y: 56 · 102 · 148 ·
    **212** · 258 · 304 · 350 · **414**). Deliberate run separation per `section-ids.ts`; recorded so
    the next pass does not re-derive it.

---

## PART 2 — INSTRUMENT NOTES

**The bare run's NO-VERDICT is correct and is not filed.** `design-audit characters` (rest regime)
reports `population-verdict=NO-VERDICT` from `selection-idiom: unmatchedUnselected=1`. Per ruling
\#1059 §1 this is the honest answer: the library toolbar's two toggles are both OFF at rest, so the
selection cohort has no selected twin and the rule *cannot* be judged. **The driven run resolves it**
— `--click '[aria-label="Select multiple"]' --click '[data-slot="checkbox-root"]'` →
`selection-idiom candidates=7 judged=2 affected=0 excluded(insufficientPopulation=5)` and
`population-verdict=complete`, findings=13. Both populations are real and are reported separately
throughout; the rest run is what a visitor lands on.

**Every other arm is NO-VERDICT for the same one reason** (mobile: `unmatchedUnselected=2`; the four
appearance presets, the Light theme arm and all three pane arms: `unmatchedUnselected=1`). So the
only `population-verdict=complete` run in this pass is the driven one. That is a *coverage* fact
worth stating plainly: **a rest-regime `design-audit` of Characters can never publish a complete
verdict**, because the surface's selection idiom only exists once driven. Every rest arm's findings
below are therefore partial by the instrument's own accounting, and I say so rather than quoting them
as clean.

**Two axis-population notes, neither filed:**

- `row-void candidates=4 judged=0 excluded(unbound=4)` at rest and `14/0/unbound=14` driven — the
  rule finds label/control pairs it cannot bind on this surface. Not a clean pass, an inapplicable
  one; recorded so it is not read as "no row voids here".
- `glow-shadow candidates=15 judged=3 excluded(sanctionedGlowCarrier=12)` — the sanctioned carriers
  are recognised. Given the 2026-09-01 parser repair, this is the first Characters pass whose
  glow/radial rows were taken by a colour-space-aware instrument; the previous ones were blind.

**One thing the fleet still cannot see here, stated:** `--matrix` was not run (stage band held by a
sibling), and the #836 prod-build arm was not taken. F7's boot-splash frame drop is therefore
measured only on the dev build — the drop is real and reproducible, its prod magnitude is unknown.

---

## PART 3 — TASTE, IA AND THE ERRANDS

### The blunt taste verdict, per surface driven

**The library LIST pane: genuinely good.** It is the best-looking thing in this section and probably
one of the best in the app. 44px rows at a 52px pitch, 32×32 `object-fit: cover` avatars from 512×512
sources (no distortion, measured), name + handle in a clean two-line stack, hover actions that cost
zero horizontal layout because they live in reserved geometry at `opacity: 0`. The chrome above it is
tight at desktop. Nothing here looks like shit.

**The CONTENT landing: it looks like a page that failed to load.** This is the blunt call. A
917×752 pane. In it: a heading, a 10.5px sentence, a caps kicker with its right-hand annotation
**1053px away** across empty space, one 136px thumbnail with a name and a two-line mono caption, a
full-width divider, one more 10.5px sentence, and then roughly 270 vertical pixels of nothing. The
divider is the tell — a full-width rule under a 136px card announces a row of content that does not
exist. My honest first read, cold, was "the grid didn't render." A first-timer landing here cannot
tell whether this section is a library, a dashboard, or broken.

**The character editor: dense, competent, and slightly airless.** Good things: the opening prose is
16px with real colour separation between narration (`oklch(0.76 0.03 240)`, italic, 8.29:1) and
quoted speech (`oklch(0.85 0.1 62)`, upright) — that is a genuinely nice reading treatment and I
initially misread it as a wall of italic. The Voice/Extras/Advanced ladder with per-field state
("Filled, 1283 characters") is the right idea. What is airless: everything is 13–16px, so eleven
distinct groups all shout at the same volume, and the Openings strip — the one control that changes
what you are reading — is the quietest thing on the screen.

**The context pane: the best-composed surface in the section.** `toolbar` + `aria-current` + roving
tabindex, six honestly-named tabs, a clean Origin/Activity/Tags ladder. It is what the rest of the
section should look like. Its one flaw is that the numbers in it contradict the landing.

**Mobile: chrome-heavy but honest.** The row actions correctly go always-visible on coarse, every
control is 44 tall, the bottom bar is the right four sections and the rest are reachable. The problem
is proportion: 35% of a phone viewport is spent before the first character.

### Information architecture (§13 single-homing)

Three concepts have more than one home on this surface, and one of them disagrees with itself:

| Concept | Homes | Verdict |
| - | - | - |
| **chat count** | landing card (`0 chats`) · content header (`1 chat`) · context pane (`1 chat`) | **three homes, one wrong** — F1 |
| **last-chat time** | landing card (`chatted 2d ago`) · context ACTIVITY (`Aug 2, 2026`) | **two homes, different fields** — F1 |
| **token count** | content header (`1,257 total · 1,017 permanent`) · context (`1,257 tokens`) | two homes, two vocabularies, one unlabelled — F11 |
| **"Own look"** | content header chip · context pane chip | two doors, same action — nit 26 |
| **open a character** | LIST row · CONTENT landing card | `duplicate-action-door`, and it forces `>> nth=0` on the map — nit 16 |

The shell physics (§14) are otherwise obeyed: LIST finds, CONTENT does, CONTEXT configures the active
artifact and is never navigation (unlike Config, where the context pane duplicated the list). Panel
states behave — the docked↔collapsed FLIP is clean (see below).

### The errands, walked as a user

| Errand | Outcome |
| - | - |
| **Find a character** | Works. Search box, sort combobox, group-by-tag, ten rows visible without scrolling at 1280×800. Group-by-tag returns one honest bucket: `UNCATEGORIZED 10`. |
| **Open one** | Works, and it is the crunchiest moment on the surface — 25% dropped frames, a bare "Loading character…" line over an empty pane, an 84px post-fill jump (F3). |
| **Start a chat** | Works — `button "New chat"` is the one filled accent control in the editor header, correctly the primary. `button "1 chat"` beside it opens the existing one. |
| **Bulk-select and act** | Works. `Select multiple` flips `aria-pressed` correctly, each row mints `checkbox "Select X"` with a proper name and `[checked]`, and `1 selected` lives inside an `aria-live="polite"` region so the running count is announced. Spoiled by F10's paint. |
| **Import one** | Reachable, has an exit, has clear copy — and its primary button says `Choose File`. I did not complete an import (read-only pass). |
| **Tell which opening is showing** | **Fails.** F2. |
| **Tell when you last talked to someone** | **Fails.** F1. |

### Cognitive load (§8)

Decision points, competing visible options at each: LIST header = 6 (search · sort · Group · Select ·
import · New) — at the edge but chunked into three visual groups, acceptable. Character editor at
rest = **11 distinct interactive groups** in one scroll (portrait · name · Own look · New chat · 1
chat · spoilers · Tags · Suggested ×5 pairs · Openings ×4 · Add/Edit/Studio · Voice ×3 · Extras ×2 ·
Advanced ×5). That is well past 4, and the flat type ramp (F9) gives the eye no way to chunk it. This
is the surface's real load problem and F9 is its fix.

### Console triage — every warning class, zero "dev mode" dispositions

| Class | Example | Disposition |
| - | - | - |
| `[frame] long frame 143–146ms · blocking 93–96ms (budget 100ms) · @ main.tsx` | every load | **INVESTIGATE** — app boot; input to F4/F7 |
| `[drop] 58/65/68/90/94/100/102ms rendered frame mid-animation · svg[aria-label=Orbweaver] · [data-slot=weave-veil] · OVER BUDGET` | every load, 4/4 runs | **F7** |
| `[drop] 68ms · aside[aria-label=Characters list] · OVER BUDGET` | after the rail click | **F4** |
| `[perf] slow commit region:list 13/25/29/31/41ms` (mount · update · nested-update) | every load | **F6** |
| `[perf] slow commit region:content 15/22/63ms` | on character open | **F3** |
| `[cls] shift 0.0225 unexpected · [role=region] moved 0px,-92px · [data-slot=separator] moved 247px,688px` | at 1562ms, before the Characters click | **NOT MINE** — the Home surface settling during boot; belongs to the Home lane's population, recorded here so it is not double-counted |
| `[cls] shift 0.0219 input-adjacent · [data-slot=character-greeting] moved 0px,84px` | on character open | **F3** |
| `[vite] connecting… / connected.` | every load | **NOT PRODUCT** — the HMR client's own handshake, emitted by `@vite/client`, which is not in the product module graph at all. Named by source, not waved off by build mode |
| `Download the React DevTools…` | every load | **NOT PRODUCT** — React's own console notice from the development React build; same class, named by emitter |
| `[orb] dev introspection ready → window.__orb…` | every load | **NOT PRODUCT** — the dev bridge's own banner, gated on `IS_DEV`; it is the instrument announcing itself |
| `[trpc] → / ← query …` (×20 per load) | every load | **NOT PRODUCT** — the instrument channel. Its *content* is F5's receipt |

**Zero console errors and zero page errors across ~35 runs.**

---

## ARIA-NAVIGABILITY RECOMMENDATIONS (first-class section)

1. **`Opening 1`–`Opening 4`** (F2) — no role, no state, four tab stops. Make the wrapper
   `role="toolbar"` with `aria-label="Openings"`, put `aria-current="true"` on the active button,
   `tabIndex 0/-1` roving, and arrow-key movement inside. This is a copy of the pattern the context
   pane already implements correctly on this same surface.
2. **The suggested-tags block** (F13) — wrap the ten `Accept …`/`Dismiss …` buttons in
   `role="group" aria-label="Suggested tags"` with the count, so a screen-reader user learns the set
   before entering it.
3. **The context Overview label/value pairs** (F14) — emit `dl`/`dt`/`dd`, or `aria-labelledby` from
   each value to its label. Today "Added" and "2d ago" are two sibling paragraphs.
4. **The Voice/Extras/Advanced field states** (nit 20) — `"Filled, 1283 characters"` is a sibling of
   its button. Bind it with `aria-describedby` so a tabbing user hears it.
5. **The `Own look` control** (nit 26) — `<p>` inside `<button>`; use a `<span>`, and give the control
   a name that survives a cold read (`"Character theme: custom"`).
6. **Nothing else.** The rest of this surface's ARIA is genuinely good and I checked it hard: 43 mapped
   elements, **0 DOM fallbacks**; `navigation "Primary"` · `complementary` · `banner` · `main` all
   present and named; every list row is a `listitem` with four named buttons; `Select multiple` carries
   `[pressed]`; every row checkbox is `checkbox "Select <name>"` with `[checked]`; `1 selected` is
   inside `aria-live="polite"`; `status: 10 characters` and `status: Character library.` are live
   regions; the import dialog is a named `dialog` with a `Cancel`; and Lighthouse a11y is **100** on
   both desktop and mobile with a single failure, the inherited-accepted Label-in-Name row.

---

## RETRACTIONS — mine, this pass (six)

1. **"The focus ring is a 1px near-black outline at every stop."** WRONG. My first keyboard walk read
   `outline: 1px rgb(16,16,16)` at all 25 stops and I nearly filed a WCAG 2.4.7. The **style** is
   `none`; the real ring is a box-shadow:
   `oklch(0.158 0.006 60) 0 0 0 2px, oklch(0.72 0.175 52) 0 0 0 4px` — a 2px surface offset plus a 4px
   accent ring, present and `:focus-visible: true` at every stop I re-measured. Reading `outlineWidth`
   without `outlineStyle` is the bug in my probe.
2. **"Under `--theme Light` the rail stays dark while the panes flip."** WRONG, and it is exactly the
   `light-theme-polarity-receipts` failure mode. Measured: `NAV.shell-rail` =
   `oklch(0.955 0.006 72)` = `rgb(243,239,236)` under Light vs `oklch(0.132 0.006 60)` = `rgb(9,7,6)`
   under Hearth. `shell-panel`, `shell-main` and the banner all flip with it. My eye misread the PNG.
3. **"The opening prose is a wall of forced italic."** WRONG. The `<p>`'s own `font-style` is
   `normal`; quoted speech is a `<span>` at `normal` in `oklch(0.85 0.1 62)`; only `<em>` narration is
   italic, in `oklch(0.76 0.03 240)`. The italic is markdown from the card, correctly rendered, and it
   is one of the nicer things on the surface.
4. **"The bulk selection count is not announced."** WRONG. `1 selected` sits inside an
   `aria-live="polite"` region (ancestor walk receipt in `p-eye-characters-bulkbar.log`).
5. **"The row's Star/Chat/Actions buttons are focusable while invisible."** HALF WRONG, and the half
   that matters is the good half. At rest: `opacity: 0`, box `[240,197,34,34]`. Focused: `opacity: 1`,
   box **identical**. Reveal is opacity in reserved geometry and focus reveals it — the sanctioned
   pattern, correctly implemented.
6. **"The rail is missing a section — 9 nav buttons against `SECTION_IDS`' 10."** NOT A FINDING.
   `config` renders at the foot as the gear labelled "Settings" per owner ruling #297 / #866 S1
   (`packages/client/src/state/section-registry.ts:34-35`). I checked the tuple before filing, per the
   §14 warning that this exact count has minted false structural P1s twice.
   Likewise **"six sections are unreachable on mobile"** — the `You` drawer carries
   `group "More"` with all six.

---

## WHAT IS GENUINELY WORKING (do not touch)

1. **The list pane's hover-reveal is textbook.** Zero horizontal layout cost, `opacity: 0 → 1` in
   byte-identical reserved geometry, revealed by focus as well as hover, and it correctly goes
   always-visible at coarse pointer. Measured both states.
2. **The context pane's `toolbar "Character"`.** `aria-current="true"` on the active tab, roving
   tabindex `0 / -1 -1 -1 -1 -1`, six honestly-named tabs, History promoted out of the old junk
   drawer. This is the ratified idiom (#112) implemented correctly, and it is the model F2 should copy.
3. **Contrast, everywhere, in both themes.** `main p` 8.45:1 (Hearth) / 7.37:1 (Light) · `main h3`
   8.45 / 7.37 · `aside h2` 8.66 / 7.01 · `Sort characters` 13.29 / 10.55 · list-row name 15.76 /
   12.23 · narration `<em>` 8.29:1 · card title 13.90:1. Zero `contrast` findings over 38–42 judged
   candidates in every arm. `gray-on-color` 0. `text-over-art` fully excluded (`flatBackdrop=38`).
4. **Layout integrity.** `--expect-no-overflow` PASS on `html`, `aside` and `main`
   (`overflow=0x0 escapes=0`); `distorted-image` fully excluded (`objectFitCropsOrLetterboxes=12` —
   every avatar is a 512×512 source in a 32×32 `cover` box); `tap-target` 50/50 judged, 0 affected, at
   **both** pointer classes.
5. **The panel FLIP.** `motion-audit characters --panel list=collapsed --selector '[aria-label="Show
   list panel"]'` → **0/24 frames dropped (0%)**, worst blocking 4ms, observed non-virtualized CLS
   0.008 (input-adjacent, `main` moved 80px,494px — the intended move). The docked↔collapsed
   transition is clean.
6. **The selector map: 43 elements, 0 DOM fallbacks, every one `[semantic]`.** Every interactive
   element on this surface is addressable by its accessible identity.

---

## THE SINGLE BIGGEST OPPORTUNITY

**Make the landing tell the truth, then give it something to say.**

F1 and F12 are the same wound seen from two sides. The CONTENT pane's job is to answer "who was I
talking to?" — and today it answers with the wrong field, the wrong count, and one card in a pane
built for a grid. Fix the projection so "Recently chatted" reads the last-chat timestamp and the real
chat count from the same place the context pane reads them; then let the row be a row (the pane is
917px wide and the data supports six cards, not one). That single change turns the section's first
impression from "this looks broken and I don't believe it" into the orientation it was designed to be
— and it retires the `duplicate-action-door` at the same time, because a real recent row stops being
a redundant copy of the list's top item.

Second, `typeset`: give the section a display voice (F9). A `<h2>` smaller than body text is why
eleven groups in the editor all shout at once.

---

## INSTRUMENT COVERAGE

| Instrument | Status |
| - | - |
| `design-audit characters` desktop (REST) | **RAN — NO VERDICT** (`selection-idiom unmatchedUnselected=1`, correct per #1059 §1, not filed). `findings=10 p0=0 p1=0 p2=8 p3=2`, census 386, `reached=36/36`, `drive-state=rest` |
| `design-audit characters` DRIVEN | **RAN — `population-verdict=complete`.** `--click Select multiple --click checkbox-root` → `findings=13 p2=11 p3=2`, census 447, `reached=50/50`, `drive-state=driven`, `selection-idiom candidates=7 judged=2` |
| `design-audit --mobile` | **RAN — NO VERDICT** (`unmatchedUnselected=2`). `findings=1 p3=1`, `pointer=coarse`, `tap-candidates=50 tap-affected=0`, `reached=50/50 (1 re-centred)`. **First run was contaminated by the sibling-lane scratch collision and was discarded**; the quoted run is `p-eye-characters-mobile.json` |
| `design-audit` appearance presets ×5 | **RAN — all NO VERDICT.** `defaults` 10 · `maximal` 10 · `compact` **2** · `reading` 11 · `diagnostics` 10. The `compact` delta is F8's proof |
| `design-audit --theme Light` | **RAN — NO VERDICT.** 10 findings, theme-invariant |
| `design-audit --theme none` | **PARTIAL** — taken via `snap --theme none` for the polarity + contrast receipt (rail/list/main identical to the owner arm; row-name contrast 15.76:1), not as a full audit arm |
| `design-audit` pane-state arms ×3 | **RAN — all NO VERDICT.** `both-docked` 10 (adds `double-empty-state` P2) · `context-only` 15 (adds `promoted-layer-offset` P2 + `off-grid-transform` P3) · `focus` 14. All three report `drive=driven` because the preset itself drives the shell |
| `snap --map` | **RAN** — 43 elements, **0 DOM fallbacks**, `map-fails=0`, every selector `[semantic]` |
| `snap --aria` | **RAN ×5** — landing (96 lines), bulk mode, import dialog, open character (278 lines), context pane docked, mobile `You` drawer |
| `snap --contrast` | **RAN ×3 arms** — Hearth (5 selectors), `--theme Light` (5), open-character (2), + row-name under `--theme none`. **12 PASS, 0 FAIL, 0 OFF-SCREEN refusals.** Fill-only subjects (the Opening-1 selection border) were NOT put through `--contrast` per `snap-contrast-reads-ink-not-fill` — they went through a canvas composite instead |
| Canvas/pixel composite (the fill arm) | **RAN** — `p-eye-characters-border.log`: the F2 selection border composited and rated 1.189:1 against its measured backdrop |
| `snap --eval` geometry/state probes | **RAN — ~30** — appearance handles (root + `.shell-grid`), content-leaf census, heading census, list-row + avatar geometry (incl. `naturalWidth`), card metadata box/wrap, Opening-tab state ×2, field-button association, quote/narration font-style, hover-reveal rest-vs-focus, bulk bar geometry + `aria-live` ancestor walk, checkbox `::before`, coarse tap census, rail/pane backgrounds ×3 themes, `__orb` suite |
| `snap --expect-*` | **RAN** — `--expect-no-overflow` on `html`, `aside`, `main`: **3 PASS**, `overflow=0x0 escapes=0`, `assertion-fails=0` |
| `snap --json` | **SKIPPED** — console never approached the 200-message cap (max 38 in one run); the terminal view was never truncated |
| `snap --matrix` | **SKIPPED with reason** — the isolated stage band (`:8888`/`:5273`) is held by sibling worktree `agent-a963e6683c39fd730`; tearing it down is banned. The five appearance presets + two themes + three pane states + two devices were taken as explicit arms instead, which covers the same axes non-pairwise |
| `snap --isolated` | **SKIPPED** — same reason; and unnecessary, since `:5173` serves main, which is the surface under review |
| `snap --scenario` | **SKIPPED** — no multi-step flow needed a shared browser lifetime; the errands are single-checkpoint drives |
| `motion-audit` (route load) | **RAN — FAIL.** 13 LoAFs style/layout in-frame, worst blocking **509ms**, CLS 0/0/0, 0 dirty animations, 0% dropped of 2 frames. Reported as the cold-boot population, distinct from the interaction arms |
| `motion-audit` rail-click entry | **RAN — FAIL.** **9/64 dropped (14.06%)**, worst blocking 298ms → F4 |
| `motion-audit` character open | **RAN — FAIL.** **14/55 dropped (25.45%)**, observed non-virtualized CLS 0.0233 → F3 |
| `motion-audit` panel FLIP | **RAN — nominally FAIL on one 54ms LoAF, but 0/24 dropped, 4ms blocking, CLS 0.008.** Reported as WORKING |
| `motion-audit --matrix` | **SKIPPED** — the three interaction arms above answer the questions this surface raises; the matrix's required-twins are motion-preset deltas and no finding here turned on one |
| `perf-meter` | **RAN — CLEAN.** `characters --click '[aria-label="Sabine Veyra"] >> nth=0' --cycles 3`: 0 long tasks, click 32/40/48ms, input delay 2/1/1ms, shift 0, `breach-steps=0`. First cycle's `rafGap 50ms` (≈3 frames) is the only blemish. **Note the disagreement with `motion-audit`'s 25% drop on the same click** — perf-meter measures input responsiveness (clean), motion-audit measures rendered frames under 4× CPU throttle (not clean); both are true and the surface feels the second one |
| `record` (webm + gif + click strips) | **RAN** — real Playwright clicks: rail → Characters → open Sabine → Select on → Select off. `steps=4 step-failures=0 page-errors=0 click-strips=4`. `p-eye-characters-drive-click2.png` is F3's visual receipt |
| Lighthouse desktop | **RAN** — snapshot mode, a11y **100** / best-practices 100 / SEO 100 / agentic 100. **1 failure**: `label-content-name-mismatch`, **10 nodes**, node path `…ASIDE…@container/list-row > button.group` = product, not the checker overlay |
| Lighthouse mobile | **RAN** — identical scores, identical single failure, identical 10 nodes. `target-size` score **1** and `color-contrast` score **1** on both devices |
| `__orb` suite | **RAN** — `.renders()` (F6), `.queries()` (F5), `.flags()` (F7), `.shell()`, `.motion()`, `.animations()` (**empty — 0 active animations at idle**), `.perf()` (`app-ready 2841ms`), `.bus()` (`live:0`) |
| Keyboard walk | **RAN** — 25 consecutive Tab stops with `activeElement`, `:focus-visible`, outline AND box-shadow, and the bounding box read at each; plus both skip-link activations measured separately |
| Hover-state paint | **RAN** via `design-audit`'s forced-state pass: rest `hover-candidates=64 hover-judged=53 hover-subjects-forced=19`, driven `68/53/22`, **0 findings**. **Caveat per the #1073 known-defect row:** `hover-contrast` publishes `excluded(noHoverChange=2 / 40)` on this surface and that exclusion is the exact class #1073 says is force-blind for `group-hover:` paths — and the list row IS a `button.group`. **A clean hover-contrast here proves nothing about the row hover.** I verified the reveal by hand (rest-vs-focus opacity) instead |
| Real-pointer hover oscillation | **SKIPPED with reason** — the structural invariant holds: the reveal is `opacity` in byte-identical reserved geometry (measured), not a `display` swap, so the hit-test oscillation class cannot occur here |
| PNGs actually looked at | **RAN — 7 read in full**: landing, skip-to-content focus state, open character ×2, bulk mode, `--theme Light`, `--mobile`, plus the `record` 6-tile click strip |
| Console triage | **RAN** — 12 classes tabulated above, zero "dev mode" dispositions; each non-product row named by its emitter |
| Prod-build CLS arm (#836) | **SKIPPED with reason** — F7's boot-splash drop is a rendered-frame flag from the app's own instrument, reproduced 4/4, not a bundler artefact; the prod arm answers boot-CLS, which nothing here turned on. Its magnitude on a prod bundle is therefore **unmeasured, and I say so in F7** rather than implying the dev number transfers |
| `--contexts` / multi-user arm | **SKIPPED** — no per-principal visibility question on this surface; the fixture stack was not up and booting it was not warranted |
| `--upload` / completing an import | **SKIPPED** — read-only pass; completing an import mutates the library |
| Error / empty / 1000-item states | **SKIPPED with reason** — the true-empty (zero-character) arm is unreachable: the ten seeded examples ARE the first-run population, and deleting them mutates. The 08-30 pass's praise for the no-matches states was **not re-verified**; I neither confirm nor retract it |

### Artifact slots (mine)

`reports/snaps/p-eye-characters-{landing,skip-content,skip-list,reveal-focus,open,openings,bulk,import,light,mobile,mobile-you,context,filters,group}.png` ·
`reports/design-audit/p-eye-characters-{desktop,driven,mobile,defaults,maximal,compact,reading,diagnostics,light,pane-both-docked,pane-context-only,pane-focus}.json` ·
`reports/recordings/p-eye-characters-drive.{webm,gif}` + `-click{1,2,3,4}.png` ·
`reports/perf-meter/perf-meter.json` ·
`reports/lighthouse-p-eye-characters-{desktop,mobile}/report.{json,html}`.
One artifact is **misnamed and is not mine to cite**: an early `--shot-of 'main'` run lost its
`--out` and wrote `reports/snaps/root.png`.

## STATE LEFT BEHIND

**Nothing written.** No character created, edited, starred, archived, deleted, tagged, exported or
imported; no setting changed; no import completed. The bulk-mode and filter drives are client state
only and reset on reload. No file written outside `reports/`, the scratchpad, and this review.

---

## Issue summary for #1114

Full-battery side-eye of the **Characters** rail surface against main tip `97a110dff` (vite pid
3858659, age-verified; ~35 runs, 0 page errors, 0 console errors, 0 failed requests, 0 overflow, 0
assertion failures). **Verdict: DO NOT SHIP AS IS.** The mechanics are strong — 43 mapped elements
with **zero DOM fallbacks**, Lighthouse a11y **100** desktop and mobile, all 12 measured contrast
ratios PASS in both themes (7.0–15.8:1), `tap-target` 50/50 clean at **both** pointer classes, no
overflow anywhere, and the panel FLIP at **0% dropped frames** — but the surface's primary landing
element is **factually wrong**. **Three P1s:** (F1) the "Recently chatted" card says
`chatted 2d ago · 0 chats` while the same character's context pane says `1 chat` and
`Last chat: Aug 2, 2026` and `Added: 2d ago` — the card renders the *added* date under a heading
annotated "sorted by last chat", and the chat count disagrees across three homes; (F2) the four-way
Opening selector carries **no `role`/`aria-pressed`/`aria-current`/`aria-selected` at all**, and its
only visual state is a 1px border compositing to **1.189:1** against a WCAG 1.4.11 floor of 3:1;
(F3) opening a character drops **25.45%** of frames (14/55) with a bare "Loading character…" line
over an empty pane and an 84px post-fill greeting jump. **P2s:** rail entry drops 14.06% of frames;
**seven** `character.list` round-trips paint a ten-row landing and `region:list` commits 16×; the
boot splash (`weave-veil`) drops frames 4/4 loads at up to 2× budget; the **shipped-default** glass
panels put 8–13 text elements off the device-pixel grid inside a promoted layer (`--appearance-preset
compact`, the only arm with `blurSurfaces: []`, reports **0** — that is the proof); the surface has
no display voice (largest text 16px, the LIST `h2` is **10.5px**); Delete is the only filled control
in the bulk bar while its dismiss is orphaned on a second row; the token datum is unlabelled in one
home and labelled in another. Plus 17 receipted nits. **Six 08-30 findings are verifiably FIXED**
(import dialog exit; 44×44 coarse import; the 28 dead tag facets; the "Field" junk-drawer rebuilt as
a correct `toolbar` + `aria-current` + roving tabindex with History as its own tab; honest
provenance; and #1067's checkbox ladder confirmed — the surface was never wrong there). **Six
self-retractions published**, including two polarity/geometry misreads of my own PNGs (the focus ring
is a box-shadow, not a near-black outline; the Light rail is `oklch(0.955 0.006 72)`, not dark) and
one inherited claim killed (the 08-30 "skip link reaches row 1 in two keystrokes" — it is Tab stop
**15**). **Instrument notes, not filed:** the bare/rest `design-audit` NO-VERDICT is correct per
\#1059 §1, and in fact **every** rest-regime arm on this surface is structurally NO-VERDICT — only the
driven run can publish `population-verdict=complete`; and the clean `hover-contrast` row is untrustworthy
here per the #1073 known-defect row, because the list row is a `button.group` and the rule is
force-blind to `group-hover:` paint (I verified the reveal by hand instead). **One environment fault
reported mid-run:** sibling side-eye lanes share one scratchpad, and a generic scratch name served me
the Home lane's complete `design-audit` run as if it were mine — lane-unique artifact names are now
load-bearing, not hygiene. Full report:
`docs/reviews/side-eye/2026-09-02-characters-rail-drive.md`.
