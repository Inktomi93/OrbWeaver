---
kind: bug
status: open
updated: 2026-11-12
priority: P2
area: client
plan: cross-surface-consistency
---

# Rendered review follow-ups on the avatar control

## What

From the rendered review of the shared avatar control. The failure line wraps to several lines of small muted caption text inside the avatar's narrow column and reads as a caption, not an error; on the persona row the column widens while the line shows and the whole form shifts sideways. The avatar shows no replace or drop affordance at rest or on hover. Smaller: the drag-over ring is identical to the focus ring, and the control carries two accessible names. Evidence and contact sheets: the client merge train review under reports/ux-reviewer.

## Why

A failure that looks like a caption is missed, a layout that jumps when an error appears loses the person's place, and a drop target nobody can see is not discovered.

## Done when

The failure line renders in the house refusal voice, as the file dropzone does, on a row spanning the host's width under the identity row, still linked to the control. A component test on both hosts asserts the line is at most two lines at phone and desktop widths and that no sibling box moves. The control shows a replace affordance at rest or on hover by the design law, the drag-over state differs from focus, and the control has one accessible name.

## Evidence

Filled at landing: what ran and where its output is.
