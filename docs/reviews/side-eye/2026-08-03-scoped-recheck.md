# side-eye SCOPED RE-CHECK — FX fix-round · macro pill · home reservation · NEW regex surfaces

**Target:** main @ `0c4c3243` · **Stage:** `pnpm snap --isolated` (frozen worktree `0c4c3243bda0` → :5273/:8888).
Dev :5173 never driven except one accidental `design-audit` page load (read-only, no mutation — noted, not repeated).
**Mode:** FOCUSED, four ranked targets. No Nielsen table (per scope discipline); per-target verdicts below.

## VERDICT: SHIP WITH FIXES

No P0. The FX fix-round largely HELD — 22 of the 24 findings I could re-drive are genuinely fixed, several
excellently (the drill→readout binding, the macro-list ARIA, the roving radiogroup, the Actions row rewrite).
The macro pill is verified good in situ. The home reservation works but ships two visible loading artifacts.

The problem is target 4: **the NEW regex surfaces landed after the fix-round and re-broke two things the
fix-round had just fixed** (the Transforms heading grammar, F-8; and a three-way single-homing violation on
the character facet). Plus a destructive action with no confirm, two switches that can contradict each other,
two different controls with the identical label in one dialog, and a keyboard-focusable code editor with no
focus ring. Regex is a first-pass surface and reads like one.

---

## Per-target verdicts (rank order)

| # | Target | Verdict |
|---|---|---|
| 1 | FX's 31 findings + blast radius | **HOLDS.** 22 re-verified fixed. F-13 not fixed. F-8 **REGRESSED** via the regex lane. One NEW regression from the fix itself (macro chips are `user-select:none` → the preview no longer copies). |
| 2 | Quieted macro pill in situ | **PASS**, on every axis the brief named. Receipts below. |
| 3 | Home-tile reservation | **WORKS, needs row-pitch polish** — not acceptable-honest. Fix shape named (R-1). |
| 4 | NEW regex surfaces | **DO NOT SHIP AS-IS.** 4×P1, 5×P2. Full list below. |

---

## Target 1 — FX re-check

### Verified fixed (rendered receipts)

- **F-1 assembled preview prints braces.** `{{char}} … {{user}} … {{description}} … {{persona}} …
  {{guided_instruction}}` — every token braced, chipped, distinguishable from prose. (`--eval` on the readout's
  `innerText` tail, this run.)
- **F-2 drill→readout binding.** Drilling `Edit Impersonate` now yields `RESOLVED — IMPERSONATE`.
  (`reports/snaps/recheck-drill-impersonate.png` + innerText.)
- **F-3 template editor role.** `textbox "Template"` with the template as VALUE, announced once — no longer a
  `combobox` named by its own 60-word content. (`--aria '[role=tabpanel]'`.)
- **F-4 radio column.** Both radios at `x=232`, `34×34`. Was 232 vs 312. (geometry `--eval`.)
- **F-5 roving tabindex.** checked radio `tabIndex 0`, unchecked `-1`, group `-1`. (`--eval`.)
- **F-6 macro chip line rhythm.** See target 2.
- **F-7 Actions preview column.** GONE. Rows are name · description · kind · source · chevron.
  (`reports/snaps/recheck-actions.png`.) *Partial* — see P2-3.
- **F-17 orphan macro chips.** Now `heading "Macros this template can use" [level=3]` + `list`/`listitem`.
  Excellent fix.
- **F-19 / F-20** one info-button vocabulary (`More info about X` everywhere); steppers named
  `Decrease Managed threshold` / `Increase Verbatim tail`. (`--map`.)
- **F-25** no-selection readout header now reads **"Active preset readout"**, matching its body.
  (`reports/snaps/recheck-presets.png`.)
- **F-28** narrow-arm landing copy reworded ("use Show list panel in the top bar if the list isn't open").

### Not fixed / regressed

