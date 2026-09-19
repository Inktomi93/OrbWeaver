---
kind: review
status: active
updated: 2026-09-19
---

# Field ink after the tw-merge type-scale fix (#2450 / #2458) — before/after rendered audit

Lane `side-eye-Y`, 2026-09-19. FOCUSED review of the rendered side-effect of `a9fd576f6`
(`fix(ui): floor every text-entry control at the iOS focus-zoom 16px`, #2450), landed at
`fe1294944`. Read-only; no fixes. Every arm is a paired `snap --isolated --ref` drive:

- **BEFORE** = `--ref 53f5a63de` (stage band 0, `http://localhost:5273`)
- **AFTER** = `--ref fe1294944` (stage band 1, `http://localhost:5283`)

## Environment — the live dev stack was lying, and the report does not rest on it

Four minutes into the drive, a merge probe against `:5173` reported that the app's own `cn`
dropped `text-foreground` beside `text-code-field`. It did — because **the dev server was
serving a `packages/ui/src/tokens/index.ts` that predated `a9fd576f6`** while serving the NEW
`class-merge.ts` and the NEW `theme.css`. A partially stale graph: the derived tw-merge scale was
live, the token map it derives from was not.

```
curl -s "http://localhost:5173/@fs/<repo>/packages/ui/src/tokens/index.ts" | grep -c code-field   -> 0
grep -c code-field packages/ui/src/tokens/index.ts                                                -> 3
curl -s "http://localhost:5283/@fs/<stage>/packages/ui/src/tokens/index.ts" | grep -c code-field  -> 5   (fresh stage, correct)
```

`pnpm stack status` printed `served module : fresh · packages/ui/src/tokens/index.ts` over those
stale bytes — its freshness check counts six value exports and cannot see a missing token, so it
published a false clean. Reported mid-run; the orchestrator restarted the stack (`served now 5`)
and is filing both rows. **Every number in this report was re-taken on pinned isolated stages
after that point**; nothing here rests on `:5173`.

## Verdict

**SHIP.** The change does what it says on every control this review could reach, and it makes
the most common control in the app *more* consistent, not less. Two things the change's own
commit message gets wrong are recorded below as P1/P2, and one deterministic lane could not
reach a verdict at all.

## What actually changed on screen

`FIELD_CONTROL_BOX` ends `text-foreground` by authoring intent —
`packages/ui/src/lib/field-control.ts:15`:

```
export const FIELD_CONTROL_BOX = "w-full min-w-0 rounded-control border border-input-border bg-input text-foreground";
```

Before the fix, `text-field` (appended by `FIELD_CONTROL`, `field-control.ts:46`) was unregistered
in tailwind-merge's font-size group, was read as a text COLOR, and dropped the `text-foreground`
that precedes it. Every `Input` / `Textarea` / `Select` trigger therefore *inherited* its ink.
Confirmed in the rendered class list, both stages, same selector:

| | rendered class fragment on `[data-slot="select-trigger"]` |
| - | - |
| BEFORE | `… border border-input-border bg-input px-block text-field leading-field …` |
| AFTER | `… border border-input-border bg-input **text-foreground** px-block text-field leading-field …` |

Where the inherited ink differed from `--color-foreground` — every **list pane**, which is an
`ASIDE.shell-panel` carrying `--color-sidebar-foreground` — the paint moved. A 22-surface paired
walk (13 config groups, 6 sections, 2 modals, a chat room) found the delta on exactly these:
characters, corpus, databank, presets, refinery, the chats list, and the chat-list search.

### Decoded framebuffer, Characters list pane, Hearth (`--shot-of '[aria-label="Characters list"]'`)

| element | BEFORE | AFTER | Δ |
| - | - | - | - |
| `Sort` trigger value "Recent" | `srgb(230,228,226)` | `srgb(242,240,237)` | **+12** |
| row title "Morgatha" | `srgb(242,240,237)` | `srgb(242,240,237)` | 0 |
| section heading "Characters" | `srgb(242,240,237)` | `srgb(242,240,237)` | 0 |
| row handle "morgatha" | `srgb(175,171,167)` | `srgb(175,171,167)` | 0 |
| search placeholder | `srgb(175,170,167)` | `srgb(175,170,167)` | 0 |

The rest of the pane was **already** at `--color-foreground`. The field was the odd one out. The
fix removes an inconsistency; it does not create one. Placeholder ink is untouched
(`placeholder:text-muted-foreground` wins in both).

### Contrast, all three shipped themes + coarse pointer

Measured on `[data-slot="select-trigger"]` (a field wearing the identical `FIELD_CONTROL` chrome
and showing a real value at rest — `--contrast` on an `<input>` returns a BOX verdict only, see
Instrument limits).

| arm | BEFORE ink | AFTER ink | BEFORE | AFTER | Δ |
| - | - | - | - | - | - |
| Hearth (default), fine | `oklch(0.92 0.004 75)` sidebar-fg | `oklch(0.955 0.004 75)` fg | 11.28:1 PASS | **12.58:1 PASS** | +1.30 |
| `--theme Light`, fine | `oklch(0.3 0.01 60)` | `oklch(0.24 0.01 60)` | 9.14:1 PASS | **11.07:1 PASS** | +1.93 |
| `--theme Mocha`, fine | `oklch(0.9 0.01 250)` | `oklch(0.95 0.01 250)` | 10.63:1 PASS | **12.35:1 PASS** | +1.72 |
| Hearth, `--mobile` (coarse) | `oklch(0.92 0.004 75)` | `oklch(0.955 0.004 75)` | 10.52:1 PASS | **11.73:1 PASS** | +1.21 |

Polarity assertion (`light-theme-polarity-receipts`): the Light arm genuinely inverted —
`--color-foreground` resolved `oklch(0.955 …)` in Hearth and `oklch(0.24 0.01 60)` under
`--theme Light`, read from the computed style, not from a PNG.

### The iOS focus-zoom floor, rendered (`--font-scale` 1.25 on this account)

| control | fine BEFORE → AFTER | coarse BEFORE → AFTER |
| - | - | - |
| NumberField `md` (×34, `config:admin`) | 18.75px → 18.75px | **18.75px → 20px** (15px → 16px @scale 1) |
| Autocomplete input (`corpus`) | 18.75px → 18.75px | **18.75px → 20px** |
| Select trigger (`corpus`) | 18.75px → 18.75px | 20px → 20px (already floored) |
| Input, list-pane tier (`characters`) | 16.25px → 16.25px | 20px → 20px |

The floor closed where the commit said it would, and nothing moved on a mouse on these four.

### Carried-theme room (D44) — unaffected, as it should be

Composer `[data-slot="textarea-root"]` in a card-themed room: ink `oklch(0.96 0 305)` before AND
after; placeholder `oklch(0.82 0 305)` before and after; 18.75px/29px both. The restored
`text-foreground` resolves through the room's `ThemeScope`
(`oklch(from oklch(0.15 0.0165 305) 0.96 0 h / 1)`), so it does not punch through the carried
theme. No attribution-ink regression.

### Disabled and a11y — no delta

Disabled ink (planted synchronously, read, restored): `opacity: 0.5` in both arms; the underlying
ink brightens with the rest. Disabled controls are outside WCAG 1.4.3; no finding.
ARIA tree of the Characters list pane is byte-identical between arms; the Tab walk lands
`INPUT "Search characters" fv=true` → `BUTTON "Sort characters" fv=true` in both.
`--contrast-edge` on the input: `6.90:1` on top/bottom/left, right side NO VERDICT — **identical
in both arms**, so the D159 `border-input-border` boundary (`field-control.ts:12-14`) is
undisturbed.

## Findings

### \[P1] The mono prose editors (MacroTextarea) shrink 13% on a mouse, and their reading measure leaves the §2 band

`packages/ui/src/primitives/macro-textarea/variants.ts:17`. The commit states "Both new fine arms
are the values those surfaces already painted, so nothing moves on a mouse." On the MacroTextarea
it moves.

| arm | BEFORE | AFTER |
| - | - | - |
| fine | `18.75px / 25px` (ratio 1.33) | `16.25px / 25px` (ratio 1.54) |
| fine, characters per line | **73** | **81** |
| fine, rendered box | 830×662 · 830×487 | 830×662 · 830×**437** |
| coarse | `20px / 25px` | `20px / 30px` |

At `--font-scale` 1 that is **15px → 13px monospace** in the character facet editor, the preset
prose editors, the theme editor and the member-card viewer. Measured advance is exactly
`10.000px` at 16.25px (Geist Mono, uniform) so the 81 is the law's own character count, not a
`ch` proxy — §2's band is 65–75, and the surface just left it.

**Why it hurts a user:** the Description facet holds 1287 characters of prose the owner edits by
hand. It is now set in 13px mono at 81 characters a line — smaller glyphs AND a longer line, the
two changes that compound against sustained reading. The before/after element shots make it
obvious to the eye.

**Is the after "right"?** By TOKEN intent, yes — `text-code` (13px) is what
`macro-textarea/variants.ts` always asked for; it only ever painted 15px because the very
tw-merge defect #2450 fixes let `text-field` win by stylesheet order. So this is an intent that
was never visible before, now visible. **That is exactly why it needs a decision rather than a
silent landing:** nobody has ever seen this surface at its authored size.

**Fix (design verb):** `typeset: the MacroTextarea prose surfaces — receipt: charsPerLine back
inside 65–75 at the 828px mount, with the before/after element shots`. Two honest arms: either
cap the editor's measure (it is a prose surface and owes `--reading-measure-prose`), or give
`text.code-field` a fine arm at the 15px this surface has actually painted for its whole life
instead of 13px. Either is a token/primitive change, not a call-site one.

**Receipts:** shots `reports/runs/snap/main-2960854-2026-09-19T17-07-02-297Z/snaps/ylane-facet-before.png`
and `…/main-2972739-2026-09-19T17-08-52-506Z/snaps/ylane-facet-after.png`; measurement evals in
runs `main-2988080-2026-09-19T17-11-01-529Z` (BEFORE, `charsPerLine` 73) and `main-2989536-2026-09-19T17-11-18-246Z` (AFTER, `charsPerLine` 81); `--cascade` receipts
in `main-2911451-…` (BEFORE: `line-height` Active `.leading-label-relaxed`) and `main-2909199-…`.

### \[P2] `snap --design-audit` cannot reach a verdict on any field surface, either pointer

`pnpm snap / --design-audit --isolated --ref fe1294944 --goto characters` →
`population-verdict=NO-VERDICT`, `findings=0`, `exit 2`,
`population-withheld=reveal-coverage:restHiddenReveal×33 + selection-idiom:unmatchedUnselected×1`.
With `--mobile` → `NO-VERDICT`, `findings=1`, same `selection-idiom` withholding.

**Why it matters:** `findings=0` on a NO-VERDICT run is *not* a clean surface — it is a run that
could not see. The deterministic lane therefore has **no opinion** on the ink change, and the
numbers in this report are the only receipt for it. Not caused by #2450; recorded so nobody
quotes the zero.

The one P3 the mobile arm did emit — `flat-type-hierarchy` `13.1px, 16.3px, 18.8px, 20px (ratio
1.5:1)` — is **identical on the BEFORE stage** (run `main-3000206-…`), so it is pre-existing and
is not a delta of this change.

**Receipts:** `reports/runs/snap/main-2995953-2026-09-19T17-12-36-968Z/run.json` (fine),
`…/main-2997800-2026-09-19T17-12-58-893Z/run.json` (mobile),
`…/main-3000206-2026-09-19T17-13-33-484Z/run.json` (mobile BEFORE).

### \[P3] Three named controls were unreachable in the seeded stage state

`CodeEditor` (regex scripts count is 0 and "New script" did not mount a `.cm-editor` within the
settle window, both stages), `Combobox` as a distinct primitive (`corpus`'s filter controls are
Select triggers; no `[data-slot="combobox-input"]` rendered on any surface reached), and
`NumberField` `inline` (all 34 NumberFields on `config:admin` are the `md`, Geist, centred arm).
All three are the `text.code-field` / `text.field` carriers the change touched. The MacroTextarea
result above is the same token pair on the same tier path and is the closest available proxy, but
these three are **UNVERIFIED RENDERED**, not clean.

## Retraction

Earlier in this run I measured, against `:5173`, that `cn("text-foreground","text-code-field")`
returns `"text-code-field"` — i.e. that #2450's own new token pair re-introduced the exact defect
it was written to kill — and that the facet textarea on main carried no `text-foreground` at all.
**Both were artifacts of the stale token map described at the top**, not product defects. On a
fresh pinned build the same probe returns:

```
cn("bg-input text-foreground px-block text-field leading-field", "font-mono text-code-field leading-code-field")
  -> "bg-input text-foreground px-block font-mono text-code-field leading-code-field"
cn("text-foreground","text-code-field") -> "text-foreground text-code-field"
cn("text-field","text-code-field")      -> "text-code-field"
cn("leading-field","leading-code-field")-> "leading-code-field"
```

`text.code-field` and `leading.code-field` ARE registered in the derived scales and behave
correctly. The finding is withdrawn; what survives from that thread is the environment row and
the P1 above (which reproduces on the fresh build).

## Taste & flow verdict

**The list panes look the same and are slightly better.** Side by side at `--shot-of` the two
Characters panes are indistinguishable to the eye — as they should be, because the only thing
that moved is one label's ink by 12 RGB points, and the decoded framebuffer is the only honest
way to see it. What the pixels say is that the pane is now internally consistent: heading, row
titles and the Sort value all sit on the same primary ink, and only the deliberately receded
things (handles, placeholder) sit below it. Before, the Sort value was a half-step dimmer than
the row titles it sat above for no reason a user could name. That is a real, if quiet, win.

**The facet editor does not look the same, and this is the thing a person would notice.** Put
the two shots next to each other and the AFTER is visibly finer-grained — more characters per
line, smaller letterforms, the same line spacing. It reads airier (ratio 1.33 → 1.54) but
smaller, and 81 monospace characters is a long way for the eye to track back. My blunt call: the
airier leading is an improvement and the 13px face is a step too far for a surface whose whole
job is editing a page of prose. It does not look like shit; it looks like a code editor being
asked to be a prose editor, which is the honest description of the control.

**Flow / IA:** nothing moved. No control changed home, no affordance was duplicated, no concept
gained a second home. This is a paint-and-metrics change and it stayed one.

## Client CT tree under the tw-merge change

```
pnpm test:ct tests/client/features/chat/components/composer.ct.tsx \
             tests/client/features/config tests/client/features/character
CT SUMMARY — PASS · 491 passed · 0 failed · 0 flaky · 0 skipped   (exit 0)
```

No preflight UNFED row for any file (#2457 did not fire here). 32 spec files, 491 tests.

## Instrument limits hit (stated, not worked around)

- **`--contrast` on an `<input>` returns a BOX verdict, never a text one.** It reads the DOM
  `value` attribute, so a Playwright `--fill` (which sets the property) leaves it reporting
  "this field is empty and paints no placeholder". Every input-ink ratio in this report is taken
  off a Select trigger wearing the identical `FIELD_CONTROL` chrome and ink token.
- `--contrast-edge` returns NO VERDICT on the input's right side in both arms (the side borders
  more than one surface), which labels the whole row FAIL. Identical in both arms → not a delta.
- `--wait-for 'text=Search characters'` times out: the string is a `placeholder`, not rendered
  text. Dropped from the drive.
- The `--eval` value-planting path (native setter + `input` event) is reverted by the React
  re-render before the post-queue captures observe it — same class as the inline-style plant
  footgun. Synchronous plant-read-restore inside ONE eval works (used for the disabled arm).

## Instrument coverage

| Instrument | Status |
| - | - |
| `snap --map` / `--atlas` | RAN — `main-2817587-…`, `main-2958545-…`, corpus/regex/character maps |
| `snap --aria` | RAN — Characters list pane, both arms, identical |
| `snap --contrast` | RAN — 3 themes × 2 stages + coarse; see the table |
| `snap --contrast-edge` | RAN — both arms, no delta |
| `snap --cascade` | RAN — `main-2911451-…` / `main-2909199-…` (line-height, font-size) |
| `snap --eval` censuses | RAN — 22-surface paired walk + 9 targeted arms |
| `snap --shot-of` + framebuffer decode | RAN — list pane, facet editor, room |
| `snap --design-audit` fine + `--mobile` | RAN — **NO VERDICT both** (P2) |
| `--theme Light` / `--theme Mocha` / default | RAN — all three shipped themes |
| `--mobile` (coarse pointer) | RAN — every size claim |
| Keyboard walk (`--key Tab` + focus eval) | RAN — identical both arms |
| `--appearance-preset` arms | SKIPPED — the change is a type/colour token swap with no appearance-axis dependency; the owner's own `--font-scale 1.25` row was the arm driven and is stated on every number |
| `snap --motion` / `--perf` | SKIPPED — no motion or interaction surface in scope (brief: don't chase `--motion`) |
| `snap --lighthouse` | SKIPPED — axe adds nothing over the per-element contrast arms here and the dev-overlay trap costs more than it returns |
| Pane-state arms | PARTIAL — list pane open (the surface that carries the delta) at desktop and `--mobile`; collapsed-pane arms not driven |
| Retained-section inventory | SKIPPED — no Activity-retained section in the field surfaces reached |
| Client CT tree | RAN — 491 passed |
