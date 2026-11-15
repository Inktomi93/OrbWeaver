---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: inference
---

# A facts read names its reach with two booleans instead of one mode

## What

The resolver's read args carry cachedFacts (held facts only) and listFacts (the model list, no per-model probe) as two optional booleans, with held outranking list. Inside the resolver they fold to one three-valued reach. A single reach field on the resolve args would close the combination by type, but it renames cachedFacts across many suites that pass it to the runtime.

## Why

Two flags that exclude each other leave an impossible combination open that the code resolves by precedence.

## Done when

The resolve args take one reach field of held or list, every caller and fixture passes it, and no boolean pair remains.

## Evidence

Filled at landing: what ran and where its output is.
