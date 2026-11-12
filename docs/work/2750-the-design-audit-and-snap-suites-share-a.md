---
kind: tooling
status: open
updated: 2026-11-12
priority: P2
area: tooling
plan: checked-law
---

# The design-audit and snap suites share a browser across cases

## What

Every case in the browser-driven tooling suites starts its own CLI process and its own headless Chromium, at about five seconds a case. `tests/tooling/ui-audit/index.int.test.ts` has 96 such cases, and the census, session-daemon and other snap suites follow the same shape through `runCli` and `auditRuleTest` in `tests/support/node/tool-fixtures.ts`. Together they are most of the whole run's time and hold the box at full load, which times out unrelated cases.

## Why

The tooling suite takes over twenty minutes and fails a random case per run, so nobody runs it whole.

## Done when

The rule and census cases run against one browser per file or per worker, a small set of cases still drives the real CLI end to end, no assertion is dropped, and the whole run's time and peak load are recorded before and after.

## Evidence

Filled at landing: what ran and where its output is.
