---
kind: work
status: open
updated: 2026-11-07
priority: P3
area: tooling
plan: test-foundation
---

# Derive every snap ceiling from one bases table

## What

Replace the paired constants with a bases record and a mapped ceilings record, and make `driveBudgets` take ceilings. Group LP3 in the ledger triage, reports/codex-test-audit/ledger-triage.md, holds the rows, causes and the defect control that must go red first.

## Why

A ceiling that stops stretching false-reds real steps under load while its test stays green.

## Done when

No hand-paired `_TIMEOUT_MS` line remains, and swapping `max` for either side fails an unequal-ceilings case.

## Evidence

Filled at landing: what ran and where its output is.
