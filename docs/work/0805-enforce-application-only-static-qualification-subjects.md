---
kind: tooling
status: doing
updated: 2026-10-08
priority: P1
area: verification
lane: codex/product-static-boundary
---

# Enforce application-only static qualification subjects

## What

Give product CI a complete native application static population that excludes tooling-only subjects while retaining application type worlds, ownership, imports and structural invariants.

## Why

Whole-tree static verification mixes checker implementation diagnostics with evidence about the application.

## Done when

Native positive controls reject application and cross-world defects. Tooling-only controls do not veto product qualification. Product compiler and policy populations are complete, preserve import closures and reuse canonical ownership without filtered diagnostics or dual owners.

## Evidence

Filled at landing: what ran and where its output is.
