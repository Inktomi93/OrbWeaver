# side-eye RE-VERIFY — preset program + shell fixes (desktop + mobile)

**Target:** main @ `f3c0ef20` · **Stage:** `pnpm snap --isolated` (frozen worktree `f3c0ef20f9c8` → :5273/:8888).
Never touched :5173. **Mode:** FOCUSED (ranked lead list). Ledger verified against
`docs/reviews/misc/2026-08-02-preset-execution-crunch-list.md`; sanctioned deviations in
`reports/snaps/preset-mocks/INDEX.md` were NOT re-litigated.

## VERDICT: SHIP WITH FIXES

No P0. Nothing blocks a user from completing the preset flow. Three P1s are honesty/desync defects on
the surface's own flagship claim ("this readout shows what the model actually receives") — they must
land before this is called done. Everything in the lead list that was CLAIMED fixed, was fixed, with
two exceptions (O-6, and the readout desync which is new).

---

## Lead-list verdicts (rank order)

| # | Target | Verdict |
|---|---|---|
| 1 | P0 confirms — trailing slot | **PASS** structurally + rendered. One NEW geometry defect (F-4). |
| 2 | 48-64rem overlay band (Lane H) | **PASS** — both panes, presets AND chats, at 960. Fully dressed. |
| 3 | Owner's 418×634 sighting | **NOT REPRODUCED as described.** Geometry correct. Two real nearby defects found (F-15, F-16). |
| 4 | D8 Actions readout binding | **SPLIT** — bound-on-SELECT is excellent; bound-on-DRILL is broken (F-2, P1). |
| 5 | Lane G geometry | **PASS** — DELIVERY aligned both drills, Role width identical, "Every generation" reads. |
| 6 | Params (quality / typography / controls) | **PASS** — quality dropdown + real OFF arm; one white; amber switches+sliders. |
| 7 | Standing taste items | 4 rulings below. worldInfo empty CONFIRMED. |
| 8 | Mobile 418–430 | **PASS on the surface**, two shell defects (F-15, F-16). |

---

## Verified-fixed (receipts held)

**P0 item 1 — hover render loop.** Structural + rendered.
- `packages/client/src/components/row-reveal.ts:33` — `ROW_REVEAL_SWAP` is now
  `group-hover/row:invisible` (visibility, reserves the box), no `display` swap. `pointer-coarse:hidden`
  is a media state, cannot oscillate.
- `preset-library-row.tsx` no longer consumes `ROW_REVEAL_SWAP` at all — it uses `actionsReserved` +
  `RowToggleAction rest="when-on"`.
- **Rendered proof — every box identical at rest and under hover:** title `66,w160` · radio `232,w34` ·
  duplicate `272,w34` · kebab `312,w34`, both states. Only `opacity` flips 0→1. Zero layout delta ⇒ no
  hit-test boundary can slide under a stationary pointer. (`snap --hover` + geometry eval.)
- Real-mouse regression proof still owed by the owner's morning wiggle; the structural invariant is now
  the thing a CT *can* hold.

**P0 item 2 / O-1 — filled dot.** `Circle` + `pressedFill`, `text-primary`, permanently visible when
pressed. Persistent at rest AND under hover (`reports/snaps/rv-list-cluster.png`). Shape delta, not
color alone (WCAG 1.4.1). Hollow ring reveals on hover/focus-within, verified live under keyboard focus.

**Item 18 — double-highlight box GONE.** Cluster wrapper computed:
`background-color: rgba(0,0,0,0)` · `box-shadow: none` · `border-radius: 0px`. Glyphs ride the row tint.

**Item 19 — built-in collision GONE.** Lock is `leading` (inline-left of "Default"); trailing region
holds controls only. No stack, no clip.

**Item 22 arm 2 — the 48-64rem overlay band (Lane H). Fully dressed, both panes, both sections.**
At 960×800, presets LIST overlay: `.shell-scrim` `oklch(0.12 0.006 60 / 0.6)` z=39 covering `0,48→960,800`;
sheet z=40 at `56,48,272,752` (topbar→bottom, full height) carrying the 4-layer `--shadow-overlay`
(`0 0 0 1px` hairline + `0 1px 0 inset` top-highlight + `0 2px 4px` contact + `0 12px 32px` ambient);
`border-top-width: 0px` ⇒ **the orphan amber edge is gone**; `Presets content` carries `inert`.
CONTEXT overlay: same, `672,48,288,752`, both list AND content inert, `border-left` a neutral
`oklch(0.99 0.005 60 / 0.07)` hairline. Chats at 960: identical treatment. Reads as a sheet now.

