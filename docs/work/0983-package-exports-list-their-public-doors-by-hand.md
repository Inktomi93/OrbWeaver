---
kind: work
status: open
updated: 2026-10-12
priority: P1
plan: test-foundation
---

# Package exports list their public doors by hand

## What

D318: replace the wildcard exports map in kit, contracts, db, server and client with an explicit list of the doors other packages use, plus a declared testing door per package for test-only seams. Derive the first list from the real cross-package imports in production code. Move the test files that import deep internal folders onto a declared door or the testing door. Point knip at the declared exports with tests outside the production run, so an export no production package uses is reported, and baseline today's findings shrink-only for adjudication by area.

## Why

The wildcard made every folder importable from any package and hid dead code from every tool; a declared surface lets the resolver and knip enforce it with no custom tooling.

## Done when

No package exports map carries a wildcard except imports; an undeclared cross-package path fails to resolve; tests reach packages only through declared doors; knip's production run reports unused declared exports against a shrink-only baseline; Core-0 section 2 states the rule.

## Evidence

Filled at landing: what ran and where its output is.
