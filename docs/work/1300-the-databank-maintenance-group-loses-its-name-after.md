---
kind: bug
status: open
updated: 2026-10-24
priority: P3
area: databank
---

# The databank maintenance group loses its name after a failed census recovers

## What

Observed in a CT aria snapshot (tests/client/features/databank/hooks/databank-list-header.ct.tsx): after databank.bankHealth fails and then recovers into an empty bank, the list header's maintenance menu group renders with an empty accessible name; a fresh mount of an empty bank names it correctly. The reasons are inline JSX in packages/client/src/features/databank/hooks/use-databank-list-header.tsx.

## Why

A screen-reader user hears an unnamed group of disabled actions and cannot tell why they are disabled.

## Done when

The group is named by the current reason after any census transition (failed to empty, failed to stocked, empty to stocked), proven by a CT that drives the failed-then-recovered sequence, red first.

## Evidence

Filled at landing: what ran and where its output is.
