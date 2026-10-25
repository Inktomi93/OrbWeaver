---
kind: work
status: open
updated: 2026-10-25
priority: P2
area: client
---

# Action groups fit narrow containers without hiding controls

## What

Review non-wrapping action groups across feature TSX. Row defaults to single-line flex and Button defaults to non-wrapping text. The plugin consent row has a measured phone overflow and is being corrected separately. Candidates include UpdateCheckRow in plugin-row-leaves.tsx, ConnectionEditorHeader in connection-editor-unavailable.tsx, and StalenessRow in staleness-row\.tsx. Structural Row matches include nested, conditional and deliberately single-line cases; do not classify them as defects without rendered evidence.

## Why

Container ownership does not make descendants fit. Variable labels and constrained panes can push an action beyond the visible region even when imports and container placement are correct.

## Done when

Adjudicate candidate groups through production-mounted cases at narrow container widths, with long supported labels and enlarged text. Fix confirmed overflow without hiding controls or shrinking hit targets. Consolidate repeated action-group behavior into the appropriate existing or justified primitive contract. Preserve deliberately single-line layouts. Add planted overflow controls and positive controls for action visibility, keyboard reach and focus return. Do not globally make every Row wrap or baseline existing failures.

## Evidence

Filled at landing: what ran and where its output is.
