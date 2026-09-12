---
kind: review
status: draft
updated: 2026-08-30
---

# side-eye — PRESETS (rail sweep delta pass)

**Lane:** cb-rail-presets · **Surface:** the Presets section on the live dev stack (`:5173` / `:8788`), main
`34a0e3c53` · **Principal:** every receipt in this report was taken as the single-user dev owner
(`sessions.me → {userId, handle:"Traveler", globalRole}`; `AUTH_MODE` resolves `oidc`, one seeded user).

**Verdict: SHIP WITH FIXES.** The 2026-08-22 pass left ten filed defects; **thirteen of the fourteen arms I
could re-drive are genuinely fixed**, several beyond what was prescribed, and the a11y skeleton is now the
strongest on any rail surface I have driven (95 mapped controls, **zero** DOM-fallback selectors, Lighthouse
a11y 100 with its only failure a ruled false positive). What is left is one **wrong statement about
generation behaviour on the first-run default state** (P1), and a **silent copy-on-write** that mints a
preset the user did not ask for and does not activate it.

**Design health: 31/40 — "good" band.** Score is calibration only. Every item below is filed regardless.

---

## Dataset, timing, and the state I changed

**Corpus BEFORE: 1 row** — the built-in `Default` only (`preset.list → 1 row`, header `Presets 1`). This is a
genuine fresh-seed first-run population and it is the single biggest delta from the 2026-08-22 pass, which
ran against 5 presets. It means the first-run experience got a real audit for the first time, and it means
two prior findings could not be re-driven (noted in coverage).

**What I mutated, with the orchestrator's approval (cb-rail-presets → main, granted mid-run):** created
`New preset` via the New button; edited the built-in `Default` (Temperature → 1.15) to observe the
copy-on-write; activated `New preset` once by keyboard and once restored `Default` by click. A third row,
`Copy of Default`, appeared during the session which I **cannot attribute to any action I took** (see
Observation O-1).

**Corpus AFTER, verified:** all three deleted through the UI's own kebab → Delete → `alertdialog` path;
`cbrp-restored` reads **1 row, `Activate Default for generation` `aria-checked="true"`**. Restored.

**Environment.** Bare `pnpm snap /` at the start: `nav=OK page-errors=0 console-errors=0 failed-req=0`.
Vite served fresh. No stack restart at any point. `deadcss=0 emptycss=0` on every run.

