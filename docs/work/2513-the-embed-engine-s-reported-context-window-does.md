---
kind: work
status: doing
updated: 2026-11-11
priority: P3
area: embeddings
lane: wt/agent-a06d7ca7c655446af
---

# The embed engine's reported context window does not reach the card text cap

## What

packages/server/src/domain/character/verbs/load-card-text.ts caps the card text it hands to embedding by a fixed bound that also feeds the content hash. The embedding engine reports its real context window at runtime, and that report is not threaded into the cap. The comment recorded this as deferred, citing a list in a report that is not in the repository.

## Why

A card longer than the engine's window is truncated or refused by the engine instead of by a cap the hash knows about, and a model with a larger window is under-used.

## Done when

The cap reads the resolved engine window with the fixed bound as its fallback, the content hash still changes exactly when the embedded text changes, and a test covers a window smaller and larger than the fallback. Or a recorded decision keeps the fixed bound with its reason.

## Evidence

Filled at landing: what ran and where its output is.
