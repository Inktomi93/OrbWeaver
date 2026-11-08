---
kind: bug
status: open
updated: 2026-11-08
priority: P3
area: ui
plan: test-foundation
---

# A disabled list row's withheld click has a test

## What

The disabled list row withholds its click in list-row\.tsx, and no test proves it since the click proof was removed.

## Why

A disabled row that still fires its action is a real defect.

## Done when

A CT clicks a disabled row and proves no action runs.

## Evidence

Filled at landing: what ran and where its output is.
