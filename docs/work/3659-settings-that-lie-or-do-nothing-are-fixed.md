---
kind: bug
status: open
updated: 2026-11-20
priority: P2
area: settings
plan: cross-surface-consistency
---

# Settings that lie or do nothing are fixed

## What

The settings audit found: UserSettings.groupDefaults has no reader; the three in-new-chats defaults (offer choices, reactions, characters can react) also change existing rooms the host never set; chat.autoSwipe.maxRetries has no writer; Appearance Density does nothing under a custom theme because the theme always stores a density; the Trust tab external media Allow behaves as Inherit; the max image size and rows per page hints name the wrong scope; the action cluster hint omits that touch ignores it. The settings audit report lists each with its evidence.

## Why

A setting that does nothing or says the wrong thing teaches users the settings cannot be trusted.

## Done when

Each finding is fixed at its owner with a test that fails before the fix, every removed key has a stored-settings lift, and the hints state the real scope.

## Evidence

Filled at landing: what ran and where its output is.
