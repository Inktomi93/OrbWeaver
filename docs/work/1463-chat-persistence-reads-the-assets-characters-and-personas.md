---
kind: work
status: open
updated: 2026-10-31
priority: P2
area: chat
plan: unwired-code
---

# Chat persistence reads the assets, characters and personas tables

## What

packages/server/src/domain/chat/persistence/co-participant-assets.ts joins assets, characters and personas rows directly, which a domain may not do for tables it does not own (docs/law/Core-0-Architecture-and-Structure.md §4). Found while ruling item 1446.

## Why

A domain reading another domain's tables bypasses that owner's scope checks and breaks when the owner changes its schema.

## Done when

Chat obtains those rows through injected handle-free ops owned by assets, character and persona, the persistence file reads only chat tables, and the room image and co-participant tests stay green.

## Evidence

Filled at landing: what ran and where its output is.
