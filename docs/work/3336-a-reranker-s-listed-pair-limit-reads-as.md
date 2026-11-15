---
kind: bug
status: open
updated: 2026-11-15
priority: P2
area: connection
plan: cross-surface-consistency
---

# A reranker's listed pair limit reads as stated, not assumed

## What

A hosted rerank list states how many documents one request may carry. The capability records that limit as assumed, so the readout marks it as a guess and the rerank caller does not trust it. NanoGPT and OpenRouter rerankers both show this.

## Why

A limit the provider published should bound the request and read as a fact; a guess mark tells the user to check something that is already known.

## Done when

A case over the NanoGPT and OpenRouter rerank list readers shows the pair limit recorded as stated with its source, and the rerank caller bounding a request by it.

## Evidence

Filled at landing: what ran and where its output is.
