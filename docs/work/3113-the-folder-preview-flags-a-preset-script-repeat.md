---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: import
plan: import-robustness
---

# The folder preview flags a preset script repeat across a split folder's uploads

## What

Each upload of a split SillyTavern folder judges its own preset scripts, and `mergeImportPreviews` in `packages/contracts/src/import/preview.ts` flags no script repeat across uploads. Card and global scripts are not in the preview, so an exact cross-upload flag also needs them listed.

## Why

A split folder's preview can call a script new that an earlier upload's run already adds.

## Done when

A split-folder dry run flags a preset script that an earlier upload adds, by the regex domain's own key digests.

## Evidence

Filled at landing: what ran and where its output is.
