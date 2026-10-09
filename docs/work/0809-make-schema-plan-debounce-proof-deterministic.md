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

Native timer registration and separate deadline steps control the draft timing. The test retains exact POST count and complete schema input assertions.

A served missing-cancellation control fails. The complete affected component file passes without retries. Normal scoped checks and independent review pass.

Hosted component qualification remains pending.
