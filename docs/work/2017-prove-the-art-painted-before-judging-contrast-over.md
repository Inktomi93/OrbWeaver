---
kind: work
status: open
updated: 2026-11-07
priority: P2
area: tests
plan: test-foundation
---

# Prove the art painted before judging contrast over it

## What

Add the painted-art read to `tests/support/browser`, require it in the over-art contrast helper, and move both black-art cases onto it. Group LK1 in the ledger triage, reports/codex-test-audit/ledger-triage.md, holds the rows, causes and the defect control that must go red first.

## Why

A wallpaper that never paints leaves a light pixel under the sample, and both AA cases pass with no art on screen.

## Done when

Serving a 404 for the wallpaper blob turns both cases red. Delaying decode past the screenshot does too, and the helper cannot be called without the witness.

## Evidence

Filled at landing: what ran and where its output is.
