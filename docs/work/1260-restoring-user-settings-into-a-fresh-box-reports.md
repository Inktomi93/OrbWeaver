---
kind: bug
status: open
updated: 2026-10-24
priority: P3
area: import
---

# Restoring user settings into a fresh box reports a missing background asset

## What

In a large real-export restore probe during item 1212, the `user-settings` file failed with "A background asset is no longer available." The seeded background art may already exist in the target under another id, so the settings reference resolves to nothing. The same flow restores with zero failures through the overlap test's `openBox` setup, so the harness configuration may be the difference. Not confirmed.

## Why

A full backup restored into a fresh install should not drop the user's appearance settings.

## Done when

The cause is named with a composed reproduction (fresh box, real export with a seeded background in use); the settings restore resolves the background by content hash or re-links the seeded art; the round trip restores appearance with zero failures.

## Evidence

Filled at landing: what ran and where its output is.
