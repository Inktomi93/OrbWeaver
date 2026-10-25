---
kind: bug
status: open
updated: 2026-10-25
priority: P3
area: tooling
---

# snap --dirty boots on a lane worktree

## What

During item 1346 `pnpm snap --dirty` failed to boot four times in a row on band 2 (Vite reset the connection), so the capture set was taken from the commit with --ref.

## Why

A lane cannot capture uncommitted work, so it commits before it can look.

## Done when

The failure is reproduced and its cause fixed; snap --dirty boots on a lane worktree on the first try, with the run recorded.

## Evidence

Filled at landing: what ran and where its output is.
