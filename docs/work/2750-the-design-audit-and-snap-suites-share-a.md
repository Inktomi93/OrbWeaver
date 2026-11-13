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

Every case in the browser-driven tooling suites starts its own snap CLI process, at four to five seconds a case. Measured on a quiet box: the CLI takes 1.5 s to print its help, before any browser exists, and 3.0 s without the large-heap option the package script passes; a whole design-audit run of a one-paragraph file page takes 4.6 s. So about a third of each case is the CLI loading its modules, and the rest is the browser launch plus the walk and its settle wait, not yet split. `tests/tooling/ui-audit/index.int.test.ts` has 96 such cases, and the census, session-daemon and other snap suites follow the same shape through `runCli` and `auditRuleTest` in `tests/support/node/tool-fixtures.ts`. Together they are most of the whole run's time and hold the box at full load, which times out unrelated cases.

## Why

The tooling suite takes over twenty minutes and fails a random case per run, so nobody runs it whole.

## Done when

A profile of the CLI child splits a case's time into module load, browser launch and the walk. The largest avoidable parts are removed: the CLI loads only what its flags need, and rule and census cases share one process and browser per file where the subject is the rule, with a small set still driving the real CLI end to end. No assertion is dropped, and the whole run's time and peak load are recorded before and after.

## Evidence

Filled at landing: what ran and where its output is.
