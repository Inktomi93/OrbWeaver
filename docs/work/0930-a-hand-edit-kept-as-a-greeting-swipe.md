---
kind: bug
status: open
updated: 2026-10-12
priority: P2
area: chat
---

# A hand edit kept as a greeting swipe is reachable while the greeting window is open

## What

Since item 907, stepping a seeded greeting whose text is not the card's appends the card alternate as a new selected variant, so a hand edit, prose repair or imported text survives as a swipe. While the greeting window is open (no user turn yet) the greeting strip (greeting-swipe-strip.tsx) shows only the card alternates, so the kept swipe cannot be reached until the first user turn opens the normal swipe strip. Make the kept text reachable from the greeting strip while the window is open, and take a rendered review of the hand-edit-then-step flow on phone and desktop.

## Why

The owner's ruling is that replaced text survives as a swipe; a swipe the user cannot reach while it matters is lost in practice, and the CTs mock the call so nothing rendered proves the flow.

## Done when

After a hand edit and a step, the greeting strip can return to the edited text before any user turn; a CT drives it through the real door; a side-eye report covers the flow.

## Evidence

Filled at landing: what ran and where its output is.
