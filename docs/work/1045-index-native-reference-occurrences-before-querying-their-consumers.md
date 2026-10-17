---
kind: tooling
status: open
updated: 2026-10-17
priority: P1
area: tooling
plan: native-occurrence-index
---

# Index native reference occurrences before querying their consumers

## What

After executing-input currentness integrates, replace bulk per-declaration reference searches with occurrence facts in the existing native SQLite store. Preserve world-specific binding identity, alias relationships and public reference projections. Keep exact native queries explicit until equivalent indexed coverage qualifies.

## Why

Repeated declaration-oriented searches can repeat program-wide reference work. A reverse occurrence relation makes consumer lookup a database query without introducing another checker or store.

## Done when

Complete native reference controls preserve aliases, declarations, contextual and shorthand members, computed and namespace uses, type/value meaning and conditional worlds. Dependency changes invalidate affected unchanged consumers. Coherent publication, pinned readers, disposal and overlays remain correct. Matching complete-world wall time and physical memory demonstrate improvement; no source population is dropped. Invocation-only cost is attributed separately rather than blamed on an inactive bulk-reference family.

## Evidence

Filled at landing: what ran and where its output is.
