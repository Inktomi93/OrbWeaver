---
kind: bug
status: open
updated: 2026-10-11
priority: P3
area: chat
---

# A newly opened chat lands at the bottom of the transcript

## What

In flat style the last row's foot opened 23-60px below the visible area on a phone drive, on both main and the mobile branch (scrollTop 614 of 637). Unconfirmed on device.

## Why

The newest message should be fully visible when a chat opens.

## Done when

Opening a chat scrolls the last row fully into view in every chat style, with a CT asserting scrollTop equals the max.

## Evidence

Filled at landing: what ran and where its output is.
