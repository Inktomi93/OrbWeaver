---
kind: bug
status: open
updated: 2026-11-13
priority: P3
area: plugin
plan: authorization-and-visibility
---

# A plugin's crash report names its own failure after a slow host call

## What

A scripted guest event that waits longer than its CPU window on a host call and then fails gets a crash report that names the interrupt, not the plugin's own error message.

## Why

A plugin author debugging a slow host call reads the wrong cause.

## Done when

A guest event that waits past the window on a host call and then throws reports the plugin's own message, a real CPU overrun still reports the interrupt, and a component test covers both.

## Evidence

Filled at landing: what ran and where its output is.
