---
kind: work
status: open
updated: 2026-10-25
priority: P2
area: ui
plan: css-system
---

# Build the CSS system: ramps, conditions, locked TSX and theme-aware variants

## What

Build the css-system plan's legs: the primitive ramp tier with semantic aliases, one conditions vocabulary, Tailwind namespace resets that lock TSX to the ramps, stylelint allow-lists over the hand-written CSS, @orb/ui variants built for the theme engine and appearance, ramp values derived from UI law, and the CSS file cleanup. No compatibility shims.

## Why

Values sprawl across role-named tokens, the Tailwind default scale and raw literals, and the same breakpoint and pointer conditions are spelled several ways; nothing forces a surface onto a scale.

## Done when

The plan's legs are built as its Shape states; every control in its Test plan fails on a planted defect; the main surfaces pass side-eye at desktop and phone; whole-tree lint, stylelint and depcruise are green.

## Evidence

The implementation, bounded correctness review and reviewed-slice visual acceptance are complete at `2df42bb1a0`, including the CodeMirror typography and enlarged new-chat footer corrections. The CSS closeout (`reports/surface-consistency-private/governed-doc-recovery/originals/docs/reviews/css-closeout.md`) and ramp enforcement closeout (`reports/surface-consistency-private/governed-doc-recovery/originals/docs/reviews/ramp-enforcement-closeout.md`) record the source populations, affected native checks, runtime cases, synthetic captures and their limits. The Import FormDialog was not reached in the capture attempts and is not claimed as visually qualified.

Keep this umbrella open until its explicit current-tree whole-lint and dependency requirements are also satisfied. D317 and the orchestrator merge-train policy leave those whole-tree results to the next authorized push barrier; pre-expansion results do not qualify the changed enforcement/configuration population. The affected Stylelint result is current and passing.
