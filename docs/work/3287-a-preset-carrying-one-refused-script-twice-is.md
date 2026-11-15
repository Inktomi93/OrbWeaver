---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: server
plan: import-robustness
---

# A preset carrying one refused script twice is named once by the preview

## What

`planUploadLift` in `packages/server/src/domain/regex/substrate/dedup.ts` checks the refusal before the in-run repeat, so two equal refused scripts in one preset read as two refusals in the preview. The run maps the second to the first and reports one refusal.

## Why

The preview must never claim more than the run does.

## Done when

A preset with the same compile-refused script twice: the folder preview and the Presets preview name one refusal and one repeat, as the run reports.

## Evidence

Filled at landing: what ran and where its output is.
