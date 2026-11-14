---
kind: bug
status: open
updated: 2026-11-14
priority: P2
area: client
---

# A stray click while an own-server model list loads cancels the search box's caret

## What

useFocusOnSwap's yieldToReader counts any document click after the wait began as the reader moving to a control. In Add connection on an own-server provider, pressing List models and then clicking dead space in the dialog leaves focus on the dialog popup when the list lands, so the search box never takes the caret.

## Why

useSearchCaret's header promises the caret after List models answers. A click on blank space is not a move to another control.

## Done when

A component test presses List models, clicks dead space while the list is held, and finds the search field focused when it lands, while a move to a real control by click or Tab still keeps focus there.

## Evidence

Filled at landing: what ran and where its output is.
