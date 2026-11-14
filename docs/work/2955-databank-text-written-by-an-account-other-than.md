---
kind: bug
status: open
updated: 2026-11-14
priority: P2
area: databank
---

# Databank text written by an account other than the host is macro-evaluated in the host's turn

## What

The `{{databank}}` slot is macro-evaluated. It can hold text and document names written by an account other than the room's host: a member's global documents (D85) and a former host's chat documents. The plugin lore path neutralizes macros in text a guest writes; the databank slot does not. A security review of the handoff fix raised it and did not probe it through the composed root, because the read needs both owners in one embedding space.

## Why

A macro in another account's text runs with the host's turn. That is the same class as a member writing the host's variables, which the shared-room flag closed for global variables.

## Done when

A server case through the composed root seats a member whose databank document holds a macro, runs the host's turn, and shows the macro text reaches the prompt as literal text. A control shows the host's own document still evaluates. The ruling is recorded in the databank decision record.

## Evidence

Filled at landing: what ran and where its output is.
