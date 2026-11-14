---
kind: adr
status: active
updated: 2026-11-14
---

# Another account's document text reaches a prompt as literal text

## Context

The `{{databank}}` slot is macro-evaluated: the `databank` macro re-evaluates any `{{` in its value. The slot can hold text written by an account other than the room's host, such as a member's global documents that credit the room. The plugin lore path already neutralizes guest macros before its text reaches a prompt.

## Decision

A document whose owner is not the host the turn runs under reaches the `{{databank}}` slot as literal text. Its name and its chunks pass through `neutralizeMacros`, the function the plugin lore path uses, so a macro or a nested slot reference in them is never evaluated. Authorship is `documents.ownerId`. A document whose row is missing counts as another account's. The host's own documents keep their macros.

The constraint is one home. `gatherRetrieval` is the only producer of the slot text, and it applies the test before it fits and renders the chunks. The turn and the assembly preview both read the slot through it, so they show the same text. No other reader may turn document names or chunks into prompt text without passing through it.

Homes: `createGatherRetrieval` in `packages/server/src/domain/databank/verbs/gather-retrieval.ts` · `filterOwnedDocumentIds` in `packages/server/src/domain/databank/persistence/queries.ts` · `neutralizeMacros` in `packages/kit/src/macro/content.ts`. Cases: `tests/server/domain/databank/verbs/gather-foreign-text.int.test.ts`.

## Consequences

A member's documents still inform the model as text. A former host's chat documents do not reach the slot at all (D64).

## Alternatives rejected

A second neutralizing implementation for documents: two homes for one rule. A non-recursive `databank` macro: it removes the host's own macros. Neutralizing at ingest: it rewrites the owner's own document and leaves stored rows untouched. Refusing other accounts' documents outright: it removes the membership widening the room relies on.
