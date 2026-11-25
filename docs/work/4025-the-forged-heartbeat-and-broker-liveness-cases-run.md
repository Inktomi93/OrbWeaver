---
kind: tooling
status: doing
updated: 2026-11-25
priority: P2
area: tooling
lane: wt/agent-a1540a588e0ac9772
---

# The forged heartbeat and broker liveness cases run on Windows and macOS in CI

## What

The plugin broker's beat authentication and liveness cases run only on the Linux CI runner, while the product ships natively on Windows and macOS where process stop and IPC behave differently.

## Why

The broker's stop and heartbeat paths are exactly where platform behavior differs, and the owner rule is that every fix works on Linux, Windows, macOS and Docker.

## Done when

CI runs the plugin broker and watchdog suites on Windows and macOS runners as well as Linux, and they pass on each.

## Evidence

Filled at landing: what ran and where its output is.
