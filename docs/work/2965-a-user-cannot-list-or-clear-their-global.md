---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: automation
---

# A user cannot list or clear their global variables

## What

No route or client surface reads or deletes `global_variables`. A card can fill the owner's key total in a few committed turns.

## Why

The only way out is account deletion, and the `global_variable_dropped` notice names no fix.

## Done when

A settings surface lists the user's global variables and deletes one or all through the owner-scoped automation verbs, with a case at the door.

## Evidence

Filled at landing: what ran and where its output is.
