---
kind: bug
status: open
updated: 2026-11-02
priority: P2
area: client
plan: cross-surface-consistency
---

# Tabbing into the transcript sends a scrolled-up reader to the latest row instead of the first visible or last focused row

## What

The change, in a sentence.

## Why

The symptom or the ruling behind it.

## Done when

The observable bar a verifier can check.

## Evidence

Filled at landing: what ran and where its output is.

Tabbing into the transcript focuses row 49 for a reader parked at row 22, in both regimes; main does the same. Done when the tab stop is the first visible row, or the row that last had focus.