**Appearance state — probed, not assumed** (the owner's real row, `defaults` arm): `data-theme` absent
(shipped Hearth), `data-reduced-motion` true, `data-texture` absent (`none`), `.shell-grid[data-elevation]`
flat, blur on at 14px, `--font-scale` 1. The `maximal`, `compact` and `reading` arms were taken separately
and all four PNGs differ by md5, so the shim demonstrably bit.

---

## Design-health score (Nielsen, honest)

| # | Heuristic | Score | Key issue |
| - | - | - | - |
| 1 | Visibility of system status | 3/4 | Activation now announces on **both** paths (verified live, click and keyboard) and the autosave chip is live. But the built-in's copy-on-write fires with the chip reading a bare "Saved" while a whole new preset is created (P2-A) |
| 2 | Match system ↔ real world | 3/4 | Still the best copy in the app; "the deck" leak is gone (`readout-parts.tsx:156` records the fix). Docked one for the fork inheriting the label **`system`** (P2-B) |
| 3 | User control & freedom | **4/4** | The #481 hazard is dead: arrows move focus only, Space commits, and the commit announces. Delete confirms by `alertdialog` naming the artifact. Esc exits. This is the biggest single improvement in the pass |
| 4 | Consistency & standards | 3/4 | Activate now has exactly two homes (row radio + editor button); the kebab is Duplicate/Export/Delete. The `Used by` panel is the one place that reads the active-pick axis differently from the other three readers (P1-A) |
| 5 | Error prevention | 3/4 | Import explains before it acts, Delete confirms, the fork-choice dialog exists for the second fork. The **first** fork has no interruption and no forewarning where the edit happens (P2-A) |
| 6 | Recognition over recall | **4/4** | An info door on every knob; the unset knob now renders a hollow ghost thumb AND announces `aria-valuetext="default (model decides)"`; the closed select states its value in full; the Prompt glyph column discriminates |
| 7 | Flexibility & efficiency | 3/4 | ⌘K, roving radiogroup with wrap, a filter in Actions and a search in the list. No bulk ops |
| 8 | Aesthetic & minimalist | 3/4 | Handsome and ordered. The CONTEXT readout still restates CONTENT row-for-row on Prompt and Transforms, and the Prompt rack's thirteen always-on accent switches carry no information at rest (T-2) |
| 9 | Error recovery | **2/4** | Same as the prior pass: the failure band exists in code but I reached **zero** error states across \~25 runs and 0 errored queries. Scored conservatively rather than credited — this is an untested layer, not a proven one |
| 10 | Help & documentation | 4/4 | Every knob has an info door, every tab leads with a sentence, every empty state teaches and offers the next action. The zero-results state is now honest in all three panes |

**31/40** (was 29/40).

---

## Findings

### \[P1-A] (NEW) The `Used by` panel says nothing uses the built-in `Default` and tells you to "activate it" — on the preset that IS active and that every chat generates with

**What.** On the built-in `Default` — the only preset a fresh install has, and the artifact this section opens
on — the CONTEXT panel's `Used by` block renders:

> Nothing uses this preset yet — activate it, or point a game's GM voice at it.

At the same moment, three other signals on the same screen say the opposite: the editor header chip reads
**`Active`**, the list row's radio is `aria-checked="true"`, and the landing CONTEXT says *"The built-in
preset runs generation until you activate one of your own."*

**Receipt.** Live ARIA of the editor (`reports/snaps/cbrp-editor-default.png`, run `cbrp-ed`):

```
- region "Preset editor":
  - heading "Default" [level=2]
  - text: Active                      ← the header chip
...
- complementary "Presets details":
  - heading "Used by" [level=3]
  - paragraph: Nothing uses this preset yet — activate it, or point a game's GM voice at it.
```

The cause is an axis with **three readers, one of which is narrower than the other two**:

- `packages/server/src/entry/compose/preset-usage.ts:54`
  `return { isUserDefault: settings.seeds.defaultPresetId === presetId, gmRooms };`
- the built-in **IS the null pick** — stated twice on the client:
  `preset-editor-surface.tsx:209` *"the built-in ⇔ `defaultPresetId === null`"* and
  `preset-library-surface.tsx:94-96` *"the seed stores 'no explicit preset', not the system row's sentinel id"*.
- so for the built-in, `null === "preset_00000000000000000000000000"` is **false**, `isUserDefault` is false,
  and `usage-readout.tsx:41-48` falls to its third arm — the one written for a preset nothing references.

The console confirms the sentinel: `→ query preset.resolveEffective {"id":"preset_00000000000000000000000000"}`.

**Why it hurts a user.** This is the sentence whose stated job is *"what breaks if I change this"*
(`usage-readout.tsx:5-8`), and on the default state it gives the exactly-inverted answer. The true answer is
already written in the file, one branch up: *"Your active preset — every chat you host generates with it."*
A first-timer reads "nothing uses this yet" and concludes the built-in is inert, then follows an instruction
("activate it") that is impossible because it is already done — while the chip 700px to the left says
`Active`. Jordan cannot form a correct model of what generates their chats; Sam gets the contradiction read
out as flat prose with no resolution.

**Fix.** `clarify`: make the readout the third correct reader of the null-pick, not a fourth semantics.
`isUserDefault` must be true when `settings.seeds.defaultPresetId === null` **and** `presetId` is the
built-in sentinel — the client already spells that predicate twice. No new copy is needed; the correct
sentence already exists on the `isDefault` arm.
Receipt: on the built-in with no explicit pick, the `Used by` block reads *"Your active preset — every chat
you host generates with it, unless a game points its GM voice somewhere else."*

---

### \[P2-A] (NEW) Editing the built-in silently mints a new preset, retargets the editor under you, and does not activate it — while the autosave chip reads "Saved"

**What.** The built-in is copy-on-write by design (documented at `preset-editor-surface.tsx:14-17`) and that
design is right. The defect is that the **first** fork happens with no forewarning, no interruption, and no
announcement, on a surface that announces far smaller events.

**Receipt.** Run `cbrp-cow` — I typed `1.15` into `[aria-label="Temperature value"]` on `Default` and
tabbed out. Before and after, in the same run:

```
BEFORE  editorTitle "Default"
        rows [Default, New preset, Copy of Default]
        live ["App loaded.", "Saved"]      dialog null
AFTER   editorTitle "Default (edited)"     ← the editor retargeted under me
        rows [Default, New preset, Copy of Default, Default (edited)]
        live ["App loaded.", "Saved"]      dialog null
```

and the new row's checked state (`cbrp-after-cow`): `Activate Default (edited) for generation` →
**`checked: "false"`**. `New preset` kept the active pick.

The mechanism is explained in exactly **one** place in the whole UI — `regex-tab.tsx:54`, a paragraph inside
the **Transforms** tab's Regex section: *"The built-in default can't hold regex scripts. Change any of its
other settings and your edits are saved as your own copy of it."* A user editing a slider on **Params** never
sees it. The `PresetForkChoiceDialog` correctly does not fire here — by its own header it opens only from the
second fork onward.

**Why it hurts a user.** Three wrong beliefs in one act. (1) *"I changed Default"* — they did not; Default is
byte-unchanged. (2) *"My change is in effect"* — it is not; the fork is not activated, so generation still
runs the previous pick. (3) *"Saved"* — the one status word on screen confirms belief (1) and (2) while both
are false. And a preset they did not create is now in their library. Riley refreshes and finds two presets;
Jordan concludes the app duplicated something.

**Fix.** `clarify` + `harden`, two halves. **Before:** when the open preset is the built-in, say so where the
edit happens — an inline notice in the editor body (not one tab's section) reading the fact the Regex
paragraph already states. **After:** announce the fork over the seam that already exists —
`notifyActivePreset`'s sibling in `active-preset-notice.ts` — e.g. *"Your edit created **Default (edited)** —
Default is unchanged."* Then take a fork on whether a fork made **from the active built-in** should inherit
the active pick; leaving it inactive is defensible but makes the edit a no-op, which is the sharpest half of
this finding.
Receipt: a repeat of the run above showing a rendered notice string and the editor's own body naming the
copy-on-write before the first keystroke.

---

### \[P2-B] (NEW) A fork of the built-in inherits `kind: "system"`, so a user's own editable preset is labelled `system` in their library

**Receipt.** Live list subtitles, same run (`cbrp-after-cow`):

```
"Default"           → "Built-in default"
"New preset"        → "generation · edited 3m"
"Copy of Default"   → "generation · edited 2m"
"Default (edited)"  → "system · forked from Default · edited now"     ← the fork
```

`kind` is a free-text column (`packages/db/src/schema/preset.ts:38`) rendered **verbatim as the subtitle's
leading token** (`preset-row-view.ts:6,35` — *"The kind ALWAYS leads the subtitle"*), and the New button mints
`generation` explicitly (`preset-library-surface.tsx:39` `NEW_PRESET_KIND = "generation"`). The fork path
copies the source row's kind instead.

**Why it hurts a user.** The word `system` is precisely the vocabulary the surface uses to mean *"not yours,
locked, no Export, no Reset"* — the built-in row is the locked one. A user's own fully-editable copy wearing
that label in the list's most scannable position teaches the wrong affordance about the one row they just
created. It also makes the two doors to a copy disagree: Duplicate produces `generation`, editing produces
`system`, for the same conceptual act.

**Fix.** `clarify`: the fork mints `generation` like every other user-owned preset; `kind` describes what the
preset IS, not where it came from — provenance is already carried, correctly, by the `forked from Default`
clause the same subtitle renders.
Receipt: the subtitle census above with the fork reading `generation · forked from Default · edited now`.

---

### \[P2-C] (NEW) On mobile, every knob's value cell aligns to nothing, and each row costs 4× its desktop height

**Receipt.** iPhone 14 Pro Max emulation (430px, `pointer: coarse`), run `cbrp-mobrow`:

| element | x | right | width |
| - | - | - | - |
| label `Temperature` | **12** | 91 | 79 |
| slider track | **12** | **418** | 406 |
| value cell (`default`) | **284** | **364** | 80 |

The value cell is neither left-aligned with the label and track (x=12) nor right-aligned with the track's end
(right=418) — it floats 54px short of the right edge on a third axis. Identical on all ten knobs (`Top-P`
label 12, track 12→418, cell 284→364; `Max output tokens` the same). Vertical cost: `Temperature` label at
y=393, `Top-P` label at y=541 → **148px per row**, against 38px per row on desktop; `Max output tokens` lands
at y=2031, so the Params tab is \~2,800px of scroll for one preset.

**Why it hurts a user.** Casey reads eight consecutive rows whose three elements each start at a different x.
The eye has no column to track down, so scanning "which knobs have I set?" — the single most common read on
this tab — becomes ten separate hunts instead of one glance down a value column. The desktop layout gets this
exactly right (label · control · value in fixed columns); the mobile stack throws the column away.

**Fix.** `layout` + `adapt`: put the value cell on the **label's** line (label left, value right, slider
full-width beneath). That restores a right-hand value column, gives the cell an edge to align to, and saves
\~46px per row (\~460px of scroll on Params alone).
Receipt: the same census with `valueCell.right === track.right` at 430px, and the per-row pitch measured.

---

### \[P2-D] (NEW) Opening a preset stalls the frame pipeline for 133ms behind a 194ms long task

**Receipt.** `pnpm perf-meter / --goto presets --click '[aria-label="Default"]'`
(`reports/perf-meter/perf-meter.json`):

```
idx  longTasks(total/worst)  blocking  script                    click(dur/delay)  rafGap  shift  label
  0   5 ( 607/ 194)          118ms     —                            —              217     0.0112 goto presets
  1   2 ( 251/ 194)          144ms     performWorkUntilDeadline    88/ 7           133     0      click [aria-label="Default"]
RESULT breach-steps=2 worst-longtask=194ms worst-click=88ms
```

Corroborated by the app's own instrumentation (`[perf] slow commit region:content 24ms (mount)`, threshold
12ms) and by `__orb.renders()` for the same drive: `region:content count 39 · mounts 1 · updates 38 ·
maxMs 72`. Under 4× CPU throttle (`--cpu-throttle 4`) the react-dom commit blocks **183ms**.

