---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: discovery
plan: unwired-code
---

# Run the discovery maintenance verbs as workloads

## What

DiscoveryService.backfillDigestStoryTime and the digest, segment and image hub-score verbs have no caller, while search reads those hub_score columns and only the character pass computes one. Wire them as discovery workloads so every scored kind is scored and the story-time backfill runs.

## Why

Owner ruling: wire the discovery maintenance instead of deleting it.

## Done when

Each verb runs from a workload; search ranks digests, segments and images on computed scores; integration tests prove each score is written and read.

## Evidence

Filled at landing: what ran and where its output is.
