---
kind: bug
status: doing
updated: 2026-11-20
priority: P2
area: chat
lane: wt/agent-abf28919555a27932
---

# The Simple send disabled reason is real or gone

## What

`composer-utility-menu.tsx:343` carries the disabled reason `Send your first message normally`. The control is disabled exactly when the composer has no text (`:187,342`), so the string cannot show. Delete the string or make it the real gate.

## Why

The owner quoted this rule to a live user as fact, and the code does not enforce it.

## Done when

The string is gone or matches the gate, and a case asserts the reason a disabled control gives.

## Evidence

Filled at landing: what ran and where its output is.
