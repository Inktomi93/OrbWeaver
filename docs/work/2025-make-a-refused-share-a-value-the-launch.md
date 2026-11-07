---
kind: work
status: open
updated: 2026-11-07
priority: P2
area: tooling
plan: test-foundation
---

# Make a refused share a value the launch cannot skip

## What

Fold `shareLaunchRefusal` into `startLaunch` as a union result, and update `prepareLaunch` and the tests. Group LP2 in the ledger triage, reports/codex-test-audit/ledger-triage.md, holds the rows, causes and the defect control that must go red first.

## Why

Deleting one guard puts a public relay in front of an SSO box with every test green.

## Done when

`startLaunch` on an oidc or forward-header box with `share` returns `refused`, and `ops/start.ts` cannot reach a spawn without narrowing it.

## Evidence

Filled at landing: what ran and where its output is.
