---
kind: tooling
status: open
updated: 2026-11-23
priority: P3
area: tooling
plan: unwired-code
---

# The old unwired engines are deleted

## What

Every scan now runs on the graph: params, columns, fields and the member scan moved, and scan.ts and language-service.ts are deleted. What is left of engine one has no scan caller: the remaining parts of classify.ts, occurrences.ts, key-resolver.ts, handoffs.ts and type-members.ts (field-declarations.ts reads type-members for brand-flow, so that reader moves first), the per-world programs and bridge, and the engine-one internals 3922 and 3923 left unread (occurrences.ts propertyFacts beyond constructionWrites, open-sends.ts leftovers). Each module's remaining reader is named in the 3923 lane report under reports/lanes/.

## Why

D357; this closes 3856, 3858, 3860 and 3864.

## Done when

No file under tooling/src/unwired imports typescript except the ports census D357 names; the listed modules are gone with their tests; design.md describes one engine; the unwired suites pass.

## Evidence

Filled at landing: what ran and where its output is.
