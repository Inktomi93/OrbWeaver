---
kind: bug
status: doing
updated: 2026-10-09
priority: P1
area: ci
lane: codex/weekly-corpus-progress
---

# Make schema plan debounce proof deterministic

## What

Control draft timing in the refinery schema plan component test and retain its exact POST and settled-input assertions.

## Why

Separate browser fill commands can cross the debounce deadline and legitimately create another plan request.

## Done when

Native controls distinguish immediate first draft, intermediate suppression and settled latest draft requests. The affected component suite passes without retries and hosted component qualification is clean.

## Evidence

Filled at landing: what ran and where its output is.
