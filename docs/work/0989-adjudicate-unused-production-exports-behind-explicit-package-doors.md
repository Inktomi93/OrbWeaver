---
kind: work
status: doing
updated: 2026-10-18
priority: P2
area: packages
lane: wt/claude-fabrication-1041
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

The reviewed client, DB and kit re-export batch is merged at `f2101d2246`, including the evaluation-preserving codemod correction at `dba31a7efc`. Independent review confirms the complete batch. The emitted-ESM controls, scoped lint and affected native compiler programs pass. Declarations, implementations, same-package callers and uncertain consumers remain unchanged. The plan records the retained macro API vocabulary.

The grouped native projection completes across its full world roster. Its work set and affected-program results remain in the production-export worktree's `reports/` directory. Native inventory reconciliation is merged at `d9b30cc9d3`: the baseline removes only proven stale keys. Unbaselined file, export and type findings remain visible. This partial batch does not complete symbol adjudication.

Reviewed UI removals at `526b6a207f` and `66170cac0a` preserve primitive parts, API vocabulary and module requests. CLI controls reject traversal and wrong dependency, containment or native origins. Affected programs pass; legacy-node retains fixture diagnostics. Named test routes are not production callers. This partial batch does not complete adjudication.

Follow the [foundation plan's public-door order](../plans/test-foundation/design.md#public-doors-and-production-usage). AST consumption and native inventory supply candidates, not authority. Preserve module evaluation, same-package and registry consumers and deliberate API contracts. Ambiguous cases remain unresolved; add no fake consumer or liveness gate.

Reviewed non-macro kit cleanup removes obsolete exports and dead implementations while preserving canonical macro identity. The baseline drops only matching stale keys. Kit/iso programs and retained kit cases pass; legacy remains red without an exact baseline. Test-supported surfaces and CSS-oracle models remain production API decisions, not established application consumers. Evidence: `reports/review/989-kit-nonmacro-independent.md`.

Reviewed kit cleanup narrows internal exports and moves meaningful cases to public callers. Scoped native checks pass; legacy types remain red. Only exact stale baseline keys leave. CSS models await real producer/renderer qualification. Evidence: `reports/review/989-kit-b1b2-independent.md`.

Reviewed client data doors preserve module evaluation and legacy cases. Native consumer roles stay explicit; scoped legacy failures remain red. Only exact stale keys leave. Evidence: `reports/review/989-client-data-independent.md`.
