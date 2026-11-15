---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: server
plan: import-robustness
---

# The compile probe runs twice for each preset import call

## What

A Presets preview runs `importPresets` in dry run (whose `keyedFiles` asks `planPresetScripts`) and then `planPresetScripts` again; a run calls `keyedFiles` and then the lift's `admitPlan`. The folder does the same per phase. Code-reviewer measurement through `preset.previewFile` and `preset.importFile` with 264 HUD-shaped scripts at load 35: preview 1,407 ms, import 1,584 ms, repeat 1,053 and 1,518 ms; event-loop max 31 ms, p99 16 ms. The probe runs in a worker, so the server loop does not stall. Each batch has its own wall deadline (`PROBE_WALL_DEADLINE_MS` in packages/server/src/primitives/regex/compile-probe.ts), so the doubling doubles time, not the risk 3169 names.

## Why

A large preset import spends twice the probe time it needs.

## Done when

The run reuses the identity step's verdicts for the lift, so each door call probes each pattern once, measured through the same two doors.

## Evidence

Filled at landing: what ran and where its output is.
