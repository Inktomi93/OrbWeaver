---
kind: bug
status: open
updated: 2026-10-22
priority: P3
plan: test-foundation
---

# e2e specs assert copy text instead of production constants

## What

Existing e2e specs match literal copy such as Start a temp chat and No chat selected, and the render-truth spec clicks a literal Settings instead of importing the label constant.

## Why

Spine-Testing section 10 imports labels from their production home; a copy literal makes tests fail on wording changes and pass on behaviour changes.

## Done when

Selected specs locate controls by test id, role or the production label constant. Assertions still prove behavior, not only that a label renders. Apply this with the owning replacement cases.

## Evidence

Filled at landing: what ran and where its output is.
