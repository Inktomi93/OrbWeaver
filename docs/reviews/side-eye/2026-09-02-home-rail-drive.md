---
kind: review
status: draft
updated: 2026-09-02
---

# side-eye — HOME, rail-sweep drive with the full battery (#1112)

> **Lane p-eye-home, 2026-09-02.** The 08-30 riders, verbatim, so the reports compare: use the FULL
> instrument battery · the bar is EXCELLENCE, not acceptability · report EVERY finding including nits
> ("this is our bedrock, our Alamo") · work through it as a user would and report UX/IA and what feels
> crunchy · pre-launch posture — judge against the correct END STATE, not against what is tolerable.
> Judge, don't fix.
>
> **Predecessor:** [`2026-08-30-rail-home-delta.md`](2026-08-30-rail-home-delta.md) (read in full before
> this one; its findings are referenced by their headings, its retractions as R-1…R-6).
> **Method template:** [`2026-09-02-config-surface-live-drive-2.md`](2026-09-02-config-surface-live-drive-2.md).

## Environment + run health

Vite on `:5173` is **pid 3858659, started 01:16:02, age-verified before the first receipt** (1h40m old at
start, so younger than no merges but older than the tip — the served-module check reported `fresh` and
every run since has been `nav=OK` with zero page errors, so the era-limit tell never fired). Server
`:8788` pid 3858309. Main tip `7fa019799` (2026-09-02 02:55:14). This worktree is at the same tip.

**Run health across ~40 driven runs:** `nav=OK` · `nav-actions-failed=0` · `steps-failed=0` ·
`page-errors=0` · `console-errors=0` · `failed-req=0` · `vite-dep-churn=0` · `deadcss=0` · `emptycss=0` ·
`environment-fails=0`. Console *warnings* are non-zero and triaged in a table at the end — no row is
disposed of as "it's dev mode".

**Two environment faults, both reported mid-run:**

1. The chrome-devtools MCP browser profile was held by an idle sibling browser and refused every call
   (`The browser is already running for /home/inktomi/.cache/chrome-devtools-mcp/chrome-profile`). The
   orchestrator freed it; both Lighthouse arms were then taken — **and the first pair of them was a lie**
   (retraction R-1).
2. The scratchpad is shared with the sibling Characters lane and my generic log names were clobbered
   mid-drive (retraction R-3). Every arm affected was re-run under lane-prefixed names and re-verified.

---

## VERDICT — SHIP WITH FIXES

Home is still the best-made surface in the app and it survived a harder attack than last time: 35/35
`:focus-visible`, Lighthouse 100 across all four categories on both devices, zero distorted images, zero
reading-surface violations, contrast 7.62–17.14:1 in both themes, and copy that now tells the truth about
seven unbuilt features instead of one. The 08-30 taste findings about the roadmap block are **fixed or
obsolete**.

What stops it being a clean SHIP is **one measured WCAG failure at the shipped default viewport that the
entire detector fleet is structurally blind to** — the bottom fade mask paints over two live buttons and
drops their ink to **1.75:1** — plus **a feature with a live wire and no door on mobile** (notifications).
Behind those sit a shell that renders two full-height blurred panes for a section that declares it has
none, a page with no plan for any viewport taller than 800px, and prose that reaches **153 characters per
line** at 1920.

**Design health: 32/40 — "good" band** (08-30: 33/40). Calibration only; every item below is filed
regardless of the band.

---

## Design-health score (Nielsen, honest)

| # | Heuristic | Score | Key issue |
| - | - | - | - |
| 1 | Visibility of system status | 3/4 | Fade cue works, but 147px still hidden at 1280×800; boot re-settles 0.0229 every load; Resume shows **nothing for ~240ms** then 360ms of skeleton |
| 2 | Match system ↔ real world | 4/4 | "Six rooms, still warm." · "Not started yet, and there is no date to promise." · "Partly built — the table runs; encounters … are still to come." The house metaphor holds and the honesty is exemplary |
| 3 | User control & freedom | 4/4 | Everything reachable is reversible; the roadmap folds; the rail never leaves |
| 4 | Consistency & standards | 3/4 | `data-voice="gloss"` is spelled two different ways 4px apart (H8); the rail's Settings **section** is named like the Settings **modal**; the chips duplicate the rail (sanctioned) |
| 5 | Error prevention | 4/4 | Nothing destructive is reachable from Home; temp-chat irreversibility is explained before the door |
| 6 | Recognition over recall | 4/4 | "Elsewhere in the house" is the labelled legend for an icon-only rail; faces on the quick-picks; real last-message snippets |
| 7 | Flexibility & efficiency | 3/4 | ⌘K + skip link + one-click resume on desktop; on mobile the command menu is two taps deep inside the You sheet and there is no search on Home at all |
| 8 | Aesthetic & minimalist | 2/4 | **307px of void under both columns at 1920**, an orphan roadmap trigger in the bottom-right quadrant, 153ch paragraphs, an art accent that is 0px wide at 1280, a chip row that orphans one chip |
| 9 | Error recovery | 2/4 | Unchanged coverage gap — no error path inducible read-only; all 11 queries succeeded in every run |
| 10 | Help & documentation | 3/4 | The Temp-chat and Databank paragraphs teach genuinely well; no help affordance anywhere |

---

## PART 0 — DELTA vs the 2026-08-30 drive

