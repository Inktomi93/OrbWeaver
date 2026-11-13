---
kind: bug
status: open
updated: 2026-11-13
priority: P3
area: plugin
plan: authorization-and-visibility
---

# The server log mirror of plugin log lines has a per-plugin budget

## What

The plugin log ring is capped, but `handleLog` in `packages/server/src/infra/plugin-host/process-runtime.ts` writes every mirrored guest log line to the server log with no per-plugin budget. A display transform runs on every render, so one that logs its full budget each call grows the server log at the rate of the display request limit.

## Why

A plugin can fill the operator's log, and the only bound today counts requests, not lines.

## Done when

The mirror has a per-plugin budget per window, one line records how many lines were dropped, a display fault still reaches the operator, and a test drives a transform past the budget.

## Evidence

Filled at landing: what ran and where its output is.
