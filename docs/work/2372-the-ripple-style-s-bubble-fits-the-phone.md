---
kind: bug
status: open
updated: 2026-11-09
priority: P2
area: chat
plan: cross-surface-consistency
---

# The ripple style's bubble fits the phone at 300% text

## What

At 300% text the ripple chat style's bubble overflows its scroller by 70px at 320 and 36px at 390.

## Why

A message wider than the screen cannot be read without scrolling sideways.

## Done when

The ripple bubble fits the scroller at 300% on 320 and 390, with a CT that fails on main and message-avatar-reach staying green.

## Evidence

Filled at landing: what ran and where its output is.
