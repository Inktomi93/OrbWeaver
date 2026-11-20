---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: search
---

# Recall shows the score of a reranked digest it drops

## What

`packages/kit/src/rerank/index.ts` applies no score floor, so recall can drop or keep a digest at any score. Either measure and set a floor, or have the recall trace show each digest's score.

## Why

Without the score a player cannot tell why a plausible memory was or was not recalled.

## Done when

The recall trace lists the score of each candidate, or a measured floor exists with a test.

## Evidence

Filled at landing: what ran and where its output is.
