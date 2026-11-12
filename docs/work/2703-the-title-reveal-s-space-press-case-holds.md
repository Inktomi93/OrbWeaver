---
kind: tooling
status: open
updated: 2026-11-12
priority: P3
area: client
---

# The title reveal's space press case holds under load

## What

In `tests/client/features/chat/components/chat-header-title-reveal.ct.tsx` the case where a host presses Space on a cut title failed once in a merged run, with the reveal not opening, and passed on every repeat of its file. The case likely presses before the control has settled into its cut state.

## Why

A test that fails with load gets ignored, and the keyboard path it proves goes unwatched.

## Done when

The case waits on the control's own cut state before it presses, passes on repeat at load, and is still red when Space activation is broken.

## Evidence

Filled at landing: what ran and where its output is.
