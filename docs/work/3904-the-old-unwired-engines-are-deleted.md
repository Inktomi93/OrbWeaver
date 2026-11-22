---
kind: tooling
status: open
updated: 2026-11-22
priority: P3
area: tooling
plan: unwired-code
---

# The old unwired engines are deleted

## What

After every scan runs on the graph, the TypeScript 6 language service (language-service.ts, classify.ts), the per-world programs and bridge, occurrences.ts, key-resolver.ts, handoffs.ts, type-members.ts and scan.ts have no caller.

## Why

D357; this closes 3856, 3858, 3860 and 3864.

## Done when

No file under tooling/src/unwired imports typescript; the listed modules are gone with their tests; design.md describes one engine; the unwired suites pass.

## Evidence

Filled at landing: what ran and where its output is.
