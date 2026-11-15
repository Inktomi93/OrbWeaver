---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: ui
---

# A failed reply's reason is gone after a reload

## What

The reply-failure line under the composer lives in the tab's memory. After a reload the room shows the saved message with no reply and no word of why; the composer's Response icon still generates on the saved tail.

## Why

A reader who reloads after a failure is left guessing whether anything went wrong.

## Done when

A room whose tail is the viewer's own message with a failed reply states the failure after a reload, from a server-held fact, with a case that reloads.

## Evidence

Filled at landing: what ran and where its output is.
