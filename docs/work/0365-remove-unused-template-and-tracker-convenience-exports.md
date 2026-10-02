---
kind: work
status: open
updated: 2026-10-02
priority: P3
area: contracts
---

# Remove unused template and tracker convenience exports

## What

Remove TEMPLATE_DEF_BY_ID and resolveTrackerCarriers after confirming their complete consumers. Preserve TEMPLATE_DEFS and the live tracker carrier predicates and projections.

## Why

Only tests consume the eager template lookup or tracker filter wrapper. The actual template drill-in searches TEMPLATE_DEFS, and live tracker projections already use carriesTracker through trackersForCarrier.

## Done when

Check structural, alias, barrel and literal consumers. Preserve registry coverage, template capabilities and slot assertions against the canonical table. Preserve tracker grant, revoke and game-subject behavior assertions against live predicates or projections. Remove helper-only tests and stale runtime claims without adding replacement wrappers. Run affected focused suites; do not change RPG rules or template selection behavior.

## Evidence

Filled at landing: what ran and where its output is.
