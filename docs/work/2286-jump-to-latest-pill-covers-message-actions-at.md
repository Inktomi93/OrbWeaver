---
kind: bug
status: open
updated: 2026-11-09
priority: P3
area: client
plan: surface-walk
---

# Jump to latest pill covers message actions at 300% text

## What

The floating pill at `packages/client/src/features/chat/components/jump-to-latest-pill.tsx:31` grows with the text and covers Edit message, Fork chat here and Add a reaction on the last visible message. Shows at desktop 300% text on: Chat reading style ripple.

## Why

A floating control that grows with the text covers the controls under it.

## Done when

The pill leaves the message actions under it pressable. These checkpoints show no enlarged-text geometry finding at 200% and 300% text: message-operations-reaction-added.

## Evidence

Filled at landing: what ran and where its output is.
