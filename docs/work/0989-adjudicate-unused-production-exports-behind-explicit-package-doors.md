---
kind: work
status: doing
updated: 2026-10-12
priority: P2
area: packages
lane: codex/production-exports-989
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

Native production Knip completes on `08ca7b6d38`; raw inventory is `reports/knip-production-findings.json`. Reconciliation at `dbee8aaaf8` removes only stale baseline keys. Unbaselined findings stay visible; repeated export locations do not prove dead implementations. The memory work item owns measurement limitations.

The reviewed client, DB and kit re-export batch is merged at `f2101d2246`, including the evaluation-preserving codemod correction at `dba31a7efc`. Independent review confirms the complete batch. The emitted-ESM controls, scoped lint and affected native compiler programs pass. Declarations, implementations, same-package callers and uncertain consumers remain unchanged. The plan records the retained macro API vocabulary.

The grouped native projection completes across its full world roster. Its work set and affected-program results remain in the production-export worktree's `reports/` directory. Native inventory reconciliation is merged at `d9b30cc9d3`: the baseline removes only proven stale keys. Unbaselined file, export and type findings remain visible. This partial batch does not complete symbol adjudication.

The UI batch is merged at `526b6a207f` after confirmed review and the target-path correction at `66170cac0a`. Exact re-export removals preserve primitive parts, named API vocabulary and module requests. Named test routes are not production callers. Real CLI controls reject traversal targets and validate dependency identity, physical containment and complete native origins before mutation. Five affected native programs pass; legacy-node compilation fails in untouched server fixtures. Only proven stale baseline keys are removed; this partial batch does not complete adjudication.

Use existing `pnpm ast apisurface` results for package-boundary consumption and alias-resolved origin identity. Use `rot`, `dead` and their existing collectors for chains, type-only value references and namespace consumption. These report candidates: scripts/tooling can count as public consumers there, but cannot establish application production use.

Drive one batched codemod from the native production inventory and adjudicated symbol origins. Reuse `tooling/src/codemod` plans and export helpers; extend their type-only/alias handling only where required. Remove unused barrel re-exports separately from declaration exports and implementation deletion. Preserve same-package imports, side effects, dynamic/registry use and supported external APIs. Keep ambiguous candidates as unresolved decisions, not allowlist entries.

Freeze candidate and edit scope against the landed compose wave before applying. Review one cohesive diff, check affected native programs and relevant behavior, then reconcile the shrink-only native inventory. Do not run a separate typed workspace for each symbol or build another liveness gate.
