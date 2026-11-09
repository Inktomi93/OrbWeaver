---
kind: bug
status: doing
updated: 2026-11-09
priority: P2
area: ui
lane: wt/agent-a8da83abc2aef9b16
plan: cross-surface-consistency
---

# New chat's search field keeps its height on a fine pointer

## What

On a fine pointer at 1280 and 1440 the New chat search field is crushed to 20px against 32px in the command palette, because the picker box cap leaves out the list's showing-count line and the search wrapper shrinks.

## Why

A crushed search field is a tap target the design audit flags and reads unlike every other picker.

## Done when

The search field holds the picker height at 1280 and 1440 on a fine pointer, with a CT cell, and the room-rule cells still pass. Source: acceptance part 4 report A NC-2.

## Evidence

Filled at landing: what ran and where its output is.
