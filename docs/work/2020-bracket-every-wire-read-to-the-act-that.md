---
kind: work
status: open
updated: 2026-11-07
priority: P3
area: tests
plan: test-foundation
---

# Bracket every wire read to the act that caused it

## What

Add `wireOf` beside `wireBodies`, move all eight tails onto it, and unexport the raw read. Group LK4 in the ledger triage, reports/codex-test-audit/ledger-triage.md, holds the rows, causes and the defect control that must go red first.

## Why

A forced turn that makes no request still passes on the prior round's body, and the negatives pass the same way.

## Done when

Skipping the provider call in `forceCharacterTurn` turns 093 red, and no caller reaches the raw history.

## Evidence

Filled at landing: what ran and where its output is.
