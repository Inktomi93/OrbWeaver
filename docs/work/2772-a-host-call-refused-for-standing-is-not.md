---
kind: bug
status: open
updated: 2026-11-13
priority: P3
area: plugin
plan: authorization-and-visibility
---

# A host call refused for standing is not a plugin crash strike

## What

An uncaught refusal from the installer-standing gate counts as a guest crash; only host conflicts are exempt in `packages/server/src/domain/plugin/activation/activate.ts`. Three such refusals can auto-disable a plugin whose owner was disabled, and it stays disabled after the owner is enabled again.

## Why

The plugin did nothing wrong, and its owner finds it switched off with no cause they can see.

## Done when

A standing refusal is exempt from the crash count, with a test that refuses a guest three times and finds the plugin still enabled.

## Evidence

Filled at landing: what ran and where its output is.
