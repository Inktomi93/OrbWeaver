---
kind: work
status: doing
updated: 2026-11-09
priority: P3
area: client
lane: wt/agent-aed439736e8f3a94a
plan: cross-surface-consistency
---

# Re-review P3 bundle for the avatar reach, review bundle and audit merges

## What

From the cb-reach2-p3c code review report under reports/code-reviewer: in selection mode the avatar reach takes part of the Select message checkbox's touch square (message-row\.tsx:387), and the reach probe neither enters selection mode nor matches role=checkbox and passes vacuously at a fine pointer unless the row is hovered; the avatar header gap widens inline as well as vertically, so the whisper header newly wraps at 390 coarse, compact, 125% text; the density re-declaration in tokens.build.ts misses tokens that read density through another token; the census clamp branch excludes a one-line clamp with no overflow clip that shows every line (census-text.ts); a stale Attach comment at regex-placement-labels.ts:178.

## Why

Each leaves a covered target, an unseen probe path or a detector gap the merged work did not settle.

## Done when

Each finding is fixed with a CT or fixture, or answered with a cited reason in this item's Evidence.

## Evidence

Filled at landing: what ran and where its output is.
