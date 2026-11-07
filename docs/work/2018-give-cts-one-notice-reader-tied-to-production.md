---
kind: work
status: open
updated: 2026-11-07
priority: P3
area: tests
plan: test-foundation
---

# Give CTs one notice reader tied to production copy

## What

Add the notice read to `@orb/testkit/ct`, move these three cases onto it, and refuse the bare first-alert spelling. Group LK2 in the ledger triage, reports/codex-test-audit/ledger-triage.md, holds the rows, causes and the defect control that must go red first.

## Why

A generic failure toast satisfies a case whose whole claim is that the specific refusal is still said.

## Done when

Dropping the reason switch in `characterRefusalCopy` turns 508 and 510 red. Routing both warning codes to one notice turns 526 red. The lint refuses a planted first-alert read.

## Evidence

Filled at landing: what ran and where its output is.
