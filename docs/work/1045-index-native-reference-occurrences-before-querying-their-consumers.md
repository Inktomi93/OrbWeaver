---
kind: tooling
status: open
updated: 2026-10-18
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

Reference-family attribution identifies separate bulk, exact and invocation query owners. The existing SQLite relation indexes declaration references. Evidence: `reports/review/1045-reference-family-attribution.md`.

Reviewed occurrence production indexes eligible function-local declarations and retains explicit native fallback for unsupported relationships. Ordinary SDK delivery preserves reference projections, dependency invalidation, overlays and reader lifetimes. Broad occurrence coverage and complete-world cost remain open. Evidence: `reports/review/1045-native-occurrence-ordinary.md` and `reports/review/1045-native-occurrence-independent.md`.

Member and module occurrence production passes bounded parity controls and independent review. Empty search names retain native fallback. Source and derived lockfile are integrated. Fresh installed-SDK, SQLite and public AST controls pass in an isolated main-derived checkout. Shared-main installation and complete-world cost remain open. Prior evidence keeps its original compiler identity. Evidence: `reports/review/1045-native-families-installed.md` and `reports/review/1045-native-family-occurrences-independent.md`.
