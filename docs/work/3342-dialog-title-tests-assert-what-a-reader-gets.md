---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: client
plan: test-foundation
---

# Dialog title tests assert what a reader gets, not the title's CSS values

## What

The app-shell modal CTs decide whether a dialog is in its landscape-phone mode by reading computed white-space, text-overflow and position values. A markup change that kept the screen right turned fourteen cases red.

## Why

A check on how a style is written fails on a refactor and passes on a wrong screen that happens to keep the property.

## Done when

The shared helper asserts outcomes: a long title holds one line and is reachable whole, the header stays in place while the body scrolls, and Close stays pressable. A case with a long title proves each mode, and no case in those files reads white-space or text-overflow.

## Evidence

Filled at landing: what ran and where its output is.
