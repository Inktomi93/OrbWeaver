---
kind: work
status: open
updated: 2026-10-19
priority: P3
---

# Adjudicate the uncommitted chat edit-verb follow-on from the 907 lane

## What

The stopped 907 lane (worktree agent-a4fd81354ff8efecd, on c6ede5a58d) left uncommitted edits to packages/server chat messages.ts, errors.ts, canon-write.ts, queries.ts and verbs/edit.ts after 907 landed. Saved as reports/review/salvage/agent-a4fd81354ff8efecd.patch.

## Why

Unmerged edits to a chat write verb are either an unfinished fix or abandoned drafts; leaving them unjudged risks losing a real correction.

## Done when

The patch is read against main: each hunk is merged with a test, or recorded as superseded or abandoned with the main commit that covers it.

## Evidence

Filled at landing: what ran and where its output is.
