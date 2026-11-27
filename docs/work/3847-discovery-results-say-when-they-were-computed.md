---
kind: work
status: doing
updated: 2026-11-27
priority: P3
area: client
lane: wt/agent-aa8988717799db7a7
plan: unwired-code
---

# Discovery results say when they were computed

## What

Recompute provenance has no reader: duplicateCharacterPairs.model, duplicateCharacterPairs.computedAt, duplicateChatPairs.computedAt, keywordCooccurrence.computedAt, characterKeywordProfiles.computedAt, digestThemeAssignments.computedAt.

## Why

Owner ruling : data collected and never shown is a product item. Duplicate and keyword results go stale between recomputes.

## Done when

Each discovery result list shows its last compute time, and the duplicate list its embedding space, through the existing reads.

## Evidence

Filled at landing: what ran and where its output is.
