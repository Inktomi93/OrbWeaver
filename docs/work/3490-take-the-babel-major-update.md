---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: tooling
---

# Take the Babel major update

## What

The Dependabot update to the next Babel major fails typecheck: the package now ships its own types and the tooling that calls it reads the old type package's shapes.

## Why

The update stays open and blocks the majors group.

## Done when

The Babel update is applied, the old type package is removed where the new one replaces it, and typecheck and the tooling tests that use Babel pass.

## Evidence

Filled at landing: what ran and where its output is.