| 08-30 item | Verdict | Receipt |
| - | - | - |
| **P2 — the UI law names NINE rail sections** | **FIXED** (in the law, and the rail changed too) | The skill's §14 and `section-ids.ts:18` now agree on TEN, and the live rail enumerates nine nav buttons + Settings at the foot + persona: Home · Chats · Characters · Corpus · Extensions · Databank · Presets · Refinery · Analytics · **Settings** · Playing as Traveler. Note the DELTA the 08-30 report could not have: the config section's rail label is now **"Settings"**, not "Configuration", and it sits at `rail.end` |
| **P3 — "What's coming" has no section-header voice** | **FIXED** | The trigger's label is now `span[data-voice="interactiveKicker"]`, **Geist 13px / 600 / uppercase / `oklch(0.74 0.008 65)`**, inside its own `h2`, with the hairline rule — the same band voice as `START WITH` / `TEMP CHAT` / `DATABANK`. At 1920 it no longer shares a baseline with the Databank header as a stray control; it reads as a peer section (its own new problem is H6) |
| **P3 — the roadmap region is a whole section to deliver ONE dateless item** | **OBSOLETE — the ruling's INPUT changed** | The region now carries **seven** items (Buddy · RPG mode · Expressions · Reactions · World state · Agents of their own · World maps), each with a description and a per-item status line, plus a count badge. The owner's "fold, don't cut" ruling now governs a seven-item block, which is exactly what it was written for |
| **P3 — Home re-settles on every load** | **STILL STANDING, byte-identical** | `cls-non-virtualized=0.0229` (motion-audit, two independent runs), 4 shifts, dominant **0.0225** with `[role=region] moved 0px,-26px` + `[role=region] moved 0px,-92px` — the same two movers, the same magnitude as 08-30's 0.0221. At 1280×1400 a **third** mover joins (`section[aria-label="What's coming"] moved 0px,-155px`, total 0.0255); mobile is **0.0303**. The #453 boot-two premise was NOT re-probed this pass (say so rather than guess) |
| **Triaged — Lighthouse mobile CLS 0.122, our probes say 0.029** | **GONE** | Lighthouse mobile navigation CLS is now **0** (desktop 0.001). The #836 declared-limit divergence does not reproduce on this tip. Caveat: that pair of runs turned out to be measuring Settings (R-1), so read this as "the divergence did not reproduce anywhere I measured", not as a Home-specific closure |
| Focus-ring recipes: three | **NOT RE-MEASURED at recipe granularity** | 35/35 stops carry a live ring (`outline-style: none` + a box-shadow chain at every stop); I did not diff the three recipes. #457's refusal stands |
| Boot splash frame drops | **STILL STANDING, same class** | `[drop] 51–109ms · [data-slot=weave-veil] / svg[aria-label=Orbweaver] / [data-slot=skeleton]`, and motion-audit attributes a 165ms LoAF to `packages/ui/src/art/web-weave/web-weave.tsx` `loop via FrameRequestCallback`. #429 ATTRIBUTED; dev-inflated |
| `all-caps-body` P3 (cast credit line) | **STILL STANDING**, still the only ratified-voice finding | `all-caps-body candidates=63 judged=54 affected=1` desktop, `84 judged=68 affected=1` driven, `uppercase on 34 chars` at both pointers, both themes, all five appearance presets |
| Hero art absent at 1280 | **WORSE, and now measured** | The art-bleed layer is **0px wide at 1280** (rect `[773, 175, 0, 132]`) and **33px at 1920** (`[938, 175, 33, 132]`). 08-30 measured 172×134 at 1280 — it has gone to zero. See H7 |
| `region:content` renders 22× / 42ms / max 17ms | **COUNT held, COST did not** | Two samples: **21 / 222ms / max 98ms** and **17 / 104ms / max 62ms**. Console range across ~12 runs: 15–105ms per commit. Stated as a range, not a regression verdict (H15) |
| Resume gap: worst rAF 150ms | **IMPROVED on the rail, still crunchy on the hero** | `perf-meter --click [aria-label=Chats] --cycles 3`: first click 141ms of long tasks / worst 90ms / **67ms rAF gap** / 32ms click / 3ms delay; cycles 2–3 clean (0 long tasks, 33ms gap). But the *hero* Resume is now measured at ~600ms end-to-end with a 52px hero jump (H13) |
| ARIA: nothing to fix, 31 stops | **HELD, and grew to 35 stops** | See "What is genuinely working" |
| Taste: top-heavy at 1920, ~430px void | **STILL STANDING, now measured exactly** | 1920×1080: both columns finished by y=773, **307px of empty below**. 1440×900: left 773 / right 915. 1280×800: left 773 / right 851, 147px hidden (08-30: 141px — 6px worse, the Databank block grew) |
| Taste: six caps kickers in one viewport | **STILL STANDING, now SEVEN and all consistent** | `PICK UP WHERE YOU LEFT OFF` · `OTHER ROOMS` · `ELSEWHERE IN THE HOUSE` · `START WITH` · `TEMP CHAT` · `DATABANK` · `WHAT'S COMING`. The seventh joined the drumbeat by being FIXED into the same voice — the right fix, and it makes the flattening more uniform, not less |
| Taste: reading-arm right gutter | **NOT RE-MEASURED at gutter granularity** | `--appearance-preset reading` was run (design-audit, `findings=1`, the fewest of any arm) but I did not re-measure the quick-pick grid's right gutter |
| Retraction R-5: the empty/first-run state is unreached | **STILL UNREACHED** | The stage band was held by a sibling lane, so I could not take an `--isolated` arm at all. The genuine `totalCount === 0` state remains unmeasured |

---

## PART 1 — FINDINGS

### P1

**H1 · Two live buttons render at 1.75:1 at the shipped default desktop viewport, because the fold-fade
mask paints over them — and every contrast instrument we own reports PASS.**

The content scroller carries `data-fade-bottom` and
`mask-image: linear-gradient(rgba(0,0,0,0), rgb(0,0,0) 0%, rgb(0,0,0) 90%, rgba(0,0,0,0))` over rect
`[56, 48, 1224, 752]`. The fade band therefore begins at 90% of 752 → **viewport y 724.8** and reaches
zero alpha at y 800. The Databank empty state's two buttons sit at **y 773 → 805** — entirely inside the
band, at roughly 36% alpha falling to 0.

Framebuffer decode (not the eye — polarity and alpha claims need pixels):

| Subject | Arm | Brightest ink px | Darkest backdrop px | Ratio |
| - | - | - | - | - |
| `Open Databank →` | **1280×800 (shipped default)** | `srgb(61, 59, 56)` @ (1025, 784) | `srgb(15, 12, 10)` | **1.75:1** |
| `Open Databank →` | 1280×1400 (above the band) | `srgb(242, 240, 237)` @ (1025, 784) | `srgb(15, 12, 10)` | 17.14:1 |
| `Start a temp chat` (control, above the band in both) | 1280×800 | `srgb(242, 240, 237)` | `srgb(15, 12, 10)` | 17.14:1 |
| `Start a temp chat` (control) | 1280×1400 | `srgb(242, 240, 237)` | `srgb(15, 12, 10)` | 17.14:1 |

Receipts: `reports/snaps/p-eye-home-boot.png`, `reports/snaps/p-eye-home-coming-open.png`. The control
proves the sampling is honest: the same decode on a button outside the band returns the correct 17.14:1
in both arms, so the 1.75:1 is the mask, not my method.

**Why it hurts a user:** WCAG 1.4.3 needs 4.5:1 (3:1 even for large text). These are not decorative — the
mask is paint only, so both buttons remain fully hit-testable. A user can click a control they cannot
read, and `Add your first document` is the *primary* door of the Databank empty state. At 1440×900 the
same band eats the roadmap trigger row (region bottom 915 vs client 852).

**The instruments are blind by construction, and this is the finding's second half.** `snap --contrast`
and design-audit's whole `contrast` family resolve the subject through `getComputedStyle` — mask is paint,
so both report clean: `POPULATION contrast candidates=61 judged=61 affected=0` in Hearth AND under
`--theme Light`, and `gray-on-color` likewise 61/61/0. Known: memory
`mask-is-paint-invisible-to-computed-style`, and #1078 records that mask paint has **zero** fleet handling
in either direction.

**Fix:** `harden: the content scroller's bottom fade — receipt: the opaque mask stop clears the last
interactive row (or the scroller reserves an unmasked footer band), and a framebuffer decode of both
Databank buttons at 1280×800 reads ≥4.5:1.`

---

**H2 · Notifications have a live wire and no door on mobile.**

Every mobile boot opens the channel and reads the inbox — from the `p-eye-home-mobile` console:
`→ mutation stream.attach {"ref":{"channel":"notifications"}}` and
`→ query notifications.list {}` → `← 65ms · {items,nextCursor}`. And then nothing renders it:

- `snap / --mobile --map` = **42 elements, no Notifications** (desktop's map has `button "Notifications"`
  among its 51).
- The mobile banner is empty: `document.querySelector("header,[role=banner]")` → `{"text":"","buttons":[]}`.
- The You sheet (`--click "[aria-label=You]" --map`, 18 elements) carries `Jump to…`, `Settings`,
  `Traveler — current persona`, `Manage personas in Settings`, `Log out`, and the six More sections —
  **no notifications entry**.