**Input delay is 7ms**, so INP is nowhere near its 200ms budget — this is a visible hitch, not an
unresponsive control, which is why it is P2 and not P1. But a 133ms rAF gap is \~8 dropped frames on the
section's primary action, and the box this ships to is explicitly not a workstation.

**Why it hurts a user.** Every entry into the surface's main artifact judders once. It reads as the app
thinking, on a click that should feel instant.

**Fix.** `optimize`: the editor mounts all five tabs' worth of form state in one commit. Defer the
non-selected tabpanels' subtree (the tab strip already knows which is selected), or split the Params deck's
ten knob rows behind a transition.
Receipt: `perf-meter` on the same click with `rafGap < 50` and `worst-longtask < 100`.

---

### \[P3-A] (NEW) The presets LIST pane drops a frame on entry, against the app's own budget

**Receipt.** Present on clean runs (`cbrp-landing`, `cbrp-boot`):

```
[drop] 61ms rendered frame mid-animation · aside[aria-label=Presets list] · [data-slot=theme-scope] · <html> · OVER BUDGET
```

Distinct from the shell-boot drops on `svg[aria-label=Orbweaver]` / `[data-slot=weave-veil]`, which are the
already-recorded shell class. This one names the presets list pane itself.

**Fix.** `animate`: the pane's entrance animates something the compositor cannot own — `__orb.animations()`
returned **0** active animations at settle, so the offender is a transition on a layout property during the
pane's mount rather than a tracked animation. Verify `transition-property` on the list aside.
Receipt: the same drive with no `[drop]` naming `aside[aria-label=Presets list]`.

