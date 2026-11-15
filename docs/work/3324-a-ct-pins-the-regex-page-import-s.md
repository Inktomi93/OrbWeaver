---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: regex
---

# A CT pins the Regex page import's notes beside its result

## What

Mount the Regex config band's Import door, import a SillyTavern script whose placement has no target here, and assert the result toast carries the import's note.

## Why

useImportRegexMember in packages/client/src/features/regex/hooks/use-regex-collection.ts now shows `notes`, and no browser test covers it.

## Done when

A CT through the real file door is red when the notes are dropped and green on the branch.

## Evidence

Filled at landing: what ran and where its output is.
