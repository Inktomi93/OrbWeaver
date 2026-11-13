---
kind: bug
status: open
updated: 2026-11-13
priority: P3
area: client
plan: cross-surface-consistency
---

# Renaming on a phone keeps focus when the pressed row unmounts

## What

The topbar rename case proves the rename field keeps focus when a cached room is pressed at desktop width. On a phone the pressed row unmounts and the room takes focus from the page body; no test covers that path.

## Why

The focus steal the case guards against can return on the phone layout without a red.

## Done when

A component test at phone width opens rename as the room mounts and fails when the room takes focus from the field.

## Evidence

Filled at landing: what ran and where its output is.