---

### \[P3-B] (NEW, with a caveat I am stating rather than hiding) `flat-type-hierarchy` fires page-wide on the editor

**Receipt.** `pnpm design-audit / --goto presets --click '[aria-label="Default"]'` — the **only** finding on
the desktop arm, and it reproduces at the both-panes-hidden arm:

```
P3  flat-type-hierarchy  page  page font sizes are too close together for a visible hierarchy
                               (10.5px, 13px, 15px, 16px (ratio 1.5:1))
RESULT findings=1 p0=0 p1=0 p2=0 p3=1 census=614 reached=89 nav=OK
```

**The caveat.** A dense settings form arguably *wants* a compressed ramp — the hierarchy here is carried by
the kicker rules and the section grouping, not by type size, and that is the house's own `Section.kicker`
idiom. I am filing it because the rule fired and the receipt is real, but I am **not** claiming the surface
reads flat: it does not. Treat this as a question for the type-ramp owner rather than a defect to fix blind.

---

### \[T-1] (taste) The CONTEXT readout restates CONTENT row-for-row on two of five tabs

Not a new finding — the 2026-08-22 P2-7 covered it and the fix chosen was the `~—` token plus a gloss, which
landed and works. But the doubling itself survives and the eye still trips on it. On **Prompt**, the rack
renders thirteen sections (Main, World info (before), Description, Personality, Scenario, User persona, World
info (after), Dialogue examples, Memory, Databank, Guided instruction, Chat history, Post-history) and the
readout renders the same thirteen, same order, same numbers, 200px to the right
(`reports/snaps/cbrp-tab-Prompt.png`). On **Transforms**, the four POST-PROCESSING switches in CONTENT are
rows 3–6 of the reply-side readout (`cbrp-tab-Transforms.png`). Each panel does add something real — the
readout owns SETUP/POST budgeting, execution ORDER and the PIVOT; the rack owns drag, toggle and drill-in —
so this is a taste observation, not a re-file. It is worth knowing that the pattern reads as duplication
even though it is not.

### \[T-2] (taste) Thirteen always-on accent switches carry no information at rest

`cbrp-tab-Prompt.png`: every one of the thirteen rack rows ships its switch **on**, in full accent orange, in
a single vertical column. At rest the column says nothing — it is thirteen identical bright marks. The rare
and interesting state (a section switched **off**) is the quiet one. This inverts the surface's own excellent
discipline everywhere else, where accent is rationed onto state. `quieter: the prompt rack's switch column —
receipt: the off state louder than the on state, or the on state demoted to a hairline, with design-audit
still clean and the accent share re-measured.`

### \[T-3] (taste) The Data tab is mostly void

`cbrp-tab-Data.png` at 1280×800: CONTENT ends at y≈450 of an 800px pane; CONTEXT ends at y≈230. Two thirds of
both panes are empty on a tab whose whole content is two empty states and a collapsed `Macro browser`. The
copy is good (each empty state teaches and offers its action) — the problem is purely that the surface does
not look finished. Least urgent thing in this report; noted so it is on record.

---

## Observations / questions for the orchestrator

