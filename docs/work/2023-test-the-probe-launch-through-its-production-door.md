---
kind: work
status: open
updated: 2026-11-07
priority: P2
area: tooling
plan: test-foundation
---

# Test the probe launch through its production door

## What

Rewrite the HUD case over `launchProbeSession`, and assert the launch options the owned launch really uses. Group LK7 in the ledger triage, reports/codex-test-audit/ledger-triage.md, holds the rows, causes and the defect control that must go red first.

## Why

The contrast probes depend on both lines, and either can vanish with both tests green.

## Done when

Deleting the `addInitScript` call fails 527, and dropping the acceleration call fails 101, on any hardware.

## Evidence

Filled at landing: what ran and where its output is.
