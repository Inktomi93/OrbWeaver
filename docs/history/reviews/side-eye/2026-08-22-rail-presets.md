---
kind: review
status: archived
updated: 2026-08-30
---

# side-eye — PRESETS (rail sweep 2/10)

**Lane:** rail-presets · **Surface:** the Presets section on the live dev stack (`:5173` / `:8788`), read-only
**Verdict: SHIP WITH FIXES.** Presets is a genuinely well-built surface — the copy is the best in the app,
every knob has a help door, every empty state teaches, and the a11y skeleton is real (skip link inside the
rack, `sr-only` spoken token estimates, `aria-describedby` subtitles, an `alertdialog` on delete). I attacked
it across 8 matrix variants, 4 pane states, two pointer classes, two themes, two appearance profiles and a
keyboard walk, and the contrast/overflow/motion/perf layers all held. What it has is **one keyboard hazard
that silently rewrites a global setting**, a **width-dependent header misalignment that re-opens a ruling
already closed once**, and a cluster of clarity defects where two adjacent signals mean opposite things.

**Design health: 29/40 — "good" band, lower end.** Score is calibration only; every item below is filed
regardless of the band.

**Dataset / timing.** The ST import is running on this stack, but presets is **not** an imported plane
(the importer is unbuilt), so the corpus was stable at **5 presets** for the entire pass
(`Default` built-in + 4 user presets, all `edited 38m`→`1h` across the session). I created one
preset (`New preset`) to review the create flow and **deleted it**, and I changed the active preset
during the keyboard walk (see P1-1) and **restored it to `Default`** — final state verified: 5 rows,
`Default` `aria-checked="true"` (`scratchpad/47-restore`, `49-deleted`).

**Appearance state — PROBED, not assumed** (`snap --eval` on the root + `.shell-grid`, 11:34):

| Handle | Value |
| - | - |
| `data-theme` | *(absent — no theme selected; shipped Hearth default)* |
| `data-reduced-motion` | **true** |
| `data-texture` | *(absent = `none`)* |
| `data-shadow` / `data-theme-colorization` | *(absent = off)* |
| `data-blur-panels` / `-composer` / `-modals` | present · `--blur-strength: 14px` |
| `.shell-grid data-elevation` | **flat** |
| `.shell-grid data-density` | comfortable |
| `--font-scale` | 1 |

So the owner's own row hides every ornament. The `maximal` arm (`data-texture=grain`,
`data-elevation=glow`, `data-shadow`, `data-theme-colorization`, blur 22px, motion on) was taken
separately and **held** — grain and glow land on chrome only; no reading surface picked up art
(`reports/snaps/presets-maximal.png`).

**Environmental note.** Live `:5173` was wedged 11:50–11:58 (a stale vite transform graph referencing a
reverted export → error boundary). Every receipt in this report is either **before 11:50** with a clean
`nav=OK / console-errors=0` RESULT line, or **re-taken after the orchestrator's 11:58 restart**. The two
runs that landed inside the window (New / Import dialogs) were discarded and re-taken twice — once on a
`--dirty` stage (`:5273`, same 5-preset corpus, verified by aria) and once on the restarted live stack.
Nothing from the wedge window is cited.

---

## Design-health score (Nielsen, honest)

| # | Heuristic | Score | Key issue |
| - | - | - | - |
| 1 | Visibility of system status | 3/4 | Autosave "Saved" + retry, live token estimates, a capability readout that names what the model ignores. But **activating a preset produces no toast, no live region, no announcement** — the only feedback is a 34px dot moving in the list |
| 2 | Match system ↔ real world | 3/4 | The best copy in the app ("A preset shapes generation; it doesn't pick the model (that's Connections)"). Two leaks: "clear them in **the deck**" (internal name) and "**off**" colliding with the switch vocabulary |
| 3 | User control & freedom | **2/4** | Delete confirms, Reset confirms, Import explains before it acts — and **Activate, the one action with global effect, has no confirm, no undo, and fires on a bare arrow key** (P1-1) |
| 4 | Consistency & standards | 3/4 | One switch grammar, one number format, lifecycle in the list kebab matching chats/characters. But Activate has **three homes** and the editor header does not share the column it is documented to share |
| 5 | Error prevention | 3/4 | The import dialog states replace-vs-create semantics *before* you pick a file — genuinely excellent. The delete `alertdialog` names the preset. Activate gets none of this grammar |
| 6 | Recognition over recall | 3/4 | An info door on every knob, a description on every Actions row, `default` ghosts in value cells. But **unset and minimum render identically** (P2-3) and one select hides its own value (P2-5) |
| 7 | Flexibility & efficiency | 3/4 | ⌘K, "Skip the section list", instant New with no naming modal, a filter in Actions and a search in the list. No bulk ops; no deliberate keyboard path to activate |
| 8 | Aesthetic & minimalist | 3/4 | Handsome and dense-but-ordered. The Prompt readout **duplicates the rack row-for-row** and its meter column is \~85% empty tracks; the landing is 71% void |
| 9 | Error recovery | **2/4** | The failure band exists in code (`EffectiveProfileFailure`, `role="alert"`, cause-specific copy, Retry) but I could **not reach any error state** — 17 queries, 0 errored, across every arm. Scored conservatively rather than credited |
| 10 | Help & documentation | 4/4 | Every knob has an info door; every tab leads with a sentence saying what it is for; the readout glosses provenance (`model default` / `window` / `default`); every empty state teaches and offers the next action |

**29/40.**

---

## Findings

### \[P1-1] Arrow keys in the preset list silently activate each preset they land on — one persisted mutation per keystroke, no confirm, no undo, no announcement

**What.** The preset list is a `radiogroup "Active preset for generation"` whose radios mean "this preset
drives every generation from now on". Standard radiogroup semantics apply: only the *checked* radio is in
the tab order, and arrow keys move **and select**. So a keyboard or screen-reader user merely *browsing*
the list rewrites which preset generates — once per arrow press.

**Receipt.** Keyboard walk (`scratchpad/10-kbd`, `11-radio`), live stack 11:38, no `--probe`:

