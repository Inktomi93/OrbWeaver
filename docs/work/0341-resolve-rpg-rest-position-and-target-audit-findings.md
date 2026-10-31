---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: rpg
plan: cross-surface-consistency
---

# Resolve RPG rest-position and target-audit findings

## What

The audit flags fractional Waystone SVG bounds at rest, but a controlled SVG comparison does not establish visible blur. Adjudicate the rule against painted geometry. Measure the reported gold and Grit touch targets, layer offsets and page typography hierarchy. The ruling doc is `docs/law/integer-line-boxes.md` section 9.

## Why

The completed readability fixes do not resolve these other findings. Keep confirmed defects separate from missing measurements.

## Done when

Preserve continuous clock movement and adjudicate the SVG result against integer-line-boxes section 9. Measure effective hit extents, layer offsets and the visible typography hierarchy. Fix confirmed defects at their shared owner and document measured retractions for false findings. Keep animation measurement limits explicit.

## Evidence

Partial: the unset-state half is measured, the populated half is not. No source changed. The item stays open for the missing measurements below.

Instrument: `pnpm snap --dirty` on isolated stage band 1, a scenario that starts the "Storm the Spire" roster chat, opens its Game tab, and runs a geometry `--eval` over `[data-slot=rpg-takeover-header]`. Desktop 1280x800, DPR 1, root font 16px. Run slot `reports/runs/snap/agent-a81f5ee07cc8e702b-1965505-2026-10-31T20-10-17-560Z`. Load was 36 on 24 cores; the numbers are layout, not timing.

Measured, unset clock (the only Waystone state the stage can reach, because the stage has no model to write an ambient clock):

- Painted geometry: the Waystone svg is 64 x 64 at x 909, y 56, so every bound is an integer. Its computed `transform` and `rotate` are `none`, and no ancestor up to the band carries a transform, `backdrop-filter` or `will-change`. Section 9 law 2 is met at rest in this state.
- Size source: `packages/ui/src/charts/meter/variants.ts` gives the stone box 64, 80, 96 or 120px from `--size-meter-*`, all integers at a 16px root. A fractional bound can come only from an ancestor offset or a non-16px root, not from the stone's own box.
- Typography: the unset line is 10.5px / 400 / 13px line, the Read-only badge is 13px / 500 / 16px line.
- Targets: the one control in the band, `More info about Read-only trackers`, is 12 x 12 at y 91.5, and `elementFromPoint` at its centre and both corners returns the control. Its effective hit extent beyond the 12px box is not measured here.

Not measured (missing measurements, not defects):

- The populated stone: hand `rotate`, sky layers, celestial offsets and the promoted-layer offset need a set clock. The hand rotation is a rest-state `rotate`, which section 9 puts out of scope ("a rotation is out of scope"), and it is the continuous clock movement, so nothing there is a candidate for change.
- The gold coin disc and the Grit disc hit extents: they render only when the host pins trackers, and the stage has none.
- Page typography hierarchy with a populated band.

To finish: run the same scenario on a stage cloned from the container data (`--stage-db`, see `.claude/skills/snap-driving/SKILL.md`, "Default stage data") with a game chat that has an ambient clock and pinned gold and Grit. No confirmed defect exists yet, and no retraction is recorded for the gold and Grit findings until they are measured. Animation limits: this run took no motion evidence, so the stone's transitions and the hand sweep are unjudged.