**\[O-1] An unattributed `Copy of Default` appeared mid-session.** By the time I ran the copy-on-write test the
list already held `Copy of Default` (`generation · edited 2m`) which I did not knowingly create. The name is
exactly what the kebab's **Duplicate** mints, and its subtitle reads `generation`, *not* `forked from
Default` — so it is a Duplicate, not a fork (which is also why the fork-choice dialog correctly stayed shut).
I ran a control: sitting on the built-in editor for 6s with no input produced **0** `preset.create` calls and
a stable row count of 4, so it is not a spontaneous fork on idle. I cannot attribute it and I am not filing it
as a defect — recording it because "a preset appeared and nobody clicked Duplicate" is worth a second pair of
eyes if it recurs.

**\[O-2] The chats↔presets binding claim, re-derived rather than remembered** (the brief asked). It holds:
`packages/db/src/schema/` has **no** `chats.preset_id` — the only preset FKs are `rpg_games.gmPresetId`
(`rpg.ts:87`), `preset_regex_scripts` (`regex.ts:126`), `roster_preset_members` / `roster_preset_rules`
(`roster-preset.ts:72,110`) and `preset_tags` (`tag.ts:221`). D58 states it directly: *"the GM voice is a
cloned preset carried as `rpg_games.gmPresetId` … NOTHING is ever bound to chats (neo's chat-binding sin is
banned)."* So the `Used by` panel's two-row model is correct, and saved casts bind a **roster** preset, a
different `kind`, which the library list correctly does not show. P1-A is a bug in the null-pick predicate,
**not** in this model.

---

## ARIA-navigability

This surface is in better a11y shape than any other rail section I have driven. **95 mapped controls, 0 DOM
fallbacks** (`map=95 map-dom-fallbacks=0`) — every single control has a stable accessible identity.
Lighthouse desktop scores **100 accessibility / 100 best-practices / 100 SEO / 100 agentic-browsing**.

Only one recommendation, and it is P1-A's, not a naming defect:

1. **`Used by` (`usage-readout.tsx`)** — the block is correctly a `Section` with a `heading [level=3]`, but on
   the built-in it *states a falsehood*. An AT user navigating by heading lands on "Used by" and is told
   nothing uses the preset that runs all their chats. Fix the predicate (P1-A), not the markup.

**What is already right and must not be touched:** the radiogroup's manual-selection contract
(`use-roving-radio-group` — arrows move focus, Space/Enter commit, wrap-around, and a no-checked fallback so
a filtered list is never un-enterable); `aria-valuetext="default (model decides)"` on every unset knob, so an
inherited value never announces as its minimum; `tablist "Preset sections"`; the delete `alertdialog` naming
the preset and saying it can't be undone; `aria-describedby` subtitles kept out of the row's accessible name;
the `Skip the section list` link in the rack; the `role="status"` announcement on activation, on **both**
input paths.

---

## Taste & flow verdict (blunt)

**Does it look like shit? No.** This remains one of the two or three best-looking surfaces in the app, and
the delta since August 22 made it better. The editor reads like a well-set instrument panel: fixed columns
of label · info-door · control · value, kicker rules doing real grouping, accent rationed onto state. The
landing is no longer a hole — the block is vertically centred with a real `h2` at a 60ch measure, which is
the single most visible improvement in the pass. The Actions tab is genuinely handsome: a lead sentence, a
filter, twelve steers each with a plain-English description of when it fires, and a right-hand readout that
shows the resolved template with the macro highlighted and tells you clicking the name opens that row in
Prompt. Somebody has thought hard about this surface, repeatedly.

**Does it flow weird? In two places.** First, **the built-in is a trapdoor.** It is the only thing in a fresh
library, so it is where every new user starts, and the surface presents it as a fully editable preset — ten
live sliders, live comboboxes, a live autosave chip — while the first edit quietly makes something else and
leaves the thing you were editing untouched. Nothing about the geography warns you; the one sentence that
explains it is parked in the fifth tab's third section. Second, **the CONTEXT panel and the CONTENT pane keep
saying the same words**, which makes the eye try to correlate two lists that scroll independently and cannot
be correlated. Neither is fatal; both make the surface feel like it has two minds.

**Is it intuitive cold? Mostly yes, with one hard no.** From the landing screenshot a first-timer can name
what this section is for — the empty state says it in one sentence and explicitly disclaims what it is *not*
("it doesn't pick the model (that's Connections)"), which is unusually good. The hard no is P1-A: the panel
whose kicker literally reads **Used by** tells that first-timer nothing uses their only preset. That is the
one place on this surface where reading the screen carefully makes you *more* wrong than not reading it.

**One home per concept (§13 IA lens).** Materially improved and now nearly clean. `Activate` went from three
homes to two (list radio for list-side commitment, editor header for the open artifact) — the kebab's echo is
gone and the kebab is now Duplicate/Export/Delete. `Rename` single-homed to the editor. `Export` stayed
single-homed to the list kebab per the recorded owner ruling. The one axis still read two ways is the
**active-pick** itself: `preset-editor-surface.tsx:209` and `preset-library-surface.tsx:94-96` both treat the
built-in as the null pick, and `preset-usage.ts:54` does not — which is exactly P1-A. Fixing it makes the
axis single-homed in behaviour as well as in prose.

---

## What is genuinely working (do not touch)

1. **The #481 keyboard fix is complete and correct, and I verified every arm of it live.** Three arrow
   presses across the radiogroup produced `checked=true → false → true` with `:focus-visible` at every stop
   and **zero** `settings.updateUserSettingsSection` mutations (`cbrp-kbd2`). Space then committed exactly one
   write (`cbrp-space`). Both the click path and the keyboard path announce
   `"<name> is now the active preset"` into an `aria-live="polite"` region. The hook's file header states the
   fork it resolved ("the ruling survives; its input changed") instead of silently reversing the earlier
   selection-follows-focus ruling — that is exactly the discipline the house asks for, written down where the
   next reader will find it.
2. **The zero-results state is now honest in all three panes** — better than what was prescribed. The header
   keeps the total (`Presets 0 of 1`, where the prior pass lost it), the list says "No matches / No preset
   matches your search. / Clear search · New preset", and the CONTENT landing swaps its whole paragraph to
   *"No preset matches your search, so there is nothing to pick right now — Clear search brings your presets
   back."* State honesty across pane boundaries is rare and this does it.
3. **The unset-knob problem was fixed on both channels, not just the visible one.** The thumb is now a hollow
   ghost ring (`cbrp-both-hidden.png`) *and* the slider carries
   `aria-valuetext="default (model decides)"` while `value` sits at the minimum — so neither a sighted user
   nor a screen-reader user can read "inherited" as "turned all the way down". Fixing the a11y half of a
   visual finding without being asked is the mark of the thing being done properly.

---

## The single biggest opportunity

**Make the built-in `Default` tell the truth about itself.** P1-A and P2-A are the same wound seen from two
sides: the surface treats the built-in as an ordinary preset in the DOM and as a special case in three
different predicates, and the two places that leak are the two sentences a first-run user actually reads —
"nothing uses this" (false) and "Saved" (false). Fix the null-pick predicate, say the copy-on-write rule
where the edit happens, and announce the fork on the seam that already exists, and the first-run experience
of this section goes from quietly misleading to genuinely excellent. Nothing else in this report is close.

---

## Retractions

Six, four of them my own.

1. **Prior P2-1 (header/body width fork) re-measured IDENTICAL — and it is NOT a finding.** At both panes
   hidden (`main`=1224) the header column is still `x=220 right=1116 w=896` and the body column still
   `x=308 right=1028 w=720` (`cbrp-geom`), byte-for-byte the 2026-08-22 numbers. I was about to file it as
   "closed but unfixed". **The owner ruled it live on 2026-08-22** in #482: *"KEEP the params-deck inset
   (arm a). The 720px instrument cap stands; the one-tab kicker offset is its accepted symmetric cost."*
   Recording the measurement here so the next sweep recognises it and does not re-file it either.
2. **My own "unset knobs announce their minimum to a screen reader" — dead.** The `--aria` tree prints
   `slider "Frequency penalty": "-2"`, which reads like a defect. It is the **serializer printing
   `aria-valuenow`**; the element carries `aria-valuetext="default (model decides)"`, which is what AT
   actually announces (`cbrp-sl2`). Never file an announced-value finding from the ARIA snapshot alone.
3. **My own "keyboard activation does not announce" — dead, and it was a race in my instrument.** My eval ran
   before the mutation's `onSuccess` settled, so the toast viewport was legitimately empty. Re-run with
   `--wait-for 'text=is now the active preset'` before the eval: `"New preset is now the active preset"`,
   present in both the `aria-live="polite"` region and a `role=status`. A `notify` that rides a mutation's
   success is **not** observable at snap's default post-step settle.
4. **design-audit `--mobile`'s `P2 tap-target 32×32` — not forwarded.** The node path is
   `…[data-slot=slider-root]:nth-of-type(14) > [data-slot=slider-thumb] > input:nth-of-type(1)` — the Base UI
   Slider's hidden native `input[type=range]`. Every slider on this surface has a numeric text field beside
   it, so WCAG 2.5.8's equivalent-control exception applies; this is the same class the 2026-08-22 pass
   retracted on desktop. Worth noting it moved 24×24 → 32×32, so the coarse-pointer enlargement did land.
5. **Lighthouse's one failure is the ruled false positive.** `label-content-name-mismatch` on
   `div.@container/list-row > button.group` — `aria-label="Default"` against visible text that also contains
   the subtitle. The subtitle is bound by `aria-describedby="_r_53_-subtitle"`, which is the ruled list-row
   pattern the brief told me not to re-file. Not re-filed.
6. **The Lighthouse MOBILE arm is VOID and I am not citing it.** It reported
   `Emulating viewport: {"isMobile": false, "width":1280, "height":800}` — it ran at the desktop viewport,
   exactly as the brief warned. `design-audit --mobile` (`pointer=coarse census=502`) is the authoritative
   coarse receipt in this report; the Lighthouse mobile numbers are excluded from every claim.

---

## Console triage

`console-errors=0` and `page-errors=0` on **every** run in this pass. Warnings, all arms:

| Warning | Disposition |
| - | - |
| `[frame] long frame 103–174ms · blocking 42–124ms @ main.tsx` | **Known-ruled — shell boot**, attribution is `main.tsx`, not presets (2026-08-22 P3-8, routed to the shell) |
| `[drop] 70–101ms mid-animation · svg[aria-label=Orbweaver]` / `[data-slot=weave-veil]` | **Known-ruled — the splash mark**, same shell class |
| `[reflow] forced synchronous style/layout 19–37ms` inside the boot frame | **Known-ruled — shell boot**, same frame as the above |
| `[cls] shift 0.0221 unexpected · [role=region] moved 0px,-24px / -91px` | **Investigated → within budget.** Load-settling of the two panes; folded into non-virtualized CLS 0.0334, under the 0.1 gate |
| `[perf] slow commit region:content 18–24ms (mount/update)` | **INVESTIGATE → filed as P2-D** (the 194ms long task / 133ms rAF gap on opening a preset) |
| `[drop] 61ms mid-animation · aside[aria-label=Presets list]` | **INVESTIGATE → filed as P3-A** — the only warning whose attribution names a presets-owned node |

No warning was dispositioned "it's dev mode".

---

## Instrument coverage

| # | Instrument | Status |
| - | - | - |
| 1 | `snap --map` / `--aria` | **RAN** — `cbrp-landing` (30 elements), `cbrp-editor-default` (**95 elements, 0 DOM fallbacks**), per-tab aria ×4, `[role=menu]`, `[role=alertdialog]` |
| 1b | `snap --contrast` (in-viewport, hydration-gated on a rendered `h2`) | **RAN** — 8 selectors desktop, all PASS (15.73 / 15.73 / 7.75 / 8.45 / 8.66 / 6.27 / 6.55); the below-fold `Advanced` label re-taken at a **tall viewport** (1280×2400) → 17.14:1 PASS. One honest `OFF-SCREEN … NO VERDICT` refusal drove that second arm |
| 1c | `snap --expect-no-overflow` | **RAN** — PASS at 430 coarse, 768, 1280, 1920 and on all four appearance arms (`overflow=0x0 escapes=0`) |
| 1d | `snap --matrix` | **SKIPPED** — its axes (viewport × theme × motion) were covered individually at higher resolution: four explicit viewports, an explicit `--theme Light` arm with a framebuffer decode, and `data-reduced-motion=true` already live in the owner's own row |
| 2 | `pnpm design-audit` desktop | **RAN** — `cbrp-da-desktop` (findings=1, census=614, reached=89, nav=OK) |
| 2b | `pnpm design-audit --mobile` | **RAN** — `cbrp-da-mobile` (findings=2, `pointer=coarse`, census=502). The authoritative coarse receipt |
| 2c | `design-audit` at a second pane state | **RAN** — `cbrp-da-bothhidden` (list + context hidden, actions=4, findings=1 — same single P3) |
| 3 | `pnpm motion-audit` | **SKIPPED (reason)** — `__orb.motion()` + `__orb.animations()` were read directly on the driven surface (row 6) after real interactions, which is the same signal set; the dropped-frame % is only trustworthy headful and no headful arm was available |
| 4 | `pnpm perf-meter --click` | **RAN** — `reports/perf-meter/perf-meter.json`, the primary action (open a preset). Filed as P2-D |
| 4b | `snap --cpu-throttle 4` (small-hardware lens) | **RAN** — worst blocking 637ms (boot), react-dom commit 183ms, non-virtualized CLS 0.0113 |
| 5 | Lighthouse desktop (MCP) | **RAN** — `reports/lighthouse-cbrp-desktop/` — 100/100/100/100, 37 passed, 1 failed (ruled FP) |
| 5b | Lighthouse mobile (MCP) | **RAN but VOID** — reported `isMobile:false, 1280×800`. Excluded from every claim (Retraction 6) |
| 6 | `__orb.motion()` / `.animations()` / `.renders()` | **RAN** — CLS raw 0.0334 · virtualized 0 · **non-virtualized 0.0334** (gate 0.1, PASS); **0** animations, so nothing compositor-dirty; renders `region:content 39/1/38 maxMs 72` |
| 7 | Console triage table | **RAN** — see above; 0 errors on every run |
| 8 | The PNGs, actually looked at | **RAN** — landing, editor, all five tabs, both-hidden, mobile, 1920, four appearance arms, Light theme |
| 9 | Keyboard walk incl. `:focus-visible` at every stop | **RAN** — `cbrp-kbd`, `cbrp-kbd2`, `cbrp-space`, `cbrp-space2`; `fv=true` at every stop; the #481 hazard proven dead by mutation count |
| 10 | Appearance-preset arms | **RAN** — `defaults`, `maximal`, `compact`, `reading`, all four md5-distinct, all overflow-clean. `diagnostics` **SKIPPED** — no metadata chrome under judgment on this surface |
| 10b | `--theme` arm (framebuffer decoded BEFORE looking) | **RAN** — `--theme Light --idle`; decoded pixels content-bg `(250,248,245)`, list-bg `(246,242,239)` = genuinely light; contrast re-measured 16.26 / 7.37 / 7.70, all PASS. `--theme none` **SKIPPED** — the account carries no `data-theme`, so the owner arm already *is* the null-theme state |
| 11 | Pane-state arms | **RAN** — both open (default), list hidden + context hidden (`cbrp-geom`, `cbrp-both-hidden`, `cbrp-da-bothhidden`), and mobile where both panes are structurally absent |
| — | Two prior findings NOT re-drivable | **BLOCKED, stated** — P2-2 (regex `off` vs attach switch) needs a preset that can hold regex scripts; the built-in structurally cannot, and I restored the corpus to 1 row. Verified **structurally** instead: the `Disabled in your library` badge exists at `regex-script-picker.tsx:285`. Same for the "deck"→Params leak, verified at `readout-parts.tsx:156`. Neither has a rendered receipt in this pass |

**MCP budget: 4 calls used** (navigate, one bridge eval, two Lighthouse) of \~12.

---

## Issue summaries (for the orchestrator to paste; NEW unless marked)

**NEW — P1.** `Used by` reports the built-in `Default` as unused and instructs the user to "activate it",
on the preset that is active and that every chat generates with. Cause: `preset-usage.ts:54` computes
`isUserDefault: settings.seeds.defaultPresetId === presetId`, but the built-in **is the null pick**
(`defaultPresetId === null`), so the comparison is always false for the sentinel
`preset_00000000000000000000000000` and `usage-readout.tsx:41-48` falls to its no-bindings arm. Two client
sites already read the axis correctly (`preset-editor-surface.tsx:209`,
`preset-library-surface.tsx:94-96`); this is the third, narrower reader. This is the first-run default state
and it contradicts the header `Active` chip, the checked list radio, and the landing readout on the same
screen. Fix: treat `defaultPresetId === null` + built-in sentinel as `isUserDefault: true`; the correct
sentence already exists on the `isDefault` arm. Receipt:
`docs/reviews/side-eye/2026-08-30-rail-presets-delta.md` P1-A.

**NEW — P2 cluster (built-in copy-on-write + fork identity).** (1) Editing the built-in silently mints a new
preset, retargets the editor under the user, does **not** activate the fork, and the only status on screen
reads "Saved" — measured: rows 3→4, editorTitle `Default`→`Default (edited)`, `dialog: null`, new row
`checked:false`; the mechanism is explained only at `regex-tab.tsx:54`, inside the Transforms tab. Fix: an
inline notice in the editor body when the open preset is the built-in, plus a fork announcement over the
existing `notify` seam (`active-preset-notice.ts`), plus a fork on whether a fork of the ACTIVE built-in
should inherit the active pick. (2) The fork inherits `kind: "system"` and the subtitle renders kind verbatim
in the lead position (`preset-row-view.ts:6,35`), so a user's own editable preset is labelled with the
vocabulary the surface uses for "locked, not yours"; the New button mints `generation`
(`preset-library-surface.tsx:39`). Receipt: same file, P2-A and P2-B.

**NEW — P2 (mobile layout).** At 430px every knob's value cell aligns to nothing: label x=12, slider track
12→418, value cell 284→364 — 54px short of the track's right edge, on all ten knobs — and each row costs
148px against 38px on desktop (Params ≈2,800px of scroll). Fix: move the value cell onto the label's line so
a right-hand value column exists. Receipt: same file, P2-C.

**NEW — P2 (perf).** Opening a preset breaches: 2 long tasks (251ms total / 194ms worst), 144ms blocking,
**133ms rAF gap** (≈8 dropped frames), click 88ms — though input delay is only 7ms, so this is a hitch, not
an INP failure. `region:content` commits 39× with `maxMs 72`; at 4× throttle the react-dom commit blocks
183ms. Fix: defer non-selected tabpanel subtrees / split the ten-knob deck behind a transition. Receipt:
same file, P2-D + `reports/perf-meter/perf-meter.json`.

**NEW — P3 polish cluster.** (1) The presets LIST pane drops a 61ms frame on entry against the app's own
50ms budget (`[drop] … aside[aria-label=Presets list] … OVER BUDGET`) while `__orb.animations()` reports 0
tracked animations — check `transition-property` on the list aside. (2) `design-audit` reports page-wide
`flat-type-hierarchy` (10.5/13/15/16px, 1.5:1) on the editor — filed with the caveat that a dense form may
legitimately want a compressed ramp and hierarchy here is carried by kicker rules; this is a question for the
type-ramp owner, not a fix-blind. (3) Taste: the Prompt rack ships thirteen always-on accent switches in one
column, inverting the surface's own rationed-accent discipline (`quieter`); the Data tab leaves two thirds of
both panes empty. Receipt: same file, P3-A / P3-B / T-2 / T-3.

**ALREADY FILED — verification only, no action.** #481 (keyboard activation + Activate's three homes),
\#482 (7 of 8 arms; item 1 owner-ruled dead), #483 (landing + readout meters), #484 (mobile `aria-current`),
\#486 (owner-ruled skip), #506 (Rename single-homing) all **re-verified fixed live** — details and receipts in
the "What is genuinely working" and Retractions sections. #485's ListRow `side-tab` /
`border-accent-on-rounded` pair **no longer fires** on this surface at any arm.
