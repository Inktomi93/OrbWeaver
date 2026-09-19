---
kind: review
status: active
updated: 2026-09-18
---

# settings:appearance look — surface state review (#1827)

Item 5 of #999's instrument-defect batch, split from #1807 at its fold. Owner-deprioritized (verify
batch's side-eye posture). This review documents the current state of the `settings:appearance` surface
against its design intent, re-derived from the code on 2026-09-18.

## Surface structure

The appearance pane is a SECTIONS SKIMMER (`appearance-group.tsx`: `body: { kind: "sections" }`). It owns
no surface of its own — every knob is a self-owned settings-section CONTRIBUTION in the feature that
reads it (message style/avatars/message details from chat; sizing & motion/reading typography/effects/
background from app-shell; library from character). The settings host renders the `appearance`-anchored
contributions and derives the pane's nav from them.

### Looks section (`appearance-looks-section.tsx`)

The theme picker is the first section. Architecture:

- **One collection, one card shape** (owner ruling, #866 S4 / #297): all themes — shipped seeds and
  user-created — render in a single `RadioGroupPicker` grid with identical cells. `isSeed` changes
  capability only (the menu's item list), never anatomy. No client allowlist of shipped names.
- **Apply-not-mode** (#297): picking a cell writes `theme.selectedThemeId` through the D71 pipeline.
  The default card writes NULL (base `@theme`). Every other cell writes its id.
- **Keyboard accessible** (#929 E6, #981 F20): one tab stop, roving focus, arrows change selection
  via `RadioGroupPicker`/`RadioGroupPickerItem`.
- **Menu sibling** not nested: the per-theme actions menu is a SIBLING of the radio root, positioned
  over the cell's top-leading corner. The check indicator owns the trailing one.
- **Builder door**: "New theme from <current>..." button mints a duplicate at the first real edit,
  opening the builder inline as this section's editing state.
- **Import/Export**: client-side over the row's own bytes (`{name, override, css}` JSON).
- **Loading reservation** (#1100): section chrome renders immediately; body uses the `reserveKey` seam
  to hold the box this device last measured, with 7 skeleton bars as the first-boot guess (337px at
  869px content-pane width with three seed themes).

### Advanced fold

A "Customize this look" disclosure (`advancedFold` on the group definition) collapses the fine-tuning
sections (sizing & motion, reading typography, effects) under the Looks picker — "your changes, on top
of the look you applied." Caption component (`LooksFoldCaption`) shows the current look name.

## Current state assessment

**What is present and correctly structured:**

- The one-collection/one-shape architecture is implemented as designed.
- Keyboard navigation through the theme grid works (RadioGroupPicker).
- The menu is correctly positioned as a sibling, not nested inside the radio control.
- Loading reservation prevents the CLS that #1100 identified (measured 0.1624 input-adjacent shift
  before the fix).
- Import/export are functional.
- The builder door names the current theme in its label.
- Empty-collection edge case handled: falls through to "New theme..." without a current name.

**No visual defects identified in code review.** The surface follows its design rulings faithfully: one
grid, one cell shape, apply-not-mode, keyboard accessible radio picker, sibling menu, inline builder,
loading reservation. The `#1671` default-detection fix (via `isDefault` rather than display name) and
the `#1667` fix (not comparing by name) are both present.

**Scope note:** this is a code-level review, not a rendered audit. Owner deprioritized this item to
verify-batch side-eye posture ("visual certification waits for verify passes"). A rendered
`snap --isolated` or ui-audit instrument pass was not run. If a rendered audit is needed, it should be
routed to a side-eye role with stack access.
