---
kind: work
status: doing
updated: 2026-11-15
priority: P3
area: inference
lane: wt/agent-a5487884af20f9847
---

# NanoGPT serves embeddings and rerank from their own lists

## What

NanoGPT lists embedding models at /api/v1/embedding-models and serves /api/v1/embeddings and a rerank route, outside /models. Read those lists as their kinds and add `embed` to the row's `serves`.

## Why

A NanoGPT user who wants memory recall needs a second provider today.

## Done when

A NanoGPT key lists its embedding models as embedders, and an embed connection on one embeds through the row.

## Evidence

Filled at landing: what ran and where its output is.
