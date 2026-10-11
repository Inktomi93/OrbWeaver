---
kind: tooling
status: doing
updated: 2026-10-11
priority: P2
area: tooling
lane: wt/agent-ab4068ef65b2864f9
---

# Tests import package internals through subpaths

## What

About a third of test files reach package internals by relative path (for example ../../../../packages/server/src/transport/jobs/...) because package exports are root-only, against law rule 2 (package names cross-package).

## Why

Owner ruling: tests import via package subpaths, not relative paths into other packages.

## Done when

Tests reach package internals through a sanctioned subpath (a test-visible conditional export or imports map) instead of ../ into packages; the relative-into-packages form is refused by a gate; all test files are migrated and the affected suites pass.

## Evidence

Filled at landing: what ran and where its output is.
