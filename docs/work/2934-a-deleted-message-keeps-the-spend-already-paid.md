---
kind: bug
status: open
updated: 2026-11-14
priority: P2
area: stats
---

# A deleted message keeps the spend already paid

## What

Deleting a message or a swipe subtracts its paid cost from the shown spend on the live path and on a rebuild.

## Why

Spend already paid is never lowered. The shown spend drops when the reader tidies a chat, although nothing was refunded.

## Done when

A server case deletes a paid message and a paid swipe, and the shown spend is unchanged on the live path and after a rebuild.

## Evidence

Filled at landing: what ran and where its output is.
