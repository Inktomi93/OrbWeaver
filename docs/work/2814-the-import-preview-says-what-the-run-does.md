---
kind: bug
status: open
updated: 2026-11-13
priority: P2
area: server
plan: import-robustness
---

# The import preview says what the run does with a same-name persona

## What

The persona read-only check in `packages/server/src/domain/persona/persistence/import-write.ts` judges equal content only, while the write merges on a name collision. A persona whose name is taken and whose content differs is previewed as a new write, and the run writes none.

## Why

A user's own persona name repeats across profiles and installs, so the preview misstates the most common persona case.

## Done when

The check answers as the write does for a name collision, and the preview-equals-run test covers a namesake persona with different content, red first.

## Evidence

Filled at landing: what ran and where its output is.
