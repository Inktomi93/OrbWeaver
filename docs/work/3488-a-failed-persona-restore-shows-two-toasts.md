---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: client
plan: cross-surface-consistency
---

# A failed persona restore shows two toasts

## What

`packages/client/src/features/persona/components/persona-list.tsx` toasts the error's message in its catch while the restore mutation shows its own failure toast.

## Why

The reader sees the same failure twice.

## Done when

A failed persona restore shows one failure, and a component test counts it.

## Evidence

Filled at landing: what ran and where its output is.
