---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: client
---

# The model picker's Tab-only arrival path has no keyboard-first test of the List models press

## What

The picker takes the caret when the list lands after the List models press on an own-server draft. No component test proves that arrival, so the reader-moved-focus rule in the focus hook is only proven for the hosted paste path and for a provider pick.

## Why

The hook now tells focus the reader moved while a read ran from focus left by the press that started the read, and the List models press is the one start that leaves focus on a button.

## Done when

A component test presses List models on an own-server draft, lets the list land, and finds the search field focused; a second case moves focus to another control by Tab while the list is held and finds it still there.

## Evidence

Filled at landing: what ran and where its output is.
