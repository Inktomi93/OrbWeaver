# SIDE-EYE: PRESET-1 program — DO NOT SHIP (fix the P0/P1 band first)

> Verdict delivered 2026-08-02 against the merged tree (P0-P4). Fix-all law applies: every
> finding below gets fixed. Orchestrator rulings on the two JUDGMENT rows are appended at the
> bottom. Artefacts: reports/snaps/ + reports/design-audit/ (ephemera).

The bones are right. The five-view collapse works, the rack keyboard path is genuinely
excellent, the carrier attribution panels land, the freshness contract fires. But there is a P0
that hides row identity, a lying state badge on the built-in preset, a swallowed server error
dressed up as an empty state, and the ember accent budget has broken exactly where the spec
warned it would.

Stack note: :5173 was serving a stale-vite ghost at review start (contracts/prose served without
USER_PROSE_SLOT_IDS → fatal page error); `pnpm stack restart` cleared it. Everything below is
against the restarted, merged tree.

## Per-rider verdicts

| # | Rider | Verdict |
|---|---|---|
| 1 | Amber solid "Active" badge | Reads as a second CTA (same fill as + New). Soft + shape fix — F-06 |
| 2 | Explicit KnobRow ember | Budget breaks. Drop the ember — F-09 |
| 3 | Ghost value legibility | Contrast fine (8.66:1), size/treatment wrong; ghost slider FILL lies |
| 4 | Select≠drill discoverability | Works, keyboard-perfect — but focus destroyed on drill (F-04) |
| 5 | Carrier attribution + wiFormat | PASS — best-executed surface in the program |
| 6 | Narrow drill-in | PASS takeover/back row; focus lands on body; mobile header loses name |
| 7 | Import merge semantic | FAIL — no merge-semantic line exists at all (F-10) |
| 8 | Empty states | PASS none blank; Data/Transforms off-grammar (F-22) |
| 9 | A11y | Mixed: rack excellent; empty selects, color-only activation, focus loss |
| 10 | CONTEXT no-selection honesty | FAIL — contradicts the list, shows no profile (F-07) |

## Findings

### P0
- **F-01 Three Actions rows render with NO visible name** (Greeting rewrite / New greeting /
  New-chat marker at 0px label width; Response clips "Respo…"). DOM/ARIA carry the names — the
  layout eats them: label + fires-gloss share one flex line with no basis. Fix: fixed/shrink-0
  label column; the GLOSS truncates, never the identifier. Receipt: reports/snaps/actions-view.png.

### P1
- **F-02 Capability-read FAILURE renders as "connect a chat model"** — server said `400
  incoherent routing (agent-sdk × local-light)`; deck told the user to connect a model (already
  connected), 3×. Branch isError vs no-model; surface the server message. Also: gate copy
  repeats "Pick one under Settings → Connections → Model roles" 3× and the honors-line 2× — one
  gate note per deck.
- **F-03 `custom` badge fires on the untouched BUILT-IN** — section bodies materialize the
  default as a VALUE (full-weight) instead of ghosting when empty; the F2/§5.2a defect the
  redesign exists to kill. Fix: `template: undefined` + placeholder ghost; badge derives from
  `template !== undefined`. Receipt: reports/snaps/builtin-rack.png.
- **F-04 Focus dumped to <body> on drill-in AND back-out.** Fix: focus Back-to-rack (or heading
  tabIndex -1) on mount; restore to the originating Edit chevron on exit; role="region" +
  aria-label on the drill-in.
- **F-05 Three selects render completely EMPTY** (Reasoning display · Speaker names · Continue
  delimiter — combobox with no value). Adjacent-role merging does it right ("Model default").
  Fix: unset select renders the effective default ghosted, never blank.
- **F-06 Activation is COLOR-ONLY** (identical bolt glyph, stroke color the only delta; the
  "Active" text badge is pointer-coarse:hidden so touch gets color alone). WCAG 1.4.1. Fix:
  fill="currentColor" on the active bolt (shape delta) + keep a coarse-visible badge. Related
  rider 1: badge tone="soft" (same fill as + New at rest violates one-primary-per-region), and
  note the reveal-swap hides the badge the instant you activate (no rest confirmation until
  focus moves).
