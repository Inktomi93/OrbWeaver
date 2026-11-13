---
kind: tooling
status: doing
updated: 2026-11-13
priority: P2
area: tooling
lane: wt/agent-ab07c667afb044383
plan: checked-law
---

# The design-audit and snap suites share a browser across cases

## What

Every case in the browser-driven tooling suites starts its own snap CLI process, at four to five seconds a case. Measured on a quiet box with the package script's heap option: the CLI takes about 1.3 s to print its help, before any browser exists, and a whole design-audit run of a one-paragraph file page takes 4.6 s. The start cost is module loading. Two static imports remain: `tooling/src/snap/ops/stage-source.ts` imports `@orb/db` (0.7 s alone) for `localPath`, `createDb` and `preCloseHousekeeping`, and `tooling/src/floor/browser/browser.ts` imports the server env record (0.35 s) for one constant. Lighthouse is already loaded on use. The other three seconds are the browser launch plus the walk and its settle wait, not yet split. `tests/tooling/ui-audit/index.int.test.ts` has 96 such cases, and the census, session-daemon and other snap suites follow the same shape through `runCli` and `auditRuleTest` in `tests/support/node/tool-fixtures.ts`.

## Why

The tooling suite takes over twenty minutes and fails a random case per run, so nobody runs it whole.

## Done when

A profile of the CLI child splits a case's time into module load, browser launch and the walk. The largest avoidable parts are removed: the CLI loads only what its flags need, and rule and census cases share one process and browser per file where the subject is the rule, with a small set still driving the real CLI end to end. No assertion is dropped, and the whole run's time and peak load are recorded before and after.

## Evidence

Filled at landing: what ran and where its output is.
