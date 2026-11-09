---
kind: bug
status: doing
updated: 2026-11-09
priority: P3
area: client
lane: wt/agent-a1c1c7a87cab455a1
plan: cross-surface-consistency
---

# The remaining item switches read itemSwitchName

## What

Automation rule rows, workload schedules, preset section rows and drill-ins, the chat regex tier rows and groups, and the plugin show-in-chat switch each spell their own grammar for a per-item switch; the paths are in 2270's Evidence.

## Why

One control family with several name grammars breaks the switch family the 2270 ruling set.

## Done when

Each reads itemSwitchName from its one home, and a CT per family finds two items by stable name and asserts aria-checked.

## Evidence

Filled at landing: what ran and where its output is.
