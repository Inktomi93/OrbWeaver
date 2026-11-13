---
kind: bug
status: open
updated: 2026-11-13
priority: P3
area: plugin
plan: authorization-and-visibility
---

# The broker Worker's guest-driven warnings count against the plugin's log window

## What

The warning written when the realm cannot settle a host call, and the pending-jobs supervision lines, go to the broker's standard output, which the app inherits. A guest can drive the settle warning many times per display call through a `then` getter that runs out its CPU window.

## Why

The log budget covers the main log only, so a plugin can still flood the operator's log.

## Done when

Those lines share the plugin instance's window or are capped per window, with a test that drives them from a guest.

## Evidence

Filled at landing: what ran and where its output is.
