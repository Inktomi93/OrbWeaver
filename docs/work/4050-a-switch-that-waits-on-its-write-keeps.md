---
kind: bug
status: open
updated: 2026-11-27
priority: P3
area: ui
---

# A switch that waits on its write keeps keyboard focus everywhere

## What

Many Switch sites, including the connection editor's background and image switches, pass disabled while their write is pending, which drops keyboard focus to the page body. The fact switch now uses readOnly and keeps focus; the rest do not.

## Why

A keyboard user who toggles a switch loses their place and cannot undo with another press.

## Done when

The @orb/ui Switch takes a pending state that keeps focus and refuses input, every pending-disabled site moves to it, and a CT presses a pending switch by keyboard and finds focus kept.

## Evidence

Filled at landing: what ran and where its output is.
