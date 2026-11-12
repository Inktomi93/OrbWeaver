---
kind: tooling
status: open
updated: 2026-11-12
priority: P2
plan: checked-law
---

# Tooling tests that are red on main are triaged and fixed

## What

A whole run of `pnpm test:tools` on main fails in a handful of files that pass when run alone or in small groups. The product findings and stale fixtures from the first triage are fixed (the recipe erasure reader, the tsconfig read, the cross-feature fixture, the compose-query hook budget, one slow tag). What remains fails only inside a whole run: `tests/tooling/eslint-tests-coverage.int.test.ts` and `tests/tooling/native-response-lint.int.test.ts` and `tests/tooling/native-ui-satellite-boundary.test.ts` time out, the checker pass in `tests/tooling/native-compose-query-boundary.test.ts` hits its own spawn timeout, `tests/tooling/snap/ops/motion-throttle.suite.int.test.ts` reads a throttle ratio under its floor, and `tests/tooling/ui-audit/ops/walker/census-text.int.test.ts` fails one caption case. Tooling tests are outside the product test command, the pre-push list and CI.

## Why

A red tooling test is a checker nobody is watching, and some of these hold rules the law cites.

## Done when

Each remaining file is classed as a real defect or a load-sensitive case. A load-sensitive case gets a budget that scales with the run or a signal that does not depend on wall time, without weakening what it proves. A whole run of `pnpm test:tools` passes on main.

## Evidence

Filled at landing: what ran and where its output is.
