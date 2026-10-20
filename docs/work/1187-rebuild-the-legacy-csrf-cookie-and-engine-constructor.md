---
kind: work
status: open
updated: 2026-10-20
priority: P1
plan: test-foundation
---

# Rebuild the legacy CSRF, cookie and engine-constructor cases in the maintained suites

## What

Legacy cases that cannot compile without legacy-only machinery (the 1170 census lists them: via-sensitive CSRF, cookie and debug-gate cases, and legacy direct createTurnEngine constructors) keep the legacy typecheck red. Owner ruling: rebuild them now rather than add test-only exports or testkit doors.

## Why

D320 keeps legacy typecheck in CI; the plan forbids exporting production code or building testkit machinery solely for legacy harnesses, so the cases move to their proper layer.

## Done when

CSRF, cookie and debug-gate cases run as e2e specs on the corpus; engine cases run on the server composition root; every listed case is preserved by name with a red-first production control; the legacy copies are deleted; tsconfig.tests-legacy.json and tsconfig.tests-legacy-dom.json typecheck clean.

## Evidence

Filled at landing: what ran and where its output is.
