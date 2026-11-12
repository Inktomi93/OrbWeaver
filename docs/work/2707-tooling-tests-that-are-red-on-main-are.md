---
kind: tooling
status: blocked
updated: 2026-11-12
priority: P2
blocked: owner
plan: checked-law
---

# Tooling tests that are red on main are triaged and fixed

## What

A whole run of `pnpm test:tools` on main fails in a few files that pass alone. The product findings and stale fixtures from the first triage are fixed. What remains are type-aware lint and dependency-cruiser self-tests that outrun their time inside a whole run: `tests/tooling/eslint-tests-coverage.int.test.ts`, `tests/tooling/native-response-lint.int.test.ts`, `tests/tooling/native-ui-satellite-boundary.test.ts`, the checker pass in `tests/tooling/native-compose-query-boundary.test.ts`, and the throttle ratio in `tests/tooling/snap/ops/motion-throttle.suite.int.test.ts`. The caption miscount has its own item. Tooling tests are outside the product test command, the pre-push list and CI.

## Why

A red tooling test is a checker nobody is watching, and some of these hold rules the law cites.

## Done when

Each remaining self-test either runs fast in-process or is deleted, as the owner ruled for tests that test the tester; none gets a larger time budget. The owner confirms the deletions first, because some of these files check rules the law cites. A whole run of `pnpm test:tools` passes on main.

## Evidence

Filled at landing: what ran and where its output is.
