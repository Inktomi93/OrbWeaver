---
kind: work
status: open
updated: 2026-10-02
priority: P3
area: inference
---

# Trim redundant inference exports and correct surface comments

## What

Review the audited excess exports without deleting live implementations. Remove obsolete package-root tool-server exports together, keep their module-level exports, and narrow the confirmed internal type exports. Correct stale cache-placer and backend-registry surface descriptions.

## Why

The export-intent audit found unused exposure and misleading annotations, not dead inference behavior. Optional package-surface cleanup must preserve callable and nameable contracts.

## Done when

Confirm consumer and signature requirements before narrowing AgentToolResult, AgentToolSpec and createAgentToolServer at the root barrel, and BuiltBackends and FoldResult locally. Preserve the exported BackendDef shape of BACKEND_DEFS. Preserve implementations, canonical type homes, session-store defaults, DI types and valid test seams. Correct only false marker explanations. Run affected type and import checks; do not implement the separate surface-freeze program.

## Evidence

Audit: `/tmp/claude-launch-inference-surface-audit/RESULTS.md`, with exact rows in its `candidates.json`. It finds live implementations, not removable behavior. The root barrel exposes the tool-server members, while the live caller uses their module directly. Preserve that caller and the implementations.

Correct `computeCacheBreakpointPlacements` to name the shared placer and its actual runners. Correct `BACKEND_DEFS` to describe the package's root-only exports rather than its internal imports map. Keep both live exports and their test anchors.

Keep `BackendDef` exported: `docs/law/Tier-3b-Providers.md` names it as the shape of `BACKEND_DEFS`. Its declaration and marker rows describe the same retained type. This is optional surface cleanup, not a launch runtime blocker or authorization for the separate export-freeze work.
