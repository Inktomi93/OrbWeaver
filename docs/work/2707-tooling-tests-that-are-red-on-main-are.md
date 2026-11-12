---
kind: tooling
status: open
updated: 2026-11-12
priority: P2
plan: checked-law
---

# Tooling tests that are red on main are triaged and fixed

## What

A whole run of `pnpm test:tools` on main fails in these files: `tests/tooling/native-compose-query-boundary.test.ts` (the file fails to load), `tests/tooling/eslint-container-ownership.test.ts`, `tests/tooling/eslint-tests-coverage.int.test.ts`, `tests/tooling/native-domain-cross-feature-boundary.test.ts` (its fixture trips the parent-climb rule, not the rule it tests), `tests/tooling/native-response-lint.int.test.ts` (it parses a tsconfig that now holds a comment as strict JSON), `tests/tooling/native-ui-satellite-boundary.test.ts`, `tests/tooling/ui-facts/recipe-erasure.test.ts` (undeclared erasures between the button and picture button recipes), `tests/tooling/ui-audit/index.int.test.ts` and `tests/tooling/snap/ops/session-daemon.int.test.ts`. `tests/tooling/snap/ops/session-har.suite.int.test.ts` failed in one run and passed in another. Tooling tests are outside the product test command, the pre-push list and CI, so nothing ran them after the merges that broke them. The run's log is in the session scratch and is not kept; rerun to reproduce.

## Why

A red tooling test is a checker nobody is watching, and some of these hold rules the law cites.

## Done when

Each file is classed as a product finding, a stale fixture or a load-sensitive test, with the commit that broke it named. Product findings are fixed at the site, fixtures are corrected without weakening the case, and load-sensitive cases wait on a real signal. A whole run of `pnpm test:tools` passes on main.

## Evidence

Filled at landing: what ran and where its output is.
