---
kind: decision
status: open
updated: 2026-09-25
priority: P3
---

# Decide whether corpus search surfaces segment-only blocks

## What

packages/server/src/domain/search/verbs/corpus.ts:5-6: a segment forms a BlockKey only when a tier-0 digest matches it. Verbatim segments with no digest yet are dropped, so the most recent, not-yet-digested chat content is invisible to cross-chat corpus search. Decide whether that is intended or whether corpus should surface segment-only blocks under a segment-derived BlockKey.

## Why

Confirmed live in code at corpus.ts:5-6. Without a decision this stays an unexplained gap in search recall for recent content.

## Done when

The owner has ruled. Either corpus surfaces segment-only blocks, with a test, or the flag becomes a FLAG\[name] design marker that states the reason.

## Evidence

Filled at landing: what ran and where its output is.