**O-18 quality dropdown + real OFF arm.** Options: `Don't use quality · Fast · Balanced · Deep`.
Selecting OFF resolves end-to-end — content gloss flips to "quality off — knobs are what you set",
readout QUALITY MAPPING grows the off arm with the same copy, EFFECTIVE GENERATION effort → `none ·
model default`. A real stored arm, not a fourth enum materializing defaults. (`rv-quality-off.png`)

**Item 3 — the 720px left-pin is dead.** All five views span the pane; Quality select right edge 884
against a pane ending 896.

**Item 4 — one control-color grammar.** Reasoning switch ON: track `oklch(0.72 0.175 52)` (amber),
thumb `oklch(0.19 0.03 50)`, thumb right-aligned (left edge 35% of a 48px track, 30px thumb).
Rack switches amber-ON / gray-OFF and unambiguous (`rv-prompt.png`: Dialogue examples gray, rest amber).
Sliders amber-filled. Transforms switches match.

**Item 21 — typography.** Visible census (sr-only excluded) is ONE white family, `oklch(0.955 0.004 75)` —
the 0.955/0.96 drift is collapsed. The bounds-helper hierarchy inversion is fixed by *removal*: "Between
1 and 64000" is now `sr-only` (`clip-path: inset(50%)`, 1×1). Remaining drift is one tuple: "Saved" is
the gloss tuple plus `letter-spacing: 0.84px` (P3).

**Item 7 kind chips** — one outlined grammar, `format` no longer filled blue. **Item 9** — both `1500`
and `200000` raw. **Item 11** — readout header names the view ("Params readout", "Prompt readout",
"Actions readout"). **Item 13** — title is `16px/600`, chips are right. **Item 16** — Guided instruction
carries "⚡ steered turns", Main carries "custom".

**Owner list:** O-3 Import `title="Import a preset"` ✓ · O-4 "Default — Managed" ✓ ·
O-5 all three sites read "compaction marker" (`params-limits.tsx:199,222,247`); "memory marker" survives
only in a comment explaining the rename ✓ · O-8 "Inject at depth" is enabled + editable ✓ ·
O-9 zone options are `Relative — ordered among the prompts` / `In Chat — at a depth in the conversation`,
depth+order render only under In Chat ✓ · O-10 both drills say "Role" ✓ · O-11 triggers read
"Every generation / Nothing selected — this section fires on every generation" ✓ · O-12 OVERRIDES block
present in the section drill ("Block the character card's override" / "Block the room's override") ✓ ·
O-13 "Delivers via Guided instruction" now jumps to Prompt, selects that rack row AND highlights the
matching readout row ✓ · O-16 header kebab holds only "Reset to starter arrangement" — Export is
single-homed in the list-row kebab ✓ · O-17 Delivery + Collapsing live in Transforms ✓ ·
O-19 presets opens list+context docked ✓ · item-20 rider: `__orb.shell()` exposes `focus` ✓.

**`design-audit` on the presets surface: 0 P0 / 0 P1 / 3 P2**, all three TanStack devtools z-index
(`#tanstack_devtools` 99999, `[data-testid=tsd-resize-handle]` 100000) — dev-only third-party chrome,
FALSE POSITIVES for the product. Report: `reports/design-audit/rv-presets.json`.

---

## Findings

### P1

**F-1 · The assembled preview strips macro braces and prints the bare macro name — the preview LIES.**
The Prompt readout's "Show assembled preview" renders:
`You are char in an immersive, ongoing roleplay with user. Stay in character; write char's perspective only.`
The actual body (Main drill textarea) is `You are {{char}} in an immersive, ongoing roleplay with
{{user}}. Stay in character; write {{char}}'s perspective only.` Every section body is likewise
substituted with a bare lowercase token: DESCRIPTION→`description`, PERSONALITY→`personality`,
SCENARIO→`scenario`, USER PERSONA→`persona`, GUIDED INSTRUCTION→`guided_instruction`.
*Why it hurts:* the preview's entire job is "what the model receives". Bare `char` is indistinguishable
from prose — a user reads broken English and cannot tell a placeholder from a word. `guided_instruction`
additionally leaks a snake_case internal key into user-facing copy.
*Fix (this is the braces-vs-bare ruling — see Rulings):* print `{{char}}` in the SAME braced token chip
the Actions readout already ships.
*Receipt:* readout `innerText` tail via `snap --eval`, this run.