- **F-07 No-selection CONTEXT readout contradicts the LIST** ("Nothing is activated" beside the
  Active-badged built-in) and shows NO effective profile (mock: ACTIVE chip + effective table).
  One vocabulary: built-in-running = active; render its profile (resolver already answers).
- **F-08 Rack ON/OFF visually indistinguishable** (ON track bg-secondary L0.255 vs OFF composited
  ≈L0.286 — ON is DARKER; only a 10px thumb offset signals). Fix: real luminance fill for ON
  (bg-foreground/70 if ember at 12 rows breaks CD3).
- **F-09 KnobRow: drop the explicit EMBER fill AND the ghost grey fill.** Explicit = ↺ + full-
  weight mono value (spec §4.1: weight, not accent; mock draws every slider neutral). Ghost
  paints a near-full grey fill that reads as a maxed meter — unset looks MORE set than set. Ghost
  = hairline track + muted thumb, NO fill.
- **F-10 Import dialog never states the merge semantic** (dialog text duplicated 2×, says only
  "format is detected"). Fix: one line stating what actually happens + dedupe. Rejection UX good
  BUT the sniffer leaks its fall-through ("Not a SillyTavern preset…" for a malformed ORB file) —
  say it matched neither format.
- **F-11 Mobile editor header drops the preset NAME** (⚡ Activate │ model chip │ Saved │ ⋯, chip
  overlaps Saved). Name > provenance chip at narrow; truncate the chip.
- **F-12 Landing copy false on mobile** ("Pick a preset on the left" — no left pane at 430px).

### P2
- **F-13** Readout prints raw schema key `maxOutputTokens` (mock: "max output"); `context` has an
  effective value but no EFFECTIVE row.
- **F-14** Lying provenance: `effort · none · clamped` on a model with no reasoning controls —
  nothing clamped; the knob doesn't exist.
- **F-15** QUALITY MAPPING shows no mapping (spec/mock: "deep → effort high · temp 1.0");
  rendered gloss is an override-status sentence that misreads as "everything overridden"; the
  CONTEXT panel repeats the same sentence instead of the datum.
- **F-16** No max-width in CONTENT: rack rows span ~840px w/ ~60% dead gutter; drill-in gloss
  ~130ch vs §2's 65-75ch; cap the column at the mock's 720px.
- **F-17** Rack type-glyph column is noise: 9 identical bright steel-blue sparkle discs — loudest
  thing in the pane, near-zero information. Mock: small, dim, zone-hued, type-differentiated.
  Tone down + vary by type, or drop the column.
- **F-18** Pivot-band text collides with the chevron at ~530px (no truncation/min-width); the
  setup/post legends render as filled pills straddling the band border (mock: hairline caps
  kickers inside).
- **F-19** Activate controls use aria-pressed toggle semantics for a one-of-N radio → role="radio"
  + aria-checked in a role="radiogroup".
- **F-20** Actions rows announce their entire template body (~600 chars) — aria-hidden the mono
  preview; accessible name = label + fires-gloss.
- **F-21** Provenance/bounds glosses are loose text fusing across rows — wire aria-describedby on
  slider + twin.
- **F-22** Data + Transforms off-grammar: 17px sans headings instead of kickers; Transforms
  stacks switches vertically (label / switch / helper on separate lines) while the identical
  control in DELIVERY is label-left/switch-right.
- **F-23** Transforms center vs readout: two vocabularies + two counts for ONE pipeline (§13
  one-home).
- **F-24** Reset button 34×34 — below the 44 floor.
- **F-25** Editor kebab has ONE item ("Reset to starter arrangement") — identical on the locked
  built-in (which IS the starter); no Export in the editor (two homes: the verb lives only on
  the LIST kebab).
- **F-26** Disabled section vanishes from the budget readout while staying in the rack — keep the
  row, zero/strike it.

### P3
- **F-27** slider named "Max output tokens slider" — role restated.
- **F-28** Preset name is a <p>; kickers are h3 with no h2 — heading nav can't find the artifact.
- **F-29** Number formatting inconsistent in one cluster (1,500 vs 8192).
- **F-30** 4 stops × 12 rack rows = 48 presses, no skip.
- **F-31** text-micro (10.5px) does too many jobs (kicker, gloss, explainer prose, subtitle,
  status) — contrast PASSES everywhere (7.06-8.66:1); the TYPE SCALE is too flat for
  multi-sentence prose.
