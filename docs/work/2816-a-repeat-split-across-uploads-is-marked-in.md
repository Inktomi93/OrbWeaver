---
kind: bug
status: doing
updated: 2026-11-13
priority: P3
area: server
lane: wt/agent-a9c11f23be40e8385
plan: import-robustness
---

# A repeat split across uploads is marked in the merged import preview

## What

The repeat flag is judged per upload, and the preview merge in `packages/contracts/src/import/preview.ts` keeps each upload's own flag. A folder past one upload's size can put equal content in two uploads, and the merged preview counts both as writes.

## Why

For a large folder the preview claims more writes than the run makes.

## Done when

Two uploads sent as the planner sends them, holding equal presets and backgrounds, merge to a preview whose unflagged entries equal the run's writes, with a test.

## Evidence

Filled at landing: what ran and where its output is.
