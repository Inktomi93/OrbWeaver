---
kind: bug
status: open
updated: 2026-11-10
priority: P3
area: client
plan: cross-surface-consistency
---

# First-run Home's start control does not move from the masthead into the empty tile on boot

## What

On a cold first-run boot, Home may draw New chat in the masthead while the chat list read is pending and move it into the empty recents tile once the read settles, shrinking the masthead row. Snap captures start after the app is ready, so no capture has seen it.

## Why

A primary control that jumps on boot is layout shift on the first screen a new user sees.

## Done when

A production-mounted CT with a held chat list read shows the start control in one place from first paint to settle, or the masthead reserves its row so nothing moves; the CT holds the read and asserts the control's box does not change.

## Evidence

Filled at landing: what ran and where its output is.
