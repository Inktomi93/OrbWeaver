---
kind: work
status: open
updated: 2026-11-16
priority: P3
area: ui
plan: chat-html-and-presets
---

# The transcript follow loss at the row swap has a component test

## What

The follow fix is proven by a pure-function row built from a staged trace and by a staged run. No component test reproduces a pinned list whose streaming row overflows the written list height and is swapped for a taller unmeasured row.

## Why

The defect came back unnoticed once already, and only a staged drive can see it today.

## Done when

A component test through the real message list goes red with the clamp rule removed.

## Evidence

Filled at landing: what ran and where its output is.
