---
kind: bug
status: open
updated: 2026-11-20
priority: P2
area: chat
plan: cross-surface-consistency
---

# Message actions reveal on every input that can reach them, and hold while their menu is open

## What

Three defects in the message-actions reveal: actionsRevealFor keys on a coarse pointer rather than on hover capability, so a stylus or a fine pointer with no hover gets the hover-only reveal and cannot reach the actions; the HOVER_REVEAL setting variant still reveals on group-focus-within, so a tap focus reveals it (the defect 3436 fixed for the focus variant); and when a row loses hover while its actions menu is open, the trigger fades under its own menu.

## Why

Actions that a device cannot reach, or a trigger that vanishes under its own menu, break the message tools on real devices.

## Done when

The posture keys on hover capability, with a component test at a fine pointer with no hover; the setting variant is gated like the focus variant or the reason it is not is recorded; the trigger stays shown while its menu is open, with a component test.

## Evidence

Filled at landing: what ran and where its output is.