**F-2 · Drilling into an Actions template DESYNCS the readout — it keeps showing a different template.**
Content drilled into **Impersonate**; readout header reads **"RESOLVED — RESPONSE"** and shows Response's
resolved text. Merely *selecting* the Impersonate row binds correctly ("RESOLVED — IMPERSONATE"); the
`Edit X` drill does not carry the selection.
*Why it hurts:* two panes on screen simultaneously describing different artifacts, with no cue which is
which. A user editing Impersonate reads a "resolved preview" of a template they aren't editing. Breaks
`UI-Architecture-and-Layout.md` §4.2.1 (CONTEXT follows CONTENT).
*Fix:* drill-in sets the same readout selection the row click sets.
*Receipt:* `reports/snaps/rv-drill-template.png` (select → IMPERSONATE) vs
`reports/snaps/rv-drill-impersonate.png` (drill → RESPONSE).

**F-3 · The template textarea is exposed as a `combobox` whose accessible name is the entire 60-word
template, announced TWICE.**
```
- combobox "Template": "[Forget all other previous instructions. … Guidance: {{input}}]
                        [Forget all other previous instructions. … Guidance: {{input}}]"
```
*Why it hurts:* Sam tabs into the field and hears a full prompt template read out twice before he can
type. Also the wrong role — a multi-line prompt editor is a `textbox` with `aria-multiline`, not a
combobox.
*Fix:* role `textbox`; move the ghost default out of `placeholder`-as-name into `aria-describedby` (or
shorten it); one announcement.
*Receipt:* `snap --aria '[role=tabpanel]'` on the Impersonate drill, this run.

### P2