- **F-32** BODY → "Template" → textarea = three naming levels (drop the redundant sub-label);
  carrier Entry wrapper is a 90px textarea for a one-line format string (mock: single-line input).
- **F-33** "Two independent collapses happen…" orphaned above the label it belongs to.
- **F-34** "Delivers via Guided instruction" chip renders its ↗ OUTSIDE the pill.

## Mock-vs-rendered classification

| Divergence | Class |
|---|---|
| Explicit KnobRow ember fill (mock: neutral) | RENDERED-WRONG (F-09) |
| Ghost KnobRow full grey fill (mock: bare track) | RENDERED-WRONG (F-09) |
| Rack ON switch bg-secondary (mock: ember fill) | RENDERED-WRONG on legibility; hue = any real luminance fill (F-08) |
| Rack glyphs: big saturated discs ×9 (mock: dim, zone-hued, varied) | RENDERED-WRONG (F-17) |
| Pivot legends: filled pills straddling border (mock: hairline kickers inside) | RENDERED-WRONG (F-18) |
| Budget bars GREEN (mock: steel-blue/ember) | RENDERED-WRONG (green is nowhere in the language) |
| Rack subtitle on second line (mock: inline after name) | JUDGMENT → RULED below |
| QUALITY strip chunky, no mapping gloss, 700px void (mock: compact + mapping) | RENDERED-WRONG (F-15) |
| No-selection readout 2 sentences (mock: chip + effective table) | RENDERED-WRONG (F-07) |
| Header ACTIVE chip solid ember (mock: soft/outline) | RENDERED-WRONG |
| List active marker color-only bolt (mock: filled dot vs hollow ring) | RENDERED-WRONG (F-06) |
| List "Active" badge at rest existing | MOCK-STALE — sanctioned (P4/D11 arm) |
| Pivot enable switch absent | MOCK-STALE — sanctioned (§5.1) |
| ~tokens not struck when off (mock: line-through) | RENDERED-WRONG minor |
| Carrier drill-in lacks INJECT AT DEPTH (mock draws one) | JUDGMENT → RULED below |
| Data/Transforms sans headings | RENDERED-WRONG (F-22) |
| Dotted underline → ⓘ glyph | not a divergence (drawing convention) |

## ARIA recommendations (10)
1 ghost selects render effective value · 2 drill focus mount/restore + region · 3 radio
semantics · 4 active bolt fill + coarse badge · 5 aria-hidden template previews · 6
aria-describedby glosses · 7 Quality radiogroup (+ drop duplicated name) · 8 preset name → h2 ·
9 drop "slider" from slider names · 10 Actions group headings get human labels (raw enum members
today).

## What's working — don't touch
Rack keyboard model (4 named stops, real focus-visible rings) · carrier attribution panels ·
the freshness contract FIRES (settingsChanged/presetsChanged fans verified live) · selection
echo end-to-end · motion clean (no LoAF/CLS, zero DEADCSS). Dismissed false positives: TanStack
devtools z-index hits; Base UI chips-in-rows "nested cards"; the hidden Reset's tabIndex
(visibility:hidden removes it from the tree — correct).

## The single biggest opportunity
Finish the GHOST GRAMMAR — implemented in exactly one place today. One GhostValue treatment
(muted foreground + provenance gloss + NO fill + custom/explicit derived from value !==
undefined) applied uniformly to sliders, selects, textareas, badges closes F-03, F-05, F-09,
the custom-badge lie, and most of the mock gap in one motion.

---

## ORCHESTRATOR RULINGS on the two JUDGMENT rows (2026-08-02)

1. **Rack subtitle: FOLLOW THE MOCK — inline after the name.** The owner's charge for this pass
   was "lock down visually what it's supposed to look like"; the mock is the visual law where no
   ruling supersedes it. Inline + truncation, and F-16's 720px column cap makes the tradeoff
   mild.
2. **Carrier INJECT AT DEPTH: MOCK-STALE.** Plain markers declare NO inject/trigger in the
   contract — V2's `628a3666` correctness fix (the drill-in offering them would author invalid
   sections). The drawing predates that fix; the render is right.
