---
kind: work
status: open
updated: 2026-10-14
priority: P2
area: inference
plan: test-foundation
---

# Rebuild reranker-live on the real recall and vector graph

## What

Replace legacy helpers in `scripts/probes/reranker-live/run.ts` with composed search, databank and chat operations. Seed through production generation and corpus writes. Script only the provider embedding edge; keep actual reranker calls opt-in. Coordinate embedding-owner seams with compose cleanup.

## Why

Copied search and chat contexts invent role clients, embedding state and fallback ownership. Existing production doors are present; isolated injectable composition remains incomplete.

## Done when

Remove legacy helper imports and the partial databank context cast. Preserve text and late-closing recall, Smart and databank cuts, every omnibox target, speaker cuts, reach, seed upgrade, user choice, reboot, cold and token cases. A deterministic composed test must fail on a production scoping or rerank defect. Keep live engine calls opt-in.

## Evidence

Filled at landing: what ran and where its output is.
