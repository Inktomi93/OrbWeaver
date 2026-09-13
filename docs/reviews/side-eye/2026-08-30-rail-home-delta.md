---
kind: review
status: draft
updated: 2026-08-30
---

# side-eye — HOME, delta pass (rail sweep re-run)

**Lane:** cb-rail-home · **Surface:** home screen, live dev stack `:5173` / `:8788`, main `d9f51ea10`, read-only
**Principal:** every receipt below was taken as the dev stack's single seeded user
`01m18ywmzjf268dry1jb3nw4zq` ("Traveler"), except the `--isolated` arm, which ran as the stage's own
freshly-seeded user on `:5273`/`:8888`.

**Verdict: SHIP.** The four filed clusters from the 2026-08-22 pass (#453 #454 #457 #458) have landed
and hold under re-measurement, and nothing I could reach on this surface blocks a user. I attacked it
with the full battery — ten viewport/appearance/theme arms, a 31-stop keyboard walk, both Lighthouse
devices, a seeded boot-two arm with a planted positive control — and the reading surface, the contrast
layer, the image layer and the a11y skeleton all held. What I found is one **stale law document** that
will keep minting false structural findings until it is amended, one **closure premise I can no longer
reproduce**, and a small pile of taste residue in the right column's bottom third.

**Design health: 33/40 — "good" band** (was 32/40). Calibration only; every item below is filed
regardless of the band.

---

## Design-health score (Nielsen, honest)

| # | Heuristic | Score | Key issue |
| - | - | - | - |
| 1 | Visibility of system status | 3/4 | Fade cue landed (293px → 141px hidden), but 141px still below fold at 1280×800 and the whole roadmap disclosure sits at y=877–909; boot still re-settles visibly; Resume still gaps 150ms |
| 2 | Match system ↔ real world | 4/4 | "Six rooms, still warm." / "Not started yet, and there is no date to promise." The house metaphor is intact and the honesty about unbuilt features is exemplary |
| 3 | User control & freedom | 4/4 | The roadmap block is now foldable (`aria-expanded` present, collapsed by default) — the "no way to dismiss Not yet" gap from the last pass is closed |
| 4 | Consistency & standards | 3/4 | **THREE** focus-ring recipes on one surface now; the disclosure is the only right-column block with no kicker/hairline header voice |
| 5 | Error prevention | 4/4 | Nothing destructive; temp-chat irreversibility explained before the action |
| 6 | Recognition over recall | 4/4 | "Elsewhere in the house" is still the labelled legend for the icon rail; faces on the quick-picks; real last-message snippets |
| 7 | Flexibility & efficiency | 3/4 | ⌘K, skip link, one-click resume. Still no per-section shortcut |
| 8 | Aesthetic & minimalist | 3/4 | Six caps kickers + a seventh sentence-case disclosure in one viewport; ~430px of void under both columns at 1920; a whole region to say one thing |
| 9 | Error recovery | 2/4 | Unchanged coverage gap — no error path was inducible read-only; all 11 queries succeeded in every run |
| 10 | Help & documentation | 3/4 | The temp-chat paragraph teaches genuinely well; no help affordance anywhere |

---

## Findings

### \[P2] The UI law names NINE rail sections and does not know `extensions` exists — the rail ships TEN

**Why it hurts a user:** indirectly but expensively. `UI-Architecture-and-Layout.md:190` is the core
law text that every reviewer and every fix lane reads before touching the shell. It reads *"NINE
sections (D121 amended D62 P6's seven …)"*, enumerates the sanctioned members, and names
`client/src/state/shell-store.ts` as "the truth". Both halves are now false. **This exact staleness
nearly made me file a false structural P1 in this very run** — my own review skill's §14 says "a TENTH
section … is a finding", and the law it cites agrees. The next reviewer will either file that false
P1 or, worse, a lane will refuse legitimate work against it.

**Receipt:**

```
packages/client/src/state/section-ids.ts:18
export const SECTION_IDS = ["home","chats","characters","corpus","config","extensions","databank","presets","refinery","analytics"] as const;   ← TEN
docs/architecture/core/UI-Architecture-and-Layout.md:190   "NINE sections"   · zero occurrences of "extensions" in the whole file
```

Live ARIA tree (`navigation "Primary"`) enumerates ten section buttons: Home · Chats · Characters ·
Corpus · Configuration · **Extensions** · Databank · Presets · Refinery · Analytics.

The tenth section IS sanctioned — `docs/design/plugin-ui-plane.md:283` (§4.5b, landed at U5, #679)
mints "the house **Extensions** rail SECTION … ONE rail item for the platform, never per-plugin", and
`section-ids.ts:14-17` records the placement reasoning. But that is a **design** doc, and under
docs-are-law a design doc does not amend core law by landing code.

**Fix:** `document: UI-Architecture-and-Layout.md:190 — receipt: the count reads TEN, `extensions`is
named in the enumeration with its §4.5b/U5 provenance, and the "truth" pointer moves from`shell-store.ts`to`state/section-ids.ts`(where the tuple actually lives, with`shell-store` noted as
the re-export).` If the owner wants the ceiling itself re-ratified at ten, that is a ledger row, not a
doc edit — state the fork.

---

### \[P3] The "What's coming" disclosure has no section-header voice, and at 1920 it reads as Databank chrome

**Why it hurts a user:** every other block in the right column announces itself the same way — a caps
kicker plus a hairline rule (`START WITH`, `TEMP CHAT`, `DATABANK`). The roadmap disclosure is
sentence-case body weight with a chevron and no rule, so it has no visual parent. At 1920 the right
column splits into two sub-columns and the trigger lands **on the same baseline as the Databank
header**, reading as a third Databank control beside `All documents →`.

**Receipt:** `reports/snaps/cbrh-w1920.png` — `DATABANK ————— All documents →   What's coming ⌄` all
at y≈537. `reports/snaps/cbrh-disclosure-open.png` (1280×1400) — the trigger floats at y=893 with a
62px unruled gap above it. Trigger computed class carries
`focus-visible:ring-2 ring-ring ring-offset-2 min-h-control-sm`, no kicker slot.

**This is a consequence of a stated fork, not a fresh defect:** the #455 fix lane recorded *"brief's
kicker-voice letter correctly overridden by #482's fresh 24×24 trigger ruling (fork stated)"*. The
ruling was right about the target size; the visual consequence at 1920 was not visible to that lane.

**Fix:** `layout: the "What's coming" trigger — receipt: a kicker+hairline band that HOSTS the 24×24
trigger (the h2-wraps-button shape already there), so it reads as a section at every width, and a
1920 shot where it no longer shares a baseline with the Databank header.`

---

### \[P3] The roadmap region is now a whole section of chrome to deliver ONE dateless item

**Why it hurts a user:** `<section>` + `h2` + disclosure trigger + `h3` + two paragraphs, all to say
"Buddy — not started yet, and there is no date to promise." Automation's dormant tile was retired with
B3 (`packages/client/src/compose/home-tiles.ts:17-18`: *"automation's dormant tile 90 was RETIRED with
B3 — its own contract said it stays 'until B3'"*), so the block that the owner ruled *fold, don't cut*
now carries a single row.

**Receipt:** `reports/snaps/cbrh-disclosure-open.png`; `snap --aria '[aria-label="What'\''s coming"]'`
returns exactly `heading "Buddy" [level=3]` + 2 paragraphs.

**This is the "ruling survives — its INPUT changed" shape.** The owner ruled on a two-item block; the
block is now one item. Do not silently reverse the ruling: put the fork to the owner.

**Fix (owner call):** `distill: the "What's coming" region — arms: (a) keep as-is, (b) collapse to the
single Buddy line without the region/disclosure scaffolding, (c) cut now that it is a single dateless
row. Receipt for (b)/(c): the right column's bottom edge lifts and the 1280×800 below-fold residual
drops below 141px.`

---

### \[P3] Home still re-settles on every load — and it survives a *seeded* boot-two, which the #453 refusal said it would not

**Why it hurts a user:** small but real — at ~3.1s the "Other rooms" block lifts 24px and loses 67px of
height while "Elsewhere in the house" lifts 90px and grows 27px → 92px, so the left column visibly
re-flows under the eye just as it becomes readable.

`nonVirtualizedCls = 0.0221` is **under** the 0.1 budget, so this is a P3 composition item, not a
re-opened P2. What makes it worth writing down is the **premise**: #453's height-reservation half was
refused with *"movers gone at boot 2; first-boot shrink is the accepted arm"*, and I cannot reproduce
that.

**Receipt — four arms, all byte-identical `[cls]` output:**

| Arm | `orb:active-user` seeded | `surface-box` seeded | "Other rooms" prev→cur | CLS |
| - | - | - | - | - |
| cold context (true boot one) | no | no | `[88,358,686,392] → [88,334,686,325]` | 0.0221 |
| box only (no boot hint) | no | real values | identical | 0.0221 |
| **boot-two (hint + real box)** | **yes** | **yes** | **identical** | **0.0221** |
| **positive control** | **yes** | **`chat.alsoOpen:1500, home.jump:300`** | **identical** | **0.0221** |

The seed demonstrably lands (`--eval localStorage.getItem("orb:active-user")` → `"01m18…"`), and a
deliberately absurd 1500px reservation moved **nothing** — so the reserved 392px at first paint is not
coming from box memory at all. Method note: seeding only `orb:u/<id>/surface-box` is a **false**
boot-two — with no `orb:active-user` hint the stores mint on the legacy un-namespaced key
(`packages/client/src/state/durable-local.ts:19-23,86-99`), so both keys must be seeded.

Second mover, same shift: `[aria-label="Go to Chats"] > svg` and two `[data-slot=separator]` enter with
`previousRect [0,0,0,0]` — the chips row mounts late rather than moving.

**Fix:** `layout: re-derive #453's boot-two premise before deciding anything — receipt: either a
reproduction of the "movers gone at boot 2" arm with the boot hint seeded (which would refute me), or
an intrinsic-height reservation for the also-open + section-jump tiles that drops the [cls] line's
largest mover under ~8px.`

---

### Triaged, not filed: Lighthouse mobile CLS 0.122 (score 0.84, agentic-browsing 95)

Lighthouse mobile scores CLS **0.122 — over the 0.1 budget** (desktop 0.042, score 0.99). Our own
instruments disagree: `snap / --mobile` reports `nonVirtualizedCls 0.0293`, and **under 4× CPU
throttle it is 0.0295** — the throttle arm does not reproduce it. The untested discriminator is
Lighthouse's mobile **network** throttling, and `pnpm snap --help` warns in its own text that the
network arm is meaningless against this dev build (*"~250 unbundled ESM resources … throttle CPU alone
here; the network arm is for a prod build"*).

I am **not** dismissing this as "dev mode" — I am naming the one measurement that closes it:
**a mobile CLS arm against a prod build**. Until that exists, the divergence is unresolved, and the
honest statement is that our own probes cannot see whatever Lighthouse's mobile profile sees.
Receipts: `reports/lighthouse-cbrh-mobile/report.json`, `reports/lighthouse-cbrh-desktop/report.json`.

---

## Previously ruled — re-measured, deliberately NOT re-filed

| Item | Today's number | Standing ruling |
| - | - | - |
| Focus-ring recipes | **three** now: outset halo (21 stops) · inset ring (5 chat rows) · `ring-2 ring-offset-2` (the collapsible trigger) | #457 REFUSED the unification per the recorded inset ruling. The third recipe is new information for whoever revisits it |
| Boot splash frame drops | 4 flags, 54 / 101 / **178** / 83 ms (was 3 at 53–108ms) | #429 ATTRIBUTED — the veil is victim, not cause; #433 cut the boot chunk −20.4% (prod frame p50 139ms). Dev numbers, inflated |
| `all-caps-body` P3 (cast credit line) | still the only design-audit finding, both pointers | ratified micro-caps voice — leave alone |
| Hero art absent at 1280 | art-bleed layer 172×134, `background-size: cover`, left-fading mask | `globals.css:178-183` reading-surface guarantee; the product question is #455's |
| `region:content` renders 22× | 1 mount + 21 updates, 42ms total, max 17ms | #454 REFUTED it — the Profiler counts subtree commits; home is already per-tile isolated |
| Resume gap | worst rAF gap **150ms**, long tasks 521/162ms, input delay 2ms | #454 improved it from 233 / 791 / 238 / 4; residual attributed to chat first-mount with follow-ups filed |

---

## ARIA-navigability

**Nothing to fix.** The skeleton is still the best in the app, and this pass added receipts rather than
findings:

- 31-stop keyboard walk, `:focus-visible = true` at **every** stop. Order: skip link → the ten rail
  sections → theme/settings/identity → ⌘K → bell → hero → content.
- Skip link is now **118×32** (was 94×18) — WCAG 2.5.8 clear.
- Hero is a real `<button>` (was `div[role=button]`).
- ⌘K's accessible name now contains its rendered string — it has **left** the
  `label-content-name-mismatch` list (8 items → 7).
- The disclosure trigger carries `aria-expanded="false"` → `[expanded]` when open, inside its own `h2`.
- `--expect-no-overflow html` PASS (`overflow=0x0`, 4 edges judged, 0 escapes).
- **Do not "fix" the remaining 7 `label-content-name-mismatch` items** — every one is the correct
  `aria-label` + `aria-describedby="…-subtitle …-meta"` list-row/card pattern (5 chat rows, the hero
  card, the databank row). axe flags the visible subtitle/timestamp text; the pattern is right. This is
  the same false-positive class the last pass triaged, minus the one real item, which was fixed.
- Lighthouse accessibility **100** and best-practices **100** on both desktop and mobile.

---

## Taste & flow verdict

**Does it look like shit? No — and I went looking harder than last time.** It still reads as *made*.
Warm near-black, one Ember accent, ratified kicker+hairline rule, six portraits at true 1:1
(14 images measured, **zero** distorted: all 512×512 source, AR 1.000, `object-fit: cover`). It trips
none of the §6 slop tells.

**Where the eye actually catches now:**

- **It is top-heavy on a real monitor.** At 1920×1080 both columns are finished by y≈650 and the
  bottom ~430px is empty; at 1280×1400 the left column ends at y=775, the right at y=845, leaving
  ~555px of void. The page is designed for an 800px laptop and looks unfinished above that.
- **The columns still do not share the load.** Left ends 775, right 845 at the same width — the
  asymmetry the last pass named is unchanged, just smaller.
- **Six caps kickers in one viewport** (`PICK UP WHERE YOU LEFT OFF` · `OTHER ROOMS` · `ELSEWHERE IN
  THE HOUSE` · `START WITH` · `TEMP CHAT` · `DATABANK`) plus a seventh block that announces itself
  differently. Down from seven, still a drumbeat — the flattening between "your most important thing"
  and "a footnote about an unbuilt feature" persists.
- **The reading arm leaves a gutter.** At `--appearance-preset reading` the quick-pick grid drops
  3→2 columns cleanly but the cells stop at x≈1163 in a column that runs to ≈1240 — ~80–110px of dead
  right gutter (`reports/snaps/cbrh-ap-reading.png`).
- **Mobile is still arguably better than desktop.** 430×932 gives the resume card full width, a
  labelled bottom tab bar, and the fade cue reads immediately. The only wart: the cast credit line
  wraps to two lines under `RESUME →`, which sits awkwardly.

**Does it flow weird? No.** h1 greeting → hero with title/snippet/cast/RESUME in one glance → recents →
out. That is still the right task order for a returning user, executed cleanly.

**One home per concept:** the nine "Elsewhere in the house" chips now mirror the nine non-home rail
sections exactly, Extensions included. **Still sanctioned, not a defect** — the rail is icon-only and
this is its labelled legend on the one surface where teaching belongs. No other duplication found;
home correctly declares both panes collapsed (`__orb.shell()` → `list:collapsed, context:collapsed`)
and claims `rail.brand` rather than minting an extra slot.

**Is it intuitive cold? Yes.** From the screenshot alone a first-timer can name what this is and what
to press.

**The one thing I would change:** give the right column's bottom third back. Between the one-item
roadmap region, the unparented disclosure trigger and the 141px still under the fold, the same ~200
vertical pixels are carrying three separate findings — and above 800px tall, the whole page is floating
in void.

---

## What's genuinely working (do not touch)

1. **The #453 fold cue is real and it works.** The content scroller carries
   `mask-image: linear-gradient(…, rgb(0,0,0) 90%, …)` + `data-fade-bottom` + `scrollbar-width: thin`,
   and hidden-below-fold went **293px → 141px**. It is visible in the mobile and 768 shots as a genuine
   "there is more" signal rather than a severed edge.
2. **The image and reading-surface layer is mechanical, not vigilant.** 14 images, zero distortion; the
   only background art is a 172×134 masked edge-bleed that cannot reach prose by construction. Contrast
   PASSes at 7.37–17.14:1 across ten roles in **both** themes, and design-audit's whole-surface sweep
   (census 354 desktop / 322 mobile, both pointers) finds nothing.
3. **The a11y skeleton and the copy.** Both were the standout last time and both survived a harder
   attack: 31/31 `:focus-visible`, Lighthouse a11y 100 ×2, and prose that still spells numbers to ten
   and refuses to promise a date it does not have.

---

## The single biggest opportunity

**Amend `UI-Architecture-and-Layout.md:190`, today.** It is the cheapest fix on this list and the only
one that is actively costing money: it is a law text that every shell-touching lane reads, it is wrong
in two ways, and it nearly minted a false structural P1 inside this very review. Everything else here
is polish on a surface that is already good.

---

## Retractions — things I believed during this run and then killed

| # | I believed | Killed by |
| - | - | - |
| **R-1** | "The `--theme Light` arm rendered DARK — the theme does not reach the shell." I looked straight at the PNG and read it as near-black. | Framebuffer decode: `cbrh-theme-Light.png` rail(20,300) = `srgb(243,239,236)`, topbar(600,20) = `srgb(250,248,245)`, bg(600,780) = `srgb(250,248,245)`. Fully light. (Dark arm for comparison: rail `srgb(9,7,6)`.) Corroborated by `settings.getTheme` firing in the arm and h1 measuring 15.56:1 vs dark's 17.14:1. **My eye was wrong about page-scale polarity, again.** |
| **R-2** | "A TENTH rail section shipped — structural P1 against `UI-Architecture-and-Layout.md:190`." | `docs/design/plugin-ui-plane.md:283` §4.5b sanctions the Extensions section at U5, and `section-ids.ts:14-17` records the placement reasoning. The section is legitimate; **the law text is stale**. Re-filed as a P2 doc finding, not a P1 shell finding. |
| **R-3** | "Home fails contrast on five roles — h1, the subtitle, the hero card, the first chat row and the first quick-pick all report NOT FOUND." | A hydration race, not a defect. `--idle` settles on network-quiet, which precedes React's tile hydration; the same batch gated on `--wait-for 'text=Spire Field Notes'` measures all five at 8.45–17.14:1 PASS. **Instrument note worth keeping: gate a `--contrast` batch on a late-rendering string, never on `--idle` alone.** |
| **R-4** | "`data-reduced-motion=false` on the shell while the OS pref is `reduce` — the reduced-motion axis is a dead toggle." | `globals.css:40` documents it as *"a user pref beyond the OS setting"*, and both floors exist (the OS `@media` block plus `[data-reduced-motion="true"]`). Proven live: under `--reduced-motion`, `__orb.flags()` returns `[]` — **zero** dropped frames, versus four on the unemulated arm. Correct by design. |
| **R-5** | "The isolated stage will give me the true empty-house first-run state." | It boots the same example seed (six rooms, six characters) — `reports/snaps/cbrh-empty.png` is indistinguishable from the dev stack. The genuine `totalCount === 0` state remains **unreached**, and still needs a seeded/mutating pass. |
| **R-6** | "Seeding `orb:u/<id>/surface-box` reproduces boot two." | It does not — with no `orb:active-user` boot hint the stores mint on the **legacy un-namespaced** key (`durable-local.ts:19-23`), so that arm is still boot one. Both keys are required; the corrected arm is in the P3 table above. |

---

## Instrument coverage

| # | Instrument | Status |
| - | - | - |
| 1 | `snap --map` | **RAN** — 54 elements, **0** DOM fallbacks (every selector semantic) |
| 2 | `snap --aria` | **RAN** — 84-line tree desktop + a scoped tree of the opened disclosure |
| 3 | `snap --contrast` | **RAN** — 10 roles × 2 themes, all PASS 7.37–17.14:1. First batch retracted (R-3) |
| 4 | `snap --eval` / geometry | **RAN** — scroll chain + mask + `scrollbar-width`, region rects, image AR census (14 imgs), appearance handles, buffered layout-shift replay with per-node prev/cur rects, kicker census, disclosure attrs |
| 5 | `snap --expect-*` | **RAN** — `no-overflow html` PASS (0×0, 4 edges, 0 escapes) |
| 6 | Keyboard walk (`--key Tab` ×30 + skip link) | **RAN** — 31 stops, `fv=true` at every stop, box-shadow recipe recorded per stop |
| 7 | `design-audit /` (desktop, `pointer=fine`) | **RAN** — census 354, reach 44/44, **1 P3** (ratified caps line), 0 P0/P1/P2 |
| 8 | `design-audit / --mobile` (`pointer=coarse`) | **RAN** — census 322, reach 33/33, **1 P3**, zero tap-target findings |
| 9 | `motion-audit /` | **RAN** — verdict FAIL: `cls-non-virtualized=0.0221`, `dropped-frames=0%`, `dirty-animations=0`, `worst-blocking=555ms` (boot, dev-inflated), 14 LoAFs style-in-frame |
| 10 | `perf-meter --click` (Resume) | **RAN** — rAF gap 150ms, long tasks 521/162ms, click 32ms / delay 2ms |
| 11 | `pnpm record --click` (transition eye) | **RAN** — `reports/recordings/cbrh-resume.{webm,gif}` + 6-tile strip: ~2 tiles (≈240ms) of skeleton before content, improved from ~3 |
| 12 | Lighthouse desktop (MCP, sanctioned) | **RAN** — a11y 100 / BP 100 / agentic 100 / SEO 66 · `reports/lighthouse-cbrh-desktop/` |
| 13 | Lighthouse mobile (MCP, sanctioned) | **RAN** — a11y 100 / BP 100 / agentic 95 / SEO 66; CLS 0.122 triaged above |
| 14 | `__orb` suite (`shell`/`renders`/`animations`/`flags`/`queries`/`motion`) | **RAN** — panes both collapsed, 22 renders, 0 live animations, 4 boot drops, 11 queries all success |
| 15 | Console triage | **RAN** — table below; **0 console errors, 0 page errors, 0 failed requests in all ~25 runs** |
| 16 | PNGs actually read | **RAN** — 8 read visually + framebuffer pixel decode on 4 after R-1 |
| 17 | Appearance arm `defaults` | **RAN** — `cbrh-ap-defaults.png` (404825 B, `data-elevation=flat`, `data-density=comfortable`) |
| 18 | Appearance arm `maximal` | **RAN** — `cbrh-ap-maximal.png` (560799 B — +156 KB, the grain/elevation delta) |
| 19 | Appearance arm `compact` | **RAN** — `cbrh-ap-compact.png` (408873 B) |
| 20 | Appearance arm `reading` | **RAN** — `cbrh-ap-reading.png` (423673 B) → the right-gutter taste item |
| 21 | Appearance arm `diagnostics` | **RAN** — `cbrh-ap-diagnostics.png` (404748 B); ~identical to defaults, as expected: home renders no per-message metadata chrome |
| 22 | Theme arm `--theme Light` | **RAN** — pixel-verified light (R-1) |
| 23 | Theme arm `--theme none` | **RAN** — `cbrh-theme-none.png`, distinct hash from defaults |
| 24 | Reduced-motion arm | **RAN** — `__orb.flags()` empty, `__orb.animations()` empty |
| 25 | Viewport arms | **RAN** — 1920×1080 · 1280×800 · 1280×1400 · 768×1024 · 430×932 coarse |
| 26 | CPU-throttle arm (`--cpu-throttle 4`, mobile) | **RAN** — `cls-non-virtualized 0.0295`, `worstBlocking 535ms` |
| 27 | Boot-two / box-memory arms | **RAN** — 4 arms incl. a planted wild-value positive control (see P3 table) |
| 28 | Pane-state arms | **N/A, verified live** — `__orb.shell()` returns `list:collapsed, context:collapsed`; home declares both panes unavailable by design |
| 29 | Empty / first-run state | **NOT REACHED** — the `--isolated` stage boots the same example seed (R-5). Source-verified to exist (`home-masthead-body.tsx`, `"An empty house."`). Still needs a mutating pass |
| 30 | Error state | **NOT REACHED** — all 11 queries succeeded in every run; no failure path inducible read-only. Scored 2/4 on Nielsen #9 for exactly this |
| 31 | `--deadcss` | **RAN** — `deadcss=0 emptycss=0` on every run |

### Console triage

| Message | Disposition |
| - | - |
| `[frame] long frame 131–166ms · blocking 73–116ms @ main.tsx` + `[reflow]` | **known-ruled** — #429/#433: boot entry-module eval, prod-measured p50 139ms after the −20.4% chunk cut |
| `[drop] 54–178ms · weave-veil / svg[aria-label=Orbweaver]` ×3–4 | **known-ruled** — #429 ATTRIBUTED, veil is victim not cause. Numbers re-measured worse than the last pass; dev-inflated, noted not filed |
| `[drop] 68–83ms · [data-slot=skeleton]` | **known-ruled** — same boot window |
| `[perf] slow commit region:content 13–85ms` | **known-ruled** — #454 REFUTED the render-count reading (subtree commits, per-tile isolated) |
| `[cls] shift 0.0221 unexpected` | **INVESTIGATE** → the P3 above; under budget, but the boot-two premise is refuted |
| `[trpc] → / ←` ×11 queries | normal instrumentation |
| vite dep-optimizer churn ×7 (isolated arm only) | **known-fine** — cold-stage re-bundle aborts, re-requested and served; snap labels it "NOT a failure" |

**Errors: zero.** `console-errors=0 · page-errors=0 · failed-req=0` on every run in this pass.
MCP budget: 3 calls used of ~12 (1 navigate + 2 Lighthouse) — everything else went through `snap`.
