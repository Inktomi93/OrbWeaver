---
kind: tooling
status: blocked
updated: 2026-10-21
priority: P3
area: tooling
blocked: owner
---

# Caught-failure ownership refuses spread overrides and reference-only carriers

## What

A factory body can override ok:false through a spread such as {ok:false, ...v}, and a call that only references the binding, such as wrap(void err), counts as carrying it.

## Why

Both can credit an owner that does not keep the failure.

## Done when

Each shape has a mustFlag row that is red before the fix and green after.

## Evidence

Filled at landing: what ran and where its output is.

Owner-directed tooling pause: this work is parked outside the test-foundation and test-mirror programs. Preserve source and evidence; resume only with explicit owner authorization. Custody: `reports/review/tooling-park-2026-10-21/`.
