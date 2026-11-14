---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: chat
---

# A bundle strike on a character with no seat lands as a shared strike, proven

## What

Export, import and the strike import op carry a strike whose character holds no seat or cannot be resolved as a shared strike (`packages/server/src/domain/export/verbs/export-chat-bundle.ts`, `packages/server/src/domain/import/verbs/import-chat-bundle.ts`, `packages/server/src/domain/chat/memory/persistence/import-strikes.ts`). No case covers it.

## Why

The three paths changed together. A change that drops such a strike again would return a struck scene to the prompt after a restore, with every test passing.

## Done when

A restore case imports a file whose strike names a handle with no seat in the target room and shows the span struck and listed on the shared copy. The case fails when the strike is dropped.

## Evidence

Filled at landing: what ran and where its output is.
