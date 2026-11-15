---
kind: work
status: open
updated: 2026-11-15
priority: P2
area: chat
plan: import-robustness
---

# Cache the regexed history for the context-fit preview

## What

`previewContextFit` in `packages/server/src/domain/chat/verbs/read.ts` re-runs the host's prompt-history regex pass over the whole canon on every call, and any member can call it. Cache the regexed rows per room, keyed on the canon's revision and the effective script set's revision, so a repeat read with nothing changed runs no regex.

## Why

A real HUD preset costs a fraction of a millisecond of CPU per history row, so a member's read of a long chat costs about a second of the host's budget each time the transcript divider asks.

## Done when

Two fit previews of an unchanged room run the history pass once, an edit or a script change runs it again, and the fit numbers equal an uncached build's.

## Evidence

Filled at landing: what ran and where its output is.