**Why it hurts a user:** notifications are the domain the constitution describes as *"the per-user durable
inbox + delivery stream (invite/kick/host-handoff to non-members the per-chat bus can't reach)"*. On a
phone the user is subscribed to that stream and cannot see a single item in it. That is the "no dead
toggles" law inverted — a live consumer with no rendered control.

**Scope, stated honestly:** this is a shell-topbar fact measured from Home; it presumably holds on every
section at coarse pointer. It is filed here because Home is where a returning user lands.

**Fix:** `onboard: the mobile shell — receipt: a notifications affordance exists at coarse pointer (topbar
bell or a You-sheet row with an unread count), and snap --mobile --map names it.`

---

### P2

**H3 · Home renders two full-height, empty, backdrop-blurred panes for a section that declares it has
neither.**

`packages/client/src/features/home/lib/home-section.tsx:30` —
`panels: { list: "unavailable", context: "unavailable" }`, with the header at :13-18 spelling out *"home
has NEITHER pane, and the shell must not ship a toggle that reveals 'Home list — this surface isn't wired
yet' on the app's front door"*. Live DOM says otherwise:

| Element | Rect | State | Paint |
| - | - | - | - |
| `aside[aria-label="Home list"].shell-panel` | x **−307.188**, w **307.188**, h 800 | `inert`, `aria-hidden="true"`, 2 element children, **80 bytes of innerHTML**, 0 tabbables | `backdrop-filter: blur(14px) saturate(1.4)`, `transform: matrix(1,0,0,1,-363.188,0)` |
| `aside[aria-label="Home details"].shell-panel` | x **1280**, w **384**, h 800 | `inert`, `aria-hidden="true"`, 2 children, 80 bytes, 0 tabbables | `backdrop-filter: blur(14px) saturate(1.4)`, `transform: matrix(1,0,0,1,384,0)` |

A whole-document sweep confirms these are **the only two `backdrop-filter` elements on the page**. The
grid tracks are already zero (`grid-template-columns: 56px 0px 1224px 0px`), so they cost no layout — they
cost two permanently composited, full-viewport-height backdrop-filter layers to blur nothing, on the app's
front door, forever.

They are also not inert to the compositor during navigation: the recorded drive flags
\`\[drop] 53ms rendered frame mid-animation · aside\[aria-label="Home list"] · \[data-slot=theme-scope] ·

<html> · OVER BUDGET` on the return-to-Home click, and `[drop] 93ms · aside[aria-label="Chats list"]` on
the way out.

**Why it hurts a user:** it is the most expensive paint primitive in the browser, ×2, for zero content, on
the surface whose whole job is to appear instantly. And it is the direct cause of H4.

**Fix:** `distill: the shell's panel slots on sections that declare a pane "unavailable" — receipt: snap --eval over aside.shell-panel returns [] on Home, and design-audit's promoted-layer-offset population goes
to candidates=0 on this surface.`

---

**H4 · The whole shell's blurred layer lands 0.188 device pixels off the grid, and design-audit files it
in four of six arms.**

`design-audit /` → **P2 `promoted-layer-offset`**: *"this element promotes itself to its own composited
layer (backdrop-filter), which disables text snapping … backdrop-filter layer lands top 0.000 / left
**−0.188** device px off the grid at DPR 1; 1 affected of 2 judged"*, plus P3 `off-grid-transform` on the
same node (`"a resting translation — matrix(1, 0, 0, 1, -363.188, 0)"`). Law:
`docs/design/integer-line-boxes.md` Laws 2 and 3.

Arm-by-arm, all `population-verdict=complete`:

| Arm | findings | `promoted-layer-offset` | `off-grid-transform` |
| - | - | - | - |
| desktop (rest) | 3 | **P2** | P3 |
| desktop (driven, roadmap open, census 411) | 3 | **P2** | P3 |
| `--theme Light` | 3 | **P2** | P3 |
| `--panels focus` (drive=driven) | 3 | **P2** | P3 |
| `--appearance-preset defaults` | 3 | **P2** | P3 |
| `--appearance-preset maximal` | 3 | **P2** | P3 |
| `--appearance-preset diagnostics` | 3 | **P2** | P3 |
| `--appearance-preset compact` | 2 | — | P3 |
| `--appearance-preset reading` | **1** | — | — |
| `--mobile` (pointer=coarse) | **1** | — | — |

The width is the cause: **307.188px is 24dvw of 1280 (307.2) after subpixel rounding**, so the fraction is
inherent to a viewport-derived pane width and will recur at most widths. It disappears under `compact` and
`reading` only because those tiers resolve a different width that happens to land on the grid — a point
measurement would have called this fixed.

**Fix:** `polish: the shell panel track width — receipt: the resolved panel width is device-pixel-snapped
at DPR 1 and 2, and design-audit reports 0 promoted-layer-offset / 0 off-grid-transform at 1280, 1440 and 1920.` (If H3 lands first, this dies with it.)

---

**H5 · No measure cap on the teaching prose — 153 characters per line at 1920.**

Canvas-measured average glyph advance per paragraph (`main p`, ≥40 chars):

| Paragraph | 1280×800 | 1920×1080 | `max-width` |
| - | - | - | - |
| Temp chat — *"A room that never joins your chats list…"* | 442px = **76.7ch** | 884px = **153.2ch** | **`none`** |
| Databank — *"Upload a file, paste text, or pull in a page…"* | 442px = 76.3ch | 426px = 73.5ch | `none` |
| Hero snippet — *"Sabine is already on it…"* | 660px = **94.7ch** | 750px = **107.7ch** | `750px` |

§2 of the design law is 65–75ch. The Temp-chat paragraph is **over 2× the ceiling** at 1920 and already
over it at 1280; the Databank one is saved only by the 1920 sub-column split. And the one element that
*has* a cap is capped in **pixels** (750px), which is 107ch at this type size — a pixel cap is not a
measure cap.

`design-audit`'s `line-length` rule cannot see it from where we run it:
`candidates=63 judged=6 affected=0 excluded(srOnly=2 notProseTag=55)` at 1280 — six judged subjects, and
the run never happens at 1920.

**Fix:** `layout: the region teaching paragraphs and the hero snippet — receipt: every main p resolves to
≤75ch measured by glyph advance at 1280, 1440 and 1920, not to a pixel max-width.`

---

**H6 · The page has no plan for any viewport taller or wider than 800×1280.**

Measured region bottoms (`main [role=region]` rects), every arm:

| Viewport | Left column ends | Right column ends | Hidden below fold | Void under content |
| - | - | - | - | - |
| 1280×800 | y **773** | y **851** | **147px** | — |
| 1440×900 | y 773 | y 915 | 47px | — |
| **1920×1080** | y **773** | y **773** (Databank 643, roadmap 554) | 0 | **307px** |
| 768×1024 (single col) | — | y 1551 | **615px** | — |
| 430×740 mobile | — | y 1945 | **1293px** | — |

At 1920 (`reports/snaps/p-eye-home-w1920.png`) three things go wrong at once: the right column splits into
two 426px sub-columns while the left stays one 884px column (an **884 | 426 | 426** rhythm that reads as
an accident); the `WHAT'S COMING ⌄ ————— 7` trigger row floats **alone in the bottom-right quadrant** with
526px of nothing under it and its hairline rule running to the page edge; and the "Elsewhere in the house"
chips wrap **8 + 1**, orphaning `Analytics` on its own row.

**Fix:** `layout: the two-column home grid above 1440 — receipt: at 1920 the columns' bottoms differ by
<120px, no region sits alone in a quadrant, and the chip row has no orphan.`

---

**H7 · The hero's art accent is zero pixels wide at the default width and a 33px face-slice at 1920.**

`DIV.pointer-events-none.absolute.inset-y-0.end-0`, `background-image: url(/api/blob/4cad4141…)`,
`background-size: cover`, `background-position: 50% 50%`,
`mask-image: linear-gradient(to left, rgba(0,0,0,0.55), rgba(0,0,0,0))`, `opacity: 1`.

- **1280×800: rect `[773, 175, 0, 132]` — width 0.** The accent does not exist at the default desktop
  width. (08-30 measured 172×134 here.)
- **1920×1080: rect `[938, 175, 33, 132]`.** `cover` at 50% 50% on a square portrait in a 33×132 box takes
  the middle vertical slice — which is the face. The element shot
  `reports/snaps/p-eye-home-hero-1920.png` shows a strip of hair and part of an eye, cut vertically at the
  card's edge.

It obeys the reading-surface rule (the mask fades to nothing before the prose, `text-over-art
candidates=61 judged=0 excluded(flatBackdrop=61)`), so this is craft, not safety: at every width I
measured it is either absent or reads as a clipped image rather than an intentional edge accent.

**Fix:** `bolder: the hero art bleed — receipt: the layer has a non-zero, deliberate width at 1280 and a
crop that reads as an abstract edge rather than a face fragment at 1920; element shots at both.`

---

### P3

**H8 · `data-voice="gloss"` is spelled two different ways, 4px apart, inside one component.**
Type census of the opened roadmap (7 pairs, identical each time):

| Role | Font | Size / weight / leading | Colour | `data-voice` |
| - | - | - | - | - |
| Item description | `Geist` | 13px / 400 / 20px | `oklch(0.74 0.008 65)` | **`gloss`** |
| Item status line | **`"Geist Mono"`** | **10.5px / 400 / 13px** | `oklch(0.74 0.008 65)` | **`gloss`** |

One voice name, two renderings, same colour, stacked. §15 `typeset`: the five voices exist so a role has
one spelling. **Fix:** `typeset: the roadmap status line — receipt: it carries its own voice (datum, or a
new named one) rather than a second rendering of gloss.`

**H9 · A 95-character sentence at 10.5px monospace.** *"Partly built — the table runs; encounters and
handing the GM seat to a person are still to come."* renders at `Geist Mono 10.5px / lh 13px`. The ramp
sanctions the size (`text-below-ramp candidates=84 judged=84 affected=0`, `undersized-ui-text` likewise
84/84/0 — it is not interactive text), so this is a legibility judgment, not a rule breach: mono at 10.5px
with 13px leading is a *stamp* voice being asked to carry a sentence.

**H10 · The roadmap count badge is an unnamed "7" in the accessible tree.**
`span[data-slot="badge"]`, 25×30 at x=1223, `aria-label: null`, `title: null`. `snap --aria` renders the
region as `heading "What's coming" [level=2] → button "What's coming"` then a bare **`text: "7"`**. A
screen-reader user hears "What's coming, collapsed… seven". Contrast is fine (7.68:1 Hearth / 7.62:1
Light). **Fix:** `clarify: the roadmap badge — receipt: the count folds into the trigger's accessible name
("What's coming, 7 items") or the badge carries its own aria-label; verified with snap --aria.`

**H11 · Opening the roadmap drops two frames.** Real Playwright click, unthrottled:
`[drop] 67ms rendered frame mid-animation (budget 50ms) · [data-slot=collapsible-trigger] · OVER BUDGET`
and `[drop] 51ms · [data-slot=collapsible-panel] · [data-slot=collapsible-trigger] · OVER BUDGET`. The
height animation itself is correctly **not** a finding — the console says so in its own words:
`[anim] Base UI lifecycle height — the ratified panel-height allowance (guide §4.2 item 3), not a §3.7
violation` (#1069 landed and works). See retraction R-2 for the number I do **not** file.

**H12 · Every section switch forces a synchronous reflow inside a long frame.** Reproduced on all four
recorded clicks: `[frame] long frame 129–216ms · blocking 62–155ms @ view-transition.ts` immediately
followed by `[reflow] forced synchronous style/layout 8–18ms inside that frame · @ view-transition.ts`.
Same class the Config drive found; reproducible on demand from Home.

**H13 · Resume is the crunchiest moment on the surface: ~240ms of nothing, then ~360ms of skeleton, and
the hero jumps 52px on the way out.**
`pnpm record` 6-tile × 120ms strip `reports/recordings/p-eye-home-drive-click3.png`: tiles 1–2 are
unchanged Home, tiles 3–5 are the room shell with two grey skeleton bars and an empty content well, tile 6
paints text. Console at the same click:
`[cls] shift 0.0225 input-adjacent (excluded from CLS) · div[aria-label="Example — The Ashen Spire"] moved
0px,52px · [data-slot=skeleton] moved 437px,112px · … · observed 0.0454`, then
`long frame 216ms · blocking 155ms @ view-transition.ts`, `slow commit region:content 215ms`,
`long frame 285ms · blocking 210ms · commitRootWhenReady`, `[drop] 109ms`. Chrome excludes the shift from
CLS because it is input-adjacent — judge it on `observed`, which is what #1071 exists to make possible.

**H14 · Home still re-settles on every load** — see the delta table. Under the 0.1 budget, so a P3
composition item, not a re-opened P2. The two movers are unchanged from 08-30; the third
(`section[aria-label="What's coming"] moved 0px,-155px`) is new because the region grew.

**H15 · `region:content` commit cost is 2.5–5× the 08-30 record, at an unchanged commit count.**
Sample A: `count 21 · mounts 1 · updates 20 · totalMs 222 · avgMs 11 · maxMs 98`. Sample B: `17 · 1 · 16 ·
104 · 6 · maxMs 62`. 08-30: `22 · 42ms · maxMs 17`. Console per-commit range across ~12 runs: 15ms · 18ms ·
23ms · 24ms · 28ms · 29ms · 34ms · 37ms · 83ms · 105ms. Two samples is enough to state a range and not
enough to convict — dev build, load-varying, and #454 already refuted reading the *count* as churn. Stated
as: the number of commits held, the cost per commit did not.

**H16 · The chip row orphans a chip at every width I measured.** 1280: 6 + 3. 1920: **8 + 1**. Nine chips
never divide evenly into the column widths this layout produces.

**H17 · The cast credit line wraps under RESUME on mobile.** `reports/snaps/p-eye-home-mobile.png`:
`SABINE VEYRA · CALAMITY ·` / `MORGATHA` on two lines with `RESUME →` vertically centred against the pair,
so the action label sits between the two text lines. Still standing from 08-30.

**H18 · The Databank empty state offers two doors and puts the teaching after both.**
`region "Databank"` → `paragraph: No documents yet` → `button "Add your first document"` →
`button "Open Databank →"` → `paragraph: Upload a file, paste text, or pull in a page — its contents get
indexed…`. "Open Databank" opens a bank the same block just said is empty; and the sentence that explains
what a databank *is* comes after you have been asked to choose. (Temp chat has the same door-then-teach
order, so the order is a house pattern — but Temp chat has one door, and this one has two.)

**H19 · Stumbled on, out of scope, reported with its receipt: a dead Tailwind class in the chat
transcript.** During the recorded drive, in the room opened by Resume:
`[css] dead class — no rule defines it, so the style never applied · .my-6 on [data-slot=message-bubble]`.
Home's own surface is clean — `deadcss=0 emptycss=0` on every one of ~40 runs.

**H20 · Stumbled on: `aria-label="Chats"` is ambiguous on the Chats section.** After the quick-pick errand,
`snap --map` has to disambiguate by index: `button "Chats" → [aria-label="Chats"]:visible >> nth=0` and
`list "Chats" → [aria-label="Chats"]:visible >> nth=1`. Two different things share one accessible name in
one document. Memory `anchor-attribute-must-resolve-unique`.

---

## PART 2 — INSTRUMENT FINDINGS (file these; the fleet is the thing every other lane consumes)

**I1 · design-audit publishes NO-VERDICT on four axes this surface structurally cannot have — the
population law's polarity, inverted.**

Every Home run prints:

```
SURFACE-AXIS panel-list    candidates=3 judged=1 withheld(docked=1 overlay=1) excluded() — withheld
SURFACE-AXIS panel-context candidates=3 judged=1 withheld(docked=1 overlay=1) excluded() — withheld
SURFACE-AXIS focus         candidates=2 judged=1 withheld(on=1) excluded() — withheld
RESULT … panel-list-axis=NO-VERDICT panel-context-axis=NO-VERDICT focus-axis=NO-VERDICT
        population-verdict=complete
```

But the SAME tool, asked to reach those states, refuses correctly and loudly:

```
$ pnpm design-audit / --panels both-docked
NAV FAILED  panel list=docked: panel "list" did not open — the active section likely declares no "list" pane
NAV FAILED  panel context=docked: panel "context" did not open — the active section likely declares no "context" pane
INSTRUMENT ERROR  the reveal queue is ABSENT — this run is not a verdict          (exit 2)
```

and the source agrees: `home-section.tsx:30` `panels: { list: "unavailable", context: "unavailable" }`.
So the instrument holds the fact in one code path and, in the other, reports **WITHHELD** — which its own
contract defines as *"the rule applies and the instrument could not judge it"* — where the honest polarity
is **EXCLUDED** (*"measured facts prove the rule inapplicable"*). The consequence for a reader is a run
that says `population-verdict=complete` beside three `NO-VERDICT` axes that no arm can ever close.

**Fix:** `audit: the SURFACE-AXIS census — receipt: on a section whose definition declares a pane
"unavailable", the axis prints excluded(sectionDeclaresNoPane=N) and the RESULT axis reads COMPLETE, with
a planted control proving a section that DOES declare the pane still reports withheld when unreached.`
(P2 under the standing fix-tools-as-we-find-them-lying ruling.)

**I2 · The contrast family is blind to mask paint, and H1 is the first Home instance with a measured WCAG
failure behind it.** `snap --contrast` resolves through `getComputedStyle().color`; design-audit's
`contrast` / `gray-on-color` populations read the same way. Both report `candidates=61 judged=61
affected=0` over a surface where a framebuffer decode finds 1.75:1. Known class (#1078 records zero fleet
handling for mask paint in either direction; memory `mask-is-paint-invisible-to-computed-style`) — filed
again because it now has a live product defect attached, which is the argument for closing it.

**I3 · motion-audit's dropped-frame % is a denominator artifact on any suppressed-motion cell.** See
retraction R-2. Not necessarily a bug — the twin machinery is exactly what let me catch it — but a run
that prints `dropped-frames=36.36%` beside `raw-frames=11` should say so on the same line.

**I4 · `snap --matrix` is unreachable from a lane whose sibling holds the stage.**
`ARG ERROR --matrix requires --isolated/--dirty/--ref because rated custom themes and density-preview
drafts are stage-scoped`, and `--stage-status` reports the single band held:
`marker d4f3601e2113 → :5273 · owner …/agent-a963e6683c39fd730 · pid 27663 · started 37m ago`. Per the
standing rule I did not tear it down. Consequence for the mandate: the snap matrix arm and the empty /
first-run state are **both** unmeasured this pass, and both need the stage.

**I5 · A shared scratchpad plus generic log names served me a sibling lane's complete run.** See R-3.

---

## PART 3 — UX / IA: the errands, the taste verdict, what feels crunchy

### The blunt taste verdict

**Does it look like shit? No — at 1280×800 it looks genuinely made, and above that it looks unfinished.**
Warm near-black, one Ember accent, a consistent kicker+hairline band voice on all seven regions, six
portraits at true 1:1 with zero distortion. It trips none of the §6 slop tells and the detector agrees
(three findings, none of them a taste rule). But the moment the window is taller than ~850px the page
stops. `reports/snaps/p-eye-home-w1920.png` is the honest picture: everything is finished by y=773 and the
bottom third of a 1080px screen is empty, with one orphan control (`WHAT'S COMING ⌄ … 7`) marooned in the
bottom-right and one orphan chip (`Analytics`) marooned bottom-left. It reads like a page whose content
ran out, not like a page with breathing room.

**The visual weight is inverted against the page's own copy.** The h1 says *"Six rooms, still warm. You
left off 4w ago."* — this is a returning-user surface and resuming is the point. But the loudest objects
on screen by an enormous margin are **six 135×131 character portraits** under `START WITH`, which is the
*start-something-new* action; the resume hero is a quiet 686×155 card with a hairline. Your eye goes right
and down, then has to come back left and up to do the thing the headline told you to do. Under `--theme
Light` this is worse: the hero card loses its warm tint entirely and becomes a plain white card with a
1px edge (`reports/snaps/p-eye-home-light.png`), so the primary card carries no more weight than the five
plain chat rows beneath it.

**The roadmap is now the best-written block on the page and the worst-placed.** Seven items, each with a
description and an honest status — *"Partly built — the table runs; encounters and handing the GM seat to
a person are still to come."* — and it is parked at the very bottom of the right column, below an empty
Databank, behind a fold, with its status lines set in 10.5px mono.

**Cold first-timer test (5 seconds, from `p-eye-home-boot.png` alone):** you can name the surface, you can
tell those are your rooms on the left and characters on the right, and you would press one. You would
**not** guess that the two greyed-out shapes at the bottom-right are live buttons rather than disabled
ones — which is H1 stated as taste rather than as a ratio.

### Does it flow weird?

**No, the order is right** — greeting → the one room you were in → other rooms → where else you can go →
who you could start with → the two utility blocks → what's coming. That is the correct task order for a
returning user, and the shell physics are obeyed: Home fills CONTENT only, declares both panes collapsed
(`__orb.shell()` → `list:collapsed, context:collapsed`), claims `rail.brand` rather than minting a slot,
and mints no geography of its own.

**What is crunchy:** Resume (H13) — ~240ms of nothing, then a dark room with skeletons, then text; the
hero card jumping 52px as it leaves; and the whole-page re-settle every load (H14) that lifts two regions
26px and 92px just as they become readable.

### One home per concept (§13 IA)

- **The nine "Elsewhere in the house" chips mirror the rail exactly.** Still **sanctioned, not a defect** —
  the rail is icon-only and this is its labelled legend on the one surface where teaching belongs. I
  re-checked and re-affirm 08-30's ruling.
- **No other duplication found.** No concept has two editors, no control sits away from its effect, and
  nothing renders the same fact twice.
- **One vocabulary wobble:** the config section's rail entry is now labelled **"Settings"** and lives at
  `rail.end`, while §14 of the design law says *"Settings IS a modal — not a section, not a pane."* The
  section is sanctioned (owner ruling #297, the config revamp took the gear's slot), so this is a naming
  collision, not a structural one — but the chip reads `Go to Settings` and lands on a rail SECTION, which
  is a different noun from what the law's Settings means. Worth one line in the vocabulary map.

### The errands, driven

| Errand | Outcome |
| - | - |
| **A — resume the last room** | Works, one click, correct room. Crunchy: H13 |
| **B — open a specific older room** | Works. Five rows with real snippets and a `4w` stamp; the accessible name is the title and the snippet is the description — the correct list-row pattern |
| **C — start a chat with a character** | Works. Clicking a Home quick-pick lands in `section: "Chats"`, `chatOpen: true`, list docked, draft room open — no message sent, nothing written. The one wart is that the shape of the destination (a docked list + a room) is nothing like the shape you left |
| **D — go to another section** | Two doors, both correct: the icon rail and the labelled chips. Cost: one 129–216ms long frame with a forced reflow (H12), then clean on repeat (perf-meter cycles 2–3: 0 long tasks) |
| **E — see what is coming** | Works and reads beautifully. Costs two over-budget frames (H11); the badge is unnamed (H10) |
| **F — add a Databank document** | **Blocked by H1 at the default viewport** — the door is a 1.75:1 ghost until you scroll |
| **G — start a temp chat** | Not driven (it writes a row; this is a read-only pass). The teaching paragraph beside it is excellent and explains irreversibility *before* the door |
| **H — Home on a phone** | Resume is full-width and reachable; the bottom tab bar is labelled Home/Chats/Characters/You; the fade cue reads correctly. **1293px of 1929 is below the fold** and notifications have no door at all (H2) |

---

## RETRACTIONS (mine, this pass)

**R-1 · "Home's Lighthouse accessibility dropped 100 → 96, with six `target-size` failures at 245×16 and
two `label-content-name-mismatch` nodes."** **Wrong, and the mechanism is worth keeping.** The
chrome-devtools MCP browser profile is PERSISTENT and this app's section lives in durable-local, so
`navigate_page` to `/` restored **the previous holder's section**. `evaluate_script` proved it after the
fact: `__orb.shell()` → `{"section":"Settings","panels":[{"side":"list","mode":"docked"},…]}` at viewport
**412×823** (the previous holder's mobile emulation), and the 245×16 nodes enumerate as *Appearance ·
Backup & Restore · Chat behavior · Jobs · Personas · Admin · Automation · Connections · Plugins* — the
**Config group rows**, i.e. F1 of the Config report, at 385×16. Both navigation-mode runs are verdicts
about Settings.
Re-taken correctly (`__orb.nav.section("home")`, confirmed `{"section":"Home"}` + `h1: "Six rooms, still
warm."`, then snapshot mode because a navigation-mode reload would restore Settings again): **Home is
a11y 100 · best-practices 100 · SEO 100 · agentic-browsing 100 on BOTH desktop (1350×940) and mobile
(412×823 DPR 1.75)**, with one informational `label-content-name-mismatch` naming the hero card
(`button.block`) and four chat rows (`button.group`) — the known-correct `aria-label` +
`aria-describedby` list-row pattern that 08-30 already triaged as *do not "fix"*.
**Durable lesson:** the URL is not the surface (§12 — this app has two routes and navigates by client
state), so a Lighthouse *navigation* run on `/` audits whichever section the shared profile was left on.
Assert `__orb.shell()` before AND after any MCP audit, and prefer snapshot mode once you have driven the
surface yourself.

**R-2 · "Opening the roadmap drops 30–36% of frames."** Read off `motion-audit --matrix` cells v02
(30.77% of 13 frames) and v03 (36.36% of 11 frames). **Their twins refute it.** v02 is
`appReducedMotion=true`, v03 is `osReducedMotion=true` — the motion is suppressed by design, so the frame
population collapses and four slow frames become a third of the run. The full-motion twins are the honest
measurement: **v01 desktop `5.45% of 55 frames`, v04 mobile `3.39% of 59 frames`.** `required-twins=3`
exists for exactly this attribution, `uncovered-pairs=0`, `instrument-errors=0`, and
`staticExpected: {"status":"ordinary","detail":"candidate produced frames and keeps the ordinary
verdict"}` — the matrix refused to claim a STATIC-EXPECTED it had not earned. What survives is H11: two
over-budget frames on a real, unthrottled click.

**R-3 · Two of my own scratch logs were a sibling lane's run by the time I re-read them.** The shared
scratchpad plus generic names (`da-desktop.log`, `da-driven.log`) meant those files now carry
`out=…/agent-a609dc18fced14b3c/reports/design-audit/p-eye-characters-*.json`. My readings were taken
before the clobber and were Home-consistent (`SHELL STATE section=Home`), but a receipt I cannot re-open
is not a receipt: **both arms were re-run under lane-prefixed log names and every number re-verified**
identical (`census=362` rest / `411` driven, the same three findings, `out=…/agent-a87e651d679fbe637/…
/p-eye-home-*.json`, `population-verdict=complete`). No finding changed. The artifact NAMES were already
lane-prefixed; the LOGS were not — that was the gap.

**R-4 · "The two off-canvas panels are an accessibility leak."** They are not: `inert`,
`aria-hidden="true"`, zero tabbables, empty text content, and `snap --aria` shows no trace of them. What
survives (H3/H4) is compositor cost and raster crispness, not a11y.

**R-5 · `--contrast [aria-label='Open Databank']` reported `NOT FOUND` (`contrast-fails=1`) in both theme
arms.** That is my selector, not a product defect — the button is named by its textContent
(`Open Databank →`), not by an `aria-label`. The framebuffer decode in H1 is the receipt that stands.

---

## WHAT IS GENUINELY WORKING (do not touch)

1. **Focus.** **35 consecutive Tab stops, `:focus-visible = true` at every single one**, in an order a
   person would predict: skip link → the nine rail nav sections → Settings → persona → ⌘K → bell → the
   resume hero → All chats → five chat rows → nine chips → All characters → six character cards. Nothing
   regressed and it grew by four stops.
2. **The a11y skeleton.** Lighthouse **100 / 100 / 100 / 100** on both devices (R-1's corrected run);
   `aria-name candidates=42 judged=42 affected=0`; `tabindex-positive` 46/46/0; `obscured-target` 76/76/0;
   `truncated-to-nothing` 48/48/0; **zero DOM fallbacks** in both the desktop map (51 elements) and the
   mobile map (42) — every control has a stable semantic identity.
3. **The image and reading-surface layer is mechanical, not vigilant.** `distorted-image candidates=14
   judged=0 excluded(objectFitCropsOrLetterboxes=14)` and `text-over-art candidates=61 judged=0
   excluded(flatBackdrop=61)` — the two defect families this role exists for cannot occur here by
   construction.
4. **Contrast, in both themes.** h1 17.14 / 15.56 · body 14.42 / 13.81 · hero 15.73 / 16.26 · chat row
   17.14 / 15.56 · chip 17.14 / 15.56 · character name 17.14 / 15.56 · badge 7.68 / 7.62 — all PASS, and
   the whole-surface family clean in all ten arms. Light polarity **pixel-verified**, not eyeballed: rail
   `srgb(243,239,236)`, page `srgb(250,248,245)` vs the dark arm's rail `srgb(9,7,6)`.
5. **The copy.** Still the best writing in the app, and it got braver: seven unbuilt features named, each
   with its own honest status, including *"Not started yet — an agent still acts under your name."*
6. **Two 08-30 findings are properly closed.** The roadmap kicker voice is fixed (`interactiveKicker`,
   13px/600 caps, in its own `h2`, with the hairline), and the one-item region is obsolete because the
   region grew to seven — the ruling survived, its input changed.
7. **Reduced motion is honest.** `--reduced-motion`: `__orb.flags()` `[]`, `__orb.animations()` `[]`.
8. **Loud refusals.** `--panels both-docked` refuses with the reason and exits 2 rather than auditing the
   wrong surface — which is what let me catch I1.

---

## THE SINGLE BIGGEST OPPORTUNITY

**Give the page a bottom, and spend the weight where the headline points.** Two of the P2s and four of the
P3s are the same underlying gap: the layout was composed for a 1280×800 laptop and has no answer above it
— 307px of void at 1920, an orphan roadmap trigger, an orphan chip, 153ch paragraphs that only exist
because the column got wider, and a right column that ends 78–142px past the left one at every other
width. One decision (cap the measure, balance the two columns' heights, and let the roadmap or the
character grid absorb the slack above 1440) resolves H5, H6, H16 and most of the taste verdict.

**The one to fix first is still H1**, because it is the only defect here that makes a control
unusable — and it is invisible to every automated arm we own, which means nothing else will catch it.

---

## Console triage (zero "dev mode" dispositions)

| Message | Disposition |
| - | - |
| `[frame] long frame 111–187ms · blocking 56–137ms @ main.tsx` (every run) | **Known-ruled** — #429/#433 boot entry-module eval; prod-measured p50 139ms after the −20.4% chunk cut. Dev-inflated, not filed |
| `[frame] long frame 129–216ms · blocking 62–155ms @ view-transition.ts` + `[reflow] forced synchronous style/layout 8–18ms inside that frame` (every section switch) | **INVESTIGATE — H12.** Reproducible on demand from Home, four for four recorded clicks |
| `[drop] 51–109ms · [data-slot=weave-veil] / svg[aria-label=Orbweaver] / [data-slot=skeleton]` | **Known-ruled** — #429 ATTRIBUTED, the veil is victim not cause. motion-audit names the source: `web-weave.tsx` `loop via FrameRequestCallback`, 8–9ms per frame inside a 165ms LoAF |
| `[drop] 93ms · aside[aria-label="Chats list"]` / `[drop] 53ms · aside[aria-label="Home list"]` | **H3.** The off-canvas phantom panes participate in the section transition |
| `[drop] 67ms + 51ms · [data-slot=collapsible-trigger] / -panel` | **H11.** Real, on an unthrottled click |
| `[anim] Base UI lifecycle height — the ratified panel-height allowance (guide §4.2 item 3), not a §3.7 violation` | **RATIFIED, not a finding.** #1069 landed and is working — the console says so itself |
| `[perf] slow commit region:content 15–105ms` | **H15.** Corroborated by `__orb.renders()` maxMs 62–98 over two samples; the count is unchanged from 08-30, the cost is not |
| `[cls] shift 0.0225 unexpected · [role=region] moved 0px,-26px · [role=region] moved 0px,-92px` (every load) | **H14.** Under budget (0.0229 of 0.1) but unchanged since 08-30 |
| `[cls] shift 0.0225 input-adjacent (excluded from CLS) · div[aria-label="Example — The Ashen Spire"] moved 0px,52px` (on Resume) | **H13.** Chrome excludes it; judge on `observed 0.0454` |
| `[css] dead class — no rule defines it · .my-6 on [data-slot=message-bubble]` | **H19.** Not Home — inside the room Resume opens. Reported with its receipt, then returned to the target list |
| `[trpc] → / ←` ×11 queries, all success (one `__gated__,off pending` in the cache census) | Normal instrumentation. The permanently-pending `__gated__` key is a disabled-query placeholder, not user-visible |

**Errors: zero.** `console-errors=0 · page-errors=0 · failed-req=0` on every run in this pass.

---

## INSTRUMENT COVERAGE (the full-battery mandate — every row RAN with a receipt or SKIPPED with a reason)

| # | Instrument | Status |
| - | - | - |
| 1 | `snap --map` desktop | **RAN** — 51 elements, **0 DOM fallbacks** |
| 2 | `snap --map` mobile | **RAN** — 42 elements, 0 fallbacks; the receipt behind H2 |
| 3 | `snap --map` (mobile You sheet, driven) | **RAN** — 18 elements, 2 DOM fallbacks (both unnamed `separator`s) |
| 4 | `snap --map` (post-quick-pick, errand C) | **RAN** — 61 elements, 0 fallbacks; the receipt behind H20 |
| 5 | `snap --aria` (body) | **RAN** — 82-line tree |
| 6 | `snap --aria` (scoped, roadmap opened) | **RAN** — 25-line tree; the receipt behind H10 |
| 7 | `snap --contrast` Hearth | **RAN** — 7 roles, all PASS 7.68–17.14:1; 1 selector miss (R-5) |
| 8 | `snap --contrast` `--theme Light` | **RAN** — same 7 roles, all PASS 7.62–16.26:1 |
| 9 | `snap --eval` geometry / state | **RAN** — ~20 probes: shell-grid tracks + transform, both off-canvas asides (labels/inert/aria-hidden/backdrop-filter/tabbables), the whole-document backdrop-filter + will-change census, region rects at five viewports, the fade-mask chain, canvas-measured prose measure at two widths, the roadmap type census, the sub-24px control census at Lighthouse's own viewport, the appearance handles |
| 10 | `snap --expect-*` | **SKIPPED** — this pass's layout questions were measurements, not assertions; 08-30 ran `--expect-no-overflow html` PASS and nothing in the delta touches that surface |
| 11 | `snap --json` | **SKIPPED** — console never approached the 200-message cap (max 32 in one run) |
| 12 | `snap --matrix` | **SKIPPED (blocked)** — `ARG ERROR --matrix requires --isolated/--dirty/--ref`, and the single stage band is held by a sibling lane (`--stage-status`: marker `d4f3601e2113`, owner `agent-a963e6683c39fd730`, pid 27663, 37m). Never tear a sibling's stage down. Filed as I4 |
| 13 | `snap --isolated` | **SKIPPED (blocked)** — same reason; this is also why the empty / first-run state is unreached again |
| 14 | `design-audit /` desktop | **RAN ×2** (original + the R-3 re-run) — `findings=3 p0=0 p1=0 p2=1 p3=2`, census 362, `population-verdict=complete`, reach 42/42 |
| 15 | `design-audit / --mobile` | **RAN** — `findings=1` (the ratified caps line), census 332, `tap-candidates=33 judged=33 affected=0`, pointer=coarse, `population-verdict=complete`. **Zero tap-target findings at the 44px floor** |
| 16 | `design-audit / --theme Light` | **RAN** — 3 findings, identical set; `theme-light=363 theme-dark=0` (the shim reached the root). Findings are theme-invariant |
| 17 | `design-audit` appearance presets ×5 | **RAN** — `defaults` 3 · `maximal` 3 · `compact` **2** · `reading` **1** · `diagnostics` 3, all `population-verdict=complete`. The preset axis is what proves H4 is width-dependent, not universal |
| 18 | `design-audit --panels both-docked` | **RAN → REFUSED (exit 2), correctly** — Home declares no list/context pane; the run reports INSTRUMENT ERROR rather than auditing the wrong surface. Receipt for I1 |
| 19 | `design-audit --panels context-only` | **RAN → REFUSED (exit 2), correctly** — same reason |
| 20 | `design-audit --panels focus` | **RAN** — `focus-state=on drive-state=driven`, 3 findings, census 362 (byte-identical to rest): focus mode is a no-op on a section with no panes |
| 21 | `design-audit` DRIVE axis (roadmap opened) | **RAN** — `drive-state=driven`, census **411** vs 362 at rest, `population-verdict=complete`, still 3 findings. The 49 extra nodes the rest arm cannot see are clean |
| 22 | `motion-audit /` | **RAN ×2** — `verdict=FAIL`, `cls-non-virtualized=0.0229`, `worst-blocking 511–541ms` (boot), `loaf-style-in-frame=16`, `dirty-animations=0`. **`raw-frames=1` — the 0% dropped-frame number is over a population of one and is NOT a frames verdict** |
| 23 | `motion-audit --matrix` | **RAN** — `cells=6 uncovered-pairs=0 required-twins=3 instrument-errors=0 static-expected=0 violations=6`; the twins are what killed my own R-2 |
| 24 | `perf-meter --click` (first rail click) | **RAN** — cycle 0: 2 long tasks / 141ms total / 90ms worst, click 32ms, delay 3ms, **rAF gap 67ms**; cycles 1–2 clean. `reports/perf-meter/perf-meter.json` |
| 25 | `pnpm record` real-click drive | **RAN** — rail Chats → rail Home → hero Resume → rail Home, 4 click strips at 6 tiles × 120ms. `reports/recordings/p-eye-home-drive.{webm,gif}` + `-click{1..4}.png`. Strip 3 is H13's receipt |
| 26 | Lighthouse desktop | **RAN ×2** — the first (navigation mode) was a verdict about Settings and is RETRACTED (R-1); the corrected snapshot run on Home reads **a11y 100 / BP 100 / SEO 100 / agentic 100** |
| 27 | Lighthouse mobile | **RAN ×2** — same story; corrected run **100 / 100 / 100 / 100** |
| 28 | `__orb` suite | **RAN** — `.motion()` (36 LoAFs, 4 shifts with per-node rects), `.animations()` `[]`, `.flags()`, `.shell()`, `.renders()` ×2 samples, `.queries()` (11, all success + one gated placeholder), `.nav.section()` |
| 29 | Keyboard walk | **RAN** — 35 `--key Tab` stops with `activeElement` + `:focus-visible` + outline + box-shadow read at each; `fv=true` 35/35 |
| 30 | Hover-state paint | **RAN** via design-audit's forced-state pass — `hover-pass=ok hover-candidates=78 hover-rules=17 hover-judged=62 hover-subjects-forced=28 hover-not-restored=0`, 0 findings. **Caveat (#1073, live known defect):** the run publishes `excluded(noHoverChange=6)`, which that row says can be a FALSE exclusion for group-variant hover paint — six subjects here are unproven, not clean |
| 31 | Framebuffer / pixel decode | **RAN** — H1's four-cell table with a positive control, plus the Light/dark/theme-none polarity triple |
| 32 | Viewport arms | **RAN ×5** — 1920×1080 · 1440×900 · 1280×800 · 1280×1400 · 768×1024 · 430×932 mobile (coarse, DPR 3) |
| 33 | Theme arms | **RAN** — `--theme Light` (pixel-verified light) and `--theme none` (pixel-identical to the account's Hearth default). Home is a non-carried surface, so the theme arm is meaningful here |
| 34 | Reduced-motion arm | **RAN** — `__orb.flags()` `[]`, `__orb.animations()` `[]` |
| 35 | `--deadcss` | **RAN** — `deadcss=0 emptycss=0` on every run (the one `[css]` dead class found was in the chat room, H19) |
| 36 | Console triage | **RAN** — 11 classes, table above, zero "dev mode" dispositions |
| 37 | PNGs actually looked at | **RAN** — 6 read in full (boot 1280×800, roadmap open 1280×1400, 1920×1080, mobile 430×932, Light, hero element shots at 1280 and 1920) + the 6-tile Resume strip |
| 38 | Errand walkthroughs | **RAN** — A–F and H driven; G (temp chat) deliberately not driven because it writes a row |
| 39 | Empty / first-run state | **NOT REACHED** — needs the stage (row 13). Third consecutive pass this state has gone unmeasured |
| 40 | Error state | **NOT REACHED** — no error path inducible read-only; all 11 queries succeeded in every run. Scored 2/4 on Nielsen #9 for exactly this |
| 41 | Prod-build CLS arm (#836) | **SKIPPED** — the Lighthouse mobile CLS divergence it exists to resolve did not reproduce (0.000/0.001), so nothing in this pass turned on it |
| 42 | `--contexts` / multi-user arm | **SKIPPED** — no per-principal visibility question on Home; the fixture stack was not up and this lane does not boot it |

### Artifact slots (all lane-named)

`reports/snaps/p-eye-home-{boot,coming-open,w1920,w1440,w768,mobile,light,themenone,rm,hero-1280,hero-1920,errandC}.png` ·
`reports/design-audit/p-eye-home-{desktop,mobile,light,panes-focus,ap-defaults,ap-maximal,ap-compact,ap-reading,ap-diagnostics,driven-roadmap}.json` ·
`reports/recordings/p-eye-home-drive.{webm,gif}` + `-click{1,2,3,4}.png` ·
`reports/perf-meter/perf-meter.json` · `reports/motion-audit/root-matrix.json` ·
`reports/lighthouse-p-eye-home-{desktop,mobile,desktop2,mobile2}/report.{json,html}` ·
`reports/traces/p-eye-home-mobile-you.{zip,har}`.

## State left behind

Nothing written to the product. No DB row created (errand C stopped at the uncommitted draft; the temp-chat
errand was deliberately not driven). Two environment notes for the next lane: the chrome-devtools MCP
browser is left on **Home** at viewport 412×823 (the previous holder's mobile emulation, which I did not
reset), and the isolated stage band remains held by `agent-a963e6683c39fd730` — untouched.

---

## Issue summary for #1112

Drove HOME with the full battery against main tip `7fa019799` (vite pid 3858659, age-verified; `nav=OK`,
0 page errors / 0 console errors / 0 failed requests / `deadcss=0` across ~40 runs). **Verdict: SHIP WITH
FIXES — 32/40.** Home remains the best-made surface in the app (35/35 `:focus-visible`, Lighthouse
100/100/100/100 both devices, 14 images zero distortion, `text-over-art` 61 candidates all excluded as
flat backdrops, contrast 7.62–17.14:1 in both themes) and two of the four 08-30 findings are properly
closed: the roadmap block gained the ratified kicker voice, and the "one dateless item" P3 is obsolete
because the region now carries seven items with per-item honest status. **Twenty findings (H1–H20), two
P1.** **H1:** the content scroller's bottom fade mask paints over the two Databank empty-state buttons at
the shipped 1280×800 default, dropping their ink to **1.75:1** (framebuffer decode: `srgb(61,59,56)` on
`srgb(15,12,10)`; the same button above the band reads 17.14:1, and an above-band control reads 17.14:1 in
both arms) — the controls stay clickable because mask is paint, and `snap --contrast` plus design-audit's
whole contrast family report `61 judged / 0 affected` because mask is invisible to `getComputedStyle`
(#1078, memory `mask-is-paint-invisible-to-computed-style`). **H2:** notifications have a live wire and no
door on mobile — every mobile boot runs `stream.attach{channel:notifications}` + `notifications.list`,
while `--mobile --map` (42 elements) has no bell, the banner has zero buttons, and the You sheet (18
elements) has no entry. **P2s:** Home renders two full-height `inert` `aria-hidden` **empty** panes
(`aside[aria-label="Home list"]` 307.188×800 and `"Home details"` 384×800) each carrying
`backdrop-filter: blur(14px) saturate(1.4)` although `home-section.tsx:30` declares both panes
`"unavailable"` — the only two backdrop-filter elements on the page, and the left one's fractional
`matrix(1,0,0,1,-363.188,0)` is what makes design-audit file `promoted-layer-offset` P2 in 7 of 10 arms;
prose has no measure cap (Temp chat = **153.2ch at 1920**, `max-width: none`; even the capped hero snippet
is 107.7ch); and the page has no plan above 800px tall (**307px of void under both columns at 1920**, an
orphan roadmap trigger, an orphan chip). **Two instrument rows to file:** (a) P2 — design-audit's
SURFACE-AXIS prints `withheld(docked/overlay)` and `panel-*-axis=NO-VERDICT` on a section whose definition
declares the panes `"unavailable"`, i.e. the population law's polarity inverted (EXCLUDED, not WITHHELD) —
proven by the tool's own `--panels both-docked` run refusing correctly with "the active section likely
declares no list pane"; (b) the mask-blind contrast family now has a live WCAG failure attached (H1).
**Five self-retractions published**, the largest being that my first Lighthouse pair audited **Settings,
not Home** — the shared chrome-devtools profile persists the app's section, so a navigation run on `/`
restores whatever the last holder left (the 245×16 "target-size" nodes enumerate as the Config group rows
at 385×16); re-taken after `__orb.nav.section("home")` in snapshot mode, Home scores 100 across all four
categories on both devices. Also retracted: a 30–36% dropped-frame reading that its own reduced-motion
twins proved to be a denominator artifact (the full-motion twins are 5.45% of 55 and 3.39% of 59 frames).
**Two arms blocked and stated:** `snap --matrix` and the empty/first-run state both need `--isolated`, and
the single stage band is held by a sibling lane. Full report:
`docs/reviews/side-eye/2026-09-02-home-rail-drive.md`.
