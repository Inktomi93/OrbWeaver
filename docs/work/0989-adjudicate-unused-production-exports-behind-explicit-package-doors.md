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

Use existing `pnpm ast apisurface` results for package-boundary consumption and alias-resolved origin identity. Use `rot`, `dead` and their existing collectors for chains, type-only value references and namespace consumption. These report candidates: scripts/tooling can count as public consumers there, but cannot establish application production use.

Drive one batched codemod from the native production inventory and adjudicated symbol origins. Reuse `tooling/src/codemod` plans and export helpers; extend their type-only/alias handling only where required. Remove unused barrel re-exports separately from declaration exports and implementation deletion. Preserve same-package imports, side effects, dynamic/registry use and supported external APIs. Keep ambiguous candidates as unresolved decisions, not allowlist entries.

Freeze candidate and edit scope against the landed compose wave before applying. Review one cohesive diff, check affected native programs and relevant behavior, then reconcile the shrink-only native inventory. Do not run a separate typed workspace for each symbol or build another liveness gate.
