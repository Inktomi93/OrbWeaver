---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: client
plan: cross-surface-consistency
---

# Chat Context item switches name their book

## What

The regex script switch names its subject the way the row's menu does. `regexScriptEverywhereSwitchName` takes the row subject from `rowActionSubject(name, qualifier)` in `regex-tier-row.tsx`. The On screen roster computes its own qualifiers with `rowQualifiers` and passes them the same way.

## Why

Two same-titled scripts in one list give two switches one accessible name, so a screen reader user cannot tell which script a switch toggles.

## Done when

`tests/client/features/chat/components/regex-switches.ct.tsx` has a case with two same-titled scripts in one tier and in the On screen roster, red before and green after, and each switch name equals its row menu's subject.

## Evidence

Filled at landing: what ran and where its output is.