```
Tab, Tab                 → "Activate Default for generation | role=radio | checked=true"
ArrowDown                → "Activate Default (OpenAI) for generation | checked=true"
ArrowDown                → "Activate GGSytemPrompt (OpenAI) for generation | checked=true"
```

Console harvest for that same run — the state is **persisted server-side**, not just a visual radio:

```
2 → mutation settings.updateUserSettingsSection
2 ← mutation settings.updateUserSettingsSection
```

Two arrow presses, two writes. `reports/snaps/kbd-radio.png` shows the outcome: `Default` has lost its dot,
`GGSytemPrompt (Op…)` now reads `Active · roleplay · edite…`. Nothing announced it; there is no toast and
no live region. Re-verified in the `--goto presets --fill` run 11 minutes later — the change had stuck
(`reports/snaps/presets-search-empty.png`, readout: "GGSytemPrompt (OpenAI) **Active**").

**Why it hurts a user.** Sam (§9) explores a list to find out what is in it. On this surface exploring *is*
committing. The mouse path requires a deliberate click on a 34px target that is hidden until hover; the
keyboard path fires on the key you press to read the next row. The user then generates against a preset
they never chose and has no signal that anything changed — the app's own diagnosis language for this
("1 stored knob this model ignores") will suddenly appear or vanish with no stated cause.

The asymmetry is the tell: **Delete** — recoverable by re-creating — gets an `alertdialog` that names the
artifact and says "This can't be undone." **Activate** — which changes what every future turn does — gets a
keystroke. The app already owns the right grammar and did not apply it to the one action on this surface
with global reach.

**Fix.** Split focus from selection, which WAI-ARIA APG explicitly sanctions for exactly this case
(selection with a side effect): arrow keys move focus only, `Space`/`Enter` commits. Then add the missing
feedback — an `aria-live="polite"` announcement ("GGSytemPrompt is now the active preset") and, ideally, an
undo affordance on the toast. `clarify` + `harden`: the preset list radiogroup — receipt: a repeat of the
walk above showing N arrow presses → **0** `settings.updateUserSettingsSection` mutations, then one
mutation on `Space`, plus the live-region text in the aria tree.

---

### \[P2-1] The editor header is 176px wider than the body column it is documented to share — at every pane state where the content container is ≥64rem

**What.** `preset-editor-surface.tsx:278-287` records a prior fix (cited there as *side-eye 2026-08-19
P1-1*): the sticky header's *content* was given the body's capped, centered column so "the two ends of the
header" stop sitting "a hand-span outside the thing they belong to". The header got
`max-w-(--width-content-col) @5xl:max-w-(--width-content-col-wide)`. The **body column never got the `@5xl`
arm**. Below the container breakpoint they agree; above it they diverge by the difference between the two
tokens.

**Receipt.** Both panels hidden, `main` = 1224px (`scratchpad/43-align`, live, 12:0x):

| | x | right | width | class |
| - | - | - | - | - |
| header column | **220** | **1116** | **896** | `… max-w-(--width-content-col) @5xl:max-w-(--width-content-col-wide)` |
| body column | **308** | **1028** | **720** | `… max-w-(--width-content-col)` |
| first `section` | 308 | 1028 | 720 | — |
| tablist | 220 | 623 | 403 | — |

`--width-content-col: 45rem` (720px) · `--width-content-col-wide: 56rem` (896px). So the preset name, the
Activate button, the autosave status and the whole tab strip sit **88px outside the content on each side** —
the exact geometry the earlier ruling was minted to kill, re-created above the breakpoint.
`reports/snaps/presets-both-hidden.png` shows it: the tab strip's left edge is visibly left of every
section kicker beneath it.

**This is a range property that a point measurement passed.** At the default docked-both state
(`main` = 568px) both caps are inactive and the two columns align perfectly — which is why it survived.
It appears at any pane state where the content container crosses `@5xl` (64rem): list-hidden, context-hidden,
both-hidden, or a wide monitor.

**Why it hurts a user.** The artifact's own title and its primary action float unanchored above the thing
they act on; the tab strip's left rule no longer lines up with the section rules below it. It reads as two
layouts stacked, not one pane.

**Fix.** `layout`: give the body column the same `@5xl:max-w-(--width-content-col-wide)` arm, or drop it
from the header — one of the two, not one each. **Note for the fixer:** this contradicts the recorded fix
at `preset-editor-surface.tsx:278-287`; state the fork rather than silently reverting it (the mechanism —
"the header rides the body's column" — survives; its input changed when only one side gained a wide arm).
Receipt: the table above re-measured at `main`=1224 with `headerCol.x === bodyCol.x`.

---

### \[P2-2] "off" and the switch beside it mean opposite things on the same regex row, with nothing saying which is which

**What.** On the Transforms tab, a regex row's scent begins with `off · ` when the script is **disabled in
your library**; the switch at the row's other end is `aria-label="Attach {name}"` and means **attached to
this preset**. So a row can read `off · model output · /…/ · edited 1h ago` with a bright orange ON switch.

**Receipt.** `packages/client/src/lib/regex-placement-labels.ts:182`

```ts
return script.enabled ? scent : `off · ${scent}`;
```

against `packages/client/src/components/regex-script-picker.tsx:276-278` (`aria-label={`Attach ${name}`}`,
`checked={attached}`). Rendered: `reports/snaps/presets-tab-Transforms.png`, row 1 "Clean HTML (From
Outgoing Prompt)" — subtitle starts `off ·`, switch is on.

**Why it hurts a user.** Two state words, 500px apart on one row, one saying off and one saying on, about
two different facts, with neither labelled. The *true* meaning — "this is attached but it's disabled in
your library, so it will not run" — is genuinely important and the UI never says it. A user turning the
switch on and seeing nothing happen has no path to the cause.

**Fix.** `clarify`: replace the bare `off` token with something that names its own subject — a `Disabled in
your library` badge on the row, and (better) an explicit inert state on rows that are attached-but-disabled.
Receipt: a before/after copy table plus a screenshot of an attached-and-disabled row.

---

### \[P2-3] An unset sampling knob renders identically to a minimum one

