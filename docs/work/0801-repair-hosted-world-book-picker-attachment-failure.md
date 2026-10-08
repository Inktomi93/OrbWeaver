---
kind: bug
status: doing
updated: 2026-10-08
priority: P1
area: testing
lane: codex/chat-book-picker
---

# Repair hosted world-book picker attachment failure

## What

Repair the native world-book attachment flow while preserving selected-book and room mutation semantics.

## Why

Hosted component testing fails waiting for the unattached book after opening the picker. A retry hides the unresolved failure.

## Done when

Prove and repair the cause with affected native controls and exact mutation assertions. Hosted qualification passes without retries.

## Evidence

Filled at landing: what ran and where its output is.
