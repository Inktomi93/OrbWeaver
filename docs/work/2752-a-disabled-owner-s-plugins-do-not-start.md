---
kind: bug
status: open
updated: 2026-11-12
priority: P3
area: plugin
plan: authorization-and-visibility
---

# A disabled owner's plugins do not start at boot

## What

Plugin activation at boot restarts a disabled owner's plugins, and their startup code runs under that owner.

## Why

Disabling an account does not stop its plugins across a restart.

## Done when

Boot skips a disabled owner's plugins and re-enabling the owner starts them, with a test on the boot path.

## Evidence

Filled at landing: what ran and where its output is.