**What.** A knob with no stored value shows its thumb parked at the far-left rail and its value cell reading
`default`. A knob genuinely set to its minimum looks exactly the same on the track. On a **brand-new
preset** this is the dominant state: all eight sampling sliders sit at the left rail simultaneously.

**Receipt.** `reports/snaps/stage-new-dialog.png` — a freshly created preset: Temperature, Top-P, Top-K,
Min-P, Top-A, Frequency penalty, Presence penalty, Repetition penalty, every thumb at x≈500 (track start),
every value cell `default`. Compare `reports/snaps/presets-editor.png`, where Top-K and Min-P (unset) sit at
the identical position while Temperature (set to 1) sits mid-track.

**Why it hurts a user.** The value cell says "inherited"; the track says "zero". The track is the louder
signal and it is the wrong one. A first-timer's honest read of a new preset is "everything is turned all the
way down", which is the opposite of the truth. The `default` cell is doing all the work and it is the small
grey element.

**Fix.** Give the unset state its own track treatment — a dimmed/hollow thumb, a dashed or unfilled track,
or park the thumb at the *inherited* value with a ghost fill — so "no opinion" cannot be misread as "set to
minimum". `clarify` + `colorize`: the eight `SAMPLING` knob tracks — receipt: side-by-side shots of an unset
knob and a knob set to its true minimum, visibly different.

---

### \[P2-4] The "Advanced" disclosure is a 16px-tall control with a 10.5px label and no touch target

**What.** The `Advanced` collapsible at the foot of the Params tab is the smallest interactive text on the
surface and has no pointer-conditional hit expansion.

**Receipt.** `scratchpad/15-triage` / `23-mobile-targets`:

```
desktop: {text:"Advanced", fontSize:"10.5px", box:"544x16"}
mobile : {box:"406x16", "::after": content:none, height:auto}
```

Corroborated deterministically — `pnpm design-audit / --goto presets --click <preset>` and the same run
`--mobile`, both report `P2 undersized-ui-text [data-slot=collapsible-trigger] > p — interactive text is
10.5px, below the 11px functional floor; being on the type ramp does not launder legibility for a control`.

16px of height is below WCAG 2.5.8's 24×24 minimum on *any* pointer and far below the 44×44 coarse floor.
`::after` resolves to `content: none`, so the `@orb/ui` touch-target pseudo is not in play here.

**Why it hurts a user.** Casey (§9) taps a 16px strip one-handed. Low-vision users read a 10.5px control
label. And it is a *disclosure* — the thing that hides functionality — so the cost of missing it is missing
a whole section.

**Fix.** `typeset` + `adapt`: the collapsible trigger — lift the label to the 13px label voice and give the
trigger a ≥44px row box. Receipt: `design-audit --mobile` clean of `undersized-ui-text` + the measured box.

---

### \[P2-5] The "Speaker names" select truncates its own current value

**Receipt.** `scratchpad/40-transforms2`, Transforms tab, docked-both (568px pane):

```
SPAN "Content — always prefix “Name: ”"  scrollWidth 236 · clientWidth 154 · text-overflow: ellipsis · over: true
```

Rendered as `Content — always p…` (`reports/snaps/presets-tab-Transforms.png`). The trigger is a fixed
200px control; the label beside it ends at x≈445 and the trigger starts at x≈684, leaving \~240px of empty
gutter that the value could have used.

**Why it hurts a user.** The whole job of a closed select is to state the current setting. This one requires
opening it to find out what it says — recall instead of recognition, §7.6 — and the three-word truncation
`Content — always p…` is not even distinguishable from a sibling option that also starts "Content — always".

**Fix.** `layout`: let the select trigger grow into the row's available width (or wrap/two-line the value)
instead of a fixed 200px cap in a fluid pane. Receipt: `scrollWidth <= clientWidth` on the trigger's value
span at the 568px pane, and at 1224px.

---

### \[P2-6] "Activate" has three homes on one surface

**What.** The same action is reachable three ways in one view: the always-present radio on the list row, an
`Activate` menuitem inside that same row's kebab, and an `Activate` button in the editor header.

**Receipt.** `scratchpad/37-kebab-live` —

```
menu "Actions for \"Marinara's Spaghetti Recipe (OpenAI)\" · 59m ago":
  - menuitem "Activate"    ← duplicates the radio 40px away on the same row
  - menuitem "Rename"
  - menuitem "Duplicate"
  - menuitem "Export"
  - menuitem "Delete"
```

plus `button "Activate — use this preset for generation"` in the editor header (`scratchpad/04-editor` map).

**Why it hurts a user.** §13's IA single-homing rule. The kebab item is pure duplication of the row's own
primary affordance, sitting 40px from it. Worse, it teaches that the kebab is where actions live, which
makes the radio look like a status dot rather than a control — and the radio *is* the control, including
the one with the P1-1 keyboard hazard.

Note the surface already applied this exact reasoning once and stopped short: `preset-editor-surface.tsx:362-365`
records the owner overruling an `Export` echo — *"ONE home — the list-row kebab, matching the
characters/chats precedent"*. The same test kills the `Activate` echo.

**Fix.** `distill`: drop `Activate` from the list-row kebab; keep the row radio (list-side commitment) and
the editor header button (acting on the open artifact in CONTENT). Receipt: the menu aria tree with four
items.

---

### \[P2-7] The Prompt readout duplicates the rack row-for-row, and its meter column is \~85% empty track

**What.** The Prompt tab renders the same 20+ prompt sections twice: the rack in CONTENT (drag, name, token
count, switch, drill-in) and the readout in CONTEXT (name, a token bar, the same number, strikethrough when
off). The readout's added value is the SETUP/POST budget grouping and the relative-weight bar — but the bar
does not work at this data's scale.

**Receipt.** `scratchpad/19-bars`, measured fill widths against a 142–146px track:

```
track 146 fill 0.7 · 146/0.7 · 142/0 · 146/0.7 · 142/0 · 142/0 · 142/16.6 · 146/0.7 ·
142/3.6 · 142/0 · 142/0 · 146/0.7 · 142/4 · 142/0 · 142/0 · 146/0.7 · …
```

