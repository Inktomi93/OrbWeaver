---
kind: work
status: open
updated: 2026-10-24
priority: P3
area: tests
---

# The corpus carries an empty-Explore subject

## What

0963 cases AR13 and AR14 (the empty Corpus Explore finder) cannot be built: the corpus owner has 33 of 38 characters distilled and no verb clears digests, so no subject renders the empty state.

## Done when

The corpus publishes a principal (or capture) with characters and zero digests, and `tests/client/features/discovery/components/corpus-explore-empty.ct.tsx` covers AR13 and AR14 through it.

## Evidence

Filled at landing: what ran and where its output is.
