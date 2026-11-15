---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: db
plan: import-robustness
---

# The two-axis boot report names a world-info script that no longer runs

## What

Before migration 0020 a script with neither SillyTavern switch and a `WORLD_INFO` target ran on world info. After it the script is on the save pass, which never reads world info. packages/db/src/client/regex-two-axis-report.ts (on its branch) selects a non-editor row only when a switch is set, and `reachBefore` in packages/server/src/entry/boot/report-regex-two-axis.ts (on its branch) records the old reach as `save:WORLD_INFO`.

## Why

The owner was promised every changed script by name. The new behaviour matches SillyTavern, so only the report is wrong.

## Done when

The boot report names a neither-switch `WORLD_INFO` row as moved, with its old reach read as `prompt:WORLD_INFO`; the repo test for 0020 seeds it and asserts the line.

## Evidence

Filled at landing: what ran and where its output is.
