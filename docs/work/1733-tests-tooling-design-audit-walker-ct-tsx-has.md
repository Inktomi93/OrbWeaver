---
kind: tooling
status: open
updated: 2026-11-06
priority: P2
area: tooling
plan: surface-walk
---

# tests/tooling/design-audit-walker.ct.tsx has no runner: the CT config's chromium project ignores tests/tooling

## What

Run tests/tooling/design-audit-walker.ct.tsx from a root script that selects the tooling project of playwright-ct.config.ts.

## Why

The chromium project ignores tests/tooling (playwright-ct.config.ts:71) and test:ct runs only that project. The tooling project exists at line 99, but no root script selects it, and test:tools is vitest only, so the walker test never runs.

## Done when

A root package.json script runs the tooling project and the walker test executes and passes in it.

## Evidence

Filled at landing: what ran and where its output is.
