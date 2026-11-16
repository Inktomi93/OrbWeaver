---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: client
---

# The framed link confirm does not announce the address with the dialog

## What

`ConfirmDialog` describes the alert dialog by its description paragraph only. The framed link confirm puts the host and the address in the body, so a screen reader announces the question without the host.

## Why

A screen reader user decides without hearing where the link goes unless they explore the dialog.

## Done when

The host is part of the dialog's accessible description, and a component test under `tests/client/features/chat/components/` asserts it through the accessibility tree.

## Evidence

Filled at landing: what ran and where its output is.
