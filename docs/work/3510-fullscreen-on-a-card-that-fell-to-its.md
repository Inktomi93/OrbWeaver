---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: client
---

# Fullscreen on a card that fell to its plain fallback opens a blank frame

## What

A framed card whose frame failed to load falls to its fallback. Its fullscreen control in `packages/client/src/features/chat/` still loads the failing address, so the fullscreen view is a blank frame.

## Why

The reader opens an empty view with no reason shown.

## Done when

Fullscreen on a fallen card shows the same fallback or is not offered, and a component test under `tests/client/features/chat/components/` covers it.

## Evidence

Filled at landing: what ran and where its output is.
