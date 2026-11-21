---
kind: work
status: open
updated: 2026-11-21
priority: P3
area: server
plan: typed-enforcers
---

# The debug inspect shapes derive from the database rows

## What

inspectedChatSchema, inspectedMessageSchema and the character detail row in packages/contracts/src/debug/index.ts restate chats and messages columns by hand, because contracts cannot import db. Only the debug route and tooling read them.

## Why

A new column needs a hand copy in the debug shape and nothing forces it.

## Done when

The shapes move to packages/server/src/foundation/observability and derive from the db rows' inferred select types, the contracts copies are deleted, and the tooling readers still type-check.

## Evidence

Filled at landing: what ran and where its output is.
