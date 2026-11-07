---
kind: tooling
status: open
updated: 2026-11-07
priority: P3
area: tooling
plan: type-law
---

# orb/no-raw-id keys on the brand, not the field name

## What

orb/no-raw-id reads any field typed messageId: string, such as ESLint's own message type, as the chat MessageId brand. Key the rule on the brand's type or import, and remove the workaround the derived-port test carries for it.

## Why

A false positive forces workarounds into correct code.

## Done when

A planted ESLint message field passes and a planted raw chat id is refused.

## Evidence

Filled at landing: what ran and where its output is.
