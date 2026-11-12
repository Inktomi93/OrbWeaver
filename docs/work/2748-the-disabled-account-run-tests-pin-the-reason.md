---
kind: work
status: open
updated: 2026-11-12
priority: P3
area: workloads
plan: authorization-and-visibility
---

# The disabled-account run tests pin the reason and the retry

## What

In `tests/server/domain/workloads/funding.int.test.ts` the queued-run case asserts a failed run without its reason, and no case retries a run while the paying account is disabled.

## Why

A run that fails for another cause, or a retry that spends, would pass.

## Done when

The queued-run case asserts the `run_account_disabled` reason, and a case retries while disabled and after re-enable, both through the production verbs.

## Evidence

Filled at landing: what ran and where its output is.
