---
kind: bug
status: open
updated: 2026-11-13
priority: P3
area: plugin
plan: authorization-and-visibility
---

# An uncaught host refusal of a bridge call is never a crash strike

## What

An uncaught host-unavailable refusal of a plugin's bridge call (result channel full, parent disconnected, sync timeout) still counts as a crash strike, for enabled users too, though `packages/plugin-sdk/shared.d.ts` says it never does. A disabled-installer refusal while a sleeping plugin is rebuilt also strikes, through the plain error `wakeBinding` raises in `packages/server/src/infra/plugin-host/process-runtime.ts`. Found by reading, not run.

## Why

A plugin can be auto-disabled for the host's own refusals, which its author cannot prevent.

## Done when

The app-side record of the running command covers every conflict the app raises, with a test where an uncaught flood of host refusals leaves the plugin unstruck and a real guest throw still counts.

## Evidence

Filled at landing: what ran and where its output is.
