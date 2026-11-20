---
kind: work
status: open
updated: 2026-11-20
priority: P3
area: inference
---

# Decide whether the contracts generation-capability read is a second home of generationOf

## What

packages/contracts/src/inference/capability/reads.ts exports requireGenerationCapability, which throws a plain Error when a capability has no generation half; packages/inference/src/contract/resolved.ts exports generationOf, the one generation read every inference runner now calls. The preset resolver in packages/server/src/domain/preset/verbs/resolve-effective.ts calls the contracts copy.

## Why

One home per concept: if both answer the same question, a fix to one misses the other; if they differ by tier on purpose, the headers should say so.

## Done when

Either the server caller reads through one shared home and the second copy is deleted, or both file headers name why the two tiers each need their own read and what error each throws.

## Evidence

Filled at landing: what ran and where its output is.
