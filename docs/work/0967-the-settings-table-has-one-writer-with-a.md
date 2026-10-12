---
kind: work
status: open
updated: 2026-10-12
priority: P1
plan: inference-flow
---

# The settings table has one writer with a prefix-scoped port

## What

domain/settings exposes a prefix-scoped key-value port over the settings table, with tenant prefixes in a registered tuple. domain/connection builds the runtime SnapshotStore on it and drops its direct settings import (persistence/catalog-snapshot.ts). Extend own-tables-only to judge the write half inside persistence/. Fix the stale openrouter-model-catalog key in the schema header and tests, and the inspect config comment that calls the table small.

## Why

Two laws disagree about the table (Tier-1 invariant 6, Core-0 section 8) and no gate sees a cross-owner write inside persistence/.

## Done when

No module outside domain/settings imports the settings table; a tenant cannot write outside its prefix (test); own-tables-only reds a planted cross-owner persistence write; both law sections state the ruling.

## Evidence

Filled at landing: what ran and where its output is.