Of the first 17 rows: **7 fills are 0px** and **6 are 0.7px** — a 0.5% sliver on a 146px track, sub-pixel at
DPR 1. Only three exceed 3px. One section (`Instructions`, \~393 of \~896 setup tokens) owns the scale and
flattens everything else.

**The real defect inside the noise: "off" and "negligible" render as the same empty track.** A disabled row
draws fill=0; a two-token enabled row draws 0.7px. The eye cannot separate them, so the one thing the meter
column could usefully say — which sections are actually costing you — is exactly what it cannot say.

**Why it hurts a user.** Twenty rows of chart furniture that carries a single readable bit, beside a list the
user is already reading, on a surface whose whole job is prompt budget.

**Fix.** `distill`: either drop the bar for rows below a visible threshold and lean on the number (which is
already right there, tabular and right-aligned), or move to a rank/log scale so small sections are still
distinguishable from zero — and make the disabled state visually distinct from a small one. Receipt: the
same fill census showing either 0 sub-1px fills, or a distinct treatment for `enabled: false`.

---

### \[P2-8] (mobile) Slider thumbs at min/max sit flush against the screen edge, at 24×24

**Receipt.** `scratchpad/23-mobile-targets`, iPhone 14 Pro Max emulation (430px, `pointer: coarse`):

| knob | thumb x → right | spill |
| - | - | - |
| Top-P (max) | 406 → **430** | 0px margin, viewport edge |
| Top-A (max) | 406 → **430** | 0px margin |
| Top-K (unset/min) | **0** → 24 | 0px margin, left edge |
| Min-P (unset/min) | **0** → 24 | 0px margin |
| Temperature (mid) | 203 → 227 | fine |

Thumb is 24×24 — under the 44×44 coarse floor, and its grabbable half at either extreme is on the bezel,
where the OS edge-swipe gesture lives. Visible in `reports/snaps/presets-mobile-editor.png` (Top-P).

**Retraction attached:** `design-audit` reported this class as **4× `P1 tap-target 22×22`** on desktop. That
node is the Base UI Slider's hidden native `input[type=range]` inside a 256×32 track, and every slider on
this surface has a numeric text field beside it — WCAG 2.5.8's "equivalent control" exception. Those four
P1s are **not forwarded**. The real, narrower finding is the mobile edge-flush geometry above.

**Fix.** `adapt`: inset the slider track by half a thumb at both ends so a min/max thumb keeps a full
grabbable radius on screen; consider a larger coarse-pointer thumb. Receipt: the same census with
`thumb.x > 0` and `thumb.right < innerWidth` at both extremes.

---

### \[P2-9] (shell-scope, tripped over here) On mobile there is no visible or announced "you are here" for Presets

**What.** The mobile bottom bar renders 4 of the 9 rail sections. The `Presets` button is still in the DOM
carrying `aria-current="page"` — at **0×0**.

**Receipt.** `scratchpad/22-mobilenav`, `--mobile`, on Presets:

```
nav "Primary" 0,684 430x56 · scrollWidth 430 = clientWidth 430 · overflow-x: visible
  Home   0,685 108x56  cur=-
  Chats  108,685 108x56 cur=-
  Characters 215,685 108x56 cur=-
  You    323,685 108x56 cur=-
  Presets 0,0 0x0  cur=page      ← current section, zero-sized
  (Corpus, Configuration, Databank, Refinery, Analytics also 0x0)
```

**Why it hurts a user.** Four visible tabs, none marked current, while the current-page marker lives on an
invisible node. A screen-reader user can land on "Presets, current page" for a control with no box; a
sighted user gets no location cue at all. §7.1 (visibility of system status) fails on mobile specifically.

**This is shell-owned, not presets-owned** — it will reproduce on Corpus, Configuration, Databank, Refinery
and Analytics. Filing it here because this is where I hit it; route it to the shell.

**Fix.** Either surface the current section in the bottom bar (swap it into the fourth slot, or mark the
overflow entry as current), or drop `aria-current` from a zero-sized node so AT is not told about an
unreachable control. Receipt: on Presets at 430px, exactly one *visible* nav item carries the current marker.

---

### \[P3-1] The presets landing uses 29% of its pane, at a 42.5ch measure, and its title is not a heading

**Receipt.** `scratchpad/09-geom`, docked-both, live:

```
main      328,48  568 x 752
emptyState 328,48 568 x 219      ← 533px (71%) of the CONTENT pane is empty below it
title      427,108 370 x 30   tag: P    24px/600
desc       420,150 384 x 93   15px/23.25px, max-width 384px, text-align: center
lineWidths [362, 365, 359, 96]  chWidth 8.58  →  max 42.5ch
```

Three separate things:

1. **71% void.** The block is top-anchored in a 752px pane, so the eye reads three lines and falls into
   500px of nothing. Same at every pane state; it gets worse the wider the pane.
2. **42.5ch measure** against §2's 65–75ch, *centered*, over four lines — the ragged-centered short-measure
   look.
3. **The 24px/600 title is a `<p>`.** In the landing state `main "Presets content"` contains **zero
   headings** (`scratchpad/03-aria-hidden`). Heading navigation finds nothing in the pane the user is
   looking at. (In the *editor* state this is already correct — the preset name is an `h2`, per a prior
   side-eye fix at `preset-editor-surface.tsx:290-296`. Only the landing was missed.)

**Fix.** `onboard` + `typeset`: promote the landing title to a real heading; widen the measure toward 60ch
or left-align it; and either centre the block in the pane or give the void something to do (recent presets,
"start from Default", the import door). Receipt: `main` aria tree containing a `heading`, the measured
line width, and a shot at both 568px and 1224px.

---

### \[P3-2] #434's list-state honesty verified — and the same class of dishonesty survives in the zero-results state

