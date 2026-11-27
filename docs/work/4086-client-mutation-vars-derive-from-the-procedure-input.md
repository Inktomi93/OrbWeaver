---
kind: work
status: open
updated: 2026-11-27
priority: P3
area: client
plan: unwired-code
---

# Client mutation vars derive from the procedure input they send

## What

Some client mutation hooks hand-write a Vars interface (for example SetChatDocumentVisibilityVars and SetUserMacroValuesVars in packages/client/src/features/chat/hooks) instead of deriving it from the procedure input with inferInput, or composing it from it when the hook adds client-only fields.

## Why

A restated wire shape is a second home: it drifts from the contract silently and hid reads from the unwired graph.

## Done when

Every Vars type in packages/client/src derives from or composes inferInput of its procedure, or names why it is client-only; typecheck and the touched CTs pass.

## Evidence

Filled at landing: what ran and where its output is.
