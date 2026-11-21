---
kind: work
status: open
updated: 2026-11-21
priority: P3
area: connection
---

# A capability fact can show where it came from

## What

capabilityEvidenceSchema (packages/contracts/src/inference/capability/override.ts) records tier, date and cite for a fact, but the folded capability the client gets carries no per-field provenance, so the connection editor can only say assumed.

## Why

A capability is a claim, and the reader cannot see whether it was measured, curated or advertised.

## Done when

The capability read carries per-field provenance from the fold, the connection editor shows the source and date on each fact row, and a test covers a curated and a measured fact.

## Evidence

Filled at landing: what ran and where its output is.
