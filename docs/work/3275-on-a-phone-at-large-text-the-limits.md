---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: connection
plan: cross-surface-consistency
---

# On a phone at large text the limits step's footer hides the refusal and the second field

## What

On a phone at the app's largest text, typing a bad value in the limits step scrolls the dialog body. The title is cut at the top, and the sticky footer covers the field's refusal text and the Max output field.

## Why

The user sees a red border with no reason and may not find the second field.

## Done when

After a refusal, the invalid field's message is in view above the footer at phone width and the largest app text.

## Evidence

Filled at landing: what ran and where its output is.
