---
kind: bug
status: open
updated: 2026-11-10
priority: P3
area: client
plan: cross-surface-consistency
---

# Chat Context item switches name their book

## What

In the chat Context pane, two list rows with the same entry title produce the same itemSwitchName, so two switches for different entries share one accessible name; the name carries no book qualifier.

## Why

A screen reader user cannot tell which entry a switch toggles.

## Done when

itemSwitchName includes the owning book or list, so two same-titled entries in different books have distinct names, proven by a production-mounted CT, and the duplicate-action-door finding is gone from the Chat evidence case.

## Evidence

Filled at landing: what ran and where its output is.
