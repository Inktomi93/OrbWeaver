---
kind: work
status: open
updated: 2026-10-18
priority: P2
area: packages
plan: test-foundation
---

# Adjudicate unused production exports behind explicit package doors

## What

Use the native production Knip inventory and shrink-only baseline to review unused public re-exports and implementation exports in cohesive package or domain batches. Remove unnecessary surface, follow real callers, delete genuinely unused code, and retain deliberately supported external APIs with their actual contract. Explicit package paths are implemented; symbol-level adjudication is not complete.

## Why

Closing wildcard package paths exposes unused symbols but does not remove them. Tests and tooling must not keep production code falsely alive, and a baseline entry is debt rather than authority.

## Done when

The recorded production inventory is fully adjudicated in package/domain batches. Each batch records production roots and consumer scope. Removed exports preserve real callers; retained external APIs have explicit contracts. Baseline debt shrinks without new exemptions. No custom liveness reader or fake consumer is added.

## Evidence

Native production Knip completes; raw inventory is `reports/knip-production-findings.json`. Reviewed server barrel removals preserve declarations and evaluation. Affected programs and lint qualify with inherited Node diagnostics. Only proven stale baseline keys are removed; other findings remain. Evidence: `reports/review/989-server-door-adjudication-ordinary.md`.

Reviewed client, DB and kit re-exports preserve module evaluation, implementations and uncertain consumers. Scoped lint and affected native programs pass. Evidence: `f2101d2246` and `dba31a7efc`. The plan retains macro API vocabulary.

The grouped native projection covers its full world roster. Reconciliation at `d9b30cc9d3` removes only proven stale baseline keys. Unbaselined findings stay visible; symbol adjudication remains open.

Reviewed UI removals at `526b6a207f` and `66170cac0a` preserve primitive parts, API vocabulary and module requests. CLI controls reject traversal and wrong dependency, containment or native origins. Affected programs pass; legacy-node retains fixture diagnostics. Named test routes are not production callers. This partial batch does not complete adjudication.

Follow the [foundation plan's public-door order](../plans/test-foundation/design.md#public-doors-and-production-usage). AST consumption and native inventory supply candidates, not authority. Preserve module evaluation, same-package and registry consumers and deliberate API contracts. Ambiguous cases remain unresolved; add no fake consumer or liveness gate.

Reviewed non-macro kit cleanup removes obsolete exports and dead implementations while preserving canonical macro identity. The baseline drops only matching stale keys. Kit/iso programs and retained kit cases pass; legacy remains red without an exact baseline. Test-supported surfaces and CSS-oracle models remain production API decisions, not established application consumers. Evidence: `reports/review/989-kit-nonmacro-independent.md`.

Reviewed kit cleanup narrows internal exports and moves meaningful cases to public callers. Scoped native checks pass; legacy types remain red. Only exact stale baseline keys leave. CSS models await real producer/renderer qualification. Evidence: `reports/review/989-kit-b1b2-independent.md`.

Reviewed client state doors preserve evaluation, public contracts and legacy cases. Retained decisions and compiler reds stay explicit. Only exact stale keys leave. Evidence: `reports/review/peer-state-population-independent.md`.

Reviewed feature-door cleanup preserves emitted module requests, binding targets and legacy assertions. Retained APIs and header decisions remain explicit. Only exact stale baseline keys leave. Evidence: `reports/review/989-feature-door-independent.md`.
