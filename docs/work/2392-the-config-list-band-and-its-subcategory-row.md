---
kind: bug
status: open
updated: 2026-11-13
priority: P3
area: client
plan: cross-surface-consistency
---

# The Config list band and its subcategory row stop sharing the name Connections

## What

In the settings list, the group band and a subcategory row inside that group are both named Connections, so two navigation controls carry one name.

## Why

Two controls with one name read as one destination to a screen reader and to sighted scanning, and the walk files them as a duplicate door.

## Done when

The duplicate-action-door finding is gone from the Config evidence cases of a design-audit run, and the longer section label does not clip at narrow list widths. Already merged: the section reads Your connections from `packages/client/src/features/credentials/lib/connections-copy.ts`, and `tests/client/features/config/surfaces/config-list-arrival.ct.tsx` asserts no section row carries its band's name.

## Evidence

Filled at landing: what ran and where its output is.
