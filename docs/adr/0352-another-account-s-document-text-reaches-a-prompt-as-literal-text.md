---
kind: adr
status: active
updated: 2026-11-14
---

# Another account's document text reaches a prompt as literal text

## Context

The databank slot of a prompt is macro-evaluated. It can hold text written by an account other than the room's host: a member's global documents, and documents a former host left attached. The plugin lore path already neutralizes guest macros before its text reaches a prompt; the databank slot did not.

## Decision

A document whose owner is not the turn's host reaches the databank slot as literal text. Its name and its chunks pass through the same neutralizing function the plugin lore path uses, at one home in the databank retrieval verb. A document whose owner row is missing is treated as another account's.

## Consequences

A member's documents still inform the model as text. A macro or a nested slot reference inside them is never evaluated in the host's turn.

## Alternatives rejected

A second neutralizing implementation for documents: two homes for one rule. Refusing other accounts' documents outright: it removes the membership widening the room relies on.
