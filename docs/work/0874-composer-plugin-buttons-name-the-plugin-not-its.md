---
kind: bug
status: doing
updated: 2026-10-11
priority: P3
area: plugin
lane: wt/agent-a9603c332ec7acdab
---

# Composer plugin buttons name the plugin, not its handle

## What

On desktop the composer's plugin buttons print the machine handle beside the name, for example 'Oracle Deck (oracle-deck) · Run Draw' (mobile side-eye round 2).

## Why

Users see an internal slug in a primary control.

## Done when

Plugin command buttons show the plugin's display name and command only; a CT pins the accessible name.

## Evidence

Filled at landing: what ran and where its output is.
