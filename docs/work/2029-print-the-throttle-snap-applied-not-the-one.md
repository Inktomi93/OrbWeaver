---
kind: work
status: open
updated: 2026-11-07
priority: P3
area: tooling
plan: test-foundation
---

# Print the throttle snap applied, not the one it was asked for

## What

Return the applied throttle, build both records from it, and add the recording-session case. Group LP6 in the ledger triage, reports/codex-test-audit/ledger-triage.md, holds the rows, causes and the defect control that must go red first.

## Why

A dropped CDP send still prints `cpu:8x`, and the load-suspect label then hides it.

## Done when

Removing `Emulation.setCPUThrottlingRate` fails the recording case on any box.

## Evidence

Filled at landing: what ran and where its output is.