**F-4 · The active-preset radios in ONE radiogroup are 80px out of column.**
`Activate New preset for generation` at `x=232`; `Activate Default for generation` at `x=312`. Both
34×34, same group. Cause: the built-in row has no `actions` so its cluster is `[radio]` alone and
right-aligns, while a fork row's is `[radio, dup, kebab]`. `actionsReserved` reserves the strip *in flow*
but not to a COMMON width across rows.
*Why it hurts:* the one-of-N state column staggers row to row — the eye can't scan "which is active"
down a straight line, and it's visible at rest.
*Fix:* reserve the trailing strip to `max(cluster)` width for every row in the list, or right-align the
state toggle and put the reveal cluster to its LEFT.
*Receipt:* geometry eval this run; visible in `reports/snaps/rv-kbd-focus-row.png` (Default's hollow ring
at x≈329 vs New preset's amber dot at x≈249).

**F-5 · The radiogroup has no roving tabindex and no arrow-key navigation.**
Both `[role=radio]` carry `tabIndex: 0`; the `radiogroup` is `tabIndex -1`. WAI-ARIA's radiogroup
pattern requires exactly one tabbable radio (the checked one) with Arrow keys moving the selection.
*Why it hurts:* with 20 presets a keyboard user takes ~80 Tab stops to cross the list, and the Arrow
keys the role promises do nothing.
*Fix:* roving tabindex (checked radio = 0, rest = -1) + Arrow/Home/End handling. (Keep `role=radio` —
F-19's one-of-N semantics are right; just honor the contract.)
*Receipt:* live chrome-devtools read of `tabIndex` per radio.

**F-6 · Macro chips break the line rhythm and detach adjacent punctuation.**
Chip computed: `display: inline-flex`, `padding: 6px 8px`, `line-height: 16.25px`, `border-radius: 9999px`,
inside a `white-space: pre-wrap` mono block whose line-height is `20.15px`. The chip's box is 28.25px tall
in a 20.15px line → line boxes shove apart wherever a macro appears; the 8px side padding renders
`(not {{char}} ).` and `{{user}} 's voice` with visible gaps before the punctuation.
*Fix:* `display: inline`, `line-height: inherit`, `padding: 0 2px`, radius one step down from pill.
*Receipt:* computed style eval + `reports/snaps/rv-drill-template.png`.

**F-7 · The Actions row's template-preview column is 152px, clips on EVERY row, and discriminates
nothing — and it's the template text's THIRD home.**
Measured: preview cell `152px`, `scrollWidth > clientWidth` on all six sampled rows; five of six read
the identical first 30 chars ("[Take the following into speci…" ×3, etc.). The same string already lives
in the drill textarea and in the readout's RESOLVED block.
*Why it hurts:* 152px of every row spent on non-information, while the row's actual scent — the
description — is squeezed to ~30px ("You steer y…", "You rew…"). §13 single-homing: one concept, three
homes.
*Fix:* delete the preview column from the row; give its width to the description.
*Receipt:* column measurement eval this run; `reports/snaps/rv-actions.png`.

**F-8 · Group-heading voice differs per tab — three grammars in one editor.**
Params: `QUALITY / SAMPLING / REASONING / OUTPUT / CONTEXT` as 10.5px uppercase muted kickers.
Transforms: the same kickers PLUS "Regex" as a large sentence-case bright heading.
Data: "Variables" / "User macros" / "Macro browser" all as large sentence-case headings, no kickers.
*Why it hurts:* the surface reads as if a different person built each tab (Nielsen #4). The ARIA is
already consistent (`heading level=3` everywhere) — only the paint diverges.
*Fix:* one kicker voice for a deck group across all five views.
*Receipt:* `rv-transforms.png`, `rv-data.png`, `rv-preset-params.png`.

**F-9 · Select widths are inconsistent inside a single deck.**
Transforms: Speaker names `375→884` (full), Continue delimiter `375→884` (full), Adjacent-role merging
`684→884` (half, right-aligned). Section drill: Name input `375→884` (full), Role select `375→627`
(half), Zone select `375→627` (half). Two right edges (627 and 884) inside one column.
*Fix:* one rule — either the half-width select is the law for enum controls (then Name/Speaker/Continue
follow it) or full-width is (then the half arm goes).
*Receipt:* field geometry eval, this run.

**F-10 · "Inject at depth" is revealed by a PLACEMENT choice but renders in the DELIVERY group above it.**
Reading order: `DELIVERY → Name, Role, Inject at depth` … `PLACEMENT → Zone, Order`. Picking
"In Chat — at a depth in the conversation" under PLACEMENT makes a field appear ~80px ABOVE, in a
different kicker group.
*Why it hurts:* the control is far from where its cause is — the user changes Zone, sees nothing move
where they're looking. §13 IA.
*Fix:* home the depth field under PLACEMENT with Zone + Order.
*Receipt:* `snap --eval` innerText ordering on the Main drill with zone=In Chat.

**F-11 · O-6 NOT FIXED — "Summary instructions" is the one field on the deck with no ghost default.**
```
textbox "Summary instructions"          ← no /placeholder line
textbox "Managed threshold"  /placeholder: 0.85 (default)
textbox "Verbatim tail"      /placeholder: 8 (engine default)
textbox "Max output tokens"  /placeholder: default
```
DOM: `params.compaction.instructions` → `value=""`, `placeholder=""`.
*Why it hurts:* the user cannot see what runs if they leave it blank — and the rest of the deck (and the
section drill's explicit "Leave it empty and the built-in default rides") taught them a ghost would be
there.
*Fix:* ghost the RP-tuned default, per the GhostValue law's textarea arm.

**F-12 · Four of seven CONTEXT panes are empty or voiceless.**
- `Home details` → `""` (nothing at all — no header, no body).
- `World Info details` → `"Details"` (generic header, zero body, no empty-state arm). Confirms Lane H's
  out-of-lane find.
- `Chats` / `Characters` / `Refinery details` → `"Details\nDetails\nSelect something to see its details
  here."` — the word "Details" printed twice (pane header + inner heading) and one voiceless placeholder
  shared by three sections.
- Corpus + Analytics carry real content.
*Why it hurts:* [[empty-states-are-load-bearing]] — an empty docked pane reads as unbuilt. The preset
team built the model answer here (the no-selection arm is a first-class ACTIVE PRESET / EFFECTIVE
GENERATION / CAPABILITY readout) and nobody swept it sideways.
*Fix:* every section's no-selection arm names what the pane WILL show (presets' arm is the template);
kill the duplicated "Details"; sweep item-11's view-naming to the other sections.
*Receipt:* `snap --goto <section> --eval` sweep across all seven, this run.

**F-13 · "Show assembled preview" expands entirely below the fold with no scroll-into-view.**
At 1280×800 the button sits at y≈780; clicking it flips the label to "Hide assembled preview" and renders
the whole preview off-screen. Nielsen #1 — the only feedback is a label change.
*Fix:* scroll the disclosure's content into view on open.
*Receipt:* `reports/snaps/rv-assembled-preview.png` (label flipped, viewport unchanged).

**F-14 · CLS is 2–4× the budget on EVERY section — shell-tier, not preset-specific.**
`__orb.motion()` on a clean load, no interaction: presets `cls 0.2637 / worstShift 0.1147` ·
chats `0.233 / 0.092` · characters `0.218 / 0.149` · corpus `0.408 / 0.131`. Budget is 0.1.
Adding four tab switches barely moves it (0.2984) — the instability is the FIRST PAINT: shell, panes and
readout land in separate frames and content jumps.
*Mitigating:* `__orb.animations()` returns ZERO non-compositor-clean animations, and `worstBlocking 102ms`
is `main.tsx` dev-build boot. Re-measure on a production build before acting — but 4× budget on all four
sections sampled is not noise.
*Fix:* reserve the pane/readout geometry before data lands (skeleton at final size, not zero-height).

**F-15 · Mobile: when the active section lives in the You sheet, NO tab is marked current.**
At 418×634 in Presets, all four bottom tabs read `aria-current=null`. The section's own rail button
DOES carry `aria-current="page"` + amber — but it is `display:none` (it's the desktop rail copy).
Verified the tab bar CAN mark current (in Chats, `Chats cur=page`). So the gap is exactly the five
`mobile: "sheet"` sections (Corpus, World Info, Presets, Refinery, Analytics).
*Why it hurts:* Sam gets a nav landmark with zero current markers; a sighted user sees four unlit tabs
while standing in a fifth place. Nielsen #1.
*Fix:* the `You` tab carries `aria-current="page"` (+ the active paint) whenever the active section is a
sheet section.
*Receipt:* per-button `aria-current` eval at 418×634 and 430×932.
*Correction to my own first read:* I initially called this a navigation HOLE. It is not — the You sheet's
MORE group reaches all five (`reports/snaps/rv-418-you-sheet.png`). Only the current-indicator is missing.

**F-16 · Mobile: the You sheet opens with "Analytics" directly under the finger that tapped "You".**
The sheet covers the tab bar (0→634); the `You` tab's hit box (`314,579 105×56`) lands inside the
Analytics row. `reports/snaps/rv-418-you-sheet.png` shows Analytics painted in a hover/active fill while
Presets carries the current amber — **two rows reading as selected at once.**
*Why it hurts:* Casey (one-hand) — a slightly long press or an accidental double-tap fires an unintended
navigation; and the double-painted selection is ambiguous even when it doesn't fire.
*Fix:* reserve a dead band at the sheet's foot equal to the tab bar, or bottom-anchor the sheet's action
list above the tap point.

**F-17 · The template drill's two macro chips are orphans — no label, no role, no group.**
`{{input}}` `{{person}}` float 30px below DELIVERY with no kicker. In the a11y tree they are bare text
CONCATENATED into the previous field's bounds hint:
`text: "Between 0 and 100,000 {{input}} {{person}}"`.
*Why it hurts:* cold-read failure (§13) — nobody can tell what they are or whether they're pressable;
Sam hears them as part of a number range. They also list only 2 of the 4 macros the template uses.
*Fix:* a kicker ("Macros this template can use"), a `list`/`listitem` structure, and either make them
insert-buttons with names or mark them `aria-hidden` behind an sr-only sentence.

### P3

- **F-18** Header kebab ("Preset options") holds exactly ONE item, "Reset to starter arrangement". A ⋯
  that hides a single command isn't discoverable; either name it or wait until it has peers.
- **F-19** Two accessible-name vocabularies for one affordance: `"More info about Quality"` vs
  `"About Max output tokens"`. Pick one.
- **F-20** Stepper buttons are named bare `"Decrease"` / `"Increase"` — three steppers on the Params deck,
  so Sam hears "Decrease" three times with no subject. Use `"Decrease Managed threshold"`.
- **F-21** Typography drift: `"Saved"` = the gloss tuple (`oklch(0.74 0.008 65) 10.5px/400`) plus
  `letter-spacing: 0.84px`. Collapse to the gloss token.
- **F-22** `[aria-label="Import a preset"]` is 40×44 under coarse-pointer emulation — 40 < 44 on one axis.
  (The only genuine sub-44 target found; every other control measured 48×48 at coarse.)
- **F-23** Number-format split survives in the sr-only bounds text: `"Between 1 and 64000"` (raw) vs
  `"Between 0 and 100,000"` (locale). Same family, two grammars.
- **F-24** The Zone select's stored value is still `post` while the label reads "In Chat" — UI-only vocab
  fix. (Already on the owner queue as C's SETUP/POST vs Relative/In-Chat flag; noted, not re-litigated.)
- **F-25** With nothing selected the readout header reads "Params readout" while the body is the
  ACTIVE PRESET / EFFECTIVE GENERATION / CAPABILITY no-selection arm. The header names a view the body
  isn't showing.
- **F-26** `"Relative — ordered among …"` truncates inside the half-width Zone select (O-4's disease in a
  new box). Shorten the option label; the explanation goes to the info button.
- **F-27** Rack token counts are bare text in the a11y tree — `~—` announces as "tilde em dash". Mark the
  glyph `aria-hidden` with an sr-only "cost not counted".
- **F-28** At 960 and at 418 the content landing reads "Pick a preset **from the list**" while no list is
  on screen (both panes auto-collapse in-band). Reword the narrow arm to point at the reopen affordance.

---

## Rulings on the standing taste items

**1. Braces-vs-bare spelling split → BRACES + CHIP WINS.** Three spellings ship today:
`{{char}}` raw mono (editor textarea, correct — it's the editable source) · `{{input}}` braced chip
(Actions readout, correct) · `char` / `description` / `guided_instruction` bare (Prompt assembled
preview, WRONG — F-1). The braced chip wins because (a) braces are the vocabulary the user types, so the
preview must echo the string they'd search for; (b) the chip is the only thing that makes a placeholder
visually distinct from prose; (c) the Actions readout already ships it with the teaching gloss. The bare
form is unrecoverable — nothing distinguishes the macro `description` from the word.

**2. CD2 box-in-box, choices island inside the bubble → KEEP ONE BOX, DEMOTE ITS CHROME.**
`message-choices-block.tsx:49` renders `<Card className="border-info">` from `message-content.tsx:72`,
i.e. inside the bubble, which is itself border+radius+bg. By the letter that's an A2/CD2 violation. But
the choices block is an *interactive island inside prose* — it must be distinguishable or a user won't
know those are pressable, and that's the case CD2's "maximum" clause exists to permit. What's actually
wrong is that it carries the FULL Card treatment *plus* an accent `border-info` on top of the bubble's
own border — two complete boxes with two border colors. Demote to single-axis separation: keep the
background fill (or a left rule), drop the border, step the radius one below the bubble's.
**Caveat: this is a SOURCE ruling. I could not verify it rendered** — the isolated stage has zero chats
and seeding a chat that produces a choices block was not worth the budget against the ranked list.

**3. Forming-chip 10→8px radius pop → NOT A DEFECT. No change.**
`ghost-message-row.tsx:48-58` — the chip is deliberately a `<Card>` at the room's instrument tier
(`--radius-base`), demoted because D6 reserves the largest radius step for the floating bubble it streams
inside. An inner box at a smaller radius than its container is the nesting law, not drift. The "pop" is
the intended chip→card hard cut ("NO iframe, NO partial HTML ever renders mid-stream").

**4. worldInfo CONTEXT pane empty → CONFIRMED, P2** (F-12). Its whole `innerText` is the string
`"Details"`. Home's is the empty string, which is worse. Severity P2 not P1: a workaround exists (close
the pane), but two rail sections shipping a blank docked pane is the "looks unbuilt" failure the
empty-states law was written for.

---

## The owner's 418×634 sighting — reproduced-or-not

**NOT reproduced as described.** Honest fresh eyes, real device emulation, both panes, every section.

Measured at 418×634: panes `y 48→578` (h 530), tab bar `578→634` (h 56), `scrollHeight === innerHeight
=== 634`. The panes ARE full height for the space they own — topbar to tab bar, nothing clipped, no
navy pane, no rotated tab strip, no vertical icon rail. Lane H's debunk stands.

The takeover pane is `position: fixed`, `z-50`, backed by `.shell-scrim`
(`oklch(0.12 0.006 60 / 0.6)`, 418×530) with `backdrop-filter: blur(14px) saturate(1.4)` and a 0.7-alpha
body — frosted glass, not raw transparency. I suspected the show-through was the defect; **the receipts
refuse it**: row text on the frosted sheet measures **15.68:1** (`--contrast-pixel`, need 4.5) and the
search field **6.45:1** (need 3.0). `Presets content` carries `inert`. Reading surface holds.

**What I *did* find in that band is F-15 and F-16** — a missing current-tab indicator and a sheet that
opens a nav target under the finger. Neither matches "panels not full height." My best read: the owner
saw the frosted sheet ending at the tab bar (two stacked bands, sheet body semi-transparent) and read it
as a half-height panel. If so the fix is presentational, not geometric: raise the sheet body's alpha, or
carry the sheet to the viewport floor with the tab bar riding ON it. The sighting stays OPEN pending the
owner's own morning look — I will not close someone else's eyes for them.

---

## Taste & flow verdict (blunt)

**Does it look like shit? No — and that's a real change.** The Params deck, the rack, and the readout now
read as one designed surface: quiet kickers, one white, amber earning its place on state (active dot,
ON switches, filled slider) and nowhere else, the readout mirroring the deck without shouting. The rack
is the best thing here — grip, glyph, name, cue badge, cost, toggle, chevron, in a scannable column with
the SETUP/POST splice band cutting it exactly where the concept cuts. The blue-vs-amber two-tone the
crunch list called accidental now reads INTENTIONAL, because SETUP is blue in both panes and POST is
amber in both. That's coherence, not drift. (The `--color-info` hue ruling is already on the owner's
queue; I'm not pre-empting it.)

**Where it still flows weird — three places.**

*The Actions rows.* Six columns crammed into 500px: name, description, kind chip, source chip, preview,
chevron. The description column's width is whatever the NAME left over, so it's ragged row to row and
truncated to uselessness — "You steer y…", "You rew…", "A Contin…". Beside it sits 152px of preview that
says "[Take the following into speci…" on three consecutive rows. The row spends its width on the thing
that discriminates least and starves the thing that discriminates most. This is the one screen on the
surface I'd call ugly, and it's the tab a user hits looking for "what do these buttons do."

*Three grammars for "a group on a deck."* Params speaks in kickers, Data speaks in headings, Transforms
speaks in both. Flipping between tabs, the type changes voice mid-sentence. Nothing is broken; it just
reads like three people shipped three tabs.

*Half-and-full selects in one column.* Two right edges, 627 and 884, alternating down a single column,
with the model-enforcement note wrapping into the void beside one of them. The eye keeps re-finding the
column edge.

**Is it intuitive cold?** Mostly yes, and better than most config surfaces I've driven — because the
readout is doing real teaching. "A bar click selects its section. A struck row is switched off and costs
nothing; carriers read ~— because their cost is the conversation's, not the preset's." That sentence does
more work than a help page. "Clicking the name opens that row in Prompt" — and then it actually does.
The empty states are honest ("This model exposes no sampling controls" / "This model honors no sampling
knobs — that is why the deck shows none") instead of pretending. Somebody wrote these like a person.

The cold-read failures are narrow and specific: the two orphan `{{input}} {{person}}` chips floating
under DELIVERY with nothing telling you what they are (F-17), and the ⋯ that hides one command (F-18).

**One home per concept — one real violation and one near-miss.** The violation is the Actions template
text living in three places (row preview / drill textarea / readout resolved) — F-7. The near-miss is the
quality gloss printing the identical string in content and readout, ~400px apart; that one I'll allow,
because the readout's whole job is to mirror resolution. Export is now correctly single-homed (O-16).
The persona "You" rendering twice in the mobile sheet — once as "PLAYING AS / You" and again as
"YOUR PERSONAS / You / Your default persona", 60px apart in two treatments — is a genuine duplicate, but
it's the identity feature's, not this program's; boarding it here so it isn't lost.

---

## ARIA-navigability recommendations

| Element | Problem | Exact fix |
|---|---|---|
| Actions template editor textarea | `role=combobox`; accessible name = the entire template, twice | `role=textbox` + `aria-multiline="true"`; ghost default via `aria-describedby`, not a name-contributing `placeholder` (F-3) |
| `[aria-label="Active preset for generation"]` radios | both `tabIndex=0`; no Arrow keys | roving tabindex (checked=0, others=-1) + Arrow/Home/End handlers (F-5) |
| Mobile bottom tab bar | no `aria-current` on any tab when the section is a `mobile:"sheet"` one | `aria-current="page"` on the `You` tab for sheet sections (F-15) |
| Template drill `{{input}} {{person}}` chips | bare text, concatenated into the At-depth bounds hint | wrap in `role=list`/`listitem` under a labelled group, or `aria-hidden` + one sr-only sentence (F-17) |
| Rack token counts `~30` / `~—` | bare text; `~—` announces "tilde em dash" | `aria-hidden` on the glyph + sr-only "≈30 tokens" / "cost not counted" (F-27) |
| Params stepper buttons | named `"Decrease"` / `"Increase"` (×3 on one deck) | `"Decrease Managed threshold"` etc. (F-20) |
| Info buttons | `"More info about X"` and `"About X"` both in use | one template (F-19) |
| Drilled-in editor title | `paragraph: Impersonate` — the drill's subject is not a heading | `heading level=3` so SR users can jump to the artifact being edited |
| Rack rows | flat buttons under the tabpanel, no list container | `role=list` + `listitem` so SR users get "11 items" (the per-row Reorder/name/enabled/Edit grammar is already excellent) |
| Prompt readout bounds hints | `text: "Between 1 and 64000"` unassociated | `aria-describedby` from the field to the hint |

---

## What's genuinely working — do not touch

1. **The trailing-slot rewrite.** `actionsReserved` + permanently-mounted `RowToggleAction rest="when-on"`
   + opacity-only reveal is the correct fix, and the measurement proves it: identical box geometry at rest
   and hover, so the CSS oscillator is structurally impossible now, not just unobserved. The file header
   documenting *why* is the kind of thing that stops this regressing in six months.
2. **The readout as a teaching instrument.** Bars with struck-off rows, `~—` for carriers with the
   sentence explaining why, the PIVOT row, the capability note, the honest "no sampling knobs" arm, the
   no-selection ACTIVE PRESET arm. This is the best empty/derived-state work in the app and it should be
   the template the other five context panes copy (F-12).
3. **Cross-pane coordination.** "Delivers via Guided instruction" → jumps tab, selects the rack row, AND
   lights the matching readout row. Clicking an Actions row binds the readout to it. That's the shell
   physics working exactly as `UI-Architecture-and-Layout.md` §4.2 describes — which is precisely why the
   drill-in exception (F-2) reads as a bug rather than a limitation.
4. **Lane H's overlay sheets.** Scrim + 4-layer elevation + inert + full height + no orphan edge, on both
   panes and both sections, with no regression at mobile. Clean lane.

---

## The single biggest opportunity

**Make the previews tell the truth, everywhere, in one spelling.** The whole surface is sold on
"here's what the model actually receives" — and that promise is currently kept in the Actions readout,
broken in the assembled preview (F-1: `You are char in an immersive roleplay with user`), and pointed at
the wrong artifact after a drill-in (F-2). Fix those two and unify on the braced chip, and this stops
being a settings screen and becomes the thing the redesign was actually for. Everything else on this
list is polish by comparison.

---

## Two-track reconciliation (what my eyes got wrong)

Recording these because the point of the second lens is that it catches ME too.

- **I called a P1 focus-ring failure and it was wrong.** `getComputedStyle` on the focused list row read
  `outline-style: none` + a transparent-only `box-shadow`, with `:focus-visible === true` — a textbook
  no-ring signature. The screenshot refuted it: a clean 2px amber ring is painted (from a layer my
  element-level read didn't see). **Retracted.** Lesson for the skill: a computed read on the focused
  NODE is not sufficient — take the picture.
- **I called the list subtitle truncated ("edited some ti…") and it was a probe artifact.** `--probe`
  freezes relative time to the long string "some time ago"; the real label is "edited 14m ago" and fits.
  **Retracted.** Don't judge text fit under `--probe`.
- **I called the mobile sheet-section list a navigation hole** before finding the You sheet's MORE group.
  **Downgraded** to the current-indicator gap (F-15).
- **I flagged a 15px bright-white bounds helper as item 21(a) surviving** — it's `sr-only`
  (`clip-path: inset(50%)`, 1×1). My census filtered zero-opacity and zero-size but not clipped nodes.
  **Retracted.**
- **What the instruments caught that my eyes forgave:** the 80px radio stagger (F-4) — I looked at that
  list four times and read it as fine before the geometry eval named it; the macro chip's 28px box in a
  20px line (F-6), which I'd registered as "the readout wraps a bit oddly"; and CLS 0.26 on a load that
  looked perfectly still to me in every screenshot (F-14).
- **`design-audit` returned clean** (0 P0/P1, 3 devtools false positives) on a surface carrying three P1s.
  Its blind spots here: cross-pane state desync, macro-substitution honesty, inline-chip line-box damage,
  and intra-group alignment. A clean scan is a floor, not a verdict.