**[P1] R-4 · F-8 REGRESSED — "Regex" is a 16px white heading among four 10.5px kickers on Transforms.**
Measured `h3` census on the Transforms deck:
```
Delivery                 | 10.5px | 600 | uppercase | oklch(0.74 0.008 65)
Collapsing               | 10.5px | 600 | uppercase | oklch(0.74 0.008 65)
Regex                    |   16px | 500 | none      | oklch(0.955 0.004 75)   ← the outlier
Post-processing          | 10.5px | 600 | uppercase | oklch(0.74 0.008 65)
Inline reasoning parsing | 10.5px | 600 | uppercase | oklch(0.74 0.008 65)
```
This is verbatim the defect F-8 named ("Transforms: the same kickers PLUS 'Regex' as a large sentence-case
bright heading") and that fix-all closed by moving `EntryListEditor` to `<Section kicker={heading}>`. The
regex lane (`12cf0a8a`) rebuilt this group through a NEW component that did not get the memo.
*Root cause, source-pinned:* `packages/client/src/components/regex-script-picker.tsx` → `PickerBody` renders
`<Section heading={heading}>`. `regex-tab.tsx` passes `heading="Regex"`.
*Fix:* `<Section kicker={heading}>` — same ruling, same reasoning as the `EntryListEditor` header comment
("it is not a per-call-site knob, because a knob is how the divergence happened").
*Receipt:* `reports/snaps/recheck-transforms.png` + the census above.

**[P1] R-5 · The macro chip is `user-select: none` — the assembled preview no longer copies.**
Selecting the RESOLVED block and reading the selection returns:
`"[Take the following into special consideration for your next message: ]"`
The `{{input}}` is **gone from the copied text.** Computed: `user-select: none` / `-webkit-user-select: none`
on the chip span (inherited from `Badge`'s `select-none`).
*Why it hurts:* the preview's stated job is "the string the model receives / the string you'd search for"
(macro-text.tsx's own header). A user who copies it to paste into a bug report, a diff, or another template
gets prose with holes in it and no indication anything was dropped. This is a NEW defect introduced by the
F-1/F-6 fix — chipping via `Badge` inherited `select-none`, which is right for a status pill and wrong for
a token inside quoted wire text.
*Fix:* `select-text` on the `size="inline"` Badge arm (or drop `select-none` from that arm in
`packages/ui/src/primitives/badge/variants.ts`).
*Receipt:* `--eval` Range/Selection read over the readout block, this run.

**[P2] R-6 · F-13 NOT FIXED — "Show assembled preview" still expands entirely below the fold.**
Button at `y=778` in an 800px viewport. After clicking: label flips to "Hide assembled preview",
readout scroller `scrollTop: 0`, `scrollHeight 1687` vs `clientHeight 752`. ~935px of preview rendered with
zero scroll-into-view. The only feedback is a label change (Nielsen #1).
*Fix:* `scrollIntoView({block:"nearest"})` on the disclosure content when it opens.
*Receipt:* `reports/snaps/recheck-assembled2.png` + the scroller eval.

**[P2] R-7 · F-7 only half-fixed — descriptions still truncate on 5 of 12 Actions rows, and the column is ragged.**
The 152px preview column is gone, but the freed width did not go to the description. Measured overflow:
```
x=499 cw=206 sw=270  "You rewrite an existing greeting in the …"
x=487 cw=218 sw=260  "You generate a fresh greeting in the cha…"
x=505 cw=197 sw=302  "Marks where the conversation starts, at …"
x=520 cw=184 sw=345  "An Impersonate fired with no steering te…"
x=497 cw=206 sw=345  "A Response fired on an assistant tail — …"
```
Five different left edges (487…520) down one column, and the description — the only column that
discriminates — is clipped at ~200px on the five longest.
*Fix:* a shared name-column width across all rows on the deck, so the description column has one left edge
and one width; drop the redundant `Default` source chip on rows where source == default to buy the space.
*Receipt:* the overflow eval + `reports/snaps/recheck-actions.png`.

**[P2] R-8 · "More info about X" buttons are 12×12 px, including under coarse-pointer emulation.**
Measured `--mobile` (iPhone 14 Pro Max, `pointer: coarse`, DPR 3): `More info about Speaker names` → `12×12`.
~15 of them across the Params/Transforms decks. This is a genuinely visible, keyboard-reachable target at
1/13 the area of the 44×44 floor, and it is the ONLY way to reach each knob's explanation.
*Correction to the previous report:* F-22 concluded "the only genuine sub-44 target found; every other control
measured 48×48 at coarse". That was wrong — it sampled list rows, not the info buttons. **Retracted.**
*Fix:* a 44×44 hit area (padding/`::before` expansion) around the 12px glyph; the glyph stays 12px.
*Receipt:* `--mobile` geometry eval, this run.

**[P3] R-9 · The drilled-in editor's subject is still `paragraph: Impersonate`, not a heading.** Carried over
from the last report's ARIA table; not taken. A SR user cannot jump to the artifact being edited.

**Blast-radius sweep — clean.** `Badge` `size="inline"` composes correctly (`display:inline`, radius resolved
to `rounded-inset` 4px, `border-width 0`); `Card` nesting produced no real card-in-card (design-audit's 23
`nested-card` P3s on home are **FALSE POSITIVES** — the flagged rows compute
`border-width: 0px 0px 0px 2px`, `background: rgba(0,0,0,0)`, i.e. a left rule, not a card);
`EntryListEditor` renders identically in its four consumers; `LibraryRow` unchanged in behaviour.

---

## Target 2 — the quieted macro pill in situ · **PASS**

Driven on the Actions view, template body with `{{macros}}` (`reports/snaps/recheck-drill-impersonate.png`).
Computed on the live chip:

| Axis the brief named | Measured | Verdict |
|---|---|---|
| quiet soft fill | `background: oklab(0.7 -0.0616 -0.0788 / 0.15)` (15% tint) | ✅ |
| info-hue text | `color: oklch(0.7 0.1 232)` | ✅ |
| mono | `"Geist Mono", ui-monospace, …` | ✅ |
| no border box | `border-width: 0px`; `border-radius: 4px` (was `9999px`) | ✅ |
| punctuation gap closed | `padding: 0px`; `display: inline` (was `inline-flex` + `6px 8px`) | ✅ |
| line rhythm | chip `line-height 20.15px` == parent `20.15px`; box `15px` inside a `20.15px` line (was a 28.25px box in a 20.15px line) | ✅ |
| contrast | **5.74:1** PASS (need 4.5, `--contrast-pixel`) | ✅ |

Rendered: `{{user}}'s`, `(not {{char}})`, `{{person}}-person` all sit flush — no detached punctuation, no
line-box shove. The paragraph reads as a paragraph with tokens in it, which is exactly the ruling.

**One taste note (P3):** in the SAME drill, ~360px below, the "MACROS THIS TEMPLATE CAN USE" list renders
`{{input}}` `{{person}}` as **outlined neutral pill chips** — pill radius, visible border, no info hue. Two
visual vocabularies for one noun on one screen. Give the list chips the info hue (keep the outline if the
"item in a list" distinction matters).

---

## Target 3 — home-tile reservation · **needs row-pitch polish**

**The mechanism works.** `orb:home-tile-box` persists `{home.jump: 320.125, chat.recents: 349,
chat.quickPicks: 349, chat.tempChat: 110.890625}`; the fallback reserves it with an exact `blockSize` +
`overflow: clip`; tiles below do not move. Measured CLS on a warm boot at 1280×800: **0.1078**
(`worstShift 0.1078` — one shift carries all of it), down from the 0.24 the last report measured. Still
marginally over the 0.1 budget, so the reservation reduced the boot shift rather than eliminating it.

**The flagged rider is real and it is NOT acceptable-honest.** Measured the skeleton's natural geometry live
by mounting the same markup in-page: **3 × `h-control-lg` rows = 160px total, 40px per row, 48px pitch.**

- `chat.recents` reserves **349px** and paints a **160px** skeleton → **189px of blank reserved space** under
  three lonely bars for the duration of the read. That reads as a half-broken tile, not a loading one — and
  189px is the exact number the commit message cites as the shift it removed. The shift became blank space.
- `chat.tempChat` reserves **110.89px** against that 160px skeleton with `overflow: clip` → row 3 starts at
  y=108 and is cut at 110.89: **a 2.9px orphan stripe** of a third bar. A hairline stub is worse than no
  third bar.

**Fix shape (R-1, P2):** derive the skeleton's row COUNT from the reserved box instead of hard-coding 3, so
the skeleton fills the box exactly and `overflow: clip` stops being load-bearing. In
`packages/client/src/features/home/components/home-tile.tsx`:
```
const rows = reserved === null ? TILE_SKELETON_ROWS : Math.max(1, Math.round((reserved - 24) / 48));
```
(24 = `p-block` top+bottom, 48 = row 40 + `gap-row` 8 — both measured this run.) `chat.recents` then paints
~7 bars filling 349px; `chat.tempChat` paints 2 filling 111px; neither blanks nor clips.

---

## Target 4 — NEW: the regex library surfaces · **DO NOT SHIP AS-IS**

Driven: Settings → Regex (empty + populated), the editor dialog (mouse + full keyboard walk), the preset
Transforms picker + readout, the character regex facet, the chat host display-scripts control.

### P1

**[P1] X-1 · "Display only" is TWO DIFFERENT CONTROLS with the IDENTICAL LABEL, 320px apart in one dialog.**
- a `Runs on` chip → the `DISPLAY` **placement** (`regex-placement-labels.ts`: `["DISPLAY"]: "Display only"`)
- an Options switch → the `markdownOnly` **flag** ("Only affects what's shown, never the prompt.")

Both visible simultaneously in `reports/snaps/recheck-kbd-findpattern.png`. A user toggling "Display only"
cannot know which one they touched, and the two interact. Worse, the chip is a category error inside its own
group: `Runs on — "Which text streams this script applies to"` lists four text streams (your message · model
output · world info · reasoning channel) and then one render tier.
*Fix:* rename the placement chip to name the STREAM it operates on (`Rendered transcript`), or drop it from
`Runs on` entirely and let the `markdownOnly` switch be the single home for the display tier.

**[P1] X-2 · "Display only" and "Prompt only" can both be ON at once, and their own descriptions contradict.**
Live: clicked both → `Display only: aria-checked=true`, `Prompt only: aria-checked=true`, no warning, no
resolution shown. Their helper lines are literal complements ("never the prompt" / "never the display"), so
the user is told the script both does and does not touch the prompt. Nothing on screen says which wins.
*Fix:* one 3-arm choice — `Both` / `Display only` / `Prompt only` — not two booleans that can contradict.
Nielsen #5 (error prevention).
*Receipt:* `--eval` switch census after clicking both, this run.

**[P1] X-3 · `Remove` deletes a library script instantly — no confirm, no undo, no destructive styling.**
Clicked `Remove`: `[role=alertdialog]` count `0`, no toast with an undo. Source confirms
(`regex-settings-surface.tsx` `onRemove` → `remove.mutateAsync` with no `ConfirmDialog`), and the button is a
plain `intent="ghost"` reading "Remove" in body-weight text next to the row it kills.
*Why it hurts:* a regex script is authored content that may be attached to N presets/characters/rooms; the
delete silently detaches it everywhere. §5 + Nielsen #5. The app already owns `ConfirmDialog`.
*Fix:* confirm (naming the script and its attachment count), or an undo toast.

**[P1] X-4 · The `Find pattern` code editor has NO visible focus ring under a real keyboard Tab.**
Real `press_key` traversal (scripted `.focus()` cannot prove this — Chromium won't promote it to
`:focus-visible`). At the CodeMirror stop: `:focus-visible === true`, and every ancestor up to the framed
wrapper computes `outline-style: none` + `box-shadow: none`; the wrapper's border stays the rest-state
hairline `1px oklch(0.99 0.005 60 / 0.08)`. Screenshot confirms: caret in the field, **no ring**, while the
Name field one row up wears a bright amber ring when focused.
*Why it hurts:* WCAG 2.4.7. The one field on this dialog where a keyboard user MUST know they've arrived (it
swallows most keys) is the one that doesn't say so.
*Fix:* `focus-within:` ring on the `.cm-editor` wrapper, matching the `TextField` treatment.
*Receipt:* `reports/snaps/recheck-kbd-findpattern.png` + the 4-level ancestor computed-style walk.

### P2

**[P2] X-5 · The Regex settings pane is the only settings section with no pane-level heading — its whole
type census is one size and one colour.**
```
Regex pane   : h3 "Scripts"  10.5px / oklch(0.74 0.008 65)   ← the ONLY h3 on the pane
Personas pane: h3 "Personas"   16px / oklch(0.955 0.004 75)
Tags pane    : h3 "Tags"       16px / oklch(0.955 0.004 75)
Chat behavior: h3 "Chat & message handling" 16px / oklch(0.955 0.004 75)
```
Every text node on the Regex pane — heading, helper, empty state — is `10.5px` in `oklch(0.74 0.008 65)`;
only `font-weight` (600 vs 400) differs. That is a `flat-type-hierarchy` (§6 absolute ban) and it makes the
pane read unlabeled next to its siblings. Root cause: the pane's only content is an `EntryListEditor`, which
(correctly, per the F-8 fix) renders its group name as a kicker — but nothing renders the SECTION title above it.
*Fix:* the settings pane frame supplies the 16px section title; `EntryListEditor`'s kicker stays the group name.
*Receipt:* per-section `h3` census across four settings categories, this run.

**[P2] X-6 · Every script is listed TWICE on the Regex pane, ~400px apart, with different controls.**
`SCRIPTS` lists 6 rows (subtitle `on · attached only` + a `Remove`); `RUNS EVERYWHERE` lists **the same 6
rows again**, name-only, each with a global switch. To make a script global you scroll past its own row to a
second copy of it. The row's own subtitle already prints the state (`attached only`) that the second list edits.
*Why it hurts:* §13 one-home-per-concept, textbook. Also the global list carries NO subtitle, so with
same-named scripts it is unusable — six rows reading "New script" over six switches.
*Fix:* the global switch belongs on the row, in the row's trailing slot. Delete `RUNS EVERYWHERE`; keep its
helper sentence as the group's helper line.
*Receipt:* `reports/snaps/recheck-regex-list.png` + `--aria '[aria-label="Regex settings"]'`.

**[P2] X-7 · The character facet renders "Regex scripts" THREE times on one screen.**
`reports/snaps/recheck-char-picker5-t2099.png`:
1. CONTEXT inspector — `Regex scripts` + "Find/replace passes over the card's text." + a dead readout
   "0 scripts attached to this character." (no action)
2. CONTENT drill header — `Regex scripts` + the SAME sentence, verbatim
3. CONTENT picker heading — `Regex scripts` + a THIRD description: "Find/replace rules that run whenever
   this character is in the room, picked from your script library."

Three headings with the same name and two different explanations of the same thing, stacked ~65px apart.
This is the ugliest IA defect in the whole run.
*Fix:* the picker inside a facet drill drops its own heading (the drill already named it); the CONTEXT
inspector either mirrors with a live count AND a jump, or renders nothing.

**[P2] X-8 · Closing the editor with Esc dumps focus on the Settings modal's Close button.**
Real keyboard walk: `Escape` → editor dialog unmounts (correct), `document.activeElement` becomes
`BUTTON "Close"` — the SETTINGS modal's close. The next Enter closes everything. Focus should return to the
row/`Add script` button that opened the editor.

**[P2] X-9 · A new script defaults to running on ALL FIVE streams.**
Fresh `Add script`: all five `Runs on` chips `aria-pressed="true"`. A find/replace with an empty pattern
is created live, enabled, and scoped to every stream in the pipeline the moment you press the button.
*Fix:* default to the two streams that cover ~all real use (`Your message`, `Model output`), or to none with
the picker refusing attachment until one is chosen. §5 smart defaults.

### P3

- **X-10** The unselected `Runs on` chip loses its box entirely (`box-shadow: none`, transparent bg, 0px
  border) and reads as plain text beside four boxed siblings — it stops looking pressable.
  `reports/snaps/recheck-runs-on2-crop.png`. Give the off state a quiet outline.
- **X-11** The focused chip and the pressed chip both signal in `oklch(0.72 0.175 52)`; focused+pressed is a
  double amber ring, focused-only is a single outer ring, pressed-only a single inset ring. Distinguishable
  (verified visually — **I retract my first read that they were indistinguishable**), but two meanings on one
  hue is a Nielsen #4 smell. Consider a neutral focus ring here.
- **X-12** `Find pattern` has no placeholder and no example. Nothing says whether to type `foo` or `/foo/gi`.
  `Replace with` gets a helper line; `Find pattern` gets none.
- **X-13** `Runs on` chips are `34px` tall (< 44). Switches are `48×32` (< 44 on the short axis). Same class
  as R-8.
- **X-14** Row subtitle `on · attached only` — "attached only" is jargon at the row, explained only in the
  helper paragraph above the list. And the picker's ON state has no marker while OFF is marked with a word
  (`off · your message · …` vs `your message · …`) — asymmetric.
- **X-15** The picker's stage subtitle is identical on every default script
  ("your message · model output · world info · reasoning channel · display only", 60 chars) — three identical
  rows in `reports/snaps/recheck-transforms.png`. It's the F-7 "discriminates nothing" disease reborn.
- **X-16** `Add script` mints a row literally named "New script" and the library fills with indistinguishable
  rows if the user closes without renaming. The list carries no `edited Xm ago` discriminator (the preset list does).
- **X-17** The character facet's picker sits on a skeleton for **~1–2s** after opening (`regex.listScripts`
  `pending fetching` at t+0, resolved by t+2099ms). Not a hang — **I retract my initial "never loads" read** —
  but the library list should be prefetched/shared, not re-fetched cold per facet open.
- **X-18** The `Regex → Scripts` nav accordion has exactly one child. So do `Personas → Personas` and
  `Tags → Tags` — this is app-wide, NOT a regex defect. Noted so it isn't re-filed.
- **X-19** Empty arms I could NOT verify rendered (library was non-empty): the picker's
  "You haven't written any regex scripts yet — add one in Settings → Regex, then attach it here." is prose
  with no link/button (§5: an empty state should carry its action), and `RUNS EVERYWHERE` disappears entirely
  at zero scripts. Source-observed only.

---

## ARIA-navigability recommendations

| Element | Problem | Exact fix |
|---|---|---|
| `.cm-editor` wrapper (Find pattern) | `:focus-visible` true, no ring painted anywhere up the tree | `focus-within:` ring on the wrapper, matching `TextField` (X-4) |
| `Runs on` chip `Display only` | duplicate accessible name with the `markdownOnly` switch in the same dialog | rename the placement chip (X-1) |
| Regex editor dialog | Esc restores focus to the SETTINGS Close button | restore to the invoking row/`Add script` (X-8) |
| `Remove` (regex row) | destructive, unconfirmed, and named only "Remove" (×6 identical on the pane) | `aria-label="Remove <script name>"` + a confirm (X-3) |
| `RUNS EVERYWHERE` switches | six identical names `New script runs in every chat` | kill the duplicate list; the row's own switch inherits the row name (X-6) |
| Character facet | three `Regex scripts` headings in one accessible tree | one heading (X-7) |
| Regex settings pane | no 16px section title; the only `h3` is a 10.5px kicker | pane frame supplies the section title (X-5) |
| `More info about X` (×15) | 12×12 hit area, coarse pointer included | 44×44 hit area around a 12px glyph (R-8) |
| Drilled-in template editor subject | `paragraph: Impersonate` | `heading level=3` (R-9, carried over, still open) |

---

## Taste & flow verdict (blunt)

**The preset surface still looks good, and it got better.** The Actions view without the preview column is a
real improvement — the rows breathe, the descriptions do the discriminating, and the readout beside them
teaches. The macro pill is the single best small change in this batch: the readout now reads like a sentence
with tokens in it instead of a field of blue lozenges, and the `{{user}}'s` gap closing is the kind of detail
that separates a designed surface from an assembled one.

**The Regex settings pane looks unbuilt.** Not "plain" — unbuilt. Three fragments of 10.5px muted text
stacked in the top 100px of a 746×575 pane, then a button, then 400px of nothing. Every other settings pane
opens with a 16px white title; this one opens with a whisper. Then when you populate it, the SAME SIX SCRIPTS
appear twice on one screen with different controls — that's not a density problem, that's an information
architecture that hasn't been designed yet. **Cold-read test: fails.** A first-timer landing here can name
neither what "attached only" means nor why the same six names appear twice.

**The editor dialog flows weird in a specific, fixable way.** Four unlabelled fields, then a group called
"Options" containing three switches, one of which repeats a chip from two groups up under the identical
label, and two of which are documented complements you're allowed to turn on together. You cannot answer
"what will this script do?" from the dialog that authors it. The dialog is also 736px tall in an 800px
viewport, offset right over the settings modal rather than centred on it, with `Done` below the fold — it
reads like a form that outgrew its box.

**The character facet is the worst flow in the run.** You click a facet called "Regex scripts", you land on a
heading called "Regex scripts", under which is a heading called "Regex scripts", while the panel to your
right says "Regex scripts" with a count you can't act on. Four labels, one concept, one screen.

**Home reads well and lands well.** Recents dominant, quick-picks and temp-chat below, the copy honest. The
only thing wrong with it is 300ms long and I've measured it above.

---

## What's genuinely working — do not touch

1. **The fix-round's ARIA work.** `heading "Macros this template can use"` + `list`/`listitem` for the drill
   chips, the roving radiogroup, `Decrease Managed threshold`, one info-button vocabulary. That's four
   separate a11y recommendations taken exactly as written, and they all measure correct live.
2. **`MacroText` and its file header.** The braces-vs-bare ruling is implemented once, documented with the
   reasoning, pinned by a CT, and consumed by both readers. Verified in situ on every axis. (Just fix the
   `select-none` inheritance.)
3. **The picker's ONE-library reshape is the right architecture** even though its UI isn't dressed yet — the
   preset Transforms readout printing `Regex · your message → off` in the same words the picker's row
   subtitle uses is the F-23 one-vocabulary rule actually working across two surfaces.
4. **The home reservation mechanism.** Measuring the settled box and replaying it is the honest answer to a
   data-dependent skeleton; the store's header explains why a static reservation would lie. Only the
   skeleton's row count needs to follow the box.

---

## The single biggest opportunity

**Give the regex library ONE home per concept and one voice, then it's done.** Every P1 and P2 on target 4 is
the same shape: a concept living in two places (the global list vs the row · the placement chip vs the flag ·
three "Regex scripts" headings on the character facet), or a group heading speaking in a voice the surrounding
deck doesn't use. The server work behind this is good and the copy is well written — the surface just hasn't
had a pass where someone asked "where does this concept live, and does it live there once?" One afternoon of
that plus the confirm dialog and the focus ring, and this stops being the weakest surface in the app.

---

## Two-track reconciliation — what my eyes got wrong

- **I read the `Runs on` chip group as "all five look selected, state is invisible."** They were all
  genuinely selected (`aria-pressed=true` ×5, a defaulting defect — X-9 — not a rendering one), and once one
  is toggled off the states ARE legibly distinct. **Retracted**; downgraded to X-10 (the off state loses its
  box) and X-11 (focus and pressed share a hue).
- **I called the character regex picker broken — "never loads."** It resolves between t+0 and t+2099ms.
  **Retracted**; refiled as X-17 (slow cold read).
- **I saw a fully blank page after clicking `Add script`** and nearly filed a P0. It was a vite dep
  re-optimization reload (`net::ERR_ABORTED …/deps/dist-DuiamLAZ.js`), not the product. Not reproducible.
  **Retracted.**
- **`--deadcss` flagged `px-1.5 py-0.5 text-sm` on the character surface.** Grepping the whole client + ui
  source for those tokens returns nothing — they belong to the TanStack Devtools shadow chrome that the same
  ARIA tree shows. **FALSE POSITIVE**, dev-only.
- **`design-audit` returned 4 P1 + 3 P2 + 23 P3 and every one of them is a false positive** (4 = Base UI's
  hidden 1×1 `span`s; 3 = TanStack devtools `z-index: 99999/100000`; 23 = `nested-card` on home rows that
  compute `border-width: 0px 0px 0px 2px` + transparent background, i.e. a left rule). Meanwhile it saw NONE
  of: the missing focus ring, the duplicate label, the contradictory switches, the unconfirmed delete, the
  triple heading, or the 189px blank skeleton. **A clean scan is a floor, not a verdict** — and this scan
  wasn't even clean, it was noisy in the wrong places.
- **What the instruments caught that my eyes forgave:** the `user-select: none` on the macro chip (R-5) — I
  looked at that preview four times and thought it was perfect before a Selection read exposed it; the
  10.5px-everything type census on the Regex pane, which I registered only as "sparse"; and the 2.9px clipped
  third skeleton bar, which no screenshot I took would ever have shown me.
