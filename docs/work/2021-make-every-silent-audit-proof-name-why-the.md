---
kind: work
status: open
updated: 2026-11-07
priority: P2
area: tooling
plan: test-foundation
---

# Make every silent audit proof name why the rule was silent

## What

Add the disposition to `AuditRuleProof`, add `expectPopulation`, and move the five flagged cases and the 62 live silent rows onto it. Group LK5 in the ledger triage, reports/codex-test-audit/ledger-triage.md, holds the rows, causes and the defect control that must go red first.

## Why

A rule that never reached its subject reads the same as a rule that judged it clean, and withheld evidence must never count as clean.

## Done when

Changing `classifyUnreachableHint` to `excluded` turns 165 red. Making a translucent fill unmeasurable turns 149 red. Skipping the pseudo channel's art host turns 76 red. Dropping the fold subject from candidates turns 215 red. A live silent row without a disposition fails `tsc`.

## Evidence

Filled at landing: what ran and where its output is.