**Verified (#434 holds).** Live, docked list — the description ends at "…(that's Connections)." With the
list collapsed it gains exactly one footnote (`scratchpad/08-collapsed`):

```
paragraph: Pick a preset to edit its sampling, reasoning, output and prompt structure, or create a new one.
A preset shapes generation; it doesn't pick the model (that's Connections). The list isn't on screen right
now — Show list panel in the top bar brings it back.
```

**Gap.** Filter the list to nothing and the welcome does not change: it still says "Pick a preset … or
create a new one" while pointing at an empty list (`reports/snaps/presets-search-empty.png`). The list pane
itself handles this beautifully ("No matches / No preset matches your search. / Clear search · New preset"),
so the CONTENT pane is the only thing lying.

Minor, same shot: with the filter matching nothing the header count drops from `PRESETS 5` to bare
`PRESETS`, so the total is lost exactly when it would reassure.

**Fix.** `clarify`: extend the same state-honesty switch to `filteredCount === 0`. Receipt: the paragraph
text under a non-matching filter.

---

### \[P3-3] "clear them in the deck" ships an internal name to the user

**Receipt.** `packages/client/src/features/preset/components/readout/readout-parts.tsx:155`

```ts
: ` · ${String(effective.stale.length)} stored knob${…} this model ignores — clear them in the deck`}
```

"The deck" is the codebase's name for the Params tab (`params-deck.tsx`, and \~14 comment sites). The word
appears nowhere in the UI — the tab is labelled **Params**. Rendered at 10.5px in the CONTEXT readout
(`reports/snaps/presets-editor.png`).

**Why it hurts a user.** Jordan (§9): the sentence tells you there is a problem and then names a place that
does not exist on screen. It is the one piece of jargon on an otherwise jargon-free surface.

**Fix.** `clarify`: "…— clear them in **Params**." Receipt: a copy diff.

---

### \[P3-4] The tab strip has no accessible name

**Receipt.** `scratchpad/04-editor` map:

```
tablist "ParamsPromptActionsDataTransforms" → body > div:nth-of-type(1) > … > div:nth-of-type(1)  [dom]
```

`map-dom-fallbacks=1` — this is the **only** element on the whole surface with no stable accessible
identity; every other one of the 112 mapped controls resolved `[semantic]`. Source: `<TabsList>` at
`preset-editor-surface.tsx:392` carries no `aria-label`, so the name computes from its own contents.

**Fix.** `aria-label="Preset sections"` on the `TabsList`. Receipt: `map-dom-fallbacks=0` on the editor map.

---

### \[P3-5] The active row's "Active ·" prefix pushes its timestamp into truncation

**Receipt.** `reports/snaps/kbd-radio.png` — the active row's subtitle renders `Active · roleplay ·
edite…` in a 155px cell, while every inactive row shows `roleplay · edited 43m` in full. The row you most
want to know about is the one that loses its metadata.

**Fix.** `layout`: move the active marker out of the subtitle string (the dot already carries it) or give
the active row's subtitle a second line. Receipt: shots of an active and an inactive row at the docked list
width.

---

### \[P3-6] The rack's glyph column renders 14 identical discs on a literal-heavy preset

**Receipt.** `scratchpad/17-glyphs` — the first 14 rack rows of an imported ST preset:

```
all 14: icon path "M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 " (lucide Pencil)
all 14: color oklch(0.7 0.1 232) · bg oklab(0.7 … / 0.15)   (info blue, 15% tint)
```

`assembly-model.ts:60-62`: `section.type === "literal" ? Pencil : MARKER_COPY[section.marker].glyph`. The
column *does* discriminate for marker sections (a pin for Scenario, a sparkle for Prompt — visible after
scrolling, `reports/snaps/presets-rack-mid.png`) and the badge hue does carry the setup/post zone. But an
ST-import preset is mostly literal sections, which is the common shape, and for those the column is 20
identical decorative discs claiming to be information.

**Fix.** `distill`: drop the glyph for literal rows (the zone hue can ride the row without a disc), so the
column appears only where it discriminates. Receipt: the glyph census showing >1 distinct icon among visible
rows, or no disc on literal rows.

---

### \[P3-7] (systemic — QUESTION for the orchestrator) `side-tab` + `border-accent-on-rounded` fire on the shared ListRow selection state

**Receipt.** `pnpm design-audit / --goto presets --click <preset>` (desktop and `--mobile`):

```
P3 border-accent-on-rounded  …[data-slot=list-row-root]:nth-of-type(4)  border-left: 2px + radius 6px
P3 side-tab                  …[data-slot=list-row-root]:nth-of-type(4)  border-left: 2px + radius 6px
```

The node is `packages/ui/src/primitives/list-row/variants.ts:31-32`:

```
"… rounded-control border-l-2 border-l-transparent …"
"data-selected:border-l-primary data-selected:bg-primary/10 …"
```

This is the `@orb/ui` ListRow primitive — the selection idiom for **every** list in the app. §6 lists both
rules as absolute bans, and the two named house divergences (the kicker voice, hairline+soft-shadow) do not
cover it. I found no ruling sanctioning a selected-row left accent.

**This is not a presets defect and I am not prescribing a fix here** — any change is app-wide and will land
in the middle of an 10-surface sweep. **Question:** is the selected-row left accent a ratified house idiom?
If yes, `design-audit` needs an exemption for `[data-slot=list-row-root][data-selected]` or these two P3s
will fire on 8 more rail surfaces. If no, it is a primitive-level `quieter` job.

---

### \[P3-8] (systemic — observation) Every cold load spends 86–149ms blocked and drops 2–3 frames on the boot mark

**Receipt.** Present in the console of **every** clean run in this pass (7 runs, 11:34–11:49):

```
[frame] long frame 136–199ms · blocking 86–149ms (budget 100ms) · @ main.tsx · route /
[drop]  52–101ms rendered frame mid-animation (budget 50ms) · svg[aria-label=Orbweaver] · [data-slot=weave-veil] · OVER BUDGET
[drop]  93–101ms rendered frame mid-animation (budget 50ms) · svg[aria-label=Orbweaver] · OVER BUDGET
```

The app's own instrumentation calls both over budget — blocking exceeds its 100ms budget on most loads and
the splash-mark animation drops frames at up to 2× its 50ms budget. This is **shell boot**, not presets:
the attribution is `main.tsx` and the `Orbweaver` splash svg. Filed as an observation so the sweep has it on
record; route to the shell.

Presets' own contribution is clean by comparison: `[perf] slow commit region:content 21ms (mount)` on a
12ms threshold — modest, once, at mount.

---

## ARIA-navigability recommendations

Concrete, element-by-element:

1. **`<TabsList>` at `preset-editor-surface.tsx:392`** → add `aria-label="Preset sections"`. Currently the
   tablist's name computes to `"ParamsPromptActionsDataTransforms"` and it is the surface's only
   DOM-fallback selector.
2. **The preset-list radiogroup** → decouple focus from selection (arrow moves, `Space` commits) and add an
   `aria-live="polite"` announcement of the new active preset. Today a persisted global change happens with
   zero AT feedback. (P1-1.)
3. **The landing empty state** (`[data-slot=empty-state-title]`) → render the 24px/600 title as a heading.
   `main "Presets content"` currently contains **no heading at all** in the landing state; heading
   navigation dead-ends there. The editor state is already correct (`h2`).
4. **Mobile bottom nav** → do not carry `aria-current="page"` on a 0×0 node while no visible tab carries it
   (P2-9). Either surface the current section or move the marker to a rendered element.
5. **`[data-slot=collapsible-trigger]` ("Advanced")** → 16px tall, no touch target; grow the row box to
   ≥44px (P2-4). Nothing wrong with its role or name — this is target size only.
6. **Regex rows** → the switch's accessible name (`Attach {name}`) is correct, but the row's visible `off`
   token has no programmatic subject. Give the disabled-in-library state a labelled badge rather than a bare
   word (P2-2).

**What is already right and should not be touched:** every one of the 112 mapped controls in the editor has
an accessible name; the rack ships a `button "Skip the section list"` skip link; the token column is
`aria-hidden` with an `sr-only` spoken sentence beside it (`~30` would otherwise announce as "tilde three
zero" — `section-row.tsx:150-153`); row subtitles are bound by `aria-describedby`, not folded into the name;
the delete confirm is a true `alertdialog`; the "No scripts match that filter" message is
`role="status" aria-live="polite"`. This is a surface where someone has clearly done the a11y work.

---

## Taste & flow verdict (blunt)

**Does it look like shit? No — this is one of the better-looking surfaces in the app.** The editor reads
like a well-set instrument panel: three columns of consistent rhythm (label · control · value · reset),
kicker sections with hairline rules doing real grouping work, one amber accent rationed onto state and
nothing else. The Actions tab in particular is genuinely handsome — a lead sentence, a filter, a warning
chip that *links to its own fix*, and a right-hand readout showing the resolved template with the macro
highlighted. Somebody thought about this.

**Where the eye complains, specifically:**

- **The landing is a hole.** 219px of content in a 752px pane, top-anchored, centered at a 42ish-character
  measure. It doesn't look designed, it looks unfinished — you read three lines and then stare at 500px of
  black. It's the first thing anyone sees on this section.
- **The Prompt tab is doubled.** The rack on the left and the readout on the right are the same list, in the
  same order, with the same numbers. Your eye keeps trying to correlate them and can't, because the rack
  scrolls (4237px of it) and the readout doesn't. Then you notice \~85% of the readout's bars are empty
  track, and the doubling bought you nothing.
- **The new-preset state reads as "everything is zero."** Eight sliders parked hard left. It is factually
  "everything inherits", but nothing on the track says so, and the track is what you see first.
- **Wide pane states look like two layouts stacked.** With the panels hidden, the title and the tab strip
  hang 88px outside the content beneath them. It's not subtle once you see the tab rule not lining up with
  the section rules.
- **One truncated select value** (`Content — always p…`) in a row with 240px of empty space beside it. That
  one just looks careless.

**Does it flow weird?** Mostly no — and the IA is correct against §14: finding in LIST, doing in CONTENT,
artifact readout in CONTEXT, with the readout re-titling itself per tab (`Params readout` → `Prompt readout`
→ `Actions readout`), which is a nice touch. The create flow is excellent: `New` makes a preset instantly
with no naming modal and drops you in the editor.

**But it flows weird in three places:**

1. **You can't rename the thing you just made from where you're standing.** `New` gives you a preset called
   "New preset", opens the editor, and the h2 title is inert (`contentEditable: false`, `cursor: auto`, no
   role, not inside a button — `scratchpad/34-kebab`). Rename lives in the *other pane's* row kebab. A
   control far from where its effect shows, §13, on the very first thing a new user does.
2. **Three doors to Activate** (P2-6), two of them on the same row.
3. **The one action with global blast radius is the one with no ceremony** (P1-1) while Delete gets a full
   alertdialog. The grammar is inverted relative to consequence.

**Is it intuitive cold?** Yes for the list and the Params tab — the 5-second test passes; the landing copy
tells you exactly what a preset is *and* what it isn't ("it doesn't pick the model (that's Connections)"),
which is the single best sentence I read today. **No for the Prompt tab** — 20 rows named `┌ <scenario>` /
`| Scenario` / `└ </scenario>` with identical discs, a token column, a switch and a chevron, and no heading
saying what the list is. And no for "the deck", which sends you to a place that doesn't exist.

**Concepts with more than one home:** Activate (three) — flagged. Everything else single-homes correctly,
and the code shows the team enforcing it deliberately (`preset-editor-surface.tsx:362-365` records the owner
killing an Export echo for exactly this reason).

---

## Retractions — findings I formed and then killed

1. **"Each rack row has two doors to the same artifact (a pencil and a chevron)."** Wrong. The left glyph is
   a non-interactive `Badge` in `ListRow`'s `leading` slot; the map shows exactly four interactive nodes per
   row (Reorder / row-select / switch / `Edit {name}`), and the single drill door is the chevron
   (`section-row.tsx:174`). Killed by the map + source.
2. **"Under `--theme Light` the rail and list pane stay dark while only CONTENT and CONTEXT go light."**
   Flatly wrong, and I would have shipped it off a screenshot. Computed styles: rail
   `oklch(0.955 0.006 72)`, list pane `oklab(0.955 0.0018 0.0057 / 0.7)`, text `oklch(0.3 0.01 60)`,
   `--color-background: oklch(0.98 0.004 75)`. Decoded framebuffer of the same PNG: rail RGB(243,239,236),
   list (246,242,239), context (246,242,239), topbar (250,248,245). The whole shell is light and all three
   contrast reads PASS (14.82 / 7.01 / 4.99). **§11's "your eye is not a colorimeter" law, paid in full by
   me this pass.** Every polarity claim in this report rests on a decoded pixel or a computed value.
3. **"The icon-only Reset button is a destructive action with no confirm."** Killed:
   `preset-editor-surface.tsx:374` — `onClick={() => setResetOpen(true)}` opens a confirm. The header's icon
   door is also documented as deliberate (a kebab holding one item was removed by a prior side-eye finding,
   F-18).
4. **design-audit's 4× `P1 tap-target 22×22`.** Not forwarded. The node is the Base UI Slider's native
   `input[type=range]` inside a 256×32 track, and every slider has a larger numeric field beside it (WCAG
   2.5.8 equivalent-control exception). Only the narrower mobile edge-flush geometry survives, as P2-8.
5. **Lighthouse's one failing audit, `label-content-name-mismatch` on the preset rows.** Not forwarded. The
   row's `aria-label` *is* its visible title; the extra visible text is the subtitle, correctly bound by
   `aria-describedby="_r_4e_-subtitle"` (visible in the axe snippet itself). WCAG 2.5.3's intent — a
   voice-control user can say the visible label — is satisfied. **Systemic note:** this is the only thing
   between this surface and a perfect axe sheet, and it will fire on every list surface in the sweep; worth
   an axe exclusion decision at the sweep level.
6. **My own `elementFromPoint` ±offset probe of the "Advanced" trigger** reported `OWNS` at ±14px, which I
   briefly read as a hidden expanded hit area. My predicate included `e.contains(t)`, true for any ancestor
   — the probe was invalid. Retracted. The standing receipt for P2-4 is the 16px box plus
   `getComputedStyle(t,"::after").content === "none"`.

**Environmental, not findings:** the `SyntaxError: … does not provide an export named 'anchorToEnd'` error
boundary seen 11:50–11:58 was a stale vite transform graph on the shared dev server (the symbol exists
nowhere in the source tree — `rg` across `packages/ui/src` and `packages/client/src`, 0 hits; the served
module was correct, a cached importer was not). Not a product defect; all affected checks were re-taken.
Likewise the `504 Outdated Optimize Dep` + 6 dep-optimizer aborts on the `--dirty` stage were cold-boot
bundling, which snap itself labels "NOT a failure".

---

## What is genuinely working (don't touch)

1. **The copy.** "A preset shapes generation; it doesn't pick the model (that's Connections)" teaches the
   one-home law in one sentence. The import dialog states replace-vs-create semantics *before* you choose a
   file. "Nothing uses this preset yet — activate it, or point a game's GM voice at it" is an empty state
   that tells you two ways forward. The delete confirm names the artifact and says it can't be undone.
2. **The a11y craft in the rack.** A "Skip the section list" link; the compressed token glyph `aria-hidden`
   with an `sr-only` sentence beside it because "\~30" announces as "tilde three zero"; drill-in focus
   restore onto a remounted chevron; subtitles as `aria-describedby` rather than folded into names. That is
   not checkbox accessibility, that is someone imagining the walk.
3. **The measured layers held under attack.** 8/8 matrix variants clean (`variants=8 failed=0`);
   `--expect-no-overflow` PASS at every pane state and both pointers, judged on all four sides; 9/9 contrast
   probes PASS (7.75 / 8.66 / 8.66 / 8.66 / 17.57 / 14.82 / 7.01 / 6.55 / 17.14 across dark and light);
   `motion-audit verdict=PASS` with CLS 0, 0 LoAF, 0 dirty animations; `perf-meter` worst click 48ms cold /
   16ms warm, 0 long tasks; `design-audit` on the landing state **0 findings** with a 246-element census.
   The `maximal` appearance arm kept every ornament on chrome — no reading surface picked up art.

---

## The single biggest opportunity

**Make the consequence of an action match its ceremony.** Right now this surface confirms the cheap,
reversible thing (Delete — recreate it in five seconds) with a modal alertdialog, and commits the expensive,
invisible thing (Activate — every future generation on the account) on a keystroke with no confirm, no
undo, and no announcement. Fixing P1-1 is a small change to one radiogroup, but the principle behind it
also resolves P2-6 (three Activate doors, none of which look load-bearing) and closes the gap in
heuristic 3, where this surface scores lowest. One idea, three findings.

---

## Instrument coverage

| # | Instrument | Status |
| - | - | - |
| 1 | `snap --map` | **RAN** — landing (33 elements, 0 DOM fallbacks) + editor (112, 1 fallback → P3-4) + Prompt rack (332, 2) · `scratchpad/01-map`, `04-editor`, `16-prompt-map` |
| 1 | `snap --aria` (+ `--include-hidden`) | **RAN** — full tree, hidden radios/actions revealed · `scratchpad/03-aria-hidden`; scoped trees for the search-empty, import, kebab and delete states |
| 1 | `snap --contrast` | **RAN** — 9 probes dark + 3 light, **all PASS**, none `INDETERMINATE`/`UNRESOLVED` · `scratchpad/07-contrast2`, `26-lightprobe` |
| 1 | `snap --matrix` | **RAN** — 8 variants (desktop/mobile × light/dark × motion/reduced), `variants=8 failed=0`, no-overflow PASS in every arm · `scratchpad/50-matrix` |
| 1 | `snap --expect-no-overflow` | **RAN** — PASS at 5 states, `judged=left+top+right+bottom escapes=0` each |
| 1 | `snap --json` manifests | **SKIPPED** — terminal console was never capped (max 44 messages/run vs the 200 cap); nothing to recover |
| 2 | `design-audit <route>` | **RAN** — landing: **0 findings** (census 246). Editor: 8 findings (4 P1 tap-target → retracted; 1 P2 undersized-ui-text → P2-4; 2 P3 side-tab/border-accent → P3-7; 1 P3 flat-type-hierarchy) · `scratchpad/02-da-desktop`, `12-da-editor` |
| 2 | `design-audit --mobile` | **RAN** — `pointer=coarse`, census 439, 5 findings, same classes · `scratchpad/13-da-editor-mobile` |
| 3 | `motion-audit` | **RAN** — `verdict=PASS`, CLS raw/virtualized/non-virtualized all 0, 0 LoAF, 0 dirty animations, 0% dropped · `scratchpad/44-motion`. *Arm caveat:* the account has `data-reduced-motion=true`, so this measures the reduced row; the `--full-motion` arm was covered by the matrix's 4 motion variants (all clean) rather than a second motion-audit |
| 4 | `perf-meter --click <primary action>` | **RAN** — 3 cycles of open-a-preset: worst click 48ms (cold) then 16/16ms, input delay 1–2ms, 0 long tasks, 0 rAF gaps, worst shift 0.0112 on the section switch · `scratchpad/45-perf` |
| 5 | Lighthouse desktop (MCP, snapshot) | **RAN** — a11y **100**, best-practices **100**, SEO 100, agentic 100; 1 failed audit (`label-content-name-mismatch`) triaged and retracted · `reports/lighthouse-presets/` |
| 5 | Lighthouse mobile (MCP, snapshot) | **RAN** — same four 100s, same single audit; `target-size` **passed** — note the snapshot was taken on the LIST state (context collapsed, no editor), so it does not speak for the Advanced trigger or the sliders · `reports/lighthouse-presets-mobile/` |
| 6 | `__orb` suite via `--eval` | **RAN** — `.renders()` (content 16 renders / max 132ms mount; list 5; context 7 — no churn), `.queries()` (17 cached, **0 errored**, 2 inapplicable-pending), `.shell()`, buffered `layout-shift` replay (total **0.0121**, worst 0.0112 on `DIV.shell-panel-body`) · `scratchpad/46-orb` |
| 7 | Console triage table | **RAN** — see below |
| 8 | PNGs actually looked at | **RAN** — 13 read: landing, editor, 5 tabs, list-collapsed, both-hidden, mobile list, mobile editor, maximal, Light, keyboard-radio, rack-scrolled, search-empty, new-preset |
| 9 | Keyboard walk (`--key Tab` chain + focus evals) | **RAN** — 11 stops through search → rows → radios → kebabs, `fv=true` at every stop; arrow-key walk inside the radiogroup produced **P1-1** · `scratchpad/10-kbd`, `11-radio` |
| 10 | Appearance-preset arms | **RAN** `defaults` (bare — the account's real state, probed not assumed) · **RAN** `maximal` + `--full-motion` (handles verified on the root: `texture=grain`, `shadow`, `theme-colorization`, `elevation=glow`, `reduced-motion=false`, blur 22px) · **SKIPPED** `compact`/`reading`/`diagnostics` — the findings here are width- and state-dependent, not density- or typography-dependent, and the pane-state + matrix arms cover the width range; call this out if the sweep wants density coverage on a settings-class surface |
| 10 | Theme arms | **RAN** `--theme Light` on this non-carried surface (computed + pixel-decoded, all contrast PASS) · **SKIPPED** `--theme none` — the account carries no `data-theme` at all, so the bare arm *is* the fresh-account state |
| 11 | Pane-state arms | **RAN** all four: both docked (568px content) · list collapsed (896px) · context hidden (\~952px) · both hidden (**1224px** — the arm that produced P2-1) · plus `--mobile` for the list and the editor. This is the arm that caught the width-dependent header misalignment a single-state pass would have passed |
| — | `--isolated` / `--dirty` stage | **RAN** (`--dirty`, `:5273`) as a fallback during the 11:50–11:58 live wedge; corpus verified identical by aria before use; findings re-taken on live after the restart |

### Console triage

Every distinct message class across 7 clean runs. **Zero console errors and zero page errors on every
healthy run** (`console-errors=0 page-errors=0 failed-req=0` on all of them).

| Message | Disposition |
| - | - |
| `[frame] long frame 136–199ms · blocking 86–149ms (budget 100ms) · @ main.tsx` | **INVESTIGATE — shell-owned, filed as P3-8.** Attribution is `main.tsx`, present on every cold load of any section |
| `[drop] 52–101ms rendered frame mid-animation · svg[aria-label=Orbweaver] · [data-slot=weave-veil]` | **INVESTIGATE — shell-owned, filed as P3-8.** The boot splash mark, up to 2× its 50ms budget, 2–3× per load |
| `[perf] slow commit region:content 18–21ms (mount)` | **Presets-owned, accepted.** One 21ms mount commit against a 12ms threshold; `__orb.renders()` shows no churn behind it (16 renders total across a whole nav+click+tab sequence) |
| `[cls] shift 0.0066 unexpected · [role=region] moved 0,-24 · [data-slot=separator] moved 180,350 · CLS 0.0072` | **Accepted.** Boot settle, 14× under the 0.1 budget; buffered replay agrees (0.0121 total). Not virtualizer-excluded — genuinely small |
| `[cls] shift 0.0078 input-adjacent (excluded from CLS) · empty-state-* moved 136px,0` | **Correct instrument behaviour.** The empty state re-centering when the list panel collapses, properly classified as input-adjacent |
| `[reflow] forced synchronous style/layout 17–72ms` | **Stage-only.** Appeared solely on the cold `--dirty` stage boot (first-ever transform + dep-optimize), never on the live stack. Environmental |
| `504 Outdated Optimize Dep` + 6 `net::ERR_ABORTED` on `.vite/deps/*` | **Environmental.** Cold-stage dep re-bundle; snap itself labels these "NOT a failure — re-requested and served" |
| `SyntaxError: … no export named 'anchorToEnd'` (11:50–11:58 only) | **Environmental — stale vite module graph on the shared dev server.** The symbol exists nowhere in the source tree (0 `rg` hits across `packages/ui/src` + `packages/client/src`); the served module was correct. Confirmed by the orchestrator; stack restarted; all affected checks re-taken. **Not a product finding** |
| `[trpc]` query/mutation traffic | Informational. Used as a receipt for P1-1 (the two `settings.updateUserSettingsSection` writes) |
| `❗2 ⚠0` badge (bottom-right) | **The vite-plugin-checker dev overlay**, not the product. Not counted, not filed (§11's dev-server trap) |
